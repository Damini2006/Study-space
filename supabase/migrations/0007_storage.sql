-- ============================================================
-- 0007: storage buckets + object policies
-- Private buckets; objects are stored under {user_id}/... folders
-- and only the owner can read/write them. Signed URLs are used for
-- any temporary access — no public bucket.
-- ============================================================

-- `sources` holds uploaded PDFs/DOCX/TXT/MD; `vision` holds vision-board
-- images (optional feature). Inserts into storage.buckets are guarded so
-- this migration also applies to test databases without the storage schema.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('sources', 'sources', false), ('vision', 'vision', false)
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    -- owner read
    drop policy if exists "sources owner select" on storage.objects;
    create policy "sources owner select" on storage.objects
      for select to authenticated
      using (
        bucket_id in ('sources','vision')
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    -- owner insert (folder must start with own uid)
    drop policy if exists "sources owner insert" on storage.objects;
    create policy "sources owner insert" on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('sources','vision')
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    -- owner update (upsert) + delete
    drop policy if exists "sources owner update" on storage.objects;
    create policy "sources owner update" on storage.objects
      for update to authenticated
      using (
        bucket_id in ('sources','vision')
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id in ('sources','vision')
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists "sources owner delete" on storage.objects;
    create policy "sources owner delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('sources','vision')
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
