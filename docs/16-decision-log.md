# 16 — Decision Log

[← Back to PLAN.md](../PLAN.md)

Every entry is a decision that is **closed**. Reopening one requires a new entry with a reason,
not a quiet change of direction.

---

## 16.1 The eight original open questions

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 1 | Payload CMS vs Strapi | **Payload**, hosted on Render | Better Next.js and TypeScript integration, config-as-code collections, first-class drafts/preview. Render solves Payload's need for a persistent Node process. |
| 2 | Is Cloudflare AI Search the right semantic search? | **Yes**, with hard cost caps | Already in the stack, usable free tier, retrieval + generation in one managed service instead of stitching a vector DB, embedding job and LLM provider together. |
| 3 | Host everything on Vercel? | **No** — Vercel (web), Render (CMS + dashboard), Supabase (data). *Superseded on the web-hosting choice — see §16.6 #32.* | Payload needs a persistent process; splitting also keeps the service role key off Vercel entirely. |
| 4 | Best free rate limiting | **Cloudflare edge rules + Upstash Redis** | Edge absorbs floods; Upstash expresses precise sliding windows in a few lines. Postgres counters rejected — reinventing windowing plus a cleanup cron, and hitting the primary DB on every check. |
| 5 | Analytics combination | **PostHog + Sentry only** | One analytics tool, one error tool. Umami, OpenPanel, Vercel Analytics and Grafana all dropped — three overlapping analytics tools contradicted the "one responsibility per vendor" constraint. |
| 6 | CMS ↔ knowledge base ↔ AI Search sync | **Webhook + 3 retries + dead-letter queue + mandatory nightly reconciliation** | Event-driven alone silently loses content when a service is down. The nightly diff sweep is the only thing that catches "the webhook never fired at all". |
| 7 | Hidden scalability / security / maintenance concerns | Addressed across [05](05-security.md), [06](06-data-model.md), [08](08-resilience.md), [10](10-backups-and-portability.md) | RLS, secrets ownership, failure modes, backups and portability were the missing operational layer. |
| 8 | SEO & performance best practices | Baked into Phase 1, see [13](13-seo-and-agent-readability.md) | ISR, Server Components, `next/image`, `next/font`, JSON-LD, Lighthouse budgets in CI. |

---

## 16.2 Decisions from the architecture review

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 9 | Draft content preview | **Add it** — Payload drafts + Next.js Draft Mode, hardened per [02](02-content-model.md) | Without preview the workflow is publish-look-unpublish. Low effort, both tools support the pattern natively. |
| 10 | i18n | **Out of scope — English only** | A single-language personal site; recorded explicitly so locale routing is never retrofitted "just in case". |
| 11 | CMS admin auth | **Cloudflare Access** on `/admin/*` + Payload's own auth | Free for 50 users, zero code to maintain, no custom session handling. Vercel Password Protection is Pro-only; hand-rolled middleware adds risk for no benefit. |
| 12 | Dashboard auth | **Cloudflare Access** over the whole subdomain | Same reasoning; no auth code at all. |
| 13 | Protecting the CMS API | **Option A** — no Access rule on `/api/*` | The API only serves published content; Payload's `access` config gates every mutation. Option B (service tokens) protects data that is public anyway, at the cost of token plumbing and rotation. |
| 14 | Cookie consent banner | **Not required** | PostHog runs cookieless; the only cookies are strictly functional (draft mode, Cloudflare Access). Constraint: session replay must stay disabled. |
| 15 | Backups | **Weekly `pg_dump` + media sync + JSON/MDX export**, four weekly copies | Supabase free tier has no PITR. Plus a mandatory restore drill — an untested backup is not a backup. |
| 16 | Contact form abuse | **Turnstile always on + honeypot + rate limit (fail closed) + Slack** | Unlike the resume route there is no "normal usage" baseline, so the challenge is permanent rather than escalated. |
| 17 | Branch strategy | **Superseded by #37: one protected `main` branch** | The original two-environment assumption is replaced by one production Supabase project plus local Supabase, Payload and Workers-runtime development. |

