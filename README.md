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
| **Master plan** | v1.5 — **Approved for implementation** (last updated 2026-08-24) |
| **Code** | Not yet written. This repo (and, for now, its implementation) is documentation-first. |
| **Roadmap** | 5 phases · Foundation → Content → AI Search → Resume Security → Analytics & Ops |
| **Shipped so far** | `katbose` business-card package published to npm (2026-08-24) |

This is a **planning repository**. The three Cloudflare validation spikes (OpenNext Worker runtime,
Payload `schemaName`, AI Search binding) are *execution gates*, not documentation claims — the plan
is only as good as the first run of those probes once the scaffold and Cloudflare account exist.

**Spike A status:** the OpenNext-on-Workers gate has its first local pass (2026-08-25) — 6/6 probes
green in `workerd` via `opennextjs-cloudflare preview` (ISR/revalidation with the R2 cache binding,
Draft Mode cookies, `node:crypto` `timingSafeEqual`, dynamic OG images, OS-default theme + toggle
persistence, image-loader URL shape + origin-proxy bytes). The remote `/cdn-cgi/image` transform
check awaits the registered zone. Probe scaffolds stay uncommitted by design ([decision
#56](docs/16-decision-log.md)).

---

## What it is

- A **professional portfolio** — projects, experience, education, certifications
- A **project showcase** — case studies with architecture, challenges and lessons learned
- A **technical blog** — long-form, MDX-authored articles with reading time, TOC and RSS
- A place to publish **Things I Explore (TIE)** — short, deliberately-unpolished engineering notes
- An **AI-searchable representation** of that work — answer questions with *source citations*
- A **recruiter-friendly resume portal** — View online + one-click secured PDF download

It is **not** a knowledge base — reference notes live in a
[separate repository](docs/18-knowledge-base.md).

---

## Core principles

- **White-first, minimalistic UI** with a light ⇄ dark toggle that defaults to system preference
- **Fast** — under 1s initial load, excellent Core Web Vitals (Lighthouse ≥ 95)
- **Responsive and accessible** — WCAG 2.1 AA, fully keyboard-operable
- **Excellent typography**
- **SEO-optimized *and* agent-readable** — `robots.txt`, `llms.txt`, `humans.txt`, JSON-LD
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
| Forms & motion | React Hook Form + Zod · Framer Motion (budget-controlled) |
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

```
katbose.dev            → Next.js public site (Cloudflare Workers via OpenNext)
cms.katbose.dev        → Payload CMS (Render, production only) — /admin behind Cloudflare Access
dashboard.katbose.dev  → Private analytics (Render, production only) — behind Cloudflare Access
```

`main` is the only deployed branch and serves production. Development, Payload work, database
migrations and Cloudflare-runtime checks all happen locally before reaching `main`.

---

## Architecture

```
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
      │  anon key / own routes     │  service role key           │  service role key
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
`cf-connecting-ip` trustworthy for IP hashing and rate limiting.

---

## Four systems worth knowing before you build

**1. Content sync** — Payload publish/update/unpublish/delete → webhook (shared secret) → Cloudflare
AI Search binding, with 3 retries, a `dead_letter_queue` row + Slack alert on failure, and a
**mandatory** nightly job that retries the queue *and* diffs the whole index against published
content. → [docs/03](docs/03-search-and-ai.md)

**2. Resume downloads** — one click for recruiters; rate limit (**fail open**) → bot checks →
Turnstile only on suspicion → 60s signed URL over a private bucket → logged. Versions are immutable
and kept forever. → [docs/04](docs/04-resume-system.md)

**3. Ask AI** — always visible, never an "unavailable" *error* state (backend problems render as an
inline retry). Protected by per-IP limits, a **50/day global cap** — beyond which it shows a polite
capacity message rather than a failure — and four layers of injection/hallucination defence, the
most important being a **citation gate**: an answer that cannot be grounded in retrieved sources is
discarded — the failure mode is *"no answer"*, never *"wrong answer attributed to me"*.
→ [docs/03](docs/03-search-and-ai.md)

**4. Data protection** — every table is RLS deny-by-default and reachable only from server-side Worker
or Render code with the service role key, which never enters a client bundle. IPs are stored as
salted hashes with a quarterly rotation aligned to a 90-day purge. → [docs/05](docs/05-security.md) ·
[docs/06](docs/06-data-model.md)

---

## Repository structure

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
├── docs/                     # this documentation set (01–19)
├── render.yaml               # Render blueprint (no secret values)
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
| [05](docs/05-security.md) | **Security & Access Control** | Threat model, Cloudflare Access, secrets ownership, IP hashing & salt rotation, headers, accepted risks |
| [06](docs/06-data-model.md) | **Data Model & RLS** | Full SQL schema, deny-by-default policies, storage rules, retention, migration discipline |
| [07](docs/07-rate-limiting.md) | **Rate Limiting & Forms** | Cloudflare + Upstash layers, per-route limits, fail-open/fail-closed matrix, contact form protection, Turnstile |
| [08](docs/08-resilience.md) | **Resilience & Fallbacks** | ISR as a shield, graceful degradation, error boundaries, outage drills |
| [09](docs/09-observability.md) | **Observability & Dashboard** | PostHog, Sentry, Slack alert catalogue, private dashboard, weekly review ritual |
| [10](docs/10-backups-and-portability.md) | **Backups & Portability** | Weekly `pg_dump`, media sync, JSON/MDX export, restore drills |
| [11](docs/11-testing-and-ci.md) | **Testing & CI** | Workflows, unit/E2E scope, resume smoke test, pre-deploy manual checks |
| [12](docs/12-accessibility.md) | **Accessibility** | WCAG 2.1 AA enforcement, axe in CI, keyboard specs, authoring rules |
| [13](docs/13-seo-and-agent-readability.md) | **SEO & Agent Readability** | Core Web Vitals targets, JSON-LD, `robots.txt`, `llms.txt`, `humans.txt`, utility pages |
| [14](docs/14-privacy-and-compliance.md) | **Privacy & Compliance** | Data inventory, no-cookie-banner rationale, retention, privacy policy, i18n out of scope |
| [15](docs/15-roadmap-and-checklist.md) | **Roadmap & Checklist** | Five phases with build lists and non-negotiable production gates |
| [16](docs/16-decision-log.md) | **Decision Log** | Decisions through #62 with reasoning, plus rejected options |
| [17](docs/17-env-vars.md) | **Environment Variables** | Full secrets inventory per surface, generation, rotation calendar |
| [18](docs/18-knowledge-base.md) | **Knowledge Base** | Separate repository, TIE boundary, future indexing |
| [19](docs/19-design-reference.md) | **Design Reference** | justaditya.com/Hackyfolio as primary visual reference, micro-interaction catalogue, intro loader, `npx katbose`, compatibility analysis |
| [20](docs/20-design-system.md) | **Design System & Tokens** | Token architecture, measured light/dark palettes, type and space scales, motion vocabulary, component inventory, section manifest contract, parity checklist |

---

## Roadmap

| Phase | Focus | Ships when |
| --- | --- | --- |
| **1 — Foundation** | Layout, core pages, utility pages, SEO, deployment | RLS, secrets hygiene, contact protection, privacy policy, CI and OpenNext validation in place |
| **2 — Content platform** | Payload, Blog, TIE, MDX, draft preview | Scoped preview hardened, Payload-schema proof passed, ISR fallback proven, restore drill passed |
| **3 — AI search** | Index, Ask AI, sync pipeline | AI Search binding, reconciliation, cost caps and all four injection layers verified |
| **4 — Resume security** | Private bucket, signed URLs, Turnstile | E2E download test passes, fail-open behaviour proven |
| **5 — Analytics & operations** | Dashboard, retention, alerting | Access control, retention and alerting verified |

Full build lists and gates: [docs/15](docs/15-roadmap-and-checklist.md).

---

## Getting started (reading this repo)

This is a documentation-first project. To understand the whole platform, read in this order:

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

## License

No license is set yet. Content and design are © Kat Bose unless otherwise noted.
