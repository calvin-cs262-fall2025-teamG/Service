-- Pre-creation uploads use {community_id}/{user_id}/{filename}. Existing
-- communities retain the owner-only upload rule and support legacy paths.
drop policy if exists "Community owners can upload community images"
  on storage.objects;
create policy "Community owners can upload community images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'community-images'
  and (
    exists (
      select 1
      from public.communities as community
      where community.id::text = (storage.foldername(objects.name))[1]
        and community.owner_id = (select auth.uid())
    )
    or (
      cardinality(storage.foldername(name)) >= 2
      and (storage.foldername(name))[2] = (select auth.uid())::text
      and not exists (
        select 1
        from public.communities as community
        where community.id::text = (storage.foldername(objects.name))[1]
      )
    )
  )
);