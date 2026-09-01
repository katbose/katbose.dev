begin;

-- The registered-zone image gate and future CMS media both depend on one public,
-- immutable origin bucket. Client roles may read through the public object URL,
-- but cannot insert, replace, update or delete objects through Storage RLS.
do $$
begin
  if to_regclass('storage.buckets') is null
     or to_regclass('storage.objects') is null then
    raise exception 'Supabase Storage is required for media bucket setup';
  end if;

  execute $sql$
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true)
    on conflict (id) do update
      set name = excluded.name,
          public = true
  $sql$;

  execute 'drop policy if exists deny_client_roles_media on storage.objects';
  execute $sql$
    create policy deny_client_roles_media
      on storage.objects
      as restrictive for all to anon, authenticated
      using (bucket_id <> 'media')
      with check (bucket_id <> 'media')
  $sql$;
end;
$$;

commit;
