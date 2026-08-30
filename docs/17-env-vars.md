# 17 — Environment Variables & Secrets Inventory

[← Back to PLAN.md](../PLAN.md)

---

## 17.1 Rules

1. The Supabase **service role key never appears in a `NEXT_PUBLIC_*` variable or any client
   bundle.** It bypasses every RLS policy — leaking it compromises the entire data layer.
2. Production values are set on the protected `main` deployment and the production Render
  services. Local development uses ignored `.env.local` files and local Supabase credentials.
  `IP_PSEUDONYM_KEY` exists only on the web Worker that receives trusted Cloudflare request
  metadata; Render does not compute visitor pseudonyms.
3. `render.yaml` is committed with `sync: false` placeholders. Secret **values** are never
   committed.
4. `.env.example` files are committed for every app with placeholders and one-line comments.
5. `gitleaks` runs on every push and pull request.
6. Anything prefixed `NEXT_PUBLIC_` is **public** — assume it is printed on a billboard.

### 17.1.1 Provisioning schedule

The plan describes required resources; it does **not** claim every account already exists. Create
or confirm them only when their phase needs them:

| Resource | Provision/confirm by | Needed for | Status (verified through 2026-08-28) |
| --- | --- | --- | --- |
| `katbose.dev` registration + Cloudflare DNS zone | Before Spike A's remote/domain pass and certainly before production deploy | Worker custom domain, trusted `CF-Connecting-IP`, CMS/dashboard subdomains | Confirmed active with the production Worker bound to the apex custom domain; parking records were removed and Cloudflare nameservers are authoritative |
| Cloudflare Workers + Images + Turnstile + Access | Workers/Images for Spike A; Turnstile/Access before their Phase 1 gates | Web runtime, image transforms, bot checks and admin protection | The existing non-interactive Turnstile widget is restricted to `katbose.dev`; its public build variable and Worker secret binding are configured. Fresh-token success and replay rejection through the deployed contact route remain unverified. Access remains phase-scoped and unconfirmed. |
| npm package `katbose` | Before shipping `packages/katbose-card` | `npx katbose` distribution | Published and monorepo source integrated. Registry byte parity **was** independently checked on 2026-08-28: the downloaded `katbose@0.0.2` tarball matches the workspace tarball exactly at SHA-1 `73f90d862686bdc5792c29440edc3d642eba73ba`. A cold-cache run on 2026-08-29 used Windows 10.0.26200 X64, Node v24.17.0, npm 11.13.0 and a unique empty cache. It exited 0 with the correct card in 15,507.9 ms, after which the cache was removed; the under-three-second gate remains unmet |
| Local Supabase CLI | Spike B | Free local Postgres/Storage/migration proof | Config, migrations and pgTAP tests are committed and pass in CI against Postgres 17.6/Supabase Storage (72 assertions); Docker remains unavailable on this workstation |
| Production Supabase project | Before first protected production migration | Production Postgres and Storage | `katbose-db` (`ap-south-1`, PostgreSQL 17.6) is active and healthy; both committed migrations are recorded, all five public tables have forced RLS/restrictive client-role denies, and the private `resume` bucket exists. Supabase GitHub **Deploy to production** is disabled, so future migrations remain owned by the backup-first workflow |
| Encrypted weekly backup controls | Before the first weekly run | Off-primary database/Storage recovery | The scripts are proven end to end by `backup-drill.yml` (run `33190795456`, 2026-08-28) against loopback infrastructure. Production is still not armed: as verified the same day, `SUPABASE_DB_URL`, `BACKUP_AGE_RECIPIENT` and `R2_RCLONE_CONFIG` exist in the `production` environment but `SUPABASE_STORAGE_RCLONE_CONFIG` does not, at environment or repository scope; the environment has no deployment-branch restriction or approval rule, `katbose-backups` has no lock rules, the active workflow has no runs, and no restore has used the real offline age identity |
| Upstash, PostHog, Sentry and Slack workspace | While implementing their Phase 1 route/observability items | Rate limits, analytics, errors and alerts | PostHog EU ingestion and production-host events are verified, and browser/server Sentry plus shared redaction are now wired in the repository. Still unverified against the live vendors: Upstash limiter behaviour, a de-minified Sentry event under the deploy release, `#katbose-alerts` delivery, and `#contact-form` delivery. Sentry source-map upload additionally needs `SENTRY_ORG` and `SENTRY_PROJECT` alongside `SENTRY_AUTH_TOKEN`, and the browser needs `NEXT_PUBLIC_SENTRY_DSN` |
| Render | Spike B / Phase 2 deployment | Payload CMS; dashboard waits until Phase 5 | Not confirmed here |
| Cloudflare AI Search instance | Spike C / Phase 3 | Items API, cited chat and reconciliation | Not confirmed here |
| Cal.com | **Confirmed:** `https://cal.com/katbose/meet` | Scheduling link on Home and Contact | Confirmed |

