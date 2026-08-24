# 01 — Architecture

[← Back to PLAN.md](../PLAN.md)

---

## 1.1 System overview

```
                              ┌──────────────────────────────┐
                              │        Cloudflare            │
                              │  DNS · WAF · Rate Limiting   │
                              │  Turnstile · Access · AI     │
                              └──────────────┬───────────────┘
                                             │
        ┌────────────────────────────────────┼────────────────────────────────────┐
        │                                    │                                    │
┌───────▼────────┐                 ┌─────────▼─────────┐                ┌─────────▼─────────┐
│  katbose.dev   │                 │  cms.katbose.dev  │                │ dashboard.katbose │
│  Next.js       │                 │  Payload CMS      │                │ Private analytics │
│OpenNext Worker │                 │  Render           │                │ Render            │
└───────┬────────┘                 └─────────┬─────────┘                └─────────┬─────────┘
        │                                    │                                    │
        │  anon key / own API routes         │  service role key                  │  service role key
        └────────────────────────────────────┼────────────────────────────────────┘
                                             │
                                  ┌──────────▼───────────┐
                                  │      Supabase        │
                                  │ Postgres (public +   │
                                  │ payload schemas)     │
                                  │ Storage (private)    │
                                  └──────────────────────┘

Side services:
  Upstash Redis  → rate limiting counters
  PostHog        → product analytics (cookieless)
  Sentry         → error monitoring
  Slack          → #katbose-alerts, #contact-form
  GitHub Actions → CI, nightly reconciliation, weekly backup, secret scanning
```

**One responsibility per vendor** — this is a hard constraint. If a new service is proposed, it
must displace an existing one or justify itself in the [decision log](16-decision-log.md).

---

## 1.2 Domains

| Domain | Serves | Platform | Protected by |
| --- | --- | --- | --- |
| `katbose.dev` | Public Next.js site | Cloudflare Workers via OpenNext | Public |
| `cms.katbose.dev` | Payload CMS admin + REST/GraphQL API | Render (production only) | Cloudflare Access on `/admin/*` + Payload auth |
| `dashboard.katbose.dev` | Private analytics dashboard | Render (production only) | Cloudflare Access (whole subdomain) |

