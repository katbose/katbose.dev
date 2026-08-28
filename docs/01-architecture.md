# 01 — Architecture

[← Back to PLAN.md](../PLAN.md)

---

## 1.1 System overview

```text
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
        │  server-only service role          │  service role key                  │  service role key
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

**Runtime lock:** the public app is an OpenNext Cloudflare Worker, not the local Node.js runtime;
Vercel is not a fallback. The local Spike A runtime probes passed in `workerd` on 2026-08-25. The
registered-zone Supabase-original → same-zone proxy → `/cdn-cgi/image` transform/cache → original
fallback check remains a fail-stop gate before image delivery is called production-ready. Spike B
and Spike C similarly stop Phase 2 and Phase 3 if their contracts fail. Exact contracts live in
[15-roadmap-and-checklist.md](15-roadmap-and-checklist.md).

---

## 1.3 Why the CMS is hosted separately

Payload needs a **persistent Node process**, not just serverless functions, plus its own
long-lived database connection and file-upload handling. Running it inside the same Cloudflare
Worker deployment as the public site couples two very different runtime profiles.

Splitting it onto Render gives:

- A persistent process suited to the admin panel and background hooks
- Independent deploy cadence — CMS changes do not redeploy the public site
- A clean security boundary: the Supabase **service role key lives only in server-side Worker or
  Render secret bindings**. Privileged Supabase operations from the public Worker use that
  server-only service-role client; browser code and anon-key clients have no privileged path.

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

```text
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

```text
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
- The Payload-managed homepage portrait and favicon use this same media origin. Metadata points to
  the favicon's immutable same-origin key, while the portrait uses the standard responsive image
  path. Bundled project-owned defaults remain in `apps/web/public` for an unset asset or a
  first-render CMS failure; no browser requests Payload or Supabase directly.
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
- `IP_PSEUDONYM_KEY` and `IP_PSEUDONYM_EPOCH` exist only on the production web Worker. Render
  never computes visitor pseudonyms, and epochs are never correlated.
- No external health-check or keep-warm traffic is used for Render. Monitor its free-tier hour and
  bandwidth usage; the dashboard remains deferred until Phase 5.

---

## 1.6 Repository structure

Monorepo, pnpm workspaces. Entries marked **planned** are architecture targets for later phases,
not claims that the directory exists in the current Phase 1 checkout:

```text
katbose-portfolio/
├── apps/
│   ├── web/                  # Next.js public site → Cloudflare Workers via OpenNext
│   ├── cms/                  # planned Phase 2: Payload CMS → Render
│   └── dashboard/            # planned Phase 5: private analytics dashboard
├── packages/
│   ├── shared/               # shared types, Zod schemas, constants, utils
│   └── katbose-card/         # integrated source for the published `katbose` package
├── supabase/                 # migrations, local config and pgTAP security tests
├── scripts/                  # backup-set contracts and restore tooling; later phases add content export and retention purge
├── e2e/                      # Playwright specs
├── .github/workflows/        # CI, migration, secret scan and weekly backup; Phase 3 adds reconciliation
├── docs/                     # this documentation set
├── render.yaml               # planned Phase 2 Render blueprint
├── pnpm-workspace.yaml
└── PLAN.md
```

`apps/web` internals:

```text
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
  security/                   # IP pseudonym, Turnstile verify, injection screen
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

```text
Visitor → Cloudflare edge → Next.js (ISR cache hit) → HTML
                        └─ on revalidate → cms.katbose.dev/api/... → Payload → Postgres
```

Content pages are statically rendered with ISR. A visitor request almost never blocks on the CMS.

**Privileged operation (resume download, contact, Ask AI)**

```text
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
- Responsive, WCAG 2.2 AA, fully keyboard operable
- Excellent typography
- SEO optimized **and** agent-readable
- TypeScript-first, strict mode, no `any` in application code
- Everything inside free tiers
- Extensible, but no speculative abstraction
- Recruiter experience beats data collection — no login, no mandatory email, no forced sign-in
- Prefer boring, well-understood technology over novelty

---

## 1.9 Final implementation boundaries

- **Baseline:** Node.js 24 Active LTS, Corepack-managed pnpm 11, strict TypeScript, no application `any`,
  exact package versions and committed lockfile. Native Windows is supported; WSL2 from a short
  Linux path is the fallback for OpenNext symlink/path/command-length failures.
- **Workers Builds:** repository root is the build root; install is
  `corepack enable && pnpm install --frozen-lockfile`; build is `pnpm --filter web build`; bindings
  live in `apps/web/wrangler.jsonc`. Workers Builds never runs migrations.
- **Migrations:** a protected explicit GitHub workflow owns production Supabase migrations and must
  complete before a migration-bearing commit reaches deployment-triggering `main`.
- **Phase ownership:** Phase 1 owns the web/runtime and Spike A remote image gate; CMS domain/Access
  and Payload belong to Phase 2; AI Search to Phase 3; resume security to Phase 4; dashboard
  domain/Access to Phase 5. The published npm package has integrated monorepo source; release parity
  must still be checked before the next publish.
- **Rendering boundary:** Server Components own pages, content fetches, metadata, `/agent` and
  derived Markdown. Client Components are leaf islands for theme, intro, clock, bottom bar, forms,
  Turnstile and bounded motion, receiving validated serializable props only.
- **Asset boundary:** no runtime external font, icon or media CDN. Fonts/assets are self-hosted or
  build-time inlined; content media uses only the approved Supabase-original → same-zone Cloudflare
  proxy/transform/fallback path.