Local-only `ALLOW_DEV_SEED=true` enables the deterministic fixture seed
([02-content-model.md](02-content-model.md) §2.1.1). It must never be configured on Cloudflare or
Render.

---

## 17.2 Cloudflare Workers via OpenNext — `apps/web`

| Variable | Public? | Purpose | Rotation |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical site URL | — |
| `SUPABASE_URL` | No | Server-only Supabase client URL | On project change |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server-only Worker writes: logs, submissions, signed URLs | On compromise, immediately |
| `CMS_URL` | No | Payload API base, e.g. `https://cms.katbose.dev` | — |
| `WEBHOOK_SHARED_SECRET` | **No** | Authenticates `content-sync`, `reconcile` and Payload-triggered site revalidation calls | Quarterly |
| `PREVIEW_URL_SECRET` | **No** | One-time Payload preview-link gate, 256-bit | Quarterly, or after any suspected exposure |
| `PREVIEW_INTERNAL_SECRET` | **No** | Worker-to-CMS draft endpoint secret | Quarterly, or after any suspected exposure |
| `IP_PSEUDONYM_KEY` | **No** | Current HMAC-SHA-256 key for IP pseudonyms | Quarterly; independent of the daily 90-day purge |
| `IP_PSEUDONYM_EPOCH` | **No** | Non-secret current key epoch stored beside each pseudonym | On each key rotation |
| `UPSTASH_REDIS_REST_URL` | **No** | Rate limiting | On compromise |
| `UPSTASH_REDIS_REST_TOKEN` | **No** | Rate limiting | On compromise |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes | Turnstile widget | — |
| `TURNSTILE_SECRET_KEY` | **No** | Server-side `siteverify` | On compromise |
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes | Analytics | — |
| `NEXT_PUBLIC_POSTHOG_HOST` | Yes | Analytics host | — |
| `SENTRY_DSN` | No | Server error reporting | — |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Browser error reporting; also derives the CSP `connect-src` ingest origin | — |
| `SENTRY_AUTH_TOKEN` | **No** | Source map upload at build time | Quarterly |
| `SENTRY_ORG` | No | Sentry organisation slug for source-map upload | — |
| `SENTRY_PROJECT` | No | Sentry project slug for source-map upload | — |
| `SLACK_ALERTS_WEBHOOK_URL` | **No** | `#katbose-alerts` | On compromise |
| `SLACK_CONTACT_WEBHOOK_URL` | **No** | `#contact-form` | On compromise |
| `CONTACT_FALLBACK_EMAIL` | Rendered, not client env | Server-side fallback passed as a serializable form prop (`im@katbose.dev`) | — |
| `NEXT_PUBLIC_CAL_LINK` | Yes | Cal.com booking link, rendered as a plain outbound link (`https://cal.com/katbose/meet`, [19-design-reference.md](19-design-reference.md)) | — |

`NEXT_PUBLIC_RELEASE` is **derived, not configured**. `next.config.ts` resolves it from
`WORKERS_CI_COMMIT_SHA` (Workers Builds) or `GITHUB_SHA` (Actions) and inlines it, so the browser
bundle and the server runtime report the same Sentry release and share one source map. It is
absent from `.env.example` on purpose: setting it by hand would mislabel a build.

Source-map upload activates only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are
all present. Any build missing one of them produces the same output as before the wrapper existed,
which keeps CI independent of Sentry availability.

AI Search is a Wrangler `ai_search` binding in `apps/web/wrangler.jsonc`, not an application
environment variable. The binding is configured with `remote: true` for local Workers-runtime
preview tests; no broad Cloudflare API token is shipped to the Worker.

Cloudflare Images is enabled for the `katbose.dev` zone and used through the same-zone
`/cdn-cgi/image/` URL interface; it is neither a Worker binding nor an environment variable.
Supabase remains the media origin. No Cloudflare Images storage or upload token is configured
([01-architecture.md](01-architecture.md) §1.4.1).

---

## 17.3 Render (production only) — `apps/cms` and `apps/dashboard`

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string, `payload` schema |
| `SUPABASE_URL` | Supabase project REST URL — used by the `resume-uploads` hook to call Storage ([04-resume-system.md](04-resume-system.md) §4.4.1) |
| `PAYLOAD_SECRET` | Payload session/encryption secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged data access from the CMS/dashboard |
| `NEXTJS_WEBHOOK_URL` | Base URL of the public site for webhook dispatch |
| `WEBHOOK_SHARED_SECRET` | Must match the web app |
| `PREVIEW_URL_SECRET` | Must match the web app — used to build the one-time preview link |
| `PREVIEW_INTERNAL_SECRET` | Must match the web app — authenticates draft reads from the Worker |
| `PUBLIC_SITE_URL` | Used in the Payload preview URL builder |
| `PAYLOAD_PUBLIC_SERVER_URL` | Payload's own base URL |
| `SLACK_ALERTS_WEBHOOK_URL` | Alerts from CMS-side hooks |

