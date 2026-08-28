# 16 — Decision Log

[← Back to PLAN.md](../PLAN.md)

Entries are immutable historical records. The canonical status field uses exactly this vocabulary:

- **Current normative** — the current decision; implementation may proceed.
- **Historical—superseded** — a preserved historical decision replaced by a numbered later entry.
- **Current—reason corrected** — the conclusion remains current, but later evidence corrected its reasoning.
- **Decided—validation pending** — the decision is made, but dependent work stops until its named validation passes.
- **Deferred—closed for current phase** — deliberately excluded from the current phase; reconsideration requires a later decision.

`clarifies`, `corrects` and `supersedes` are relationship annotations, not status values. Never
rewrite historical wording to make it look current. Annotate the old entry and add a new numbered
entry with the reason. Revising a current normative decision always requires a new entry.

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
| 50 | Development content | **Deterministic local-only seed: one fixture per content type, one media image and one dummy resume PDF** | Approved for the build. Every component and workflow needs representative data before real content exists. The seed is explicitly blocked in production and uses `fixture-*` slugs so no dummy document can be indexed or mistaken for KatBose's real work ([02](02-content-model.md) §2.1.1). |
| 51 | Theme toggle placement (clarifies #46) | **Two-state light ⇄ dark control in the top-right; a clean first visit follows the OS preference** | Matches justaditya.com and the requested UX. `defaultTheme="system"` chooses the initial resolved theme; clicking writes an explicit override to localStorage. There is no third "system" position in the visible toggle. |

---

## 16.12 Decisions from the implementation confirmations (2026-08-24)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 52 | Production deployment pipeline | **Cloudflare Workers Builds from protected `main`** | GitHub Actions remains the quality gate; Cloudflare owns the OpenNext build/deploy integration and its Worker secrets. This avoids adding a Cloudflare deployment token to GitHub Actions. |
| 53 | Hero timezone | **`Asia/Kolkata` (IST)** | The live clock should represent KatBose's timezone consistently for every visitor; the browser's local timezone must not change the displayed zone. |
| 54 | Reference typography and palette | **Match the typography and light/dark color direction of justaditya.com, recreated in project-owned design tokens** | This honors the visual reference without copying upstream component/CSS files. Font licensing and contrast are verified during the Phase 1 design pass; both palettes remain subject to the accessibility gates. |

---

## 16.13 Decisions from the Spike A execution (2026-08-25)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 55 | Windows spike toolchain | **Build and install spike dependencies with npm inside `apps/web`; pnpm remains the committed project standard** | OpenNext recreates pnpm's symlink layout verbatim when copying traced files (`copyTracedFiles.js`), and esbuild cannot traverse those recreated directory symlinks on Windows ("Access is denied"). Separately, OpenNext's internal `pnpm build` invocation overflows cmd.exe's 8 KB command-line limit under long OneDrive paths — worked around with `next build && opennextjs-cloudflare build --skipNextBuild`. Revisit both at the Phase 1 monorepo scaffold; WSL remains the documented fallback if friction persists. |
| 56 | Validation-spike artifacts | **Spike scaffolds stay local-only; repositories receive results, not probe code** | The repo is documentation-first until the real Phase 1 monorepo scaffold lands. Committing throwaway probe routes plus hundreds of MB of `node_modules` contradicts that; `.gitignore` now excludes dependency/build artifacts (`node_modules/`, `.next/`, `.open-next/`, test output) at every depth. Spike A outcomes are recorded in [15](15-roadmap-and-checklist.md) §"Validation spikes". |

---

## 16.14 Decisions from the design-system pass (2026-08-26)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 57 | Typeface | **DM Sans (SIL OFL 1.1) for every text role; JetBrains Mono scoped to code blocks and the `npx katbose` card** | Measured from the reference: one family across headings, body, the pronunciation line and the clock, with no monospace face present anywhere. DM Sans is openly licensed, so matching it raises no licensing question. Mono is kept only for syntax-highlighted code and the terminal card — surfaces the reference does not have, and where a mono face is functional rather than decorative. Closes the font question deferred by #54. ([20](20-design-system.md) §20.5.1) |
| 58 | Brand marks for the tech-stack section | **`simple-icons` imported at build time and inlined; no runtime icon CDN** | Brand logos are outside lucide-react's scope, so a second source is unavoidable. The reference fetches them from `cdn.simpleicons.org` per request; adopting that would add a third-party origin, a CSP exception and per-image latency against the third-party budget in [13](13-seo-and-agent-readability.md) §13.2, which admits only PostHog, Sentry and Turnstile. Inlining at build time keeps the marks self-hosted, versioned and free. ([20](20-design-system.md) §20.11) |
| 59 | Reference-only section types — `recommendations`, `publications`, `youtube`, `podcast` | **Deferred past Phase 1** | Each needs either a new Payload collection (recommendations, publications) or a third-party embed policy (youtube, podcast). Neither belongs in a phase whose gate is security, accessibility and performance. The Home manifest is ordered data, so adding one later is a config entry plus one renderer — no architectural cost to waiting. Revisit with a new entry when there is real content to publish. ([20](20-design-system.md) §20.14) |
| 60 | Dark palette | **Project-defined and contrast-verified; parity with the reference's dark mode is not claimed.** *Superseded — see #66. The values were obtained from upstream source, so parity is now exact.* | The measurement captured light mode only. Rather than block the design pass on a second run, the dark mapping is derived from the same Tailwind `gray` ramp and verified against AA — text at 19.27:1 / 13.66:1 / 7.93:1 and focusable boundaries at 4.16:1. A later dark-mode measurement can refine the values, but that is a token edit, not a design change. ([20](20-design-system.md) §20.4.2, §20.18) |
| 61 | Using upstream Hackyfolio source | **Not used. Visual parity is achieved by measuring rendered output and reimplementing.** *Superseded on the licensing question — see #63. The architectural half still stands.* | Re-verified 2026-08-26 rather than assumed: `PythonHacker24/yo-hackyfolio` still has no LICENSE file and GitHub reports no licence, so default copyright applies — the `open-source` topic tag and the site's "Open source" label are descriptions, not grants. The upstream README does invite template use (clone, edit `portfolio.json`, deploy), which covers using it as intended but not lifting components into a different codebase. Independently of licensing, the upstream stack (shadcn/Radix, a JSON content file, Vercel) conflicts with decisions #1, #37/#38 and the Base UI choice, so adapting it would cost more than reimplementing against [20](20-design-system.md). What *is* adopted is architecture and measured fact: the ordered manifest, the registry with an exhaustive switch, the per-section data type, the rich-text block shape, the single Markdown generator, and the measured tokens. Reopening requires an added LICENSE or written permission from the author, recorded as a new entry. ([19](19-design-reference.md) §19.1, [20](20-design-system.md) §20.18.1) |
| 62 | Reference author's content | **Never enters this repository in any form, including as fixture or placeholder data** | Biography, roles, essays, publication and client recommendations are the reference author's personal information and prose. Development data is the `[Fixture]`-prefixed set defined in [02](02-content-model.md) §2.1.1; real content is KatBose's, entered through Payload. ([20](20-design-system.md) §20.18.1) |

---

## 16.15 Upstream permission (2026-08-26)

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 63 | Upstream Hackyfolio source, now that permission exists (supersedes the licensing half of #61) | **Express permission granted by the author to use the repository for building this portfolio. Consulting and adapting upstream source is therefore allowed; wholesale adoption is still declined, on architectural grounds only** | The author confirmed he cannot add a LICENSE file but gave direct permission to use the repository for KatBose's portfolio (user-confirmed 2026-08-26). Permission from the copyright holder is a grant; a LICENSE file would have been the publicly verifiable form of the same thing, not a stronger one. **Evidence:** a dated WhatsApp message from the author granting use of the complete repository (2026-08-26). The chat export and a screenshot are archived outside this repository — deliberately not committed, since it is private correspondence. **Conditions of record:** he is credited in the README, and the grant is treated as scoped to building this portfolio — it does not make the upstream code open-source, so republishing it as a template or relicensing it would need separate agreement. **Unaffected:** #62 still stands — his biography, essays, publication and client recommendations stay out of this project entirely, including as fixtures. **Scope of use, set 2026-08-26: inspiration only.** Base UI and the architecture in [01](01-architecture.md) are not up for renegotiation. Upstream is consulted for layout, section anatomy, interaction detail and measured values; every component in `apps/web` is written against our own tokens, types and Base UI primitives. The Phase 1 licence gate therefore stands unchanged in substance — no upstream file is copied in — but it is now a quality and architecture rule rather than a legal one. **Correcting an overstatement in #61:** upstream is not a shadcn/Radix installation — `app/components/ui/` contains a single animated theme toggle. The genuine divergences are the hand-edited `portfolio.json` as content source (vs Payload, #1), Vercel deployment (#37/#38), and TypeScript essay modules (vs Payload + MDX, [02](02-content-model.md) §2.2). Those are why wholesale adoption is wrong, independent of licensing. |

---

## 16.16 Decisions from the upstream survey (2026-08-26)

Recorded after reading the upstream tree. These are architectural calls, taken because upstream is
**inspiration only** (#63) and its choices are not automatically ours.

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 64 | Next.js middleware | **Not used. Anything upstream solves in `middleware.ts` is solved with a route handler or a Server Component** | Upstream carries a root `middleware.ts`. Middleware runs through the OpenNext adapter with its own constraints, and Spike A validated ISR/revalidation, Draft Mode cookies, `node:crypto` and dynamic OG images — **not** middleware ([15](15-roadmap-and-checklist.md) §"Validation spikes"). Taking a dependency on an unvalidated adapter surface for something a route handler does natively adds risk for no gain. If a genuine middleware need appears later it requires its own spike and a new entry. |
| 65 | Theme resolution and the URL | **The resolved theme is never read from a query parameter.** *Reasoning corrected — see #67. The conclusion holds; the stated cause was wrong.* | Original reasoning, recorded as written: "on an ISR-cached route that makes the rendered output vary by query string, so one visitor's parameter can be served to another from a shared cache entry". This was asserted before reading the upstream implementation and is **not correct** — see #67. |

---

## 16.17 Decisions from reading upstream source (2026-08-26)

Taken after reading `app/globals.css` and `app/components/ThemeFromQuery.tsx` directly, which
resolved one open question and corrected one badly-reasoned entry.

| # | Question | Decision | Reasoning |
| --- | --- | --- | --- |
| 66 | Dark palette (supersedes #60) | **Exact parity: pure black background, pure white text. Both themes are the two ends of the same ramp, swapped** | Upstream defines only two theme variables — background and foreground — flipping white/black in light to black/white in dark. There is no dark gray ramp to match; per-element greys come from Tailwind utilities. So parity is reachable precisely, and #60's "not measured, not claimed" position is no longer needed. Our mapping becomes `--color-bg: --gray-1000` / `--color-text: --gray-0` in dark, the mirror of light. Verified on true black: text 21.00:1, secondary 14.25:1, tertiary 8.27:1, focusable boundaries 4.34:1 — all pass. **Accepted tradeoff:** pure black with pure white text maximises contrast but can cause halation for readers with astigmatism, and smearing on some OLED panels. Matching the reference is chosen deliberately; softening to `--gray-950`/`--gray-50` (20.10:1) is a two-token change if it reads badly in review. **Also confirmed:** `--font-sans` resolves to a DM Sans variable, independently validating #57. |
| 67 | `?theme=` query parameter — corrected reasoning for #65 | **Still not adopted, but the ISR argument in #65 was wrong** | #65 claimed a query-driven theme would poison the ISR cache. Having read the implementation, that is false: it is a client component reading `useSearchParams` inside `useEffect` and calling `setTheme` after hydration. Server-rendered HTML never varies, so nothing is cached wrongly. The real objection is different and narrower: because the switch happens *after* hydration, a visitor arriving on `?theme=dark` with a light system preference sees light paint first and then flip. That is precisely the flash of the wrong theme that #46/#51 rule out. Making it flash-free means resolving the parameter during render, which *would* vary output per query string — so the cache concern belongs to the fixed version, not to theirs. The feature (shareable theme-pinned links) is judged not worth either cost. `?view=agent` is unaffected: it is a genuine content variant with its own cache key, not a post-hydration client override. |

---

## 16.18 Final implementation lock (2026-08-26)

Architecture and Phase 1 choices are closed. Spike A's remote image pass, Spike B and Spike C are
**validation gates**: failure stops dependent work and creates a new decision; it does not silently
change architecture.

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 68 | **Current normative** | *Relationship: clarifies #55.* **Runtime/package baseline:** Node.js 22 LTS, Corepack-managed pnpm 10, strict TypeScript and pinned exact package versions/lockfile. Native Windows is supported; if OpenNext hits symlink, path-length or `cmd.exe` limits, use WSL2 from a short Linux path. | The npm-only Spike A workaround was probe-specific. The committed monorepo has one package manager and a documented Windows fallback rather than two lockfiles. |
| 69 | **Current normative** | *Relationship: clarifies #43.* **Payload owns content:** a `Profile` global owns hero/profile/contact/social/skills data; Payload collections own projects, experience, Blog and TIE; story and education prose also come from Payload. Lexical is the canonical rich-text representation. The Home manifest contains order, section type, stable IDs and display configuration only. | The manifest must never become a second prose database. Markdown/MDX are derived exports/renderings, not authoring truth. |
| 70 | **Current normative** | *Relationship: supersedes the expiry mechanics in #40/#64 examples.* **Preview expiry without middleware:** the page Server Component verifies signed scope and `expiresAt` before a draft read; an expired scope invokes a same-origin exit Route Handler that disables Draft Mode, deletes preview cookies and redirects to the clean published URL. | Cookie `maxAge` is storage hygiene, not authorization. This preserves the 15-minute fail-closed TTL without adding an unvalidated middleware surface. |
| 71 | **Current normative** | **Agent routes:** `/agent` is the canonical crawlable human-readable Markdown view. A typed route manifest drives navigation, `/agent`, sitemap/robots metadata and generated `/llms.txt`. The repository-root `llms.txt` is a checked-in planning snapshot only until the scaffold exists and must match docs/13's sample. | One manifest prevents route drift. A query-string mode may redirect to `/agent` for compatibility but is not canonical. |
| 72 | **Current normative** | *Relationship: corrects #29.* **IP pseudonyms:** use HMAC-SHA-256 with a secret `IP_PSEUDONYM_KEY` and stored epoch, sourcing IPs only from the trusted, Cloudflare-overwritten `CF-Connecting-IP` request header in the production Worker. Purge telemetry daily at 90 days; rotate keys quarterly or on compromise. Old epochs may coexist until purged and are never correlated. | A keyed HMAC is stronger than `SHA-256(IP + salt)`. Retention must not wait for rotation. Equal-length `timingSafeEqual` is the shared secret-comparison helper. |
| 73 | **Current normative** | *Relationship: corrects #30.* **Client-role database denial:** revoke current schema/table/sequence/function grants from `anon` and `authenticated`, control default table/sequence/function privileges, enable/force RLS, and add role-scoped restrictive deny policies. CI inspects current/default ACL and RLS catalogs and attempts every CRUD operation as both roles. | PostgreSQL permissive policies combine with `OR`; a permissive false policy cannot protect against a later permissive allow policy. |
| 74 | **Current normative** | *Relationship: clarifies #64.* **Static security headers:** CSP and other headers are a static allowlist in `next.config.ts`; no middleware and no request-specific nonce dependency. Runtime external media/CDNs are not permitted. | A static CSP fits the current fixed origin set and avoids an unvalidated runtime surface. Any origin addition requires a decision and privacy/performance review. |
| 75 | **Current normative** | *Relationship: clarifies #52.* **Workers Builds ownership:** repository root is the build root; install is `corepack enable && pnpm install --frozen-lockfile`; build is `pnpm --filter web build`; `apps/web/wrangler.jsonc` owns Worker bindings. Workers Builds deploys pushes to protected `main` and never runs database migrations. A protected, explicit GitHub production-migration workflow owns committed Supabase migrations and must complete before merging a migration-bearing release. | This removes the root-directory ambiguity and prevents web deployment from implicitly owning data changes. |
| 76 | **Current normative** | **Phase ownership:** Phase 1 owns web scaffold, public routes, design system, route manifest, baseline security/CI and remote Spike A image proof. Phase 2 owns Payload, CMS domain/Access gates, content, preview and Spike B. Phase 3 owns AI Search and Spike C. Phase 4 owns resume storage/download security. Phase 5 owns dashboard domain/Access, analytics operations and retention verification. The npm package is published; monorepo integration remains Phase 1. | Provisioning and gates belong to the phase that can actually exercise them. |
| 77 | **Current normative** | *Relationship: clarifies #42/#54/#63.* **Reference precedence:** observed source facts inform anatomy and measurements; project tokens, Base UI, WCAG 2.2 AA, performance budgets and architecture are normative. Deliberate differences are documented. Permission is inspiration-only for this project: no upstream file or content is copied, and Base UI remains the sole primitive library. | A visual reference cannot override project constraints or become an implementation dependency. |
| 78 | **Current normative** | **Server/Client boundary:** pages, layouts, content fetches, metadata, agent Markdown and schema mapping are Server Components/modules by default. Client Components are leaf islands only for theme, intro, clock, bottom bar state, forms, Turnstile and bounded motion; they receive serializable validated props and never import server-only clients or secrets. | This minimizes JavaScript and makes secret boundaries reviewable. |
| 79 | **Current normative** | **Exhaustive registries plus runtime schemas:** every manifest section and rich-text block is a discriminated union with an exhaustive `never` check; external/CMS data is parsed by exhaustive Zod schemas before registry dispatch. Strict TypeScript and no `any` apply to application code. | Compile-time exhaustiveness does not validate network data; both layers are required. |
| 80 | **Current normative** | *Relationship: supersedes #24's version target.* **Accessibility target is WCAG 2.2 AA.** Axe, keyboard, focus, zoom, reduced-motion and manual screen-reader gates apply to every phase. | The newer AA target is normative across docs, CI and design tokens. |
| 81 | **Current normative** | *Relationship: clarifies #58.* **No runtime external media/CDNs:** fonts, UI assets and brand marks are self-hosted/build-time inlined. Content media uses immutable Supabase originals through the approved same-zone Cloudflare transform/proxy path; no browser fetches an icon/font/image CDN. | This bounds CSP, privacy, availability and performance. Plain outbound links such as Cal.com are navigation, not embedded runtime media. |
| 82 | **Current normative** | **Boundary validation:** shared Zod schemas allow only `https:` URLs (plus explicit internal relative routes), normalize and reserve slugs, reject traversal/control characters, cap field sizes, and parse a closed Lexical node/block union. Renderers ignore no unknown node silently; schema changes fail tests until explicitly supported. | URL, slug and rich-text validation are security and portability requirements, not CMS-editor convenience. |
| 83 | **Current normative** | *Relationship: corrects #35.* **Atomic resume promotion:** validate size, MIME and `%PDF-` signature; upload to a UUID collision-safe immutable path with overwrite disabled; call a serialized transactional RPC that preserves the old pointer until the new row is committed. The function fixes `search_path`, revokes `EXECUTE` from `PUBLIC`, `anon` and `authenticated`, and grants it only to `service_role`. Delete the new object on RPC failure and always remove temporary uploads. | Two independent updates can expose zero current rows and race concurrent uploads. The database transaction and partial unique index own promotion. |
| 84 | **Current normative** | *Relationship: clarifies #25.* **Structured citation IDs:** assign opaque request-local IDs to retrieved allowed chunks; require model structured output containing those IDs; render only when every emitted ID resolves to the retrieved published allow-set and at least one valid citation exists. | Source-array presence alone does not prove the model cited an allowed retrieved chunk. |
| 85 | **Current normative** | *Relationship: supersedes #15/#23 destination priority.* **Encrypted off-primary backup:** encrypted database dumps, all paginated content exports, media and resume versions go to private off-primary R2 as the normative durable target. GitHub artifacts/private-repo exports are convenience and portable copies. Restore drills must work without the primary vendor. | A backup stored only with the CI/source provider is not sufficient fault-domain separation. |

### Historical annotations (text above remains historical)

- **#3** is superseded by #32, then #38; its Vercel web-hosting text is historical.
- **#17** is superseded by #37; the one protected `main` plus local-development model is current.
- **#29** is corrected by #72; salted SHA-256 and purge-aligned rotation are not current.
- **#30** is corrected by #73; permissive policies combine with `OR`, so revoked grants plus
  restrictive role-scoped denies and catalog/role tests are current.
- **#32** is superseded by #38; Workers via OpenNext remains closed, not a fallback choice.
- **#35** is corrected by #83; Payload remains the authenticated entry point, but promotion is a
  validated, cleanup-safe, serialized transactional RPC.
- **#42** and **#54** are clarified by #77: observed facts inform anatomy; project constraints are
  normative, and no upstream file/content is copied.
- **#55** is clarified by #68: npm was a Spike A workaround; pnpm is the committed baseline, with
  WSL2 as the Windows fallback.
- **#60** is superseded by **#66**; #66's source-backed black/white mapping and accessibility
  tradeoff are the current reasoning.
- **#61** is superseded on permission by #63 and clarified by #77; inspiration-only/no-copying and
  Base UI are current. Historical ecosystem characterizations are not implementation guidance.
- **#65** keeps its conclusion but its reasoning is corrected by **#67**; the rejected query-theme
  behavior flashes after hydration rather than poisoning current ISR output.

### 16.18.1 Availability clarification

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 86 | **Current normative** | *Relationship: corrects #27.* **Ask AI is always visible and resilient, not always active:** the page/input remain present during dependency failure, fail-closed limiting and capacity exhaustion, with honest inline retry/capacity states. | Availability of the interface must not falsely claim availability of the backend. Structured citation failure likewise returns no answer without hiding the search surface. |

**Additional historical annotation:** #27's “always active” wording is corrected by #86. In #67,
the historical `?view=agent` aside is superseded by #71: `/agent` is canonical.

---

## 16.19 Additive site-identity assets (2026-08-26)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 87 | **Current normative** | *Relationship: clarifies #50/#69/#76/#81 (see also #88 for the runtime baseline).* **Payload-managed profile portrait and favicon:** the `Profile` global owns a required `profileImage` upload relation plus meaningful `profileImageAlt`; a `SiteSettings` global owns the favicon upload relation. Both use validated, immutable objects in the existing public `media` bucket and the approved same-zone delivery path. Phase 1 owns the portrait slot, reserved geometry, metadata integration and bundled project-owned fallbacks; Phase 2 owns the Payload fields, upload validation, storage hooks and signed revalidation. | This adds editor-controlled identity assets without a new vendor, browser Supabase access or runtime external CDN. Profile uploads allow signature-verified PNG/JPEG/WebP within the size/dimension contract; favicon uploads are signature-verified square PNG only, with SVG rejected. New immutable keys provide cache busting, while last-good ISR/metadata and bundled defaults prevent CMS failure or an unset relation from producing a broken portrait or browser icon. Neither upstream asset is copied. |

---

## 16.20 Runtime baseline refresh at scaffold time (2026-08-27)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 88 | **Current normative** | *Relationship: supersedes the version numbers in #68; its Windows/WSL2 fallback and exact-pinning rules are unchanged.* **Runtime baseline is the current Active LTS line: Node.js 24 (`>=24.17.0 <25.0.0`, `.nvmrc` 24) with Corepack-managed pnpm 11.24.0. Only LTS Node lines may be used, and exactly one Corepack-owned pnpm install is permitted.** CI pins `node-version: 24`. | #68 named Node 22 and pnpm 10 when the plan was written. At scaffold time Node 22 has left Active LTS and only receives maintenance updates, while Node 24 is Active LTS with support through April 2028, so "always LTS" now resolves to 24. pnpm 11 is the current stable major and the release the lockfile was generated with. Two competing pnpm installs (an npm-global copy plus a Corepack shim) were found to shadow each other and can silently violate the `packageManager` pin, so the npm-global copy is removed and Corepack is the single owner. `engines` enforces the LTS range so a non-LTS runtime fails fast instead of drifting. |

**Additional historical annotations:** #68's "Node.js 22 LTS, Corepack-managed pnpm 10" version pair
is superseded by #88; its baseline intent (single package manager, exact pins, committed lockfile,
WSL2 fallback for OpenNext on Windows) remains current. #55's npm-based Spike A workaround remains
historical and is not implementation guidance.

---

## 16.21 Repository-root agent files after scaffold (2026-08-27)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 89 | **Current normative** | *Relationship: amends #71.* **Repository-root `llms.txt` and `robots.txt` are kept permanently, but only as exported copies of the generated routes.** `app/llms.txt/route.ts` and `app/robots.ts` remain the single source, derived from the typed route manifest. The root files are never hand-edited, are not served to visitors (they are outside `public/`), and are refreshed from the served response whenever the manifest changes. A verification test compares them against the served output and fails on drift. | #71 assumed the root snapshot would be deleted once the scaffold existed. Keeping repo-visible copies is genuinely useful—they document the agent surface for anyone reading the repository on GitHub without building it. The risk #71 guarded against is a *hand-maintained* duplicate diverging from what the site serves, so the copies are defined as build exports rather than authored files. Placing them in `public/` was rejected: static files there would shadow or conflict with the generated routes and reintroduce two sources of truth. |

---

## 16.22 Phase 1 dependency naming at implementation (2026-08-27)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 90 | **Current normative** | *Relationship: clarifies the stack naming in PLAN/README and implements #58.* **Use the official `motion` package (Motion, formerly Framer Motion), exact-pinned and loaded through `LazyMotion` + `domAnimation`; keep React Hook Form + shared Zod for forms; inline selected `simple-icons` path data at build time.** | `motion` is the current package/name for the same animation library family previously documented as Framer Motion, so this is a naming/package clarification rather than an architectural change. Exact pins preserve the locked supply-chain policy; `LazyMotion` preserves the byte budget; React Hook Form prevents client/server field drift; selected simple-icons paths satisfy #58 without a runtime CDN. |

---

## 16.23 Canonical origin and robots ownership at first deploy (2026-08-27)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 91 | **Current normative** | *Relationship: implements the documented `NEXT_PUBLIC_SITE_URL` entry.* **Every absolute URL the app emits is built from a single resolver, `apps/web/lib/site-url.ts`, which reads `NEXT_PUBLIC_SITE_URL` and falls back to `SITE_IDENTITY.siteUrl`.** The value is normalised to a bare origin and the build fails on a non-absolute or non-`https` value. Canonicals, `metadataBase`, `sitemap.xml`, `robots.txt`, JSON-LD, RSS, `/agent` and `/llms.txt` all go through it. | `NEXT_PUBLIC_SITE_URL` was documented and set in the Workers build variables while no code read it, and `app/robots.ts` hardcoded `https://katbose.dev/sitemap.xml` alongside `SITE_IDENTITY.siteUrl` — two sources for one value that agreed only by coincidence. The fallback keeps `packages/shared` standalone, which matters because the offline `npx katbose` card snapshots the same constant and has no runtime to read environment variables. Failing loud on a bad value is preferred to emitting a wrong canonical, which is expensive to undo once indexed. |
| 92 | **Current normative** | *Relationship: amends #89.* **`robots.txt` is served by `app/robots.txt/route.ts` from `generateRobotsText()`, not by Next's `app/robots.ts` metadata convention, and the app owns the full crawler policy including the `Content-Signal` directive and the training opt-out list.** Cloudflare's managed `robots.txt` feature (`is_robots_txt_managed`) is off. | Two defects, one cause. First, the served file and the repository-root export came from two different generators, so #89's drift test only ever compared the root file against one of them. Second, Cloudflare's managed feature merged its own block into the response, and that block emitted `Disallow: /` for `GPTBot` and `ClaudeBot` — the exact assistants this site allows on purpose, and the reason `/agent` and `/llms.txt` exist. Cloudflare's own `robots.txt` parser reported both `allow: ["/"]` and `disallow: ["/"]` for those agents, so the policy was decided by crawler-specific tie-break rules rather than by us. Next's `MetadataRoute.Robots` type cannot express `Content-Signal`, so keeping the convention meant giving up either the directive or ownership of the file. Turning the managed feature off would have silently dropped its training opt-outs, so those user agents are now declared in `TRAINING_OPT_OUT_AGENTS` and rendered from the same generator. |

**Open tension recorded, not resolved:** the `*` group declares `ai-train=no` while `GPTBot` — OpenAI's training crawler, as distinct from `OAI-SearchBot` and `ChatGPT-User` — is allowed. The `ai-train=no` signal and the allow-list were both inherited (the signal from Cloudflare's managed block, the allow-list from the locked route manifest) rather than chosen together. Reconciling them is a content-policy decision for the site owner: either narrow the allow-list to the search and user-triggered agents, or drop `ai-train=no`.

**Implementation-status annotations (historical decision text remains unchanged):** #56's
“documentation-first until the real scaffold lands” condition has ended; the Phase 1 scaffold now
exists. #71's planning-snapshot sentence is amended by #89. #76's pending package-integration work
is complete at repository-source level, while published-package byte parity remains unverified.
#89's reference to `app/robots.ts` as the single source is superseded by #92: the served route is now
`app/robots.txt/route.ts`, and both it and the repository-root export render `generateRobotsText()`.

---

## 16.24 Identity and identifier naming convention (2026-08-28)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 93 | **Current normative** | *Relationship: constrains every identity string and resource identifier in the repository.* **The owner's name is written as one unspaced token in exactly three casings — `katbose` (identifiers, packages, handles), `KatBose` (display and prose), `KATBOSE` (constants, env-var prefixes). Resource identifiers are `katbose-<thing>` (`katbose-portfolio`, `katbose-db`, `katbose-web`, `katbose-cms`, `katbose-alerts`, `katbose-backups`), and where a hyphen is not a legal character the same name is written with underscores (`katbose_portfolio`, `katbose_db`).** The monorepo project name is `katbose-portfolio`. | A single unspaced token removes ambiguity across URLs, slugs, shell arguments, metadata, JSON-LD and agent-readable outputs. Constraining the casings to three named forms makes the correct spelling mechanical rather than a per-file judgment. The underscore fallback covers Postgres unquoted identifiers, environment variable names and language identifiers that reject `-`. `SITE_IDENTITY.name` remains the runtime source for the display form; the dependency-free `npx katbose` card repeats it as a tested build-time snapshot. |

---

## 16.25 Contact Turnstile runtime contract (2026-08-28)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 94 | **Current normative** | *Relationship: narrows the external-origin exception permitted by #74 and implements #16.* **The `/contact` client leaf renders the existing non-interactive Turnstile widget explicitly from `https://challenges.cloudflare.com`, with action `contact` and the standard `cf-turnstile-response` field. The static CSP allows that exact origin in `script-src` and `frame-src` only. Server-side siteverify fails closed unless `success` is true, `action` is `contact`, and `hostname` exactly matches the canonical `SITE_URL` hostname. Tokens are capped at 2,048 characters and the client resets its widget after every network submission attempt because tokens are single-use.** | The widget and secret binding already exist, so creating or retrieving replacement credentials would add risk without value. Exact action and hostname checks prevent a valid token issued for another surface or host from authorizing this form. CI may mock the vendor boundary, but Phase 1 remains open until one fresh production token succeeds and replay of that token is rejected. |

---

## 16.26 Weekly backup-set publication and retention (2026-08-28)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 95 | **Current normative** | *Relationship: implements the database/Storage baseline of #15/#85 and corrects their R2-versioning assumption.* **A weekly backup is one uniquely named, zstd-compressed, age-encrypted set containing a PostgreSQL 17 custom archive, every Supabase Storage bucket and a per-file SHA-256 manifest. The R2 payload is read back and verified before `complete.json` is written last; only valid completed sets can be restored or pruned. Retention keeps at least the newest four completed sets and a 21-day R2 bucket lock protects recent `weekly/` objects from overwrite or deletion. Supabase Storage is read through a dedicated server-side S3 credential in the protected GitHub `production` environment; the service-role key and age private identity never enter GitHub.** Portable JSON/MDX joins the set only when Payload exists in Phase 2. | PostgreSQL dumps do not contain Storage object bodies, public URLs cannot read the private `resume` bucket, and warning-only copies can create green but incomplete backups. Supabase S3 provides exhaustive authenticated object transfer without exposing the broader database service-role key. A marker-last protocol makes partial uploads distinguishable; count-based pruning never deletes old sets until a new one is proven. R2 does not implement S3 bucket versioning, so unique non-overwriting keys plus bucket locks provide the actual immutability control. The 21-day lock protects the three newest scheduled copies while allowing a fifth weekly run to remove an older unlocked set; manual reruns may safely retain extra copies. |

---

## 16.27 Backup scripts must be executable outside production (2026-08-28)

| # | Status | Decision | Reasoning |
| --- | --- | --- | --- |
| 96 | **Current normative** | *Relationship: makes #95 verifiable.* **Every backup and restore script must be executable against disposable loopback infrastructure, and that path is exercised automatically. `BACKUP_TARGET_PROFILE` defaults to `production` and binds each target to the hosted project; `local-drill` instead requires the database, Storage endpoint and object store to all be loopback and refuses anything else. `.github/workflows/backup-drill.yml` runs the real creator and the real Bash restore against local Supabase and a local S3 stand-in on every change under `scripts/backups/`, using no secrets and no provider. A drill must verify a seeded database payload and Storage object by SHA-256, not only by row and object counts, and must exercise count-based pruning.** | The original scripts bound every target to the hosted project, so the only way to execute them was against production. Nothing ran them, and they carried defects that made a successful backup impossible: a contract that rejected the creator's own timestamp, a connection URI exported into `PGDATABASE` where libpq treats it as a literal database name, `pg_restore` invoked without `--dbname` so it emitted a script instead of restoring, `zstd --output` which that tool does not accept, and a restore that aborted on the archive's `CREATE SCHEMA public`. Reading the code found one of these; executing it found the rest. Row counts alone cannot detect corrupted column data, and pruning is the only destructive step, so both need explicit proof. A loopback-only profile is a narrowing rather than an escape hatch: it cannot address a hosted project, so a drill can never read real data or delete a real set. |