---

## 16.3 Decisions from the production-readiness pass

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 18 | Signed URL replay window | **60s, accepted risk** (optional 30s) | Bearer-style by nature. The system exists to log and rate-limit downloads and stop hotlinking, not to guarantee per-user access. |
| 19 | Resume versioning | **Immutable versioned files kept forever + `is_current` pointer** | A PDF is a few KB against 10 GB free. Immutability means a live signed URL always resolves to the exact version it was minted for. |
| 20 | Rate limiter failure modes | Resume **open** · Ask AI **closed** · Contact **closed** | Recruiter experience outranks abuse risk on the resume; LLM spend and spam risk outrank convenience elsewhere. |
| 21 | Legal & utility pages | 404, error boundaries, privacy, robots.txt, humans.txt, **llms.txt**, sitemap, RSS | Missing entirely from v1.0. `llms.txt` + JSON-LD make the site agent-readable, which is now a first-class goal. |
| 22 | Testing strategy | typecheck + lint + unit + build on every PR; Playwright E2E on the resume flow; axe + keyboard in CI | Absent from v1.0. The resume flow is the highest-risk path and gets the dedicated smoke test. |
| 23 | Content portability | **Weekly JSON + MDX export to a private repo** | Answers "how does my writing get out if I leave Payload?" and drives the conservative field-design rule. |
| 24 | Accessibility enforcement | **axe-core in CI + dedicated keyboard specs** (+ optional Lighthouse CI) | A stated WCAG target with no mechanism regresses immediately. |
| 25 | Prompt injection & hallucination | **Four layers**: input validation, hardened system prompt, citation-required output gate, full query logging with a flagged panel | The output gate is the key move — the failure mode becomes "no answer" instead of "wrong answer attributed to me". |
| 26 | Error monitoring | **Sentry** | Nothing in v1.0 caught runtime errors in production. |
| 27 | Ask AI availability | **Always active** — no "unavailable" state | Backend failures return HTTP 200 with a soft inline message; the feature never visibly disappears. |
| 28 | Secrets management | Per-surface ownership, documented inventory, gitleaks in CI | Seven vendors across three hosting surfaces with no documented ownership was the largest blocking gap. |
| 29 | IP salt | Env-stored, identical across surfaces, **rotated quarterly with the retention purge** | A static forever-salt makes hashes permanent identifiers; rotating with the purge avoids mixed-salt windows. |
| 30 | RLS | **Deny-by-default on every table**, service-role-only access | The most common Supabase production incident; enabling RLS without explicit deny policies is not enough. |
| 31 | ORM for the app tables | **No ORM** — `supabase-js` with generated types (`supabase gen types typescript`); migrations stay plain SQL | Payload's Postgres adapter already manages the `payload` schema internally, so CMS tables get typed access for free. The five `public` tables need only inserts and simple single-row selects. An ORM would add serverless cold-start weight, a second migration system conflicting with the plain-SQL + RLS-in-the-same-migration discipline ([06](06-data-model.md)), and speculative abstraction. |

---

## 16.4 Rejected options (do not reintroduce without a new entry)

