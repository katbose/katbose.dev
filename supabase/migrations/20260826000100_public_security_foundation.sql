begin;

create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (
    name = btrim(name) and char_length(name) between 1 and 100
  ),
  email text not null check (
    email = btrim(email) and char_length(email) between 1 and 200
  ),
  message text not null check (
    message = btrim(message) and char_length(message) between 10 and 5000
  ),
  created_at timestamptz not null default now()
);

create table public.download_logs (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  country text,
  referrer text,
  browser text,
  device text,
  user_agent_hash text,
  ip_pseudonym text,
  ip_epoch text,
  turnstile_triggered boolean not null default false,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now(),
  constraint download_logs_ip_identity_pair check (
    (ip_pseudonym is null and ip_epoch is null)
    or (ip_pseudonym is not null and ip_epoch is not null)
  )
);

create index download_logs_created_at_idx
  on public.download_logs (created_at desc);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique check (
    storage_path = btrim(storage_path) and char_length(storage_path) > 0
  ),
  uploaded_at timestamptz not null default now(),
  is_current boolean not null default false
);

create unique index one_current_resume
  on public.resume_versions (is_current)
  where is_current;

create table public.dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (btrim(collection) <> ''),
  doc_id text not null check (btrim(doc_id) <> ''),
  slug text not null check (btrim(slug) <> ''),
  operation text not null check (operation in ('create', 'update', 'upsert', 'delete')),
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dead_letter_queue_resolution_state check (
    (not resolved and resolved_at is null)
    or (resolved and resolved_at is not null)
  )
);

create index dlq_unresolved_idx
  on public.dead_letter_queue (resolved, attempts)
  where not resolved;

create table public.ai_query_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null check (btrim(query) <> ''),
  flagged boolean not null default false,
  answered boolean,
  reason text,
  sources jsonb,
  ip_pseudonym text,
  ip_epoch text,
  created_at timestamptz not null default now(),
  constraint ai_query_logs_ip_identity_pair check (
    (ip_pseudonym is null and ip_epoch is null)
    or (ip_pseudonym is not null and ip_epoch is not null)
  )
);

create index ai_query_logs_flagged_idx
  on public.ai_query_logs (flagged, created_at desc);

alter table public.contact_submissions enable row level security;
alter table public.contact_submissions force row level security;
alter table public.download_logs enable row level security;
alter table public.download_logs force row level security;
alter table public.resume_versions enable row level security;
alter table public.resume_versions force row level security;
alter table public.dead_letter_queue enable row level security;
alter table public.dead_letter_queue force row level security;
alter table public.ai_query_logs enable row level security;
alter table public.ai_query_logs force row level security;

create policy deny_client_roles
  on public.contact_submissions
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_client_roles
  on public.download_logs
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_client_roles
  on public.resume_versions
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_client_roles
  on public.dead_letter_queue
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_client_roles
  on public.ai_query_logs
  as restrictive for all to anon, authenticated
  using (false) with check (false);

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

  update public.resume_versions
  set is_current = false
  where is_current;

  update public.resume_versions
  set is_current = true
  where id = new_id;

  return new_id;
end;
$$;

-- Remove all direct and inherited client access to current public objects.
revoke all on schema public from public, anon, authenticated;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Prevent objects created later by the migration owner from restoring client access.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- The server-only service role is the sole application data path.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.promote_resume_version(text) to service_role;

alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Keep the function's execution boundary explicit even if surrounding defaults change.
revoke execute on function public.promote_resume_version(text)
  from public, anon, authenticated;
grant execute on function public.promote_resume_version(text)
  to service_role;

commit;
