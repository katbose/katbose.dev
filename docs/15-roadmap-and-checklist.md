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

- [x] Scaffold the smallest OpenNext app and run `test:spike:workers` in `workerd`
      (**local pass 2026-08-25** — 6/6 probes green via `opennextjs-cloudflare preview`;
      probe scaffold intentionally kept out of the repository, see decision [#56](16-decision-log.md))
- [x] Prove ISR/revalidation, Draft Mode cookies, Node-compatible crypto and dynamic OG images
      (ISR stale-while-revalidate with the R2 incremental cache binding; `__prerender_bypass`
      round-trip; `timingSafeEqual` from `node:crypto`; `ImageResponse` PNG — all verified in
      `workerd`, not `next dev`. **Superseded for OG images:** the dynamic `ImageResponse` route was
      replaced by a committed static PNG because `@vercel/og`'s WASM runtime pushed the Worker over
      the 3 MiB free-plan script limit. Per-post dynamic OG images return as Phase 2 work and need
      their own decision on how to fit the budget.)
- [ ] After `katbose.dev` is on Cloudflare, prove Supabase media original → same-zone proxy →
      `/cdn-cgi/image` transform/cache → `onerror=redirect` original fallback; a forced
      transform failure still displays the image
      (*partial local proof 2026-08-25: custom loader emits `/cdn-cgi/image?url=/media/original/{key}`
      URLs incl. a `w=640` variant and the origin proxy serves immutable PNG bytes; the actual
      edge transform requires the registered zone)
- [x] Prove a clean first visit follows emulated OS light/dark mode and the top-right toggle
      persists an explicit override (Playwright `colorScheme` emulation + reload persistence)

### Spike B — before Phase 2 feature work

- [ ] Run `test:spike:payload-schema` against local Supabase with `schemaName: "payload"` and
      migration-only mode (`push: false`)
- [ ] Seed one local fixture per content type, synthetic profile portrait, synthetic favicon and
      dummy resume PDF
- [ ] Complete create/draft/preview/publish/unpublish/upload, Profile/SiteSettings asset replacement,
      signed revalidation, `pg_dump`, scratch restore and schema-isolation checks

### Spike C — before Phase 3 feature work

- [ ] Provision the AI Search instance/binding and run `test:spike:ai-search`
- [ ] Prove upload/list/replace/chat with citations/key-to-ID delete/reconciliation
- [ ] Configure and verify the 5/hour, 50/day and Cloudflare provider usage alerts

Failure stops work on the dependent phase and creates a new decision-log entry; it is not patched
around silently.

---

## Phase 1 — Foundation

**Build**

- [x] Monorepo scaffold: pnpm workspaces, `apps/web`, `packages/shared`
- [x] Build the committed scaffold as an OpenNext Cloudflare Worker and run the full E2E suite in the Workers runtime (CI `quality` + `e2e`, 2026-08-27: `.open-next/worker.js` produced; 35 Playwright/axe tests pass under `opennextjs-cloudflare preview`). Windows/OneDrive bundling still fails on the documented pnpm-symlink limit; Linux CI is the normative check
- [ ] Extend `test:spike:workers` to the full documented Spike A contract ([11-testing-and-ci.md](11-testing-and-ci.md) §11.2.2): ISR stale-while-revalidate against the R2 incremental cache binding, Draft Mode cookie round-trip/expiry, and `timingSafeEqual` from `node:crypto`. The historical throwaway scaffold proved these on 2026-08-25; the committed spec currently asserts only agent output and the dynamic OG PNG
- [ ] Connect Cloudflare Workers Builds to protected `main`; production deploys from Workers Builds, not GitHub Actions
- [ ] Provision/confirm only the accounts needed for Phase 1 and record no credentials in Git ([17-env-vars.md](17-env-vars.md) §17.1.1)
- [x] TypeScript strict, Oxlint, Oxfmt, Vitest, Playwright configured
- [x] Tailwind + Base UI, design tokens, typography scale, contrast-checked light + dark palettes with a `next-themes` toggle (defaults to system preference)
- [x] Theme control is a two-state light ⇄ dark toggle in the top-right; clean first visit resolves from the OS preference
- [x] Layout, navigation, footer, skip link, mobile menu with focus trap
- [x] Home section stack per the design reference ([19-design-reference.md](19-design-reference.md)): typed section manifest + registry renderer, bottom bar with human/agent toggle, micro-interaction catalogue with reduced-motion fallbacks
- [x] Hero profile-portrait slot with reserved 1:1 geometry plus project-owned portrait and 32/48/180/192/512 PNG favicon fallbacks; asset props use future Payload schemas without requiring Phase 2
- [x] Intro loader (multilingual "Hello", ≤2s, once per session, skipped under reduced motion)
- [x] `katbose` npm package published (user-confirmed 2026-08-24)
- [x] Integrate `packages/katbose-card` source into the pnpm monorepo
- [x] Compare repository package contents with the published release (2026-08-27: **they diverge**. Published `katbose@0.0.1` is a 221-byte "under construction" stub with `index.js` at the package root, no `type: module`/`files`/`engines`, author `hello@katbose.dev` and a repository URL pointing at the non-existent `katbose/katbose-portfolio`. The workspace holds the real 496-byte card. Workspace metadata corrected and a drift guard added; `npx katbose` still serves the stub until a manual publish)
- [ ] Manually publish `katbose@0.0.2` from a tagged commit so `npx katbose` serves the real card ([19-design-reference.md](19-design-reference.md) §19.4.2 — publishing stays manual, no npm credentials in CI)
- [x] Pages: Home (hero, about, featured projects, experience preview, latest blog, latest TIE, contact CTA), Projects, Experience, Resume, Contact
- [x] Utility pages: `not-found.tsx`, `error.tsx`, `global-error.tsx`, `/privacy`, `/resume-unavailable`
- [x] Canonical `/agent`, plus `robots.txt`, `humans.txt`, generated `/llms.txt`, `sitemap.xml` and `rss.xml` from shared typed generators
- [x] SEO baseline: metadata, Open Graph, JSON-LD (`Person`, `BreadcrumbList`, `WebSite`) and deterministic bundled PNG favicons until Phase 2 activates Payload `SiteSettings`
- [x] Static CSP and security headers in `next.config.ts`; no middleware/nonces; no runtime external media/CDN origins
- [x] Image delivery implementation: immutable Supabase originals, Cloudflare Images fixed variants, cache headers and transform-error fallback; registered-zone proof remains a gate below
- [x] Sentry + PostHog repository wiring
- [ ] Create and live-verify Slack `#katbose-alerts` and `#contact-form`, Sentry and PostHog projects
- [x] Author public-table migrations, pgTAP/role tests and the protected backup-first production migration workflow in the working tree
- [x] Run public-table migrations and the pgTAP suites against real Postgres (CI `database`, 2026-08-27: Postgres 17.6.1.165; both migrations applied on `supabase start` and again on `supabase db reset`; `Files=2, Tests=72, Result: PASS`). Still unexecuted on this workstation because Docker is unavailable locally

**Gate**

- [x] **Env var inventory documented; documented server-secret identifiers absent from the built client static chunks (local scan 2026-08-27)**
- [x] **All current and default client-role grants on schemas, tables, sequences and functions revoked/controlled; RLS enabled/forced with restrictive denies on every application table; catalog + anon/authenticated CRUD tests pass; resume bucket private** — verified in CI against real Postgres 17.6 and Supabase Storage, 72 assertions (2026-08-27)
- [ ] **Contact form protection live: Turnstile + honeypot + rate limit (fail closed) + Slack** — code paths implemented and unit/E2E covered; the live widget, verification keys and vendor credentials are unprovisioned, so the form fails closed
- [ ] **Privacy policy published** — `/privacy` renders and passes axe, but publication depends on deployment
- [x] CI green **and enforced**: all four checks pass on `main` and the `main-protection` ruleset requires them as status checks (`quality`, `database`, `e2e`, `gitleaks`), with pull requests mandatory, force pushes and deletion blocked, squash-only merges, an empty bypass list, and strict up-to-date branches (2026-08-27; configuration recorded in [11-testing-and-ci.md](11-testing-and-ci.md) §11.2)
- [x] axe (WCAG 2.2 AA) and keyboard E2E pass on every current page **in the Workers runtime** (CI `e2e`, 35 tests under `opennextjs-cloudflare preview`, 2026-08-27)
- [ ] Design-reference gates pass ([19-design-reference.md](19-design-reference.md) §19.7): reduced-motion fallbacks, CLS = 0 with the intro loader and profile fallback, canonical `/agent` + generated `/llms.txt` from one route manifest, bottom-bar keyboard specs, no copied upstream files
- [ ] Spike A registered-zone image transform/cache/original-fallback probe passes
- [ ] Deployed to Cloudflare Workers via OpenNext from protected `main`
- [ ] Lighthouse ≥ 95 on Performance, SEO and Accessibility

---

## Phase 2 — Content Platform

**Build**

- [ ] Payload on Render via `render.yaml`, pointed at the Supabase `payload` schema
- [ ] **Validate the Payload Postgres adapter against Supabase with a non-default schema before building on it**
- [ ] Payload migrations, draft/publish flows, media upload, `pg_dump` and scratch restore prove the `payload` schema boundary
- [ ] Local-only idempotent seed supplies one `[Fixture]` Blog, TIE, Project and Experience, plus
      synthetic profile/favicon media and a dummy Resume PDF; production guard tested
- [ ] Collections: blog-posts, tie, projects, experience, media — with access control
- [ ] Globals: `Profile` owns the profile portrait + required alt text; `SiteSettings` owns the
      favicon; both use authenticated writes, published reads and upload relations to `media`
- [ ] Identity upload hooks enforce signature/MIME/size/dimension rules, immutable UUID keys,
      generated favicon variants and signed Home/metadata revalidation
- [ ] CORS restricted; GraphQL playground disabled in production; single admin user
- [ ] Blog + TIE authoring uses canonical Payload Lexical; derived Markdown/MDX rendering provides reading time, TOC, syntax highlighting, copy-code, tags and related posts
- [ ] Dynamic OG images; RSS and sitemap driven by CMS content
- [ ] Draft-aware fetching (`revalidate: 0` for drafts)

**Gate**

- [ ] **Secure draft preview: strong secret, equal-length constant-time check, clean-URL redirect, Server Component expiry enforcement, 15-minute TTL, redaction in Sentry and PostHog**
- [ ] **CMS domain and Access gate:** `cms.katbose.dev/admin/*` challenges through Cloudflare Access, the public `/api/*` remains readable, and the disabled `*.onrender.com` hostname returns 404
- [ ] **ISR fallback verified by taking the CMS offline** — cached pages still serve, uncached pages show the fallback component
- [ ] **Identity assets verified:** replacing the profile portrait and favicon creates new immutable
      URLs, revalidates Home/metadata, preserves alt/variant metadata and falls back cleanly when
      the CMS or relation is unavailable
- [ ] **Encrypted backup workflow running:** `pg_dump` + all-page content export + media/resume sync to private off-primary R2; GitHub artifact/repo copies are convenience only
- [ ] **One restore drill completed into a scratch database**
- [ ] Content export verified to produce readable derived MDX for every collection
- [ ] axe + keyboard tests extended to blog and TIE pages

---

## Phase 3 — AI Search

**Build**

- [ ] Cloudflare AI Search index provisioned
- [ ] `AI_SEARCH` instance binding configured in `wrangler.jsonc`; local preview uses `remote: true`
- [ ] Ask AI page: input, example queries, answers with citations, disclaimer, `aria-live` region
- [ ] Webhook `content-sync` with 3 retries, shared secret (constant-time check), dead-letter queue and Slack alert
- [ ] Nightly reconciliation workflow: DLQ retry (give up + alert at 5 attempts) + full sweep with gap-fill **and** stale purge
- [ ] Rate limits: 5/hour per HMAC IP pseudonym + 50/day global cap (fail closed); no Turnstile; Cloudflare AI Search/Workers AI usage alerts configured
- [ ] All four injection/hallucination layers: input validation, hardened system prompt, citation-required output gate, `ai_query_logs` with flagged panel

**Gate**

- [ ] **Reconciliation verified end-to-end: break the index endpoint, confirm the DLQ row, the Slack alert, and recovery on the nightly run**
- [ ] **Cost caps verified: the global cap returns the capacity message at query 51**
- [ ] **AI Search verified under the current binding and Items API: upload, list, replace, search with citations, and delete by item ID**
- [ ] **All four injection layers verified; output is discarded for zero citation IDs or any invented, stale or disallowed ID not resolving to the retrieved published allow-set**
- [ ] Fail-closed limiter behaviour proven for Ask AI: with an invalid Upstash token, Ask AI refuses while resume downloads still succeed
- [ ] Ask AI page passes axe + keyboard tests; results announced via the `aria-live` region

---

## Phase 4 — Resume Security

**Build**

- [ ] Private `resume` bucket in Supabase Storage
- [ ] Payload upload validation: size, MIME, `%PDF-` signature, collision-safe immutable UUID path and cleanup
- [ ] Serialized transactional `promote_resume_version` RPC preserves the old pointer until commit; its function fixes `search_path`, revokes `EXECUTE` from `PUBLIC`, `anon` and `authenticated`, and grants it only to `service_role`
- [ ] `resume_versions` table with the `is_current` partial unique index
- [ ] Signed URL route (60s TTL) with two-tier fallback (retry → `/resume-unavailable`)
- [ ] `/resume-unavailable` page with View Resume Online + Contact actions
- [ ] `download_logs` analytics — HMAC pseudonym and key epoch only, never raw IPs
- [ ] Progressive Turnstile escalation per the suspicion signals in [04-resume-system.md](04-resume-system.md)

**Gate**

- [ ] **E2E download test passes: never a 5xx, always a signed-URL redirect or the fallback page**
- [ ] **Fail-open behaviour proven: with Upstash unreachable, downloads still succeed**
- [ ] **Direct bucket object URL returns 400/403**
- [ ] Concurrent promotion/rollback verified: readers see the old or new complete pointer; upload/RPC failures clean the new object and preserve old current
- [ ] Turnstile challenge completes by POST with a signed intent; token never appears in a URL and only trusted `request.cf` bot data influences escalation

---

## Phase 5 — Analytics & Operations

**Build**

- [ ] `dashboard.katbose.dev` behind Cloudflare Access with the widget groups from [09-observability.md](09-observability.md)
- [ ] Daily retention purge scheduled independently of quarterly HMAC key rotation
- [ ] Full Slack alert catalogue wired ([09-observability.md](09-observability.md) §9.5)
- [ ] Weekly review ritual documented and calendarised

**Gate**

- [ ] **Cloudflare Access verified over the entire dashboard subdomain**
- [ ] **Retention purge verified once against real rows**
- [ ] **Every alert in the catalogue test-fired at least once**
- [ ] HMAC pseudonym rotation dry-run completed: rotate Worker key, increment epoch, redeploy, confirm logging/limiting, and verify no cross-epoch correlation

---

## Maintenance

| Cadence | Task |
| --- | --- |
| Daily | Purge telemetry older than 90 days |
| Weekly | 10-minute review: alerts, DLQ depth, flagged AI queries, Sentry, resume funnel |
| Monthly | Search Console, dependency updates, broken-link sweep |
| Quarterly | Rotate HMAC pseudonym key/epoch; restore drill; review accepted risks |
| Yearly | Re-read this plan end to end and retire anything that is no longer true |
