# 05 — Security & Access Control

[← Back to PLAN.md](../PLAN.md)

---

## 5.1 Threat model

| Asset | Threat | Primary control |
| --- | --- | --- |
| Resume PDF | Bulk scraping, hotlinking | Private bucket, signed URLs, rate limiting, Turnstile |
| Contact inbox | Spam floods | Turnstile + honeypot + rate limit (fail closed) |
| Ask AI endpoint | Cost drain, prompt injection | Per-IP + global caps, injection screen, citation gate |
| CMS admin | Unauthorised content changes | Payload auth + Cloudflare Access |
| Logs & submissions | Data exposure via anon key | RLS deny-by-default, service-role-only access |
| Visitor IPs | Privacy exposure | Salted hashes, 90-day retention, salt rotation |
| Unpublished drafts | Leak via preview URL | Strong secret, clean redirect, 15-min TTL, redaction |
| Secrets | Leak via Git or client bundle | gitleaks CI, strict `NEXT_PUBLIC_` discipline |

---

## 5.2 Admin surface protection

### CMS admin — `cms.katbose.dev/admin/*`

Two independent layers:

1. **Cloudflare Access** application scoped to `/admin/*`, allow-list = my email only.
   Free for up to 50 users, zero code to maintain, email OTP or identity-provider login.
2. **Payload's built-in auth** underneath — a single admin user, public registration disabled.

Cloudflare Access is defence in depth. Payload's own auth is still the real gatekeeper. Configure
the Render service with `renderSubdomainPolicy: disabled` after its custom domain is verified; an
enabled `*.onrender.com` hostname would bypass the Cloudflare Access application.

**Render/Cloudflare setup checklist:** add `cms.katbose.dev` and `dashboard.katbose.dev` as Render
custom domains, proxy both DNS records through Cloudflare, create the `/admin/*` and whole-host
Cloudflare Access applications, and disable the Render subdomain on each service. Verify the
custom domains over HTTPS and confirm each default `*.onrender.com` hostname returns 404.

### CMS API — `cms.katbose.dev/api/*`

**Deliberately not covered by a Cloudflare Access application.**

Why this interaction needs a decision at all: `cms.katbose.dev` serves both the admin UI *and*
the content API that the public Next.js site calls server-side. If Access protected the whole
domain, it would intercept your own site's content fetches and redirect them to a login page —
producing empty blog pages and failed builds rather than a loud error.

Two ways to resolve it:

| | Option A — path-scoped Access | Option B — service token |
| --- | --- | --- |
| Setup | One Access app on `/admin/*`; no rule on `/api/*` | Access app on the whole domain + `CF-Access-Client-Id` / `CF-Access-Client-Secret` on every server fetch |
| Effort | Minimal, no code changes | Token generation, storage, rotation, header plumbing |
| API exposure | `/api/*` publicly reachable | `/api/*` reachable only with the token |

**Decision: Option A.** The CMS API serves only content that is published publicly anyway; guest
`read` access is constrained to `_status = published`, and `readVersions` requires a Payload user.
Every mutation requires `req.user` via Payload's access control. You are not protecting the data —
you are protecting the *ability to change* the data, and Payload already does that.

An absent Access rule means no interception; no explicit "bypass" rule is needed.

**Verification (run once after DNS + Access setup):**

```bash
curl -sI https://cms.katbose.dev/admin            # expect 302 to a Cloudflare Access login
curl -s  https://cms.katbose.dev/api/blog-posts   # expect JSON, not HTML
# also verify the disabled default Render hostname returns 404
```

Also confirm before go-live:

- GraphQL playground disabled in production (otherwise the schema is probeable even with `/admin`
  protected)
- `/api/users/login` rate-limited at the Cloudflare edge
- `cors` restricted to the site origins
- anonymous `/api/blog-posts?draft=true` cannot return a draft and public versions endpoints fail

### Dashboard — `dashboard.katbose.dev`

Cloudflare Access over the **entire subdomain**. No custom login code, no session handling, no
password hashing to maintain.

Rejected alternatives: Vercel Password Protection (Pro plan only, not available on Hobby), and a
hand-rolled Next.js middleware + session cookie (more code and more risk for no benefit while
Cloudflare Access is free).

---

## 5.3 Secrets management

Three secret surfaces, each with a clear owner. The full inventory lives in
[17-env-vars.md](17-env-vars.md).

| Surface | Store | Holds |
| --- | --- | --- |
| Cloudflare Workers (web) | Worker secret bindings on the production deployment | Supabase **service role** key, Supabase URL, PostHog key, Sentry DSN, Upstash URL/token, `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `WEBHOOK_SHARED_SECRET`, `IP_HASH_SALT`, Slack webhooks and Turnstile keys |
| Render (cms, dashboard — production only) | `render.yaml` `sync: false` + Render dashboard | Payload secret, Supabase **service role** key, `SUPABASE_URL`, DB URL, `WEBHOOK_SHARED_SECRET`, `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `PUBLIC_SITE_URL` |
| Supabase | Production project settings | DB URL, anon key, service role key |

**Hard rules**

