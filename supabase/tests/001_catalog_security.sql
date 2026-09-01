begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(34);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'media' and name = 'media' and public is true
  ),
  'media bucket exists and is public'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'deny_client_roles_media'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and cardinality(roles) = 2
      and roles @> array['anon'::name, 'authenticated'::name]
      and regexp_replace(qual, '[[:space:]()]', '', 'g') =
        'bucket_id<>''media''::text'
      and regexp_replace(with_check, '[[:space:]()]', '', 'g') =
        'bucket_id<>''media''::text'
  ),
  1::bigint,
  'media objects have a restrictive client-role mutation guard'
);

select has_table('public', 'contact_submissions', 'contact_submissions exists');
select has_table('public', 'download_logs', 'download_logs exists');
select has_table('public', 'resume_versions', 'resume_versions exists');
select has_table('public', 'dead_letter_queue', 'dead_letter_queue exists');
select has_table('public', 'ai_query_logs', 'ai_query_logs exists');

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'contact_submissions', 'download_logs', 'resume_versions',
        'dead_letter_queue', 'ai_query_logs'
      ])
      and c.relrowsecurity
      and c.relforcerowsecurity
  ),
  5::bigint,
  'RLS is enabled and forced on all five application tables'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'contact_submissions', 'download_logs', 'resume_versions',
        'dead_letter_queue', 'ai_query_logs'
      ])
      and policyname = 'deny_client_roles'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and roles @> array['anon'::name, 'authenticated'::name]
      and qual = 'false'
      and with_check = 'false'
  ),
  5::bigint,
  'every application table has the role-scoped restrictive deny policy'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'contact_submissions', 'download_logs', 'resume_versions',
        'dead_letter_queue', 'ai_query_logs'
      ])
      and permissive = 'PERMISSIVE'
  ),
  0::bigint,
  'no permissive policy can bypass the client-role denies'
);

select ok(
  not exists (
    select 1
    from pg_namespace n
    cross join lateral aclexplode(
      coalesce(n.nspacl, acldefault('n', n.nspowner))
    ) a
    where n.nspname = 'public'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'PUBLIC, anon, and authenticated have no current public-schema privileges'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'PUBLIC, anon, and authenticated have no current public-relation privileges'
);

select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('S', c.relowner))
    ) a
    where n.nspname = 'public'
      and c.relkind = 'S'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'PUBLIC, anon, and authenticated have no current public-sequence privileges'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where n.nspname = 'public'
      and a.privilege_type = 'EXECUTE'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'PUBLIC, anon, and authenticated cannot execute public functions'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and d.defaclobjtype = 'n'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'postgres default schema privileges do not grant client access'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'postgres default table privileges do not grant client access'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and n.nspname = 'public'
      and d.defaclobjtype = 'S'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'postgres default sequence privileges do not grant client access'
);

select ok(
  not exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = (select oid from pg_roles where rolname = 'postgres')
      and n.nspname = 'public'
      and d.defaclobjtype = 'f'
      and a.privilege_type = 'EXECUTE'
      and (
        a.grantee = 0
        or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated'))
      )
  ),
  'postgres default function privileges do not grant client execution'
);

select ok(
  (
    select p.prosecdef
      and array_to_string(p.proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'promote_resume_version'
      and pg_get_function_identity_arguments(p.oid) = 'new_storage_path text'
  ),
  'promotion function is SECURITY DEFINER with an empty fixed search_path'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.promote_resume_version(text)',
    'EXECUTE'
  ),
  'the server service role receives promotion RPC execution'
);

select ok(
  has_schema_privilege('service_role', 'public', 'USAGE'),
  'service role retains public schema usage'
);

select ok(to_regclass('public.download_logs_created_at_idx') is not null,
  'download retention index exists');
select ok(to_regclass('public.one_current_resume') is not null,
  'single-current-resume index exists');
select ok(to_regclass('public.resume_versions_storage_path_key') is not null,
  'resume storage paths are unique');
select ok(to_regclass('public.dlq_unresolved_idx') is not null,
  'unresolved DLQ index exists');
select ok(to_regclass('public.ai_query_logs_flagged_idx') is not null,
  'flagged-query review index exists');

select ok(
  (
    select i.indisunique
      and i.indpred is not null
      and pg_get_expr(i.indpred, i.indrelid) like '%is_current%'
    from pg_index i
    where i.indexrelid = 'public.one_current_resume'::regclass
  ),
  'single-current-resume invariant is a partial unique index'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.dead_letter_queue'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%operation%'
      and pg_get_constraintdef(c.oid) like '%upsert%'
  ),
  'DLQ operation values are constrained'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name in (
          'contact_submissions', 'download_logs', 'dead_letter_queue', 'ai_query_logs'
        ) and column_name = 'created_at')
        or (table_name = 'resume_versions' and column_name = 'uploaded_at')
        or (table_name = 'dead_letter_queue' and column_name = 'resolved_at')
      )
  ),
  6::bigint,
  'all documented retention and resolution timestamps exist'
);

select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name in (
          'contact_submissions', 'download_logs', 'dead_letter_queue', 'ai_query_logs'
        ) and column_name = 'created_at')
        or (table_name = 'resume_versions' and column_name = 'uploaded_at')
      )
      and is_nullable = 'NO'
      and column_default = 'now()'
  ),
  5::bigint,
  'event timestamps are non-null and default to now()'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'resume' and name = 'resume' and public is false
  ),
  'resume bucket exists and is private'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
  ),
  'RLS is enabled on Supabase Storage objects'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'deny_client_roles_resume'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and roles @> array['anon'::name, 'authenticated'::name]
      and qual like '%bucket_id%resume%'
      and with_check like '%bucket_id%resume%'
  ),
  1::bigint,
  'resume objects have a restrictive client-role deny guard'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.contact_submissions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%char_length(name)%100%'
  )
  and exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.contact_submissions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%char_length(email)%200%'
  )
  and exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.contact_submissions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%char_length(message)%5000%'
  ),
  'contact persistence mirrors shared input length bounds'
);

select * from finish();
rollback;
