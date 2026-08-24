# 04 — Resume Download System

[← Back to PLAN.md](../PLAN.md)

---

## 4.1 Goal

Prevent abuse **without** adding friction for recruiters.

Explicitly rejected:

- Google Sign-In
- Mandatory email collection
- Any login or account requirement

A recruiter downloads the resume in **one click**. Security is progressive and invisible until
someone behaves abnormally.

---

## 4.2 Flow

```
User clicks "Download Resume"
        │
        ▼
GET /api/resume/download            (Next.js route handler, OpenNext Worker)
        │
        ├─ Cloudflare edge rules already applied (WAF + coarse rate limit)
        ├─ Rate limit: 5/hour, 20/day per hashed IP        [FAIL OPEN]
        ├─ User-Agent sanity checks
        ├─ Cloudflare bot signals
        │
        ├─ suspicious? ──yes──► Turnstile challenge ──verified?──no──► block (429)
        │                                             │
        │◄────────────────────────yes─────────────────┘
        │
        ├─ read current version pointer from resume_versions (is_current = true)
        ├─ generate Supabase signed URL (60s TTL) on the PRIVATE resume bucket
        ├─ write download_logs row
        │
        └─ 302 redirect ──► Supabase serves the file directly
```

Benefits of this shape:

- The resume URL is never permanently public
- Every download passes through the API, so analytics and security checks always run
- The file still streams from Supabase, so there is no bandwidth cost or latency penalty on the web app

---

## 4.3 Progressive security

```
Normal usage      → immediate download, no challenge, no delay
Heavy usage       → Turnstile challenge
Extreme abuse     → temporary block
```

**Cloudflare Turnstile** is the CAPTCHA of choice: free, privacy-friendly, invisible in the common
case, and materially better UX than reCAPTCHA. On the resume route it is only shown on suspicion —
never to a first-time visitor.

### 4.3.1 What counts as suspicious

The escalation branch sits **between the rate-limit check and the version lookup** in the route
handler. Any one of these signals triggers the Turnstile challenge:

| Signal | Threshold |
| --- | --- |
| Downloads from one hashed IP in the last hour | ≥ 3 |
| User-Agent | Missing, or matches a known script pattern (`curl`, `wget`, `python-requests`, empty) |
| Cloudflare bot score header (when available) | Below Cloudflare's "likely automated" threshold |

When a signal fires, the route returns a lightweight challenge page that renders the Turnstile
widget and re-submits the download request with a token. The token is always verified
**server-side** against Cloudflare's `siteverify` endpoint before the signed URL is minted — a
client-side "success" callback proves nothing.

---

## 4.4 Versioning — immutable files + a current pointer

Old resumes stay in Supabase forever. A PDF is a few KB against a 10 GB free tier, so retention
costs nothing and removes an entire class of bugs.

```
resume/  (private bucket)
└── versions/
    ├── resume-2026-08-07.pdf     ← is_current
    ├── resume-2026-05-12.pdf
    └── resume-2025-11-03.pdf
```

```sql
create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  uploaded_at timestamptz default now(),
  is_current boolean default false
);
create unique index one_current_resume on resume_versions (is_current) where is_current;
```

The partial unique index guarantees at most one current row — the database enforces the invariant,
not application code.

**Update workflow**

1. Upload `versions/resume-YYYY-MM-DD.pdf`. Never overwrite an existing path.
2. `update resume_versions set is_current = false where is_current;`
3. `insert into resume_versions (storage_path, is_current) values ('versions/resume-YYYY-MM-DD.pdf', true);`

**Why this answers the stale-URL question:** a signed URL points at a specific immutable path, so
a URL issued seconds before a swap still resolves to exactly the version it was minted for — never
a truncated or half-replaced file. It expires 60 seconds later regardless. Because every request
re-reads `is_current`, new visitors always get the newest version.

`download_logs.storage_path` records which version each person received.

### 4.4.1 Upload workflow — through the CMS

