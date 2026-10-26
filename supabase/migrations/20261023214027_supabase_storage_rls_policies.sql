-- Buckets are created in the Supabase Dashboard. Keep object authorization
-- here so these policies can be versioned with the database migrations.
-- Keep the buckets private; public bucket downloads bypass SELECT policies.
--
-- Object path conventions:
--   profile-pictures/{user_id}/{filename}
--   item-images/{owner_id}/{item_id}/{filename}
--   community-images/{community_id}/{filename}

drop policy if exists "Authenticated members can view profile pictures"
  on storage.objects;
create policy "Authenticated members can view profile pictures"
on storage.objects for select
to authenticated
using (bucket_id = 'profile-pictures');

drop policy if exists "Users can upload profile pictures to their own folder"
  on storage.objects;
create policy "Users can upload profile pictures to their own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update profile pictures in their own folder"
  on storage.objects;
create policy "Users can update profile pictures in their own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete profile pictures in their own folder"
  on storage.objects;
create policy "Users can delete profile pictures in their own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-pictures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Members can view visible item images"
  on storage.objects;
create policy "Members can view visible item images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'item-images'
  and cardinality(storage.foldername(name)) >= 2
  and exists (
    select 1
    from public.items as item
    where item.owner_id::text = (storage.foldername(objects.name))[1]
      and item.id::text = (storage.foldername(objects.name))[2]
      and (
        item.owner_id = (select auth.uid())
        or (
          item.community_id is not null
          and public.is_community_member(item.community_id)
        )
      )
  )
);

drop policy if exists "Users can upload images for their own items"
  on storage.objects;
create policy "Users can upload images for their own items"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update images for their own items"
  on storage.objects;
create policy "Users can update images for their own items"
on storage.objects for update
to authenticated
using (
  bucket_id = 'item-images'
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'item-images'
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete images for their own items"
  on storage.objects;
create policy "Users can delete images for their own items"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'item-images'
  and cardinality(storage.foldername(name)) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Authenticated members can view community images"
  on storage.objects;
create policy "Authenticated members can view community images"
on storage.objects for select
to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
  )
);

-- Clients generate the community id and upload before the row exists, so a
-- folder is also writable while no community uses its id. Once the community
-- exists, only its owner/admins can add files. create_community must verify
-- the caller owns the uploaded object (storage.objects.owner_id).
drop policy if exists "Community owners and admins can upload community images"
  on storage.objects;
create policy "Community owners and admins can upload community images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'community-images'
  and cardinality(storage.foldername(name)) >= 1
  and (
    not exists (
      select 1
      from public.communities as community
      where community.id::text = (storage.foldername(objects.name))[1]
    )
    or exists (
      select 1
      from public.communities as community
      where community.id::text = (storage.foldername(objects.name))[1]
        and (
          community.owner_id = (select auth.uid())
          or public.is_community_admin(community.id)
        )
    )
  )
);

drop policy if exists "Community owners and admins can update community images"
  on storage.objects;
create policy "Community owners and admins can update community images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and (
        community.owner_id = (select auth.uid())
        or public.is_community_admin(community.id)
      )
  )
)
with check (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and (
        community.owner_id = (select auth.uid())
        or public.is_community_admin(community.id)
      )
  )
);

drop policy if exists "Community owners and admins can delete community images"
  on storage.objects;
create policy "Community owners and admins can delete community images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'community-images'
  and exists (
    select 1
    from public.communities as community
    where community.id::text = (storage.foldername(objects.name))[1]
      and (
        community.owner_id = (select auth.uid())
        or public.is_community_admin(community.id)
      )
  )
);

-- ---------------------------------------------------------------------------
-- Storage cleanup queue
-- ---------------------------------------------------------------------------
-- Deleting a storage.objects row does not delete the underlying file, so files
-- must be removed through the Storage API. Triggers record replaced or
-- orphaned paths here in the same transaction as the row change, and a trusted
-- worker (service role) deletes the files and marks the entries processed.

create table if not exists public.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  reason text not null,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_storage_cleanup_queue_pending
  on public.storage_cleanup_queue (created_at)
  where processed_at is null;

alter table public.storage_cleanup_queue enable row level security;

revoke all on table public.storage_cleanup_queue from anon, authenticated;
grant select, update, delete on table public.storage_cleanup_queue to service_role;

-- Trigger arguments: bucket name and the image column on the triggering table.
create or replace function public.enqueue_replaced_storage_object()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_bucket text := tg_argv[0];
  image_column text := tg_argv[1];
  old_path text := to_jsonb(old) ->> image_column;
  new_path text;
begin
  if tg_op = 'UPDATE' then
    new_path := to_jsonb(new) ->> image_column;
    if old_path is not distinct from new_path then
      return new;
    end if;
  end if;

  if old_path is not null and old_path <> '' then
    insert into public.storage_cleanup_queue (bucket, path, reason)
    values (
      target_bucket,
      old_path,
      case when tg_op = 'DELETE' then 'row_deleted' else 'image_replaced' end
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enqueue_replaced_storage_object()
  from public, anon, authenticated;

drop trigger if exists enqueue_profile_avatar_cleanup on public.profiles;
create trigger enqueue_profile_avatar_cleanup
after update of avatar_path or delete on public.profiles
for each row
execute function public.enqueue_replaced_storage_object('profile-pictures', 'avatar_path');

drop trigger if exists enqueue_item_image_cleanup on public.items;
create trigger enqueue_item_image_cleanup
after update of image_path or delete on public.items
for each row
execute function public.enqueue_replaced_storage_object('item-images', 'image_path');

drop trigger if exists enqueue_community_avatar_cleanup on public.communities;
create trigger enqueue_community_avatar_cleanup
after update of avatar_path or delete on public.communities
for each row
execute function public.enqueue_replaced_storage_object('community-images', 'avatar_path');

-- Queues files that were uploaded but never referenced by a row (for example
-- when the app closed between the upload and the database call). The grace
-- period avoids queueing files whose rows are about to be written.
create or replace function public.enqueue_unreferenced_storage_objects(
  grace_period interval default interval '24 hours'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued integer;
begin
  insert into public.storage_cleanup_queue (bucket, path, reason)
  select o.bucket_id, o.name, 'unreferenced'
  from storage.objects as o
  where o.bucket_id in ('profile-pictures', 'item-images', 'community-images')
    and o.name not like '%.emptyFolderPlaceholder'
    and o.created_at < now() - grace_period
    and not exists (
      select 1 from public.profiles p
      where o.bucket_id = 'profile-pictures' and p.avatar_path = o.name
    )
    and not exists (
      select 1 from public.items i
      where o.bucket_id = 'item-images' and i.image_path = o.name
    )
    and not exists (
      select 1 from public.communities c
      where o.bucket_id = 'community-images' and c.avatar_path = o.name
    )
    and not exists (
      select 1 from public.storage_cleanup_queue q
      where q.bucket = o.bucket_id
        and q.path = o.name
        and q.processed_at is null
    );

  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function public.enqueue_unreferenced_storage_objects(interval)
  from public, anon, authenticated;
grant execute on function public.enqueue_unreferenced_storage_objects(interval)
  to service_role;
