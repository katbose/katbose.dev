# katbose-portfolio

> A minimalistic, ultra-fast, **AI-powered personal platform** — a portfolio, project showcase,
> technical blog, and resume system built to be *searchable and readable by both humans and AI
> agents* — rather than a static résumé website.

Use this repository's documentation as the single source of truth for the design, architecture and
operations of the site. **[PLAN.md](PLAN.md)** is the index and summary;
**[`docs/`](docs/)** holds the full 20-part specification.

---

## Status

| | |
| --- | --- |
| **Master plan** | v1.6 — **Final architecture lock; Phase 1 repository implementation in progress** (last updated 2026-08-27) |
| **Code** | The local Phase 1 web foundation is implemented: 20 Next routes, the typed Home/agent systems, security boundaries, migrations/tests, CI workflows, and `packages/katbose-card` source are present. Live services and deployment gates remain intentionally unclaimed. |
| **Roadmap** | 5 phases · Foundation → Content → AI Search → Resume Security → Analytics & Ops |
| **Validation** | Frozen dependency resolution, typecheck, Oxlint, Oxfmt, 28 Vitest tests, the 20-route Next.js production build, and 35 Playwright/axe tests against `next start` pass locally. Native Windows/OneDrive OpenNext bundling still hits the documented pnpm-symlink access limit; Workers-runtime CI/WSL validation, local Supabase pgTAP execution, registered-zone images, live vendors, and deployment remain open. |

