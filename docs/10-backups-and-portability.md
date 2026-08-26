# 10 — Backups, Disaster Recovery & Content Portability

[← Back to PLAN.md](../PLAN.md)

---

## 10.1 Why this is mandatory

Supabase's free tier has limited backups and **no point-in-time recovery**. A corrupted table, a
bad migration or a mistaken delete could take the entire blog with it. Backups are therefore
self-managed and automated from day one, not added after the first incident.

Three things must survive a total loss of every vendor account:

1. **The database** — content, logs, pointers
2. **Media** — images uploaded through Payload
3. **The writing itself** — in a format that does not need Payload to read

---

## 10.2 Weekly backup job

```yaml
# .github/workflows/weekly-backup.yml
name: weekly-backup
on:
  schedule:
    - cron: "0 3 * * 0"   # Sundays 03:00
  workflow_dispatch: {}

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create, encrypt and upload database backup
        env:
          AGE_RECIPIENT: ${{ secrets.BACKUP_AGE_RECIPIENT }}
          R2_CONFIG: ${{ secrets.R2_RCLONE_CONFIG }}
        run: |
          pg_dump "${{ secrets.SUPABASE_DB_URL }}" | gzip > "backup-$(date +%F).sql.gz"
          age -r "$AGE_RECIPIENT" -o "backup-$(date +%F).sql.gz.age" "backup-$(date +%F).sql.gz"
          rm "backup-$(date +%F).sql.gz"
          rclone --config "$R2_CONFIG" copy "backup-$(date +%F).sql.gz.age" r2:katbose-backups/database/

      # Optional convenience copy; R2 remains the durable target.
      - uses: actions/upload-artifact@v4
        with:
          name: encrypted-db-backup
          path: backup-*.sql.gz.age
          retention-days: 30
```

The dump covers both the `public` and `payload` schemas, because they live in the same database —
one of the main reasons for [that decision](01-architecture.md).

**Normative durable target:** encrypt each backup before upload and retain the last four weekly
sets in a private, off-primary Cloudflare R2 bucket with least-privilege credentials and versioning.
GitHub artifacts and the private export repository are convenience/portable copies, not the only
durable backup and not a substitute for R2. Restore tooling must decrypt without depending on the
primary Supabase, Render, or GitHub account.

**Verify early:** confirm that `pg_dump` from a GitHub Actions runner can actually reach the
Supabase connection string in use. Supabase's direct connections are IPv6-first and Actions
runners are IPv4-only, so the dump generally needs the **session pooler** connection string —
test this once during Phase 2 setup, not on the day a restore is needed.

---

## 10.3 Media sync

Payload uploads live in Supabase Storage. The same weekly workflow mirrors the media bucket to a
secondary location (R2 or a private repository) using the Supabase CLI or `rclone`. The resume
bucket is included; it is only a few KB per version.

---

## 10.4 Content export — the real anti-lock-in measure

Every collection is exported weekly in two formats:

- **JSON** — complete fidelity, for restoring into Payload
- **MDX** — human-readable and portable, for restoring into anything

```ts
// scripts/export-content.ts (shape)
const COLLECTIONS = ["blog-posts", "tie", "projects", "experience"] as const;

for (const collection of COLLECTIONS) {
  const docs: unknown[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetch(
      `${process.env.CMS_URL}/api/${collection}?limit=100&depth=2&page=${page}`,
    );
    if (!response.ok) throw new Error(`Export failed: ${collection} page ${page}`);
    const batch = ExportPageSchema.parse(await response.json());
    docs.push(...batch.docs);
    totalPages = batch.totalPages;
    page += 1;
  } while (page <= totalPages);

  await writeValidatedJsonAndMdx(collection, docs);
}
```

Every collection, Storage listing and R2 upload is paginated to exhaustion; fixed `limit=1000`
requests are forbidden. Export schemas validate all pages before publishing a backup set, and the
manifest records counts/checksums so truncated sets fail verification.

Encrypted JSON/MDX exports are uploaded with the database/media set to private off-primary R2.
A private `katbose-content-backup` repository may additionally receive the readable export as a
convenience/portable copy, but it is not the normative durable target.

This is also why [02-content-model.md](02-content-model.md) mandates conservative field design:
every exotic custom block is a special case in the serialiser and a future migration cost.

---

## 10.5 Restore procedure

```bash
# 1. Download the encrypted set from off-primary R2
# 2. Decrypt with the offline-held age identity and restore to scratch
age --decrypt -i "$BACKUP_AGE_IDENTITY" \
  -o backup-YYYY-MM-DD.sql.gz backup-YYYY-MM-DD.sql.gz.age
gunzip -c backup-YYYY-MM-DD.sql.gz | psql "$SCRATCH_DB_URL"
# 3. Restore media/resume objects and verify manifest counts/checksums
# 4. Point local Payload at scratch; verify content and exactly one current resume
```

**Restore drill:** perform this once immediately after setup, and again whenever the schema changes
materially. An untested backup is not a backup — this is a checklist item in Phase 2, not an
optional exercise.

---

## 10.6 Recovery scenarios

| Scenario | Recovery |
| --- | --- |
| Accidental content delete | Restore that document from the latest JSON export, or re-create from MDX |
| Bad migration on prod | Restore the weekly dump into a scratch DB, extract the affected tables |
| Supabase project lost | New project → apply `supabase/migrations/` → restore dump → re-point Render and redeploy the web app |
| Payload/Render lost | New Render service from `render.yaml` → same database → back online |
| Vendor abandonment (Payload) | Rebuild the site around the MDX exports; no content is trapped |
| Search index corrupted | No backup needed — the nightly reconciliation sweep rebuilds it from the CMS |

The search index is deliberately treated as **derived data**, never as a source of truth.

---

## 10.7 What is not backed up

- **PostHog and Sentry data** — telemetry, acceptable to lose
- **Upstash counters** — ephemeral by design, losing them just resets rate-limit windows
- **The Cloudflare AI Search index** — regenerated by reconciliation

Documenting these explicitly prevents a false sense of loss later.