Uploading a new resume is a task Kat repeats every time the resume changes, so it gets a real
workflow instead of manual SQL or a one-off script.

**`resume-uploads` — an admin-only Payload collection**, used purely as an upload trigger. It is
never read by the public site or by anyone without a Payload login; the actual download always
comes from `resume_versions` and the private bucket, not from this collection.

```ts
// apps/cms/src/collections/ResumeUploads.ts
import type { CollectionConfig } from "payload";
import { promoteResumeUpload } from "../hooks/promote-resume-upload";

export const ResumeUploads: CollectionConfig = {
  slug: "resume-uploads",
  upload: true, // Payload's default local storage — the file is moved out in the hook below
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: () => false,
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [],
  hooks: { afterChange: [promoteResumeUpload] },
};
```

The `afterChange` hook does the real work, reusing the **Supabase service role client Render
already holds** — no new credentials, no separate storage adapter for Payload to manage:

```ts
// apps/cms/src/hooks/promote-resume-upload.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function promoteResumeUpload({ doc }: { doc: { filepath: string } }) {
  const versionedPath = `versions/resume-${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileBuffer = await fs.readFile(doc.filepath);

  const { error: uploadError } = await supabase.storage
    .from("resume")
    .upload(versionedPath, fileBuffer, { contentType: "application/pdf" });
  if (uploadError) throw new Error(`Resume upload to private bucket failed: ${uploadError.message}`);

  await supabase.from("resume_versions").update({ is_current: false }).eq("is_current", true);
  await supabase.from("resume_versions").insert({ storage_path: versionedPath, is_current: true });

  await fs.unlink(doc.filepath); // don't rely on Render's ephemeral disk for anything long-term
}
```

**Why this shape:** the private `resume` bucket stays exactly as private as before — Payload's
own `media` collection (public, for blog/project images) is untouched and never sees the PDF.
`resume-uploads` is really just an authenticated file-picker bolted onto Payload's existing admin
auth and Cloudflare Access ([05-security.md](05-security.md) §5.2); `resume_versions` in the
`public` schema remains the single source of truth the download route reads from (§4.5) — this
hook is the only thing that writes to it outside of a manual migration.

---

## 4.5 Route handler with two-tier fallback

```ts
// apps/web/app/api/resume/download/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rate-limit/check";
import { hashIp, getIp } from "@/lib/security/hash-ip";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { getRecentDownloadCount } from "@/lib/rate-limit/recent-count";

const SIGNED_URL_TTL = 60;
const SCRIPT_UA_PATTERNS = [/curl/i, /wget/i, /python-requests/i];
const CF_BOT_SCORE_THRESHOLD = 30; // below this, Cloudflare considers the request likely automated

async function isSuspicious(req: NextRequest, ipHash: string) {
  const ua = req.headers.get("user-agent") ?? "";
  const botScore = Number(req.headers.get("cf-bot-score"));
  const recentCount = await getRecentDownloadCount(ipHash); // downloads in the last hour
  return (
    recentCount >= 3 ||
    !ua ||
    SCRIPT_UA_PATTERNS.some((p) => p.test(ua)) ||
    (!Number.isNaN(botScore) && botScore < CF_BOT_SCORE_THRESHOLD)
  );
}

async function mintSignedUrl(path: string) {
  const supabase = serviceClient();
  const result = await Promise.race([
    supabase.storage.from("resume").createSignedUrl(path, SIGNED_URL_TTL, { download: true }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("signed-url-timeout")), 5000)),
  ]);
  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? "Signed URL generation failed");
  }
  return result.data.signedUrl;
}

