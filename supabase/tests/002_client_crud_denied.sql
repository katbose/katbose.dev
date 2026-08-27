begin;

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(40);

create function pg_temp.crud_is_denied(test_role text, test_statement text)
returns boolean
language plpgsql
as $$
declare
  denied boolean := false;
begin
  perform pg_catalog.set_config('role', test_role, true);

  begin
    execute test_statement;
  exception
    when insufficient_privilege then
      denied := true;
  end;

  perform pg_catalog.set_config('role', 'none', true);
  return denied;
exception
  when others then
    perform pg_catalog.set_config('role', 'none', true);
    raise;
end;
$$;

with test_cases(table_name, select_sql, insert_sql, update_sql, delete_sql) as (
  values
    (
      'contact_submissions',
      'select * from public.contact_submissions limit 1',
      'insert into public.contact_submissions (name, email, message) values (''Test'', ''test@example.com'', ''Test message'')',
      'update public.contact_submissions set name = name where false',
      'delete from public.contact_submissions where false'
    ),
    (
      'download_logs',
      'select * from public.download_logs limit 1',
      'insert into public.download_logs (success) values (true)',
      'update public.download_logs set success = success where false',
      'delete from public.download_logs where false'
    ),
    (
      'resume_versions',
      'select * from public.resume_versions limit 1',
      'insert into public.resume_versions (storage_path) values (''private/test.pdf'')',
      'update public.resume_versions set is_current = is_current where false',
      'delete from public.resume_versions where false'
    ),
    (
      'dead_letter_queue',
      'select * from public.dead_letter_queue limit 1',
      'insert into public.dead_letter_queue (collection, doc_id, slug, operation) values (''posts'', ''1'', ''test'', ''upsert'')',
      'update public.dead_letter_queue set attempts = attempts where false',
      'delete from public.dead_letter_queue where false'
    ),
    (
      'ai_query_logs',
      'select * from public.ai_query_logs limit 1',
      'insert into public.ai_query_logs (query) values (''test query'')',
      'update public.ai_query_logs set flagged = flagged where false',
      'delete from public.ai_query_logs where false'
    )
),
role_cases(test_role) as (
  values ('anon'), ('authenticated')
)
select ok(
  pg_temp.crud_is_denied(role_cases.test_role, operations.statement),
  format(
    '%s %s on public.%s fails with insufficient_privilege',
    role_cases.test_role,
    operations.action_name,
    test_cases.table_name
  )
)
from test_cases
cross join role_cases
cross join lateral (
  values
    ('SELECT', test_cases.select_sql),
    ('INSERT', test_cases.insert_sql),
    ('UPDATE', test_cases.update_sql),
    ('DELETE', test_cases.delete_sql)
) as operations(action_name, statement);

select * from finish();
rollback;
