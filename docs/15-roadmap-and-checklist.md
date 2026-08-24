# 15 — Roadmap & Production Readiness Checklist

[← Back to PLAN.md](../PLAN.md)

---

## 15.1 How to read this

Each phase has a build list and a **gate**. A phase is not "done" until its gate items pass —
those are the ones that separate a demo from a production system. Bold items are the ones that
were missing from v1.0 and caused the plan to be judged not production-ready.

Nothing here depends on a hosted-runner restriction; the project lives in a personal GitHub
account where Actions run normally.

---

## Validation spikes — execution gates, not documentation claims

The architecture is approved, but these three integrations are not considered proven until their
commands in [11-testing-and-ci.md](11-testing-and-ci.md) §11.2.2 pass:

### Spike A — before Phase 1 feature work

- [ ] Scaffold the smallest OpenNext app and run `test:spike:workers` in `workerd`
- [ ] Prove ISR/revalidation, Draft Mode cookies, Node-compatible crypto and dynamic OG images
- [ ] After `katbose.dev` is on Cloudflare, prove Supabase media original → same-zone proxy →
	`/cdn-cgi/image` transform/cache → `onerror=redirect` original fallback; a forced
	transform failure still displays the image
- [ ] Prove a clean first visit follows emulated OS light/dark mode and the top-right toggle
	persists an explicit override

### Spike B — before Phase 2 feature work

- [ ] Run `test:spike:payload-schema` against local Supabase with `schemaName: "payload"` and
	migration-only mode (`push: false`)
- [ ] Seed one local fixture per content type, media image and dummy resume PDF
- [ ] Complete create/draft/preview/publish/unpublish/upload, `pg_dump`, scratch restore and
	schema-isolation checks

### Spike C — before Phase 3 feature work

- [ ] Provision the AI Search instance/binding and run `test:spike:ai-search`
- [ ] Prove upload/list/replace/chat with citations/key-to-ID delete/reconciliation
- [ ] Configure and verify the 5/hour, 50/day and Cloudflare provider usage alerts

Failure stops work on the dependent phase and creates a new decision-log entry; it is not patched
around silently.

---

## Phase 1 — Foundation

**Build**

- [ ] Monorepo scaffold: pnpm workspaces, `apps/web`, `packages/shared`
- [ ] **Validate the OpenNext Cloudflare Worker — ISR/revalidation, Draft Mode cookies, Node-compatible crypto and dynamic OG images — before building on it** ([01-architecture.md](01-architecture.md) §1.2)
- [ ] Connect Cloudflare Workers Builds to protected `main`; production deploys from Workers Builds, not GitHub Actions
- [ ] Provision/confirm only the accounts needed for Phase 1 and record no credentials in Git ([17-env-vars.md](17-env-vars.md) §17.1.1)
- [ ] TypeScript strict, Oxlint, Oxfmt, Vitest, Playwright configured
- [ ] Tailwind + Base UI, design tokens, typography scale, contrast-checked light + dark palettes with a `next-themes` toggle (defaults to system preference)
- [ ] Theme control is a two-state light ⇄ dark toggle in the top-right; clean first visit resolves from the OS preference
- [ ] Layout, navigation, footer, skip link, mobile menu with focus trap
- [ ] Home section stack per the design reference ([19-design-reference.md](19-design-reference.md)): typed section manifest + registry renderer, bottom bar with human/agent toggle, micro-interaction catalogue with reduced-motion fallbacks
- [ ] Intro loader (multilingual "Hello", ≤2s, once per session, skipped under reduced motion)
- [x] `packages/katbose-card`: `katbose` package created and published to npm (user-confirmed 2026-08-24); keep the monorepo source and published package synchronized
- [ ] Pages: Home (hero, about, featured projects, experience preview, latest blog, latest TIE, contact CTA), Projects, Experience, Resume, Contact
- [ ] Utility pages: `not-found.tsx`, `error.tsx`, `global-error.tsx`, `/privacy`, `/resume-unavailable`
- [ ] `robots.txt`, `humans.txt`, `llms.txt`, `sitemap.xml`, `rss.xml`
- [ ] SEO baseline: metadata, Open Graph, JSON-LD (`Person`, `BreadcrumbList`, `WebSite`)
- [ ] Security headers in `next.config.ts`
- [ ] Image CDN path: immutable Supabase originals, Cloudflare Images fixed variants, cache headers and transform-error fallback
- [ ] Sentry + PostHog wired; Slack `#katbose-alerts` and `#contact-form` created
- [ ] Public-table migrations pass against local Supabase; the protected `main` release workflow applies them to the one production project

**Gate**

- [ ] **Env var inventory documented; service role key confirmed absent from the client bundle**
- [ ] **RLS enabled with deny-by-default on every table; resume bucket private**
- [ ] **Contact form protection live: Turnstile + honeypot + rate limit (fail closed) + Slack**
- [ ] **Privacy policy published**
- [ ] CI green: typecheck, lint, unit, OpenNext build, Workers-runtime E2E; gitleaks passing; branch protection on `main`
- [ ] axe (WCAG AA) and keyboard E2E passing on every existing page
- [ ] Design-reference gates pass ([19-design-reference.md](19-design-reference.md) §19.7): reduced-motion fallbacks, CLS = 0 with the intro loader, agent view + `llms.txt` generated from one manifest, bottom-bar keyboard specs, no copied Hackyfolio files
- [ ] **Cloudflare Access on `/admin` verified not to block `/api` fetches (curl test)**
- [ ] Deployed to Cloudflare Workers via OpenNext from `main`; `cms.katbose.dev` and `dashboard.katbose.dev` custom domains are proxied through Cloudflare Access, and both `*.onrender.com` hostnames return 404
- [ ] Lighthouse ≥ 95 on Performance, SEO and Accessibility