| Rejected | Instead | Why |
| --- | --- | --- |
| Strapi | Payload | Weaker TS/Next.js integration |
| Umami / OpenPanel / Vercel Analytics | PostHog | One analytics tool, not four |
| Grafana | Custom dashboard page | Overkill for a personal site; extra infrastructure |
| Postgres rate-limit counters | Upstash Redis | Reimplements sliding windows; hits the primary DB per request |
| Upstash-only rate limiting | Cloudflare edge + Upstash | Edge absorbs floods before they reach the app |
| Cloudflare Access service tokens for the CMS API | Path-scoped Access (Option A) | Protects public data at the cost of token plumbing |
| Google Sign-In / mandatory email for resume | One-click download + progressive security | Recruiter experience is the priority |
| reCAPTCHA | Turnstile | Free, invisible, privacy-friendly, no consent implications |
| Second Postgres for Payload | Shared Supabase instance, `payload` schema | One backup, one vendor, one connection family |
| Knowledge base inside the portfolio | Separate GitHub repo | Different content type, different audience, different lifecycle |
| PostHog session replay | Cookieless analytics only | Would change the no-consent-banner analysis |
| i18n / locale routing | English only | Not needed; explicitly out of scope |
| Prisma / standalone Drizzle (app-level ORM) | `supabase-js` + generated types + plain SQL migrations | Trivial query shapes; a second migration system would conflict with the RLS discipline; cold-start weight in a serverless/edge runtime |
| Vercel (public site hosting) | Cloudflare Workers via OpenNext | Its always-on `*.vercel.app` URL bypasses Cloudflare, making `cf-connecting-ip` spoofable ([05](05-security.md) §5.4) |
| ESLint | Oxlint | ESLint-compatible already; 50–100x slower with no benefit once Oxlint covers the same rules |
| Biome (combined lint + format) | Oxlint + Oxfmt | Both are Oxc-family tools already, so Biome's one-tool convenience doesn't buy anything extra; Oxlint's rule set and type-aware linting are the larger of the two ecosystems |
| Prettier | Oxfmt | Staying inside one toolchain (Oxc) end to end rather than mixing a Rust linter with a separate JS-ecosystem formatter; Oxfmt's beta status is an accepted risk — see §16.7 #36 |
| oxc-parser / transformer / resolver / minifier used directly | Next.js's built-in build pipeline | Lower-level bundler building blocks; Next.js already covers transpilation, resolution and minification, and oxc-minify is still alpha |

---

## 16.5 Standing constraints

- Everything must fit in a free tier
- Each vendor has exactly one responsibility
- No authentication unless a feature genuinely requires it
- Recruiter experience beats collecting user information
- Build for long-term maintainability and extensibility
- Keep the UI minimal, fast and content-focused

---

## 16.6 Decisions from the pre-coding review (2026-08-11)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 32 | Public site hosting (superseded by #38) | **Cloudflare Workers via OpenNext**, not Vercel | Vercel's always-on `*.vercel.app` URL is a permanent bypass of Cloudflare's edge, which made `cf-connecting-ip` spoofable on direct requests ([05](05-security.md) §5.4). The Worker has no non-Cloudflare origin to bypass. |
| 33 | Ask AI Turnstile escalation | **Not implemented** — application caps plus provider usage alerts are the complete control | The per-IP limit is 5/hour, the global cap is 50/day, the limiter fails closed, and current AI Search pricing separates included storage/indexing from separately billed Workers AI or AI Gateway usage. Configure alerts and a hard provider spending cap where available before production traffic. |
| 34 | Render environments for CMS/dashboard | **Production only** on Render; development is local against local Supabase | No hosted CMS/dashboard preview environment is needed. Render custom domains are proxied through Cloudflare Access and each default `*.onrender.com` hostname is disabled. |
| 35 | Resume upload mechanism | **Through Payload** — an admin-only `resume-uploads` collection whose `afterChange` hook writes the file into the private `resume` bucket and flips `resume_versions.is_current` | Reuses Payload's existing admin auth + Cloudflare Access and the service-role client already configured on Render ([04](04-resume-system.md) §4.4.1) — no new upload tooling, no manual SQL, and the public `media` bucket never sees the PDF. |

---

## 16.7 Decisions from the pre-coding review (2026-08-12)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 36 | Linter & formatter | **Oxlint** (lint) + **Oxfmt** (format) — the full Oxc toolchain | Oxlint is ESLint-compatible, stable, and 50–100x faster than ESLint with 800+ rules and stable type-aware linting. Oxfmt is Prettier-compatible and 30x faster than Prettier, but is still **beta** — accepted as a conscious risk for a solo project: pin the version, expect occasional formatting-opinion churn between releases, and fall back to Prettier if it proves too disruptive before it stabilises. Biome was considered as a single lint+format tool but rejected — staying inside one toolchain (Oxc) end to end is simpler than mixing vendors, and Oxlint's rule set is the larger of the two anyway. oxc-parser/transformer/resolver/minifier are not adopted directly: they are lower-level building blocks that Next.js's own build pipeline already covers (transpilation, resolution, minification), and oxc-minify is still alpha regardless. |

