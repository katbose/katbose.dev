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

      - name: Dump database
        run: |
          pg_dump "${{ secrets.SUPABASE_DB_URL }}" > "backup-$(date +%F).sql"
          gzip backup-*.sql

      - uses: actions/upload-artifact@v4
        with:
          name: db-backup
          path: backup-*.sql.gz
          retention-days: 30
```

The dump covers both the `public` and `payload` schemas, because they live in the same database —
one of the main reasons for [that decision](01-architecture.md).

**Retention:** keep the last four weekly dumps. Artifacts are the simplest free destination;
Cloudflare R2 (free tier) is the documented upgrade path when longer retention or off-GitHub
redundancy is wanted.

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
// scripts/export-content.ts
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS = ["blog-posts", "tie", "projects", "experience"] as const;

for (const collection of COLLECTIONS) {
  const res = await fetch(`${process.env.CMS_URL}/api/${collection}?limit=1000&depth=2`);
  const data = await res.json();

  await fs.mkdir(path.join("exports", collection), { recursive: true });
  await fs.writeFile(`exports/${collection}.json`, JSON.stringify(data, null, 2));

  for (const doc of data.docs) {
    const frontmatter = [
      "---",
      `title: ${JSON.stringify(doc.title)}`,
      `slug: ${doc.slug}`,
      `date: ${doc.publishedAt ?? doc.createdAt}`,
      `tags: [${(doc.tags ?? []).join(", ")}]`,
      "---",
      "",
    ].join("\n");

    await fs.writeFile(
      `exports/${collection}/${doc.slug}.mdx`,
      frontmatter + richTextToMarkdown(doc.content), // Payload's Lexical → Markdown serializer
    );
  }
}
```

Output is committed to a **private `katbose-content-backup` repository**.

Result: even if Payload and Supabase both disappear tomorrow, every article exists as versioned
Markdown in Git — the most portable format available, and the concrete answer to "how does my
writing get out if I leave Payload?"

This is also why [02-content-model.md](02-content-model.md) mandates conservative field design:
every exotic custom block is a special case in the serialiser and a future migration cost.

---

## 10.5 Restore procedure

```bash
# 1. Create a scratch Supabase project or local Postgres
# 2. Restore
gunzip -c backup-YYYY-MM-DD.sql.gz | psql "$SCRATCH_DB_URL"
# 3. Point a local Payload instance at the scratch database and verify the admin panel loads
# 4. Spot-check: latest blog post present, resume_versions has exactly one is_current row
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
