# 11 — Testing & CI

[← Back to PLAN.md](../PLAN.md)

---

## 11.1 Scope

Right-sized for a personal site: enough automation to prevent regressions on the paths that
matter, without a test suite that becomes its own maintenance project.

| Layer | Tool | What it covers |
| --- | --- | --- |
| Static | `tsc --noEmit`, Oxlint, Oxfmt (`--check`) | Type errors, lint rules, unused code, formatting drift |
| Unit | Vitest | Security helpers, rate-limit failure modes, Zod schemas, injection screen, fallback logic |
| E2E | Playwright | Resume download flow, contact form, 404, navigation |
| Accessibility | axe-core + Playwright | WCAG 2.1 AA, keyboard operability ([12-accessibility.md](12-accessibility.md)) |
| Build | `opennextjs-cloudflare build` | Catches Next.js and Workers build-time failures before deploy |

---

## 11.2 CI workflow

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:workers
```

`pnpm test:e2e:workers` uses Playwright's `webServer` to start
`opennextjs-cloudflare build && opennextjs-cloudflare preview` and runs against the local
Workers-compatible runtime. Supabase and CMS dependencies are local or mocked; the production
project and live rate limiters are never used by CI.

**Branch protection:** CI must be green before merging or deploying `main`.

### 11.2.1 Production deployment — Cloudflare Workers Builds

Production deployment is handled by **Cloudflare Workers Builds**, not by a GitHub Actions deploy
job. Connect this repository in the Cloudflare dashboard with:

- Production branch: `main`
- Root directory: `apps/web` (or the monorepo root if the workspace build requires it)
- Build command: `pnpm --filter web build` — the `web` package runs `opennextjs-cloudflare build`
- Wrangler configuration: the committed `wrangler.jsonc` with the `AI_SEARCH` binding

Workers Build variables and secrets are configured in Cloudflare. GitHub Actions keeps only the
non-deployment secrets it needs for CI, backups and scheduled jobs. A merge into protected `main`
is the production release event; the Workers Build then deploys the resulting OpenNext Worker.

**All workflows in the repo:**

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | PR, push to `main` | Typecheck, lint, unit, OpenNext build, Workers-runtime E2E |
| Cloudflare Workers Builds | Push to protected `main` | OpenNext production build and Worker deployment |
| `secret-scan.yml` | PR, push | gitleaks |
| `nightly-reconciliation.yml` | 02:00 daily | DLQ retry + index sweep |
| `weekly-backup.yml` | Sundays 03:00 | `pg_dump`, media sync, content export |

---

## 11.2.2 Validation-spike test contracts

These commands are added with the initial scaffold. A written design is not a passing spike.

| Spike | Command | Pass condition |
| --- | --- | --- |
| OpenNext/Workers + images | `pnpm --filter web test:spike:workers` | Starts `opennextjs-cloudflare preview`; proves ISR stale/revalidate behavior, Draft Mode cookie round-trip/expiry, `timingSafeEqual` in `workerd`, dynamic OG PNG response, top-right theme system default + manual persistence, transformed image cache hit, and original-image fallback |
| Payload + `payload` schema | `pnpm test:spike:payload-schema` | Starts local Supabase; runs Payload migrations with `push: false` and `schemaName: "payload"`; seeds fixtures; proves draft/publish/unpublish, media and resume uploads; dumps both schemas; restores into a fresh scratch DB; confirms Payload never creates/changes `public` tables |
| AI Search | `pnpm --filter web test:spike:ai-search` | Uses the remote `AI_SEARCH` binding to upload, list, replace, `chatCompletions` with cited chunks, resolve key → item ID, delete, and reconcile; then confirms usage alerts/caps are configured |

The custom image loader and original proxy are unit/integration tested locally, but the actual
`/cdn-cgi/image/` transformation and `onerror=redirect` behavior require the registered
Cloudflare zone. Spike A therefore has a local `workerd` pass and one remote-domain image pass.
The AI Search spike necessarily waits until its Phase 3 account/instance exists. See
[17-env-vars.md](17-env-vars.md) §17.1.1.

---

## 11.3 Unit tests — what actually needs them

Not coverage for its own sake. These specific behaviours are security or correctness decisions
that must not regress silently:

```ts
// hashIp — stable output, salt-dependent, never the raw IP
// checkRateLimit — Upstash unreachable:
//     resume  → allowed = true   (fail open)
//     askAi   → allowed = false  (fail closed)
//     contact → allowed = false  (fail closed)
// checkGlobalAskAiCap — returns allowed = false at 51 on the same day
// looksLikeInjection — matches known payloads, does not match ordinary questions
// ContactSchema — rejects an empty message, oversized input, a filled honeypot
// Ask AI output gate — an answer with zero sources is discarded
// resume route — no is_current row → redirect to /resume-unavailable
// media loader — transform error/quota → original Supabase-CDN response, never a broken image
// seed guard — seed:dev throws when NODE_ENV=production or ALLOW_DEV_SEED is not true
```

---

## 11.4 E2E — the highest-risk path first

The resume download flow is the single most important interaction on the site.

```ts
// e2e/resume-download.spec.ts
import { test, expect } from "@playwright/test";

