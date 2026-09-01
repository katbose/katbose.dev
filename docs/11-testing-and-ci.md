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
| Accessibility | axe-core + Playwright | WCAG 2.2 AA, keyboard operability ([12-accessibility.md](12-accessibility.md)) |
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
        with: { node-version: 24, cache: pnpm }
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
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e:workers
```

`pnpm test:e2e:workers` uses Playwright's `webServer` to start
`opennextjs-cloudflare build && opennextjs-cloudflare preview` and runs against the local
Workers-compatible runtime. Supabase and CMS dependencies are local or mocked; the production
project and live rate limiters are never used by CI.

**Branch protection:** CI must be green before merging or deploying `main`. Enforced by the
`main-protection` repository ruleset (active since 2026-08-27, empty bypass list, targeting the
default branch):

| Rule | Setting | Why |
| --- | --- | --- |
| Required status checks | `quality`, `database`, `e2e`, `gitleaks` | The four jobs that must prove a change |
| Strict up-to-date branches | Required | A PR cannot pass against a stale base and still merge something that breaks `main` |
| Pull request required | Yes, **0 approvals** | Single-maintainer project: GitHub forbids self-approval, so any non-zero count would make merging impossible. The status checks, not a review count, are the real gate |
| Require last-push approval | Off | Would require a second person; a permanent deadlock for one maintainer |
| Allowed merge methods | Squash only | Keeps `main` linear without a separate linear-history rule |
| Block force pushes / restrict deletions | On | `main` history is append-only |
| Require deployments to succeed | **Off** | Cloudflare Workers Builds deploys *after* `main` moves (#52/#75); requiring a deployment first inverts that order and deadlocks the pipeline |
| Require signed commits | Off | Deferred until commit signing is configured locally; enabling it first would reject every push |

Consequence: all work reaches `main` through a branch and a pull request. The
`production-migration.yml` dispatch is unaffected — it targets `main` and asserts
`refs/heads/main`.

### 11.2.1 Production deployment — Cloudflare Workers Builds

Production deployment is handled by **Cloudflare Workers Builds**, not by a GitHub Actions deploy
job. Connect this repository in the Cloudflare dashboard with:

- Production branch: protected `main`
- Root directory: repository root
- Install command: `corepack enable && pnpm install --frozen-lockfile`
- Build command: `pnpm --filter web build`
- Wrangler configuration: `apps/web/wrangler.jsonc`

Workers Builds owns only the OpenNext production build/deploy. It never applies Supabase migrations.
A protected explicit GitHub `workflow_dispatch` migration job applies committed migrations after
backup and before a migration-bearing change is merged to deployment-triggering `main`. GitHub CI
validates; Workers Builds deploys; the migration workflow changes production data—ownership does
not overlap.

Workers Build variables and secrets are configured in Cloudflare. GitHub Actions keeps only the
non-deployment secrets it needs for CI, backups and scheduled jobs. A merge into protected `main`
is the production release event; the Workers Build then deploys the resulting OpenNext Worker.

**Workflow ownership:**

| Workflow | Trigger | Purpose | Repository status |
| --- | --- | --- | --- |
| `ci.yml` | PR, push to `main` | Typecheck, lint, format, unit, OpenNext build, database tests, Workers-runtime E2E, Lighthouse gate | `quality`, `database` and `e2e` were **green on 2026-08-27** (1m08s, 2m05s, 1m48s). The `lighthouse` job is new and has not yet recorded a passing run |
| Cloudflare Workers Builds | Push to protected `main` | OpenNext production build and Worker deployment | **deploying:** the squash-merge of PR #5 on 2026-08-27 built and deployed the Worker, and the apex custom domain serves it ([15-roadmap-and-checklist.md](15-roadmap-and-checklist.md)). Pull-request preview builds still fail because the dashboard build command runs `npx wrangler versions upload` at the repository root, where there is no `wrangler.jsonc`; the fix is a dashboard change, not a repository one |
| `secret-scan.yml` | PR, push | gitleaks | **green on 2026-08-27** (7s); initially failed on `.env.example` placeholders, resolved by the root `.gitleaks.toml` allowlist ([05-security.md](05-security.md) §5.3) |
| `production-migration.yml` | explicit dispatch from `main` | encrypted backup + committed migration application | **successful on 2026-08-27** (run `33114400303`); the database was already current because the then-enabled Supabase GitHub production deployment had applied the migrations first. That auto-deploy is now disabled so future schema changes remain backup-first |
| `nightly-reconciliation.yml` | 02:00 daily | DLQ retry + index sweep | planned Phase 3 |
| `weekly-backup.yml` | Sundays 03:00 UTC + manual dispatch from `main` | PostgreSQL 17 custom dump + all authenticated Supabase Storage buckets → manifest → zstd → age → private R2 | the scripts it runs are **proven end to end** by `backup-drill.yml` (first green run `33190795456`, 2026-08-28), but this workflow itself is **not yet operational.** As verified on 2026-08-28 it is active with no runs, `SUPABASE_STORAGE_RCLONE_CONFIG` is absent at both production-environment and repository scope, the `production` environment has no deployment-branch restriction, and `katbose-backups` has no bucket-lock rules. Portable JSON/MDX joins the set in Phase 2 |
| `backup-drill.yml` | PRs touching `scripts/backups/**` or `supabase/migrations/**`, push to `main`, manual dispatch | Runs the real creator and Bash restore against local Supabase and a local S3 stand-in; ShellCheck, `bash -n` and PSScriptAnalyzer | **green on 2026-08-28** (run `33190795456`): 3 sets published, oldest pruned, 5 tables / 6 rows restored, and both 1 KiB digests matched. Uses no secrets and contacts no provider ([10-backups-and-portability.md](10-backups-and-portability.md) §10.7) |

---

## 11.2.2 Validation-spike test contracts

These commands are added with the initial scaffold. A written design is not a passing spike.

| Spike | Command | Pass condition |
| --- | --- | --- |
| OpenNext/Workers + images | `pnpm --filter web test:spike:workers` | Starts `opennextjs-cloudflare preview`; proves ISR serve → stale → background revalidation against the R2 incremental cache, Draft Mode cookie issue/round-trip/revocation plus rejection of a forged cookie, `timingSafeEqual` from `node:crypto` in `workerd` including the length-mismatch path, the **committed static** Open Graph PNG and its metadata reference, top-right theme system default + manual persistence, transformed image cache hit, and original-image fallback. The Open Graph assertion is deliberately static: the dynamic `ImageResponse` route was withdrawn because its WASM runtime exceeded the 3 MiB Worker script limit, and per-post dynamic images return in Phase 2 with their own budget decision (decision [#98](16-decision-log.md)) |
| Payload + `payload` schema | `pnpm test:spike:payload-schema` | Starts local Supabase; runs Payload migrations with `push: false` and `schemaName: "payload"`; seeds fixtures; proves draft/publish/unpublish, profile/favicon media and resume uploads, Profile/SiteSettings replacement + signed revalidation; dumps both schemas; restores into a fresh scratch DB; confirms Payload never creates/changes `public` tables |
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
// pseudonymizeIp — HMAC-SHA-256 is deterministic within one epoch, differs across epochs,
//     and never returns the raw IP
// checkRateLimit — Upstash unreachable:
//     resume  → allowed = true   (fail open)
//     askAi   → allowed = false  (fail closed)
//     contact → allowed = false  (fail closed)
// checkGlobalAskAiCap — returns allowed = false at 51 on the same day
// looksLikeInjection — matches known payloads, does not match ordinary questions
// ContactSchema — rejects an empty message, oversized input, a filled honeypot
// Ask AI citation gate — every emitted ID must resolve to the retrieved allowed published set;
//     zero, invented, stale or disallowed IDs discard the answer
// resume route — no is_current row → redirect to /resume-unavailable
// media loader — transform error/quota → original Supabase-CDN response, never a broken image
// contact route — the full decision table: malformed body → 400 with no Sentry report; failed
//     Turnstile → 403 before the limiter is consulted; filled honeypot → the same generic
//     acceptance a real submission gets, with no write and no notification; exhausted limit →
//     429; degraded limiter → 503; exactly one insert, always before any notification; a failed
//     insert never notifies; a failed notification never changes an accepted response; only
//     cf-connecting-ip seeds the pseudonym
// redactUrl — removes every sensitive query value at any position and in any case, is idempotent,
//     and leaves unrelated parameters, paths and fragments byte-identical
// constantTimeEquals — accepts only a byte-identical value and returns false on a length
//     mismatch instead of throwing
// runtime probe guard — loopback hosts only; every production hostname and an unparseable URL
//     fail closed
// motion tokens — every declared motion token has a consumer, and each mirrored JavaScript
//     constant equals its token
// media probe — the origin/transform/cache-hit/fallback checks and their failure reporting,
//     exercised against a stubbed transport
// identity assets — reject bad magic bytes/type/size/dimensions and SVG favicon; replacement gets
//     a new immutable key, complete favicon variants and the correct signed revalidation targets
// seed guard — seed:dev throws when NODE_ENV=production or ALLOW_DEV_SEED is not true
// backup-set contract — the whole-second CREATED_AT that create-weekly-backup.sh emits is
//     accepted, persisted timestamps are canonical, a tampered payload and a marker from
//     another run are refused, and retention keeps the newest sets and fails closed
```

`apps/web/tests/backup-set-contract.test.ts` executes `scripts/backups/backup-set.mjs` as a
subprocess against staged fixtures. It exists because that contract had no automated coverage and
shipped a defect that would have failed every scheduled run: the validator accepted only
`Date#toISOString()` output while the creator emits whole-second precision. Nothing else in the
repository runs the backup scripts, so a green pipeline was not evidence they worked.

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
- Fixture rendering: the seeded Blog, TIE, Project, Experience, synthetic Profile portrait,
  synthetic Favicon and dummy Resume exercise every component without contacting production
  services; missing identity relations render bundled defaults with no CLS
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
- [ ] Profile portrait/fallback has fixed dimensions and correct alt text; favicon replacement emits
      a new same-origin immutable URL and all declared PNG variants
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

---

## 11.7 Final lock test matrix

- **Spike gates:** local Spike A is recorded passed; remote image Spike A, Spike B and Spike C are
  fail-stop tests. No dependent phase proceeds on failure.
- **Database denial:** inspect current and default ACL/RLS catalogs for every application table,
  sequence and function and attempt CRUD as both
  `anon` and `authenticated`; reject grants or permissive policies.
- **Pseudonyms:** verify trusted Worker `CF-Connecting-IP` header sourcing (never `request.cf` or an `x-forwarded-*` fallback), HMAC determinism within one epoch, different
  output across epochs, no cross-epoch correlation and daily 90-day deletion.
- **Secrets:** equal-length helper accepts exact matches and rejects mismatched content/length;
  production bundles contain no server secret.
- **Preview:** expired/tampered scope never reaches the CMS; exit Route Handler clears Draft Mode
  without middleware.
- **Resume:** size/MIME/`%PDF-`, collision, cleanup, concurrent RPC serialization, old-pointer
  preservation, Turnstile POST and trusted bot metadata.
- **AI:** every model-emitted citation ID must resolve to a retrieved allowed published chunk;
  invented/stale/disallowed IDs discard the answer while page/input remain visible.
- **Registry/content:** manifest and Lexical fixtures pass exhaustive Zod schemas; unknown variants
  fail; slugs/URLs reject reserved, unsafe and non-HTTPS values.
- **Agent routes:** canonical `/agent`, generated `/llms.txt`, navigation and sitemap derive from one
  route manifest; repository-root exports match the canonical generators.
- **Backups:** all pagination is exhausted, counts/checksums match, ciphertext reaches off-primary R2
  and a scratch restore succeeds without primary-provider access.
- **Design/accessibility:** WCAG 2.2 AA, four font weights, strong control borders, pinned responsive
  dimensions/timings, reduced motion, no runtime media CDN and ≤2-second intro; profile/fallback
  portrait geometry and alt text remain stable, and favicon variants are same-origin and immutable.