Architecture and Phase 1 implementation choices are closed. Validation spikes prove external or
experimental integrations; they do not reopen settled architecture. A failed gate stops its
dependent phase and requires a new decision entry—never an undocumented workaround. Spike A has a
local 6/6 `workerd` pass (2026-08-25); its registered-zone `/cdn-cgi/image` transform/fallback check
is still pending. Spike B must prove Payload's `payload` schema boundary before Phase 2, and Spike C
must prove the AI Search binding and Items API before Phase 3. Probe scaffolds remain uncommitted by
design ([decision #56](docs/16-decision-log.md)).

---

## What it is

- A **professional portfolio** — projects, experience, education, certifications
- A **project showcase** — case studies with architecture, challenges and lessons learned
- A **technical blog** — long-form articles authored in Payload Lexical, with Markdown/MDX derived for rendering/export, reading time, TOC and RSS
- A place to publish **Things I Explore (TIE)** — short, deliberately-unpolished engineering notes
- An **AI-searchable representation** of that work — answer questions with *source citations*
- A **recruiter-friendly resume portal** — View online + one-click secured PDF download

It is **not** a knowledge base — reference notes live in a
[separate repository](docs/18-knowledge-base.md).

---

## Core principles

- **White-first, minimalistic UI** with a light ⇄ dark toggle that defaults to system preference
- **Fast** — under 1s initial load, excellent Core Web Vitals (Lighthouse ≥ 95)
- **Responsive and accessible** — WCAG 2.2 AA, fully keyboard-operable
- **Excellent typography**
- **SEO-optimized *and* agent-readable** — canonical `/agent`; route-manifest-generated `robots.txt`, `llms.txt`, `humans.txt` and JSON-LD
- **TypeScript-first, strict mode**, no `any` in application code
- **Everything fits inside free tiers**
- **One clear responsibility per vendor** — no overlapping services
- **Recruiter experience beats data collection** — no login, no mandatory email, no tracking
- **Extensible architecture, but no speculative abstraction**

---

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router) · TypeScript · Tailwind CSS · Base UI · pnpm |
| Forms & motion | React Hook Form + Zod · Motion (`motion`, formerly Framer Motion; budget-controlled) |
| CMS | **Payload CMS** on Render |
| Data | **Supabase** — Postgres (`public` + `payload` schemas) + Storage/CDN origin |
| Image delivery | Cloudflare Images transforms over immutable Supabase media originals |
| AI search | **Cloudflare AI Search** (the site's search experience) |
| Edge & bot defence | Cloudflare — DNS, WAF, rate limiting, Turnstile, Access |
| App rate limiting | Upstash Redis |
| Analytics | PostHog (cookieless) |
| Errors | Sentry |
| Alerting | Slack (`#katbose-alerts`, `#contact-form`) |
| Hosting | Cloudflare Workers via OpenNext (public) · Render (CMS & dashboard) |
| CI | GitHub Actions |

**Retired:** Strapi · Umami · OpenPanel · Vercel Analytics · Grafana · Postgres rate-limit counters.
See the [decision log](docs/16-decision-log.md) before reintroducing any of them.

---

## Domains

```text
katbose.dev            → Next.js public site (Cloudflare Workers via OpenNext)
cms.katbose.dev        → Payload CMS (Render, production only) — /admin behind Cloudflare Access
dashboard.katbose.dev  → Private analytics (Render, production only) — behind Cloudflare Access
```

`main` is the only deployed branch and serves production. Development, Payload work, database
migrations and Cloudflare-runtime checks all happen locally before reaching `main`.

---

## Architecture

```text
                    ┌──────────────────────────────┐
                    │          Cloudflare          │
                    │  DNS · WAF · Rate Limiting   │
                    │  Turnstile · Access · AI     │
                    └──────────────┬───────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      │                            │                             │
┌─────▼──────────┐        ┌────────▼────────┐          ┌────────▼────────┐
│  katbose.dev   │        │ cms.katbose.dev │          │dashboard.katbose│
│  Next.js       │        │  Payload CMS    │          │ Private analytics│
│OpenNext Worker │        │  Render         │          │ Render          │
└─────┬──────────┘        └────────┬────────┘          └────────┬────────┘
      │                            │                             │
      │ server-only service role   │  service role key           │  service role key
      └────────────────────────────┼─────────────────────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │      Supabase        │
                        │ Postgres (public +   │
                        │ payload schemas)     │
                        │ Storage (private)    │
                        └──────────────────────┘

Side services: Upstash Redis · PostHog · Sentry · Slack · GitHub Actions
```

The public site is served from **Cloudflare Workers via OpenNext** specifically so every request
traverses Cloudflare's edge — there is no separate, always-on origin to bypass, which is what makes
`CF-Connecting-IP` trustworthy for HMAC IP pseudonymization and rate limiting. Privileged Supabase operations
run only in the Worker through a server-only service-role client; browser code and anon-key clients
have no privileged path.

---

## Four systems worth knowing before you build

**1. Content sync** — Payload publish/update/unpublish/delete → webhook (shared secret) → Cloudflare
AI Search binding, with 3 retries, a `dead_letter_queue` row + Slack alert on failure, and a
**mandatory** nightly job that retries the queue *and* diffs the whole index against published
content. → [docs/03](docs/03-search-and-ai.md)

**2. Resume downloads** — one click for recruiters; rate limit (**fail open**) → bot checks →
Turnstile only on suspicion → 60s signed URL over a private bucket → logged. Versions are immutable
and kept forever. → [docs/04](docs/04-resume-system.md)

**3. Ask AI** — always visible and resilient, not always active: dependency failure, fail-closed
limiting or the **50/day global cap** keeps the page/input visible and shows an inline retry or
capacity message. Four injection/hallucination controls culminate in a structured citation-ID gate:
every model-emitted ID must resolve to a retrieved, allowed, published chunk or the answer is
discarded. → [docs/03](docs/03-search-and-ai.md)

**4. Data protection** — client roles have grants revoked plus role-scoped restrictive deny RLS
policies, verified through catalogs and CRUD tests. Server-only service-role clients are the sole
privileged path. IP-derived telemetry uses HMAC-SHA-256 pseudonyms from trusted production
Cloudflare request metadata; a daily purge enforces 90 days independently of quarterly key rotation.
Old epochs may coexist until purge and are never correlated. → [docs/05](docs/05-security.md) ·
[docs/06](docs/06-data-model.md)

---

## Repository structure

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
├── scripts/                  # planned operational exports, backups and retention purge
├── e2e/                      # Playwright specs
├── .github/workflows/        # current CI/migration/secret scan; scheduled jobs are later-phase
├── docs/                     # this documentation set (01–20)
├── render.yaml               # planned Phase 2 Render blueprint (no secret values)
├── pnpm-workspace.yaml
└── PLAN.md
```

---

## Documentation map

| # | Document | Covers |
| --- | --- | --- |
| [01](docs/01-architecture.md) | **Architecture** | System diagram, domains, environments, branch model, monorepo layout, request paths |
| [02](docs/02-content-model.md) | **Content Model & CMS** | Blog / TIE / Projects / Experience, Payload vs Strapi, access, field discipline, secure draft preview |
| [03](docs/03-search-and-ai.md) | **Search, Sync & Ask AI** | Cloudflare AI Search, webhook → retry → dead-letter → nightly reconciliation, cost caps, injection defence |
| [04](docs/04-resume-system.md) | **Resume Download System** | One-click flow, progressive security, immutable versioning, signed URLs, two-tier fallback, analytics |
| [05](docs/05-security.md) | **Security & Access Control** | Threat model, Cloudflare Access, secrets ownership, HMAC pseudonyms/key epochs, static headers, accepted risks |
| [06](docs/06-data-model.md) | **Data Model & RLS** | Full SQL schema, deny-by-default policies, storage rules, retention, migration discipline |
| [07](docs/07-rate-limiting.md) | **Rate Limiting & Forms** | Cloudflare + Upstash layers, per-route limits, fail-open/fail-closed matrix, contact form protection, Turnstile |
| [08](docs/08-resilience.md) | **Resilience & Fallbacks** | ISR as a shield, graceful degradation, error boundaries, outage drills |
| [09](docs/09-observability.md) | **Observability & Dashboard** | PostHog, Sentry, Slack alert catalogue, private dashboard, weekly review ritual |
| [10](docs/10-backups-and-portability.md) | **Backups & Portability** | Weekly `pg_dump`, media sync, JSON/MDX export, restore drills |
| [11](docs/11-testing-and-ci.md) | **Testing & CI** | Workflows, unit/E2E scope, resume smoke test, pre-deploy manual checks |
| [12](docs/12-accessibility.md) | **Accessibility** | WCAG 2.2 AA enforcement, axe in CI, keyboard specs, authoring rules |
| [13](docs/13-seo-and-agent-readability.md) | **SEO & Agent Readability** | Core Web Vitals targets, JSON-LD, `robots.txt`, `llms.txt`, `humans.txt`, utility pages |
| [14](docs/14-privacy-and-compliance.md) | **Privacy & Compliance** | Data inventory, no-cookie-banner rationale, retention, privacy policy, i18n out of scope |
| [15](docs/15-roadmap-and-checklist.md) | **Roadmap & Checklist** | Five phases with build lists and non-negotiable production gates |
| [16](docs/16-decision-log.md) | **Decision Log** | Decisions through #90 with status vocabulary, historical annotations and reasoning |
| [17](docs/17-env-vars.md) | **Environment Variables** | Full secrets inventory per surface, generation, rotation calendar |
| [18](docs/18-knowledge-base.md) | **Knowledge Base** | Separate repository, TIE boundary, future indexing |
| [19](docs/19-design-reference.md) | **Design Reference** | justaditya.com/Hackyfolio as primary visual reference, micro-interaction catalogue, intro loader, `npx katbose`, compatibility analysis |
| [20](docs/20-design-system.md) | **Design System & Tokens** | Token architecture, measured light/dark palettes, type and space scales, motion vocabulary, component inventory, section manifest contract, parity checklist |

---

## Roadmap

| Phase | Focus | Ships when |
| --- | --- | --- |
| **1 — Foundation** | Layout, core pages, utility pages, SEO, deployment | RLS, secrets hygiene, contact protection, privacy policy, CI and OpenNext validation in place |
| **2 — Content platform** | Payload, Blog, TIE, Profile/SiteSettings identity uploads, canonical Lexical authoring, derived Markdown/MDX, draft preview | Spike B, CMS domain/Access, scoped preview, identity-asset replacement, ISR fallback and restore drill pass |
| **3 — AI search** | Index, Ask AI, sync pipeline | AI Search binding, reconciliation, cost caps and all four injection layers verified |
| **4 — Resume security** | Private bucket, signed URLs, Turnstile | E2E download test passes, fail-open behaviour proven |
| **5 — Analytics & operations** | Dashboard, retention, alerting | Access control, retention and alerting verified |

Full build lists and gates: [docs/15](docs/15-roadmap-and-checklist.md).

---

## Getting started (reading this repo)

This is a documentation-led implementation project. To understand the whole platform, read in this order:

1. **This README** — orientation.
2. **[PLAN.md](PLAN.md)** — the master plan: vision, principles, stack, domains, the four core
   systems, failure-mode matrix, roadmap and maintenance cadence.
3. **The docs behind whichever system you're touching** — start at
   [01-architecture](docs/01-architecture.md) for the layout, then dive into the numbered doc for
   the specific concern (see the table above).
4. If you change direction on anything, **record a decision** in
   [16-decision-log.md](docs/16-decision-log.md) — decisions are closed, never quietly reversed.

Everything consumes **free tiers wherever practical**. See [17-env-vars.md](docs/17-env-vars.md)
for the secrets inventory and [15-roadmap-and-checklist.md](docs/15-roadmap-and-checklist.md) for
the production gates.

---

## Contributing

- Work is done locally and validated before reaching `main` — there is no hosted dev environment.
- `main` is the only deployable branch; the release workflow is protected.
- Run and test every public-table migration locally first; take a backup before a production
  migration.
- Prefer boring, well-understood technology over novelty.

---

## Credits

The visual reference for Home anatomy and observed interaction details is
[Hackyfolio](https://github.com/PythonHacker24/yo-hackyfolio) by
[Aditya Patil](https://github.com/PythonHacker24), consulted with express permission. Thanks,
Aditya. The project rule is inspiration only: no upstream file, code, prose or personal content is
copied; Base UI and project-owned tokens/components remain normative.

The permission is scoped to this portfolio and does not make the source repository generally
licensed. See [decision #63](docs/16-decision-log.md). No content from
[justaditya.com](https://www.justaditya.com) appears here.

---

## License

No license is set yet. Content and design are © Kat Bose unless otherwise noted.
