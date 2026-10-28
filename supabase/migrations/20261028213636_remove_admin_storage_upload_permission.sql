-- Community images can only be uploaded, replaced, or removed by the
-- community owner. This requires creating the community row before uploading
-- its image; the client may then update avatar_path after the upload.

drop policy if exists "Community owners and admins can upload community images"
  on storage.objects;
drop policy if exists "Community owners can upload community images"
  on storage.objects;
create policy "Community owners can upload community images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and community.owner_id = (select auth.uid())
  )
);

drop policy if exists "Community owners and admins can update community images"
  on storage.objects;
drop policy if exists "Community owners can update community images"
  on storage.objects;
create policy "Community owners can update community images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and community.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and community.owner_id = (select auth.uid())
  )
);

drop policy if exists "Community owners and admins can delete community images"
  on storage.objects;
drop policy if exists "Community owners can delete community images"
  on storage.objects;
create policy "Community owners can delete community images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and community.owner_id = (select auth.uid())
  )
);