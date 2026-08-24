# 06 — Data Model & Row Level Security

[← Back to PLAN.md](../PLAN.md)

---

## 6.1 The rule

**Every table that stores logs, PII or submissions is deny-by-default.**

All reads and writes happen server-side with the service role key. The anon key gets **zero**
table access. Enabling RLS without policies is not enough — an explicit deny policy makes the
intent unambiguous and survives someone later adding a permissive policy by accident.

This is the single most common Supabase production incident: a table with RLS disabled, an anon
key shipped to the browser, and every contact submission and hashed IP readable by anyone.

```sql
alter table <table> enable row level security;
create policy "deny_all_anon" on <table> for all using (false) with check (false);
```

---

## 6.2 Schema

Files live in `supabase/migrations/`, applied in numeric order against local Supabase first and
then the one production project from the protected `main` release workflow.

### `contact_submissions`

```sql
create table contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  ip_hash text,
  created_at timestamptz default now()
);

alter table contact_submissions enable row level security;
create policy "deny_all_anon" on contact_submissions for all using (false) with check (false);
```

### `download_logs`

```sql
create table download_logs (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  country text,
  referrer text,
  browser text,
  device text,
  user_agent_hash text,
  ip_hash text,
  turnstile_triggered boolean default false,
  success boolean not null,
  error_message text,
  created_at timestamptz default now()
);
create index download_logs_created_at_idx on download_logs (created_at desc);

alter table download_logs enable row level security;
create policy "deny_all_anon" on download_logs for all using (false) with check (false);
```

### `resume_versions`

```sql
create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  uploaded_at timestamptz default now(),
  is_current boolean default false
);
-- At most one current resume, enforced by the database.
create unique index one_current_resume on resume_versions (is_current) where is_current;

alter table resume_versions enable row level security;
create policy "deny_all_anon" on resume_versions for all using (false) with check (false);
```

### `dead_letter_queue`

```sql
create table dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  doc_id text not null,
  slug text not null,
  operation text not null check (operation in ('create', 'update', 'upsert', 'delete')),
  error_message text,
  attempts int default 0,
  resolved boolean default false,
  resolved_at timestamptz,
  created_at timestamptz default now()
);
create index dlq_unresolved_idx on dead_letter_queue (resolved, attempts) where not resolved;

alter table dead_letter_queue enable row level security;
create policy "deny_all_anon" on dead_letter_queue for all using (false) with check (false);
```

### `ai_query_logs`

```sql
create table ai_query_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  flagged boolean default false,
  answered boolean,
  reason text,
  sources jsonb,
  ip_hash text,
  created_at timestamptz default now()
);
create index ai_query_logs_flagged_idx on ai_query_logs (flagged, created_at desc);

alter table ai_query_logs enable row level security;
create policy "deny_all_anon" on ai_query_logs for all using (false) with check (false);
```

### Payload tables

Managed by Payload's migrations inside the `payload` schema. They are not hand-edited, but they
are covered by the same backup job. This includes `resume-uploads`
([04-resume-system.md](04-resume-system.md) §4.4.1) — an admin-only upload trigger whose hook
writes into the `public.resume_versions` row above. `resume_versions` remains the only table the
download route actually reads from.

---

## 6.3 Storage

| Bucket | Visibility | Access |
| --- | --- | --- |
| `resume` | **Private** | No public or anon policy exists. Only the service role can mint signed URLs. |
| `media` (Payload uploads) | Public read | Immutable, versioned originals referenced by published content; served by Supabase's CDN and transformed through Cloudflare Images ([01-architecture.md](01-architecture.md) §1.4.1) |

The `media` collection requires alt text, width, height and MIME type. Uploads accept JPEG, PNG,
WebP and AVIF images up to 10 MB, write a unique/versioned object key, and set
`Cache-Control: public, max-age=31536000, immutable`. Replacing an image means uploading a new
key; overwriting a cached object is forbidden. The private `resume` bucket deliberately keeps
short-lived signed responses and does not inherit this cache policy.

---

## 6.4 Client boundaries

```
Browser ──► never talks to Supabase directly for anything privileged
        └─► Next.js route handler ──► service role client (server-only module)
                                  └─► Supabase
```

- `lib/supabase/service.ts` is marked server-only and is the **only** module that reads
  `SUPABASE_SERVICE_ROLE_KEY`.
- If the client ever needs Supabase directly (currently it does not, since Payload serves content),
  it may use the anon key **only** against tables with an explicit permissive read policy.

---

## 6.5 Retention & purge

```sql
-- scripts/retention-purge.sql — scheduled, runs alongside salt rotation
delete from download_logs   where created_at < now() - interval '90 days';
delete from ai_query_logs   where created_at < now() - interval '90 days';
delete from dead_letter_queue where resolved and resolved_at < now() - interval '90 days';
```

`contact_submissions` are kept until manually cleared — they are correspondence, not telemetry,
and are disclosed as such in the privacy policy.

Purging on the same schedule as salt rotation keeps the two consistent: after a rotation there are
no surviving rows hashed with the retired salt.

---

## 6.6 Migration discipline

- Migrations are plain, numbered `.sql` files in `supabase/migrations/` — no click-ops in the
  Supabase UI for schema changes.
- Every new table gets `enable row level security` **and** a deny policy in the same migration.
  A table without them does not pass review.
- Run against local Supabase first, including the relevant tests. Before production, take the
  scheduled backup, then apply the committed migration to the one production project.

---

## 6.7 No ORM

Decision #31 in the [decision log](16-decision-log.md): the application uses **no ORM**.

- The `payload` schema is managed entirely by Payload's Postgres adapter (which bundles Drizzle
  internally) — those tables are never accessed directly.
- The five `public` tables are accessed exclusively through `supabase-js` parameterised queries
  from server-only modules (§6.4). The query shapes are trivial — inserts and simple single-row
  selects — and do not justify an ORM.
- Type safety comes from generated types: `supabase gen types typescript` produces table types
  from the schema, which are fed to the Supabase client and re-exported from `packages/shared`.
  Regenerate whenever a migration changes the `public` schema.
- Adding Prisma or a standalone Drizzle setup would introduce serverless cold-start weight, a
  second connection-management layer against Supabase's pooler, and a second migration system
  that conflicts with the plain-SQL + RLS-in-the-same-migration discipline in §6.6.

If a genuine need ever emerges (for example, complex relational queries in the dashboard), it
goes through the decision log first — not a quiet addition.