test("resume download never shows a broken page", async ({ page }) => {
  await page.goto("/resume");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/resume/download")),
    page.getByRole("link", { name: /download resume/i }).click(),
  ]);
  // Either a redirect to the signed URL or a graceful fallback — never a 5xx.
  expect(response.status()).toBeLessThan(500);
});

test("resume fallback page offers real next actions", async ({ page }) => {
  await page.goto("/resume-unavailable");
  await expect(page.getByRole("link", { name: /view resume online/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /contact me/i })).toBeVisible();
});
```

Additional specs:

- Contact form: validation errors render, honeypot submission is silently accepted, success state
  appears
- 404: unknown route renders `not-found.tsx` with working links
- Navigation: every nav item resolves to a 200
- Ask AI: with the backend forced to fail, the input and page remain fully usable and an inline
  notice appears
- Fixture rendering: the seeded Blog, TIE, Project, Experience, Media and dummy Resume exercise
  every component without contacting production services
- Theme: clean contexts emulate light and dark OS preferences; the top-right toggle overrides to
  the opposite theme and persists across reload

---

## 11.5 Pre-deploy manual checks

Automation cannot cover configuration in third-party dashboards. Run these once per phase, and
after any infrastructure change:

- [ ] `curl https://cms.katbose.dev/admin` → Cloudflare Access challenge
- [ ] `curl https://cms.katbose.dev/api/blog-posts` → JSON, not HTML
- [ ] GraphQL playground unreachable in production
- [ ] Bundle analysis: no `SUPABASE_SERVICE_ROLE_KEY`, `PREVIEW_URL_SECRET` or `PREVIEW_INTERNAL_SECRET` in client output
- [ ] `pnpm preview` passes the production-like OpenNext/Workers smoke tests, not only `pnpm dev`
- [ ] Resume bucket is private; a direct object URL returns 400/403
- [ ] Preview link works, and the same link fails after 15 minutes
- [ ] Slack alert fires from a deliberately broken sync
- [ ] Restore drill from the newest backup ([10-backups-and-portability.md](10-backups-and-portability.md))

---

## 11.6 Local development

```bash
pnpm install
pnpm dev            # apps/web
pnpm preview        # OpenNext build + local Workers-runtime preview
pnpm --filter cms dev
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm test:e2e --ui  # Playwright interactive mode
```

The web package owns these production-runtime scripts:

```json
{
  "build": "opennextjs-cloudflare build",
  "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
  "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy"
}
```

`.env.example` files are committed for every app with placeholder values and comments describing
each variable — see [17-env-vars.md](17-env-vars.md). Real values never enter the repo.