**Cloudflare Workers via OpenNext is the host for the public site** — chosen over Vercel
specifically so every request is routed through Cloudflare's edge. There is no separate
non-Cloudflare origin to bypass (unlike Vercel's always-on `*.vercel.app` URL), which is what
makes `cf-connecting-ip` trustworthy for hashing and rate limiting
([05-security.md](05-security.md) §5.4) without extra verification.

**Validate early (Phase 1, before layout work starts):** the public app runs as an OpenNext
adapter Worker, not in the local Node.js development runtime. Use `opennextjs-cloudflare preview`
in local integration tests and confirm ISR / on-demand revalidation, Draft Mode cookies,
Node-compatible crypto, dynamic OG image generation and the image CDN path work in `workerd`.
The exact pass/fail probe is in [15-roadmap-and-checklist.md](15-roadmap-and-checklist.md)
§"Validation spikes". Documentation does not mark the spike complete; it must execute once the
web scaffold and Cloudflare account exist. Vercel remains the documented fallback if this
production-runtime validation fails.

---

## 1.3 Why the CMS is hosted separately

Payload needs a **persistent Node process**, not just serverless functions, plus its own
long-lived database connection and file-upload handling. Running it inside the same Cloudflare
Worker deployment as the public site couples two very different runtime profiles.

Splitting it onto Render gives:

- A persistent process suited to the admin panel and background hooks
- Independent deploy cadence — CMS changes do not redeploy the public site
- A clean security boundary: the Supabase **service role key lives only in server-side Worker or
  Render secret bindings**

Costs of the split, all accepted and mitigated:

| Cost | Mitigation |
| --- | --- |
| Cross-origin API calls | Payload `cors` explicitly allows `https://katbose.dev` and the local development origin only; preview reads are server-to-server, never browser CORS requests |
| Render free-tier cold starts (30–60s) | ISR insulates content reads ([08-resilience.md](08-resilience.md)); webhooks are retried and reconciled nightly ([03-search-and-ai.md](03-search-and-ai.md)) |
| Outbound webhook reliability | Shared-secret header + retry + dead-letter queue |
| Second place to manage secrets | Documented inventory in [17-env-vars.md](17-env-vars.md), `render.yaml` blueprint committed with `sync: false` |

---

## 1.4 One database, two schemas

Payload does **not** get its own database. It connects to the same Supabase Postgres instance
using a dedicated `payload` schema:

```
Supabase Postgres
├── public   → contact_submissions, download_logs, resume_versions,
│              dead_letter_queue, ai_query_logs
└── payload  → Payload-managed tables (blog_posts, tie, projects, experience, media, users…)
```

Benefits: one backup covers everything, one connection string family, no second database vendor,
and the nightly/weekly jobs only have one target.

`schemaName` support is experimental in Payload, so validate it early (Phase 2, first task): on
local Supabase, run Payload migrations, create/draft/publish content, upload media, back up and
restore into a scratch database. Confirm Payload creates and reads only `payload` schema objects
and never changes the `public` application tables. If the proof fails, stop and record a new
database-boundary decision before building content features.

### 1.4.1 Image storage and CDN delivery

Media has one source of truth and two cache/optimization layers:

```
Payload upload
  → versioned object in the public Supabase `media` bucket
  → Supabase Storage CDN (original)
  → katbose.dev/media/original/{key} same-zone proxy
  → Cloudflare Images responsive transform + Cloudflare edge cache
  → browser
```

- **Supabase Storage remains the origin.** Cloudflare Images storage is not purchased; that would
  duplicate media and introduce a second upload lifecycle.
- **Cloudflare Images performs transformations only** (`format=auto`, `fit=scale-down`, fixed
  widths 320/640/960/1280/1920). Five widths bound the free-plan usage to at most five unique
  transformations per original per month; repeat requests are cached.
- A custom `next/image` loader generates same-zone `/cdn-cgi/image/` URLs whose source is
  `/media/original/{key}`. `onerror=redirect` therefore falls back to the original Supabase-CDN
  bytes when a transform fails or the 5,000 free-transform allowance is exhausted. Images
  degrade in size, never in availability.
- Original object keys are immutable/versioned and carry
  `Cache-Control: public, max-age=31536000, immutable`. Updating media creates a new key rather
  than overwriting one, so neither CDN needs an individual purge.
- Static UI assets in `apps/web/public` use the Worker assets/CDN path directly. The private
  resume bucket is never passed through Cloudflare Images; it keeps the signed-URL flow in
  [04-resume-system.md](04-resume-system.md).

---

## 1.5 Production and local development

There is one hosted environment and one deployed branch:

| Surface | Production | Local development |
| --- | --- | --- |
| Git / web | Cloudflare Workers Builds from protected `main` deploys the OpenNext Worker | Any local work is tested before merge; no branch auto-deploys |
| Supabase | One production project | `supabase start` with local database, Storage and generated local credentials |
| CMS / dashboard | Render production services only | `pnpm --filter cms dev` and dashboard dev processes run only on the developer machine |

Rules:

- `main` is the only branch that can deploy. CI must pass before it is merged or pushed through
  the protected release workflow.
- Cloudflare Workers Builds is connected to this repository with `main` as its production branch;
  GitHub Actions validates the change, while Workers Builds performs the production deployment.
- Run and test every public-table migration locally first. Before a production migration, take a
  backup; then apply the committed migration to the one production project.
- `.env.local` is local-only. Production secrets live only in Cloudflare and Render. There is no
  shared `dev`/`prod` secret inventory.
- `IP_HASH_SALT` must be identical across the production web Worker and Render services so hashes
  are comparable.
- No external health-check or keep-warm traffic is used for Render. Monitor its free-tier hour and
  bandwidth usage; the dashboard remains deferred until Phase 5.

---

## 1.6 Repository structure

Monorepo, pnpm workspaces:

```
katbose-portfolio/
├── apps/
│   ├── web/                  # Next.js public site → Cloudflare Workers via OpenNext
│   ├── cms/                  # Payload CMS → Render, production only (render.yaml blueprint)
│   └── dashboard/            # Private analytics dashboard → Render, production only
├── packages/
│   └── shared/               # shared types, Zod schemas, constants, utils
├── supabase/migrations/      # public-schema + RLS migrations, run in order
├── scripts/                  # export-content.ts, backup helpers, retention purge
├── e2e/                      # Playwright specs
├── .github/workflows/        # ci, nightly-reconciliation, weekly-backup, secret-scan
├── docs/                     # this documentation set
├── render.yaml               # Render blueprint (no secret values)
├── pnpm-workspace.yaml
└── PLAN.md
```

`apps/web` internals:

```
app/
  (site)/                     # public routes
  api/                        # route handlers
  not-found.tsx
  error.tsx
  global-error.tsx
components/
  ui/                         # primitives on top of Base UI
  common/
  layout/
  fallbacks/                  # CmsUnavailableFallback, EmptyState
features/
  blog/  projects/  tie/  resume/  ai/  contact/
lib/
  payload/                    # typed CMS client
  supabase/                   # server-only clients
  search/                     # Cloudflare AI Search client
  analytics/                  # PostHog wrappers
  rate-limit/                 # Upstash limiters + failure modes
  security/                   # hashIp, turnstile verify, injection screen
  preview/                    # draft-mode helpers
  monitoring/                 # Sentry + PostHog config with redaction
hooks/
types/
```

**Shared package rule:** anything used by two or more apps (Zod schemas, content types, constants
like rate-limit values) lives in `packages/shared` so the CMS and web app cannot drift apart.

---

## 1.7 Request paths

**Public content read**

```
Visitor → Cloudflare edge → Next.js (ISR cache hit) → HTML
                        └─ on revalidate → cms.katbose.dev/api/... → Payload → Postgres
```

Content pages are statically rendered with ISR. A visitor request almost never blocks on the CMS.

**Privileged operation (resume download, contact, Ask AI)**

```
Visitor → Cloudflare (WAF + edge rate limit) → Next.js route handler (OpenNext Worker)
        → Upstash rate limit → Turnstile (if escalated) → Supabase / Cloudflare AI Search
        → log to Postgres → response
```

Every privileged operation passes through a Next.js route handler. Nothing sensitive is called
directly from the browser, and the client never holds a service role key.

---

## 1.8 Core principles (non-negotiable)

- White, minimalistic UI; content first
- < 1s initial load; excellent Core Web Vitals
- Responsive, WCAG 2.1 AA, fully keyboard operable
- Excellent typography
- SEO optimized **and** agent-readable
- TypeScript-first, strict mode, no `any` in application code
- Everything inside free tiers
- Extensible, but no speculative abstraction
- Recruiter experience beats data collection — no login, no mandatory email, no forced sign-in
- Prefer boring, well-understood technology over novelty
