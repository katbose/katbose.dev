# 06 — Data Model & Row Level Security

[← Back to PLAN.md](../PLAN.md)

---

## 6.1 The rule

**Every application table is deny-by-default for `anon` and `authenticated`.** PostgreSQL combines
permissive policies with `OR`; therefore a permissive policy added later can bypass a permissive
`false` policy. Each migration must revoke schema/table/sequence/function privileges, add a
role-scoped **restrictive** deny policy, and control default privileges so future objects cannot
silently inherit client grants. Server-only service-role clients remain the sole data path.

```sql
revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from PUBLIC, anon, authenticated;

-- Run for every role that can own/create public-schema objects (normally `postgres`).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from PUBLIC, anon, authenticated;

alter table <table> enable row level security;
alter table <table> force row level security;
revoke all on table <table> from anon, authenticated;
create policy "deny_client_roles"
  on <table> as restrictive for all to anon, authenticated
  using (false) with check (false);
```

Migration tests query `pg_policy`/`pg_policies`, table/sequence/function ACL catalogs and default-ACL
catalogs, then attempt `SELECT`, `INSERT`, `UPDATE` and `DELETE` as both `anon` and `authenticated`;
every attempt must fail. Catalog tests also reject any unexpected permissive policy or current or
default grant. The service-role path is covered separately and its key never enters a client bundle.

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
  created_at timestamptz default now()
);

alter table contact_submissions enable row level security;
alter table contact_submissions force row level security;
revoke all on table contact_submissions from anon, authenticated;
create policy "deny_client_roles" on contact_submissions as restrictive
  for all to anon, authenticated using (false) with check (false);
```

Contact submissions deliberately store no IP pseudonym; form abuse control is enforced before the
insert and correspondence contains only the fields needed to reply.

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
  ip_pseudonym text,
  ip_epoch text,
  turnstile_triggered boolean default false,
  success boolean not null,
  error_message text,
  created_at timestamptz default now()
);
create index download_logs_created_at_idx on download_logs (created_at desc);

alter table download_logs enable row level security;
alter table download_logs force row level security;
revoke all on table download_logs from anon, authenticated;
create policy "deny_client_roles" on download_logs as restrictive
  for all to anon, authenticated using (false) with check (false);
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
alter table resume_versions force row level security;
revoke all on table resume_versions from anon, authenticated;
create policy "deny_client_roles" on resume_versions as restrictive
  for all to anon, authenticated using (false) with check (false);
```

The promotion RPC is one serialized transaction and has a closed execution boundary:

```sql
create or replace function public.promote_resume_version(new_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.promote_resume_version', 0)
  );

  insert into public.resume_versions (storage_path, is_current)
  values (new_storage_path, false)
  returning id into new_id;

  update public.resume_versions set is_current = false where is_current;
  update public.resume_versions set is_current = true where id = new_id;
  return new_id;
end;
$$;

revoke execute on function public.promote_resume_version(text)
  from PUBLIC, anon, authenticated;
grant execute on function public.promote_resume_version(text)
  to service_role;
```

The transaction-scoped advisory lock serializes concurrent promotions. Until commit, readers keep
seeing the old current row; after commit they see the new one. The fixed empty `search_path` and
schema-qualified references prevent object-shadowing, and only `service_role` can invoke the
function.

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
alter table dead_letter_queue force row level security;
revoke all on table dead_letter_queue from anon, authenticated;
create policy "deny_client_roles" on dead_letter_queue as restrictive
  for all to anon, authenticated using (false) with check (false);
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
  ip_pseudonym text,
  ip_epoch text,
  created_at timestamptz default now()
);
create index ai_query_logs_flagged_idx on ai_query_logs (flagged, created_at desc);

alter table ai_query_logs enable row level security;
alter table ai_query_logs force row level security;
revoke all on table ai_query_logs from anon, authenticated;
create policy "deny_client_roles" on ai_query_logs as restrictive
  for all to anon, authenticated using (false) with check (false);
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

```text
Browser ──► never talks to Supabase directly for anything privileged
        └─► Next.js route handler ──► service role client (server-only module)
                                  └─► Supabase
```

- `lib/supabase/service.ts` is marked server-only and is the **only** module that reads
  `SUPABASE_SERVICE_ROLE_KEY`.
- Browser and Client Component code never initializes Supabase and receives no anon key. Adding
  direct browser access or a permissive client-role policy would require a new decision and
  security review; it is not an implementation option under decision #73.

---

## 6.5 Retention & purge

```sql
-- scripts/retention-purge.sql — scheduled daily; independent of key rotation
delete from download_logs   where created_at < now() - interval '90 days';
delete from ai_query_logs   where created_at < now() - interval '90 days';
delete from dead_letter_queue where resolved and resolved_at < now() - interval '90 days';
```

A daily job enforces the 90-day ceiling independently of quarterly key rotation. Old and new HMAC
epochs can coexist until their rows expire; application code never correlates epochs.

`contact_submissions` are kept until manually cleared—they are correspondence, not telemetry, and
contain no IP pseudonym.

---

## 6.6 Migration discipline

- Migrations are plain, numbered `.sql` files in `supabase/migrations/` — no click-ops in the
  Supabase UI for schema changes.
- Every migration controls current and default privileges for every role that can create objects:
  revoke client access to the `public` schema and all tables/sequences/functions, then use
  `ALTER DEFAULT PRIVILEGES` so future tables, sequences and functions cannot silently gain
  `anon`/`authenticated` grants or `PUBLIC` function execution. Every new table also enables and
  forces RLS and adds a role-scoped restrictive deny policy in the same migration. Catalog
  assertions (including default ACLs) plus CRUD attempts as both client roles are mandatory; any
  unexpected permissive policy or current/default grant fails CI.
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