---

## Phase 2 — Content Platform

**Build**

- [ ] Payload on Render via `render.yaml`, pointed at the Supabase `payload` schema
- [ ] **Validate the Payload Postgres adapter against Supabase with a non-default schema before building on it**
- [ ] Payload migrations, draft/publish flows, media upload, `pg_dump` and scratch restore prove the `payload` schema boundary
- [ ] Local-only idempotent seed supplies one `[Fixture]` Blog, TIE, Project, Experience, Media image and dummy Resume PDF; production guard tested
- [ ] Collections: blog-posts, tie, projects, experience, media — with access control
- [ ] CORS restricted; GraphQL playground disabled in production; single admin user
- [ ] Blog + TIE rendering: MDX, reading time, TOC, syntax highlighting, copy-code, tags, related posts
- [ ] Dynamic OG images; RSS and sitemap driven by CMS content
- [ ] Draft-aware fetching (`revalidate: 0` for drafts)

**Gate**

- [ ] **Secure draft preview: strong secret, constant-time check, clean-URL redirect, 15-minute TTL, redaction in Sentry and PostHog**
- [ ] **ISR fallback verified by taking the CMS offline** — cached pages still serve, uncached pages show the fallback component
- [ ] **Weekly backup workflow running: `pg_dump` + media sync + JSON/MDX export to the private backup repo**
- [ ] **One restore drill completed into a scratch database**
- [ ] Content export verified to produce readable MDX for every collection
- [ ] axe + keyboard tests extended to blog and TIE pages

---

## Phase 3 — AI Search

**Build**

- [ ] Cloudflare AI Search index provisioned
- [ ] `AI_SEARCH` instance binding configured in `wrangler.jsonc`; local preview uses `remote: true`
- [ ] Ask AI page: input, example queries, answers with citations, disclaimer, `aria-live` region
- [ ] Webhook `content-sync` with 3 retries, shared secret (constant-time check), dead-letter queue and Slack alert
- [ ] Nightly reconciliation workflow: DLQ retry (give up + alert at 5 attempts) + full sweep with gap-fill **and** stale purge
- [ ] Rate limits: 5/hour per hashed IP + 50/day global cap (fail closed); no Turnstile; Cloudflare AI Search/Workers AI usage alerts configured
- [ ] All four injection/hallucination layers: input validation, hardened system prompt, citation-required output gate, `ai_query_logs` with flagged panel

**Gate**

- [ ] **Reconciliation verified end-to-end: break the index endpoint, confirm the DLQ row, the Slack alert, and recovery on the nightly run**
- [ ] **Cost caps verified: the global cap returns the capacity message at query 51**
- [ ] **AI Search verified under the current binding and Items API: upload, list, replace, search with citations, and delete by item ID**
- [ ] **All four injection layers verified against known payloads; the output gate discards an answer with zero sources**
- [ ] Fail-closed limiter behaviour proven for Ask AI: with an invalid Upstash token, Ask AI refuses while resume downloads still succeed
- [ ] Ask AI page passes axe + keyboard tests; results announced via the `aria-live` region

---

## Phase 4 — Resume Security

**Build**

- [ ] Private `resume` bucket in Supabase Storage
- [ ] `resume_versions` table with the `is_current` partial unique index
- [ ] Signed URL route (60s TTL) with two-tier fallback (retry → `/resume-unavailable`)
- [ ] `/resume-unavailable` page with View Resume Online + Contact actions
- [ ] `download_logs` analytics — hashed identifiers only, never raw IPs
- [ ] Progressive Turnstile escalation per the suspicion signals in [04-resume-system.md](04-resume-system.md)

**Gate**

- [ ] **E2E download test passes: never a 5xx, always a signed-URL redirect or the fallback page**
- [ ] **Fail-open behaviour proven: with Upstash unreachable, downloads still succeed**
- [ ] **Direct bucket object URL returns 400/403**
- [ ] Version swap verified under a live signed URL — the URL resolves to the exact version it was minted for
- [ ] Turnstile appears only on suspicion, never for a first-time visitor

---

## Phase 5 — Analytics & Operations

**Build**

- [ ] `dashboard.katbose.dev` behind Cloudflare Access with the widget groups from [09-observability.md](09-observability.md)
- [ ] Retention purge script scheduled quarterly, aligned with salt rotation
- [ ] Full Slack alert catalogue wired ([09-observability.md](09-observability.md) §9.5)
- [ ] Weekly review ritual documented and calendarised

**Gate**

- [ ] **Cloudflare Access verified over the entire dashboard subdomain**
- [ ] **Retention purge verified once against real rows**
- [ ] **Every alert in the catalogue test-fired at least once**
- [ ] Salt rotation dry-run completed: rotate, redeploy both surfaces, spot-check that downloads still log and rate limiting still counts

---

## Maintenance

| Cadence | Task |
| --- | --- |
| Weekly | 10-minute review: alerts, DLQ depth, flagged AI queries, Sentry, resume funnel |
| Monthly | Search Console, dependency updates, broken-link sweep |
| Quarterly | Rotate `IP_HASH_SALT`; run retention purge; restore drill; review accepted risks |
| Yearly | Re-read this plan end to end and retire anything that is no longer true |
