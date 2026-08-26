# katbose.dev — Portfolio Master Plan

**Version:** 1.5
**Status:** Approved for implementation
**Last updated:** 2026-08-24

This is the entry point for the design, architecture and operations of `katbose.dev`.
v1.0 was the brainstorm. v1.1 closed 18 production-readiness gaps. v1.2 splits the result into a
documentation set so each concern can be read, reviewed and updated on its own.

**Everything discussed lives in [`docs/`](docs/). This file is the index and the summary.**

---

## Documentation map

| # | Document | Covers |
| --- | --- | --- |
| 01 | [Architecture](docs/01-architecture.md) | System diagram, domains, environments, branch model, monorepo layout, request paths, core principles |
| 02 | [Content Model & CMS](docs/02-content-model.md) | Blog / TIE / Projects / Experience, Payload vs Strapi, collection access, field discipline, secure draft preview |
| 03 | [Search, Sync & Ask AI](docs/03-search-and-ai.md) | Cloudflare AI Search, webhook → retry → dead-letter → nightly reconciliation, Ask AI availability, cost caps, prompt-injection defence |
| 04 | [Resume Download System](docs/04-resume-system.md) | One-click flow, progressive security, immutable versioning, signed URLs, two-tier fallback, download analytics |
| 05 | [Security & Access Control](docs/05-security.md) | Threat model, Cloudflare Access design, secrets ownership, IP hashing and salt rotation, headers, accepted risks |
| 06 | [Data Model & RLS](docs/06-data-model.md) | Full SQL schema, deny-by-default policies, storage rules, retention, migration discipline |
| 07 | [Rate Limiting & Forms](docs/07-rate-limiting.md) | Cloudflare + Upstash layers, per-route limits, fail-open/fail-closed matrix, contact form protection, Turnstile |
| 08 | [Resilience & Fallbacks](docs/08-resilience.md) | ISR as a shield, graceful degradation, error boundaries, outage verification drills |
| 09 | [Observability & Dashboard](docs/09-observability.md) | PostHog, Sentry, Slack alert catalogue, private dashboard widgets, weekly review ritual |
| 10 | [Backups & Portability](docs/10-backups-and-portability.md) | Weekly `pg_dump`, media sync, JSON/MDX export, restore drills, recovery scenarios |
| 11 | [Testing & CI](docs/11-testing-and-ci.md) | Workflows, unit/E2E scope, resume smoke test, pre-deploy manual checks |
| 12 | [Accessibility](docs/12-accessibility.md) | WCAG 2.1 AA enforcement, axe in CI, keyboard specs, build-time and authoring rules |
| 13 | [SEO & Agent Readability](docs/13-seo-and-agent-readability.md) | Core Web Vitals targets, JSON-LD, robots.txt, `llms.txt`, humans.txt, utility pages |
| 14 | [Privacy & Compliance](docs/14-privacy-and-compliance.md) | Data inventory, no-cookie-banner rationale, retention, privacy policy outline, i18n out of scope |
| 15 | [Roadmap & Checklist](docs/15-roadmap-and-checklist.md) | Five phases with build lists and non-negotiable production gates |
| 16 | [Decision Log](docs/16-decision-log.md) | Decisions through #62 with reasoning, plus rejected options |
| 17 | [Environment Variables](docs/17-env-vars.md) | Full secrets inventory per surface, generation, rotation calendar |
| 18 | [Knowledge Base](docs/18-knowledge-base.md) | Separate repository, TIE boundary, future indexing |
| 19 | [Design Reference](docs/19-design-reference.md) | justaditya.com/Hackyfolio as primary visual reference, micro-interaction catalogue, intro loader, `npx katbose`, compatibility analysis |
| 20 | [Design System & Tokens](docs/20-design-system.md) | Token architecture, measured light/dark palettes, type and space scales, motion vocabulary, component inventory, section manifest contract, parity checklist |

---

## Vision

Build `katbose.dev` as a modern, minimalistic, AI-powered portfolio that serves as a long-term
personal platform rather than a static resume website.

It is:

- A professional portfolio
- A project showcase
- A technical blog
- A place to publish **Things I Explore** (TIE)
- An AI-searchable representation of my work
- A recruiter-friendly resume portal

It is **not** a knowledge base — that lives in a [separate repository](docs/18-knowledge-base.md).

---

## Core principles

- White-first, minimalistic UI with a light/dark toggle (defaults to system preference) — content first
- Fast: < 1s initial load, excellent Core Web Vitals
- Responsive, accessible (WCAG 2.1 AA), fully keyboard operable
- Excellent typography
- SEO optimized **and** agent-readable
- TypeScript-first, strict, easy to maintain
- Everything fits within generous free tiers
- One clear responsibility per vendor
- Recruiter experience beats data collection — no login, no mandatory email
- Extensible architecture, but no speculative abstraction

---

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router) · TypeScript · Tailwind CSS · Base UI · pnpm |
| Forms | React Hook Form + Zod · Framer Motion (minimal) |
| CMS | Payload CMS on **Render** |
| Data | Supabase — Postgres (`public` + `payload` schemas) + Storage/CDN origin |
| Image delivery | Cloudflare Images transformations over immutable Supabase media originals |
| AI search | Cloudflare AI Search |
| Edge & bot defence | Cloudflare — DNS, WAF, rate limiting, Turnstile, Access |
| App rate limiting | Upstash Redis |
| Analytics | PostHog (cookieless) |
| Errors | Sentry |
| Alerting | Slack — `#katbose-alerts`, `#contact-form` |
| Hosting | Cloudflare Workers via OpenNext (Workers Builds from protected `main`) · Render (CMS, dashboard — production only) |
| CI | GitHub Actions |