1. The Supabase **service role key never appears in a `NEXT_PUBLIC_*` variable or any client
  bundle.** It bypasses every RLS policy; leaking it is a total compromise of the data layer.
  It may exist in server-only Worker bindings and the Render CMS/dashboard, never in browser code.
2. `render.yaml` is committed; secret *values* never are.
3. Every variable is documented with owner, surface, environment and rotation policy.
4. `gitleaks` runs on every push and pull request.
5. Local values live only in ignored `.env.local` files; production values live only in Cloudflare,
   Render and the production Supabase project. `IP_HASH_SALT` must match between production web
   and Render surfaces.

```
# .gitignore
.env
.env.local
.env.*.local
```

```yaml
# .github/workflows/secret-scan.yml
name: secret-scan
on: [push, pull_request]
jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
```

---

## 5.4 IP hashing and salt management

Raw IP addresses are never stored. Everything that needs to identify a repeat visitor —
rate limiting, download logs, AI query logs — uses a salted SHA-256 hash.

```ts
// apps/web/lib/security/hash-ip.ts
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

export function getIp(req: NextRequest) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function hashIp(ip: string) {
  return createHash("sha256").update(ip + process.env.IP_HASH_SALT).digest("hex");
}
```

**Why `cf-connecting-ip` is trustworthy here:** an earlier draft of this document warned that the
header is spoofable when an app is reachable both through Cloudflare and directly — for example,
Vercel's always-on `*.vercel.app` URL bypasses Cloudflare entirely, so a direct request could set
the header itself. Hosting the public site as a **Cloudflare Worker via OpenNext** instead
([01-architecture.md](01-architecture.md) §1.2) removes that bypass: there is no non-Cloudflare
origin to hit, so every request is terminated at Cloudflare's edge, which sets `cf-connecting-ip` from the real TCP connection and
overwrites any client-supplied value of the same name. **Verification item:** confirm empirically
that a request carrying a forged `cf-connecting-ip` header is not reflected in the computed hash.

**Why a salt:** an unsalted hash of an IPv4 address is trivially reversible — the whole address
space fits in a rainbow table. The salt is what makes the hash non-reversible in practice.

**Where it lives:** generated once with `openssl rand -hex 32`, stored as `IP_HASH_SALT` on both
the web Worker and Render. The value must be **identical across both surfaces** so
hashes computed by the rate limiter and by the logger refer to the same person.

**Rotation:** every 90 days, performed at the same moment logs older than 90 days are purged.

```
Day 0    Salt A active
Day 90   purge logs > 90 days  →  rotate to Salt B  →  update Cloudflare Worker + Render secrets
Day 180  purge  →  rotate to Salt C
```

Rotating and purging together means old-salt and new-salt hashes never coexist inside an active
comparison window. A manual quarterly calendar task is sufficient for this threat model —
automating rotation would add more moving parts than it removes.

Rotation also briefly resets rate-limit continuity: counters keyed by old-salt hashes restart
from zero after the swap. This is accepted — the windows are short (hours, not days) and a
quarterly reset is harmless at this traffic level.

---

## 5.5 Webhook authenticity

All internal service-to-service calls (`/api/webhooks/content-sync`, `/api/webhooks/reconcile`)
require an `x-webhook-secret` header matching `WEBHOOK_SHARED_SECRET`. Anything else gets a 401
before any work is done.

Render's outbound requests must be verified as unblocked during Phase 3 setup.

---

## 5.6 Input handling

- Every request body is validated with a **Zod schema** at the route boundary; nothing downstream
  trusts unvalidated input.
- Schemas live in `packages/shared` so the client and server validate identically.
- All Supabase access goes through the client library's parameterised queries — no string-built SQL.
- Rendered Markdown/MDX from the CMS is sanitised; raw HTML embedding is disabled.
- External redirects are never taken from user input — the only redirect targets are the Supabase
  signed URL and internal paths.

---

## 5.7 Security headers

Set in `next.config.ts` / middleware:

- `Content-Security-Policy` — restricted to self plus PostHog, Sentry, Cloudflare Turnstile and
  Supabase Storage origins
- `Strict-Transport-Security` with a long `max-age`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY` (nothing on the site needs framing)
- `Permissions-Policy` denying camera, microphone and geolocation

---

## 5.8 Accepted risks

Recorded here so they are conscious decisions rather than oversights.

| Risk | Decision |
| --- | --- |
| **60-second signed URL is shareable** | Accepted. The resume is semi-public; the system exists to log and rate-limit downloads, not to guarantee per-user access. Optional hardening: 30s TTL. |
| **`cms.katbose.dev/api/*` is publicly readable** | Accepted. Guest reads are restricted to published documents; draft and version reads require authenticated access. Mutations require Payload auth. |
| **Render free-tier cold starts (30–60s)** | Accepted. Single admin user; ISR insulates readers and reconciliation insulates the index. |
| **Resume rate limiting fails open** | Deliberate. Recruiter experience outranks abuse risk; Cloudflare edge rules remain as a coarse backstop. |
| **Preview secret appears once in a URL** | Accepted, mitigated by clean-URL redirect, 15-minute TTL, redaction in monitoring, and no URL logging. |
| **Hashed IPs are still personal data** | Accepted and handled — 90-day retention, rotating salt, disclosed in the privacy policy. |