export async function GET(req: NextRequest) {
  const ip = getIp(req);
  const ipHash = hashIp(ip);

  // Recruiter experience wins: if the limiter is unreachable, let the download through.
  const { allowed } = await checkRateLimit("resume", ipHash, "open");
  if (!allowed) return NextResponse.redirect(new URL("/resume?limited=1", req.url));

  // Escalation sits here — between the rate limit and the version lookup (§4.3.1).
  if (await isSuspicious(req, ipHash)) {
    const token = req.nextUrl.searchParams.get("turnstileToken");
    const verified = token ? await verifyTurnstileToken(token, ip) : false;
    if (!verified) {
      // Renders the Turnstile widget and re-submits this same request with the token —
      // same minimal pattern as the /resume-unavailable page in §4.6.
      return NextResponse.redirect(new URL("/resume/verify", req.url));
    }
  }

  const supabase = serviceClient();
  const { data: current } = await supabase
    .from("resume_versions")
    .select("storage_path")
    .eq("is_current", true)
    .single();

  if (!current) {
    await logDownload({ ipHash, success: false, error: "no-current-version" });
    return NextResponse.redirect(new URL("/resume-unavailable", req.url));
  }

  try {
    const url = await mintSignedUrl(current.storage_path);
    await logDownload({ ipHash, success: true, storagePath: current.storage_path });
    return NextResponse.redirect(url);
  } catch (first) {
    try {
      const url = await mintSignedUrl(current.storage_path); // tier 1: one retry
      await logDownload({ ipHash, success: true, storagePath: current.storage_path, retried: true });
      return NextResponse.redirect(url);
    } catch (second) {
      await logDownload({ ipHash, success: false, error: String(second) });
      return NextResponse.redirect(new URL("/resume-unavailable", req.url)); // tier 2
    }
  }
}
```

```ts
// apps/web/lib/security/turnstile.ts
export async function verifyTurnstileToken(token: string, ip: string) {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true; // a client-side "success" callback alone proves nothing
}
```

---

## 4.6 Fallback page

```tsx
// apps/web/app/resume-unavailable/page.tsx
export default function ResumeUnavailable() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h1 className="text-xl font-medium">Resume download is temporarily unavailable</h1>
      <p className="mt-2 text-muted-foreground">
        The download system is having a brief issue. You can view the resume online instead, or
        get in touch and I&apos;ll send it over.
      </p>
      <div className="mt-6 flex justify-center gap-4">
        <a href="/resume" className="underline">View Resume Online</a>
        <a href="/contact" className="underline">Contact Me</a>
      </div>
    </div>
  );
}
```

The online resume view is rendered from CMS content and has **no dependency on Supabase Storage**,
which is what makes it a genuine fallback rather than a second point of failure. This page is
`Disallow`ed in `robots.txt`.

---

## 4.7 Download analytics

Every attempt, successful or not, writes a `download_logs` row:

| Field | Notes |
| --- | --- |
| `created_at` | Timestamp |
| `storage_path` | Which resume version was served |
| `country` | From Cloudflare geo headers |
| `referrer` | Where the visitor came from |
| `browser`, `device` | Parsed from User-Agent |
| `user_agent_hash` | Hashed, not raw |
| `ip_hash` | Salted SHA-256, never a raw IP |
| `turnstile_triggered` | Whether a challenge was shown |
| `success` | Outcome |
| `error_message` | Populated on failure |

Retention: 90 days, purged in step with salt rotation
([05-security.md](05-security.md), [14-privacy-and-compliance.md](14-privacy-and-compliance.md)).

---

## 4.8 Accepted risk — the 60-second sharing window

A signed URL is **bearer-style**: for 60 seconds, anyone holding it can download the file.

**Decision: accepted.** The resume is semi-public content that is deliberately easy to obtain. The
signed-URL system exists to force every download through a logged, rate-limited API and to prevent
hotlinking and bulk scraping — not to guarantee per-user access.

Optional hardening if this ever matters more: drop the TTL to 30 seconds. `download: true` is
already set so browsers save the file rather than rendering it inline, which slightly reduces
casual re-sharing of the live URL.

---

## 4.9 Highest-risk path — test coverage

The resume flow is the single most important thing on the site, so it gets a dedicated E2E smoke
test asserting it never returns a 5xx and always ends in either a signed-URL redirect or the
fallback page. See [11-testing-and-ci.md](11-testing-and-ci.md).
