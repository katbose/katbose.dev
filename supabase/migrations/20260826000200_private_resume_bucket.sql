begin;

-- Supabase Storage must exist when this migration is applied. Failing loudly prevents a
-- successful release from silently omitting the private resume boundary.
do $$
begin
  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage is required for resume bucket setup';
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('resume', 'resume', false)
    on conflict (id) do update
      set name = excluded.name,
          public = false
  $sql$;

  execute 'drop policy if exists deny_client_roles_resume on storage.objects';
  execute $sql$
    create policy deny_client_roles_resume
      on storage.objects
      as restrictive for all to anon, authenticated
      using (bucket_id <> 'resume')
      with check (bucket_id <> 'resume')
  $sql$;
end;
$$;

commit;