---

## 16.8 Decisions from the deployment and integration review (2026-08-13)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 37 | Development and production environments (supersedes #17) | **One protected `main` production deployment plus local-only development** | Supabase branching is not part of the free-tier plan. Local Supabase, Payload and Workers-runtime preview tests provide isolation without a hosted development environment or a second production secret set. |
| 38 | Cloudflare web runtime (supersedes #32) | **Cloudflare Workers via OpenNext** | The production runtime is Workers, not Pages or the Node.js Next dev server. `opennextjs-cloudflare preview` is required for production-like local integration tests; ISR, Draft Mode cookies, crypto and dynamic OG images are release gates. |
| 39 | AI Search integration | **Direct `AI_SEARCH` instance binding plus current Items API** | The Worker binding removes broad runtime API tokens. Stable Markdown keys drive uploads and reconciliation; item IDs are used for deletes. AI Search free limits, the 5/hour and 50/day application caps, and provider usage/spending alerts together bound cost. |
| 40 | Draft preview boundary | **Published-only public API plus scoped HMAC-protected internal draft reads** | Payload guest `read` access filters `_status = published`, `readVersions` requires a user, and only the selected `{ collection, slug }` can be fetched through the short-lived server-to-server preview endpoint. |
| 41 | Payload database proof | **Release gate before content features** | `schemaName: "payload"` is experimental, so local migrations, draft/publish, media upload, `pg_dump`, scratch restore and public-schema isolation must pass before production content work begins. |

---

## 16.9 Decisions from the design reference (2026-08-19)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 42 | Visual reference | **justaditya.com / Hackyfolio as the ~99% design reference**, documented in [19](19-design-reference.md) | Section-stack layout, registry-rendered sections, human/agent mode toggle and the full micro-interaction catalogue. The upstream repo has **no LICENSE**, so patterns are studied and reimplemented — no component files are copied. |
| 43 | Section content source | **Payload + a typed section manifest**, not a `portfolio.json` | Adopting Hackyfolio's JSON file verbatim would create a second content source that drifts from the CMS — the exact failure mode the sync pipeline exists to prevent. The manifest orders sections; all prose comes from Payload. |
| 44 | Intro loader | **Multilingual "Hello" overlay** (≤2s, once per session, skipped under reduced motion, never gates content) | The one big nuance taken from abhijithjinnu.in. Rendered above fully-painted HTML so crawlers and no-JS visitors are unaffected; CLS must stay 0. |
| 45 | `npx katbose` | **`packages/katbose-card` published to npm as `katbose`** — zero/near-zero deps, build-time content snapshot, manual publish | Package creation and publication were user-confirmed on 2026-08-24. No runtime network call; no npm credentials enter CI. |
| 46 | Theming | **Light/dark toggle via `next-themes`, defaulting to system preference** (placement clarified by #51) | Matches justaditya.com's actual UX — a manual switch, not silent detection alone. `next-themes` is a separately-licensed open-source package, not a Hackyfolio-authored file, so adopting it doesn't touch the §19.1 no-copying rule. Defaults to `system` on first visit; a manual choice persists to `localStorage` only once the visitor acts, so most visitors cause no write at all. Both palettes pass the same AA contrast token check ([12](12-accessibility.md)). |

---

## 16.10 Decisions from the design-reference follow-up (2026-08-19)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 47 | Scheduling | **Cal.com as a plain outbound link, not the `@calcom/embed-react` SDK** | Booking a call is a genuine need distinct from the Contact form's written-message flow (decision #16) — both stay, side by side. A link costs zero third-party bytes ([13](13-seo-and-agent-readability.md) §13.2), needs no CSP change ([05](05-security.md) §5.7), and adds no processor to the privacy policy ([14](14-privacy-and-compliance.md)) — the visitor leaves the site the same way they would for a GitHub or LinkedIn link. An inline embed is a possible future upgrade, but it would add all three of those costs and needs its own decision entry first. |

---

## 16.11 Decisions from the implementation-readiness review (2026-08-24)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 48 | Account and domain provisioning | **Create or confirm each vendor account just in time for its validation spike/phase; buy `katbose.dev` before the first remote Worker/domain test** | The project is still planning-only, so documentation names required resources without claiming they exist. Local Supabase and low-fidelity Workers tests begin before production accounts; no account blocks documentation work. Provisioning schedule lives in [17](17-env-vars.md) §17.1.1. |
| 49 | Image CDN | **Supabase Storage/CDN for immutable originals + Cloudflare Images for transformations; no Cloudflare Images storage** | Preserves Payload/Supabase as the media source of truth, uses the existing Cloudflare edge, and stays free for up to 5,000 unique transforms/month. A same-zone original proxy enables `onerror=redirect`, so quota exhaustion falls back to the original instead of breaking media ([01](01-architecture.md) §1.4.1). |
| 50 | Development content | **Deterministic local-only seed: one fixture per content type, one media image and one dummy resume PDF** | Approved for the build. Every component and workflow needs representative data before real content exists. The seed is explicitly blocked in production and uses `fixture-*` slugs so no dummy document can be indexed or mistaken for Kat's real work ([02](02-content-model.md) §2.1.1). |
| 51 | Theme toggle placement (clarifies #46) | **Two-state light ⇄ dark control in the top-right; a clean first visit follows the OS preference** | Matches justaditya.com and the requested UX. `defaultTheme="system"` chooses the initial resolved theme; clicking writes an explicit override to localStorage. There is no third "system" position in the visible toggle. |

---

## 16.12 Decisions from the implementation confirmations (2026-08-24)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 52 | Production deployment pipeline | **Cloudflare Workers Builds from protected `main`** | GitHub Actions remains the quality gate; Cloudflare owns the OpenNext build/deploy integration and its Worker secrets. This avoids adding a Cloudflare deployment token to GitHub Actions. |
| 53 | Hero timezone | **`Asia/Kolkata` (IST)** | The live clock should represent Kat's timezone consistently for every visitor; the browser's local timezone must not change the displayed zone. |
| 54 | Reference typography and palette | **Match the typography and light/dark color direction of justaditya.com, recreated in project-owned design tokens** | This honors the visual reference without copying upstream component/CSS files. Font licensing and contrast are verified during the Phase 1 design pass; both palettes remain subject to the accessibility gates. |

---

## 16.13 Decisions from the Spike A execution (2026-08-25)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 55 | Windows spike toolchain | **Build and install spike dependencies with npm inside `apps/web`; pnpm remains the committed project standard** | OpenNext recreates pnpm's symlink layout verbatim when copying traced files (`copyTracedFiles.js`), and esbuild cannot traverse those recreated directory symlinks on Windows ("Access is denied"). Separately, OpenNext's internal `pnpm build` invocation overflows cmd.exe's 8 KB command-line limit under long OneDrive paths — worked around with `next build && opennextjs-cloudflare build --skipNextBuild`. Revisit both at the Phase 1 monorepo scaffold; WSL remains the documented fallback if friction persists. |
| 56 | Validation-spike artifacts | **Spike scaffolds stay local-only; repositories receive results, not probe code** | The repo is documentation-first until the real Phase 1 monorepo scaffold lands. Committing throwaway probe routes plus hundreds of MB of `node_modules` contradicts that; `.gitignore` now excludes dependency/build artifacts (`node_modules/`, `.next/`, `.open-next/`, test output) at every depth. Spike A outcomes are recorded in [15](15-roadmap-and-checklist.md) §"Validation spikes". |
