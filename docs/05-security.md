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
| Logs & submissions | Data exposure via client roles | Revoked current/default schema, table, sequence and function grants + forced RLS + restrictive role-scoped deny policies + catalog/CRUD tests |
| Visitor IPs | Privacy exposure | HMAC-SHA-256 pseudonyms, daily 90-day purge, independent key epochs |
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
| Cloudflare Workers (web) | Worker secret bindings on the production deployment | Supabase **service role** key, Supabase URL, PostHog key, Sentry DSN, Upstash URL/token, `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `WEBHOOK_SHARED_SECRET`, `IP_PSEUDONYM_KEY`/`IP_PSEUDONYM_EPOCH`, Slack webhooks and Turnstile keys |
| Render (cms, dashboard — production only) | `render.yaml` `sync: false` + Render dashboard | Payload secret, Supabase **service role** key, `SUPABASE_URL`, DB URL, `WEBHOOK_SHARED_SECRET`, `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `PUBLIC_SITE_URL` |
| Supabase | Production project settings | DB URL, anon key, service role key |

**Hard rules**

1. The Supabase **service role key never appears in a `NEXT_PUBLIC_*` variable or any client
  bundle.** It bypasses every RLS policy; leaking it is a total compromise of the data layer.
  It may exist in server-only Worker bindings and the Render CMS/dashboard, never in browser code.
2. `render.yaml` is committed; secret *values* never are.
3. Every variable is documented with owner, surface, environment and rotation policy.
4. `gitleaks` runs on every push and pull request.
5. Local values live only in ignored `.env.local` files; production values live only in
   Cloudflare, Render and Supabase. Only the web Worker holds `IP_PSEUDONYM_KEY`, because only it
   receives trusted visitor request metadata.

```gitignore
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

**Scan configuration.** `.gitleaks.toml` at the repository root extends the full default ruleset —
no rule is disabled. It carries exactly one allowlist entry, for the `KEY=replace-with-…`
placeholder values that rule 4 above requires committed `.env.example` templates to contain;
gitleaks' `generic-api-key` rule otherwise flags them because the variable *names* end in `SECRET`
or `KEY`.

The allowlist matches the **placeholder value pattern, not the `.env.example` path**. Allowlisting
the file would mean a real secret pasted into a template goes undetected; matching only the
placeholder keeps every other value in those files in scope. Verified both ways against gitleaks
8.24.3: the committed placeholders produce no finding, and a high-entropy value on a
non-placeholder line in the same file still fails the scan.

---

## 5.4 IP pseudonyms, trusted address source and key epochs

Raw IP addresses are never stored. Download logs, AI query logs and rate-limit keys use
`HMAC-SHA-256(IP_PSEUDONYM_KEY, canonicalIp)` plus a non-secret key epoch. In the production
Worker, `canonicalIp` comes **only** from the trusted, Cloudflare-overwritten
`CF-Connecting-IP` request header. `request.cf` is not the IP source, and no `x-forwarded-*` or
other forwarding-header fallback is accepted. Trusted bot-management signals may separately come
from `request.cf.botManagement`. Local tests inject an explicit test address through a server-only
helper. If `CF-Connecting-IP` is absent, privacy logging omits the pseudonym and security-sensitive
limiters fail according to their documented route policy.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function pseudonymizeIp(ip: string, key: string): string {
  return createHmac("sha256", key).update(ip).digest("hex");
}

export function equalLengthSecretMatches(candidate: string | null, expected: string): boolean {
  const left = Buffer.from(candidate ?? "", "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
```

`IP_PSEUDONYM_KEY` is a random 256-bit secret; `IP_PSEUDONYM_EPOCH` identifies the active key.
Rotate quarterly or after compromise. Rotation and retention are intentionally independent: a
daily purge deletes telemetry older than 90 days, including old epochs. Rows from old and new
epochs may coexist until expiry, but code must never correlate, translate or backfill identifiers
across epochs. A rotation resets short rate-limit continuity; that bounded effect is accepted.
Production tests prove forged forwarding headers do not affect the pseudonym.

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
- Markdown/MDX generated from canonical Payload Lexical is sanitised before rendering; raw HTML embedding is disabled.
- External redirects are never taken from user input — the only redirect targets are the Supabase
  signed URL and internal paths.

---

## 5.7 Static security headers

Set one static allowlist in `next.config.ts`; middleware and request-specific nonces are not used.
The CSP permits self plus only the exact PostHog, Sentry, Turnstile and approved Supabase/same-zone
media endpoints required by implemented features. No runtime font, icon or external media CDN is
allowed. Any new origin requires a decision plus privacy/performance review.

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
| **HMAC IP pseudonyms are still personal data** | Accepted and handled—daily 90-day purge, uncorrelated key epochs, disclosed in the privacy policy. |