**Retired:** Strapi · Umami · OpenPanel · Vercel Analytics · Grafana · Postgres rate-limit counters.
See the [decision log](docs/16-decision-log.md) before reintroducing any of them.

---

## Domains

```
katbose.dev            → Next.js public site (Cloudflare Workers via OpenNext)
cms.katbose.dev        → Payload CMS (Render, production only) — /admin behind Cloudflare Access
dashboard.katbose.dev  → Private analytics (Render, production only) — behind Cloudflare Access
```

`main` is the only deployed branch and serves the production site. Development, Payload work,
database migrations and Cloudflare-runtime checks are performed locally before a change reaches
`main`; there is no hosted development environment or Supabase preview branch.

---

## Navigation & pages

```
Home · Projects · Experience · Blog · TIE · Resume · Ask AI · Contact
```

There is **no traditional search page** — Ask AI *is* the search experience.

The visual language and the Home page's section-stack layout follow the design reference in
[docs/19](docs/19-design-reference.md): a Hackyfolio-style ordered section manifest rendered by a
typed registry, a fixed bottom bar with a human/agent mode toggle, a multilingual intro loader,
and an `npx katbose` terminal card.

| Page | Contents |
| --- | --- |
| Home | Hero, About, Featured Projects, Experience preview, Latest Blog, Latest TIE, Contact CTA |
| Projects | Overview, screenshots, architecture, challenges, lessons learned, stack, GitHub, live demo |
| Experience | Timeline |
| Blog | Long-form MDX: reading time, TOC, syntax highlighting, copy-code, tags, related posts |
| TIE | Short engineering-notebook entries, deliberately unpolished |
| Resume | Experience, skills, education, certifications, last updated, View online + secured Download |
| Ask AI | Natural-language semantic search with source citations |
| Contact | Minimal form (Turnstile-protected, routed to Slack) plus a Cal.com link for scheduling a call |

Plus utility pages: 404, error boundaries, `/privacy`, `/resume-unavailable`, `robots.txt`,
`humans.txt`, `llms.txt`, `sitemap.xml`, `rss.xml`.

---

## The four systems worth knowing before you build

**1. Content sync** — Payload publish, update, unpublish or delete → webhook (shared secret) →
Cloudflare AI Search Worker binding, with 3 retries, a `dead_letter_queue` row plus Slack alert
on failure, and a **mandatory** nightly job that retries the queue *and* diffs the whole index
against published content.
→ [docs/03](docs/03-search-and-ai.md)

**2. Resume downloads** — one click for recruiters; rate limit (fail open) → bot checks →
Turnstile only on suspicion → 60s signed URL over a private bucket → logged. Resume versions are
immutable and kept forever, with an `is_current` pointer in the database.
→ [docs/04](docs/04-resume-system.md)

**3. Ask AI** — always visible, never a "unavailable" state. Protected by per-IP limits, a 50/day
global cap, and four layers of injection/hallucination defence, the most important being a
**citation gate**: an answer that cannot be grounded in retrieved sources is discarded, so the
failure mode is "no answer" rather than "wrong answer attributed to me".
→ [docs/03](docs/03-search-and-ai.md)

**4. Data protection** — every table is RLS deny-by-default and reachable only from server-side
Worker or Render code with the service role key, which never enters a client bundle. IPs are stored
as salted hashes with a quarterly rotation aligned to a 90-day purge.
→ [docs/05](docs/05-security.md) · [docs/06](docs/06-data-model.md)

---

## Failure-mode matrix

| Dependency | Behaviour when it fails |
| --- | --- |
| CMS (Render) | ISR serves last-good content; only uncached pages show a fallback |
| Cloudflare AI Search | Retries, then an inline retry message — the feature stays on |
| Supabase signed URL | Retry once, then `/resume-unavailable` with real next actions |
| Upstash — resume | **Fail open** (recruiter experience wins) |
| Upstash — Ask AI, contact | **Fail closed** (cost and spam protection win) |
| Content webhook | Retry → dead-letter queue → Slack → nightly reconciliation |
| Slack | Non-blocking; never fails a user's request |

---

## Roadmap summary

| Phase | Focus | Ships when |
| --- | --- | --- |
| 1 | Foundation — layout, core pages, utility pages, SEO, deployment | RLS, secrets hygiene, contact protection, privacy policy, CI and OpenNext runtime validation are in place |
| 2 | Content platform — Payload, Blog, TIE, MDX, draft preview | Scoped preview hardened, Payload-schema proof passed, ISR fallback proven, restore drill passed |
| 3 | AI search — index, Ask AI, sync pipeline | Current AI Search binding, reconciliation, cost caps and all four injection layers verified |
| 4 | Resume security — private bucket, signed URLs, Turnstile | E2E download test passes and fail-open behaviour is proven |
| 5 | Analytics & operations — dashboard, retention, alerting | Access control, retention and alerting verified |

Full build lists and gates: [docs/15](docs/15-roadmap-and-checklist.md).

---

## Constraints

- Everything uses free tiers wherever practical
- Minimise vendor overlap — each service has one clear responsibility
- Avoid authentication unless a feature genuinely requires it
- Prioritise recruiter experience over collecting user information
- Build for long-term maintainability and extensibility
- Keep the UI minimal, fast and content-focused

---

## Maintenance

| Cadence | Task |
| --- | --- |
| Weekly | 10-minute review: alerts, DLQ depth, flagged AI queries, Sentry, resume funnel |
| Monthly | Search Console, dependency updates, broken-link sweep |
| Quarterly | Rotate `IP_HASH_SALT` + retention purge + restore drill + review accepted risks |
| Yearly | Re-read this plan and retire anything no longer true |

Any change of direction gets an entry in the [decision log](docs/16-decision-log.md) — decisions
are closed, not quietly reversed.