```yaml
# render.yaml (shape — no values)
services:
  - type: web
    name: katbose-cms
    env: node
    renderSubdomainPolicy: disabled
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter cms build
    startCommand: pnpm --filter cms start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: PAYLOAD_SECRET
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: WEBHOOK_SHARED_SECRET
        sync: false
      - key: PREVIEW_URL_SECRET
        sync: false
      - key: PREVIEW_INTERNAL_SECRET
        sync: false
```

---

## 17.4 GitHub Actions secrets

| Secret | Used by |
| --- | --- |
| `SUPABASE_DB_URL` | `weekly-backup.yml` and `production-migration.yml` (`pg_dump`); use the IPv4-reachable session-pooler URL for GitHub-hosted runners |
| `SUPABASE_STORAGE_RCLONE_CONFIG` | `weekly-backup.yml`; multiline rclone remote named `supabase` for the authenticated Supabase Storage S3 endpoint. Generated S3 keys are server-only, bypass Storage RLS and have full access to every bucket, so this secret must be stored only in the `production` environment after it is restricted to protected branches |
| `NEXTJS_RECONCILE_ENDPOINT` | `nightly-reconciliation.yml` |
| `WEBHOOK_SHARED_SECRET` | `nightly-reconciliation.yml` |
| `CMS_URL` | Planned Phase 2 input for `weekly-backup.yml` all-page JSON/MDX export; not referenced until Payload exists |
| `CONTENT_BACKUP_REPO_TOKEN` | Planned optional convenience push of portable exports to the private repo; R2 remains authoritative |
| `R2_RCLONE_CONFIG` | `weekly-backup.yml` and `production-migration.yml`; multiline rclone remote named `r2` for the private `katbose-backups` bucket. The token is bucket-scoped, so rclone uses `--s3-no-check-bucket` |
| `BACKUP_AGE_RECIPIENT` | `weekly-backup.yml` and `production-migration.yml`; public recipient that encrypts every backup while the private identity stays offline and out of GitHub |

The weekly workflow uses the same `production` environment as the protected migration workflow and
asserts `refs/heads/main` before checking out repository code. Generate the Storage pair from
**Supabase Dashboard → Storage → Configuration → S3**, store it in the config shape documented in
[10-backups-and-portability.md](10-backups-and-portability.md) §10.2.2, and keep the age private
identity in at least two offline locations. Never add the age identity or a Supabase service-role key
to GitHub to make a restore more convenient.

---

## 17.5 Generating secrets

```bash
openssl rand -hex 32     # PREVIEW_URL_SECRET
openssl rand -hex 32     # PREVIEW_INTERNAL_SECRET
openssl rand -hex 32     # WEBHOOK_SHARED_SECRET
openssl rand -hex 32     # IP_PSEUDONYM_KEY
openssl rand -hex 32     # PAYLOAD_SECRET
```

If a deployment token is required for Workers Builds, scope it to the account and Worker
deployment only. AI Search access is provided by the `AI_SEARCH` binding, not a broad runtime API
token.

---

## 17.6 Rotation calendar

| Cadence | Action |
| --- | --- |
| Daily | Purge telemetry older than 90 days; this job is independent of key rotation |
| Quarterly | Rotate `IP_PSEUDONYM_KEY`, increment `IP_PSEUDONYM_EPOCH`; never correlate epochs |
| Quarterly | Rotate `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `WEBHOOK_SHARED_SECRET`, `SENTRY_AUTH_TOKEN` |
| Quarterly | Rotate the Supabase Storage S3 pair and bucket-scoped R2 token; prove a new complete set and restore before revoking the old credentials |
| On compromise | Rotate the affected key immediately, then audit application logs plus R2/Supabase access; an age recipient change does not decrypt old sets, so preserve the corresponding offline identity through their retention window |
| On vendor change | Remove retired variables from every surface and from this document |

**Pseudonym-key rotation order:**

1. Generate a new 256-bit key and increment the epoch.
2. Update the production Worker secret/variable and redeploy atomically.
3. Spot-check logging and short-window limiting under the new epoch.
4. Leave old-epoch rows untouched until the independent daily 90-day purge removes them; never
   correlate or backfill across epochs.

---

## 17.7 Verification

Before every production deploy:

- [ ] `pnpm build` output contains no service role key, `PREVIEW_URL_SECRET` or `PREVIEW_INTERNAL_SECRET`
- [ ] No `NEXT_PUBLIC_` variable holds anything sensitive
- [ ] Local `.env.local` values are separate from production Worker/Render secrets
- [ ] `gitleaks` is passing
- [ ] Every variable in this document exists on its surface, and every variable on a surface
      appears in this document
