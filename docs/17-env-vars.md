# 17 — Environment Variables & Secrets Inventory

[← Back to PLAN.md](../PLAN.md)

---

## 17.1 Rules

1. The Supabase **service role key never appears in a `NEXT_PUBLIC_*` variable or any client
   bundle.** It bypasses every RLS policy — leaking it compromises the entire data layer.
2. Production values are set on the protected `main` deployment and the production Render
  services. Local development uses ignored `.env.local` files and local Supabase credentials.
  `IP_HASH_SALT` must match between production Worker and Render surfaces.
3. `render.yaml` is committed with `sync: false` placeholders. Secret **values** are never
   committed.
4. `.env.example` files are committed for every app with placeholders and one-line comments.
5. `gitleaks` runs on every push and pull request.
6. Anything prefixed `NEXT_PUBLIC_` is **public** — assume it is printed on a billboard.

### 17.1.1 Provisioning schedule

The plan describes required resources; it does **not** claim every account already exists. Create
or confirm them only when their phase needs them:

| Resource | Provision/confirm by | Needed for | Status (2026-08-24) |
| --- | --- | --- | --- |
| `katbose.dev` registration + Cloudflare DNS zone | Before Spike A's remote/domain pass and certainly before production deploy | Worker custom domain, trusted `cf-connecting-ip`, CMS/dashboard subdomains | Availability verified; purchase planned for 2026-08-27 |
| Cloudflare Workers + Images + Turnstile + Access | Workers/Images for Spike A; Turnstile/Access before their Phase 1 gates | Web runtime, image transforms, bot checks and admin protection |
| npm package `katbose` | Before shipping `packages/katbose-card` | `npx katbose` distribution | Created and published; user-confirmed 2026-08-24 |
| Local Supabase CLI | Spike B | Free local Postgres/Storage/migration proof |
| Production Supabase project | Before first protected production migration | Production Postgres and Storage |
| Upstash, PostHog, Sentry and Slack workspace | While implementing their Phase 1 route/observability items | Rate limits, analytics, errors and alerts |
| Render | Spike B / Phase 2 deployment | Payload CMS; dashboard waits until Phase 5 |
| Cloudflare AI Search instance | Spike C / Phase 3 | Items API, cited chat and reconciliation |
| Cal.com | **Confirmed:** `https://cal.com/katbose/meet` | Scheduling link on Home and Contact |

Local-only `ALLOW_DEV_SEED=true` enables the deterministic fixture seed
([02-content-model.md](02-content-model.md) §2.1.1). It must never be configured on Cloudflare or
Render.

---

## 17.2 Cloudflare Workers via OpenNext — `apps/web`

| Variable | Public? | Purpose | Rotation |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical site URL | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | On project change |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key (RLS-gated, near-zero access by design) | On compromise |
| `SUPABASE_URL` | No | Server-only Supabase client URL | On project change |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Server-only Worker writes: logs, submissions, signed URLs | On compromise, immediately |
| `CMS_URL` | No | Payload API base, e.g. `https://cms.katbose.dev` | — |
| `WEBHOOK_SHARED_SECRET` | **No** | Authenticates `content-sync` and `reconcile` calls | Quarterly |
| `PREVIEW_URL_SECRET` | **No** | One-time Payload preview-link gate, 256-bit | Quarterly, or after any suspected exposure |
| `PREVIEW_INTERNAL_SECRET` | **No** | Worker-to-CMS draft endpoint secret | Quarterly, or after any suspected exposure |
| `IP_HASH_SALT` | **No** | Salt for SHA-256 IP hashing | **Quarterly, with the retention purge** |
| `UPSTASH_REDIS_REST_URL` | **No** | Rate limiting | On compromise |
| `UPSTASH_REDIS_REST_TOKEN` | **No** | Rate limiting | On compromise |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes | Turnstile widget | — |
| `TURNSTILE_SECRET_KEY` | **No** | Server-side `siteverify` | On compromise |
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes | Analytics | — |
| `NEXT_PUBLIC_POSTHOG_HOST` | Yes | Analytics host | — |
| `SENTRY_DSN` | No | Error reporting | — |
| `SENTRY_AUTH_TOKEN` | **No** | Source map upload at build time | Quarterly |
| `SLACK_ALERTS_WEBHOOK_URL` | **No** | `#katbose-alerts` | On compromise |
| `SLACK_CONTACT_WEBHOOK_URL` | **No** | `#contact-form` | On compromise |
| `CONTACT_FALLBACK_EMAIL` | Yes | Shown when the form fails closed (`im@katbose.dev`) | — |
| `NEXT_PUBLIC_CAL_LINK` | Yes | Cal.com booking link, rendered as a plain outbound link (`https://cal.com/katbose/meet`, [19-design-reference.md](19-design-reference.md)) | — |

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
| `IP_HASH_SALT` | Must match the web app within the environment |
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
      - key: IP_HASH_SALT
        sync: false
```

---

## 17.4 GitHub Actions secrets

| Secret | Used by |
| --- | --- |
| `SUPABASE_DB_URL` | `weekly-backup.yml` (`pg_dump`) |
| `NEXTJS_RECONCILE_ENDPOINT` | `nightly-reconciliation.yml` |
| `WEBHOOK_SHARED_SECRET` | `nightly-reconciliation.yml` |
| `CMS_URL` | `weekly-backup.yml` (content export) |
| `CONTENT_BACKUP_REPO_TOKEN` | Pushing exports to the private backup repo |
| `R2_*` (optional) | Off-GitHub backup mirror |

---

## 17.5 Generating secrets

```bash
openssl rand -hex 32     # PREVIEW_URL_SECRET
openssl rand -hex 32     # PREVIEW_INTERNAL_SECRET
openssl rand -hex 32     # WEBHOOK_SHARED_SECRET
openssl rand -hex 32     # IP_HASH_SALT
openssl rand -hex 32     # PAYLOAD_SECRET
```

If a deployment token is required for Workers Builds, scope it to the account and Worker
deployment only. AI Search access is provided by the `AI_SEARCH` binding, not a broad runtime API
token.

---

## 17.6 Rotation calendar

| Cadence | Action |
| --- | --- |
| Quarterly | Rotate `IP_HASH_SALT` **together with** the 90-day retention purge |
| Quarterly | Rotate `PREVIEW_URL_SECRET`, `PREVIEW_INTERNAL_SECRET`, `WEBHOOK_SHARED_SECRET`, `SENTRY_AUTH_TOKEN` |
| On compromise | Rotate the affected key immediately, then audit `download_logs` and `ai_query_logs` for abuse |
| On vendor change | Remove retired variables from every surface and from this document |

**Salt rotation order** (both surfaces must move together, or hashes stop matching):

1. Run the retention purge
2. Generate the new salt
3. Update it on the production Worker and on Render
4. Redeploy both
5. Spot-check that a download still logs and that rate limiting still counts

---

## 17.7 Verification

Before every production deploy:

- [ ] `pnpm build` output contains no service role key, `PREVIEW_URL_SECRET` or `PREVIEW_INTERNAL_SECRET`
- [ ] No `NEXT_PUBLIC_` variable holds anything sensitive
- [ ] Local `.env.local` values are separate from production Worker/Render secrets
- [ ] `gitleaks` is passing
- [ ] Every variable in this document exists on its surface, and every variable on a surface
      appears in this document
