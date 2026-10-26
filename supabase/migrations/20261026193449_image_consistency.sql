-- Image consistency: clients upload the file first, then pass its path to the
-- RPCs below. The RPCs verify the path before saving it so a row can only
-- reference an existing file that the caller uploaded to the expected folder.
-- Replaced or deleted files are queued for cleanup by the triggers in the
-- storage policies migration.
--
-- Path conventions:
--   profile-pictures/{user_id}/...
--   item-images/{owner_id}/{item_id}/...
--   community-images/{community_id}/...

-- Runs as the function owner because the item and community Storage SELECT
-- policies require the row to exist, which is not yet true during create.
-- A null or empty path is allowed so an image can be cleared.
create or replace function public.assert_valid_image_path(
  p_bucket text,
  p_path text,
  p_prefix text
)
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_path is null or p_path = '' then
    return;
  end if;

  if left(p_path, length(p_prefix)) <> p_prefix
     or length(p_path) = length(p_prefix)
     or p_path like '%..%' then
    raise exception 'Invalid image path';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = p_bucket
      and o.name = p_path
      and o.owner_id = auth.uid()::text
  ) then
    raise exception 'Image not found or not uploaded by this user';
  end if;
end;
$$;

revoke all on function public.assert_valid_image_path(text, text, text)
  from public, anon;
grant execute on function public.assert_valid_image_path(text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create or replace function public.update_my_profile(p_data jsonb)
returns profiles
language plpgsql
set search_path = public
as $$
declare
  result public.profiles;
begin
  if p_data ? 'avatar_path' then
    perform public.assert_valid_image_path(
      'profile-pictures',
      p_data ->> 'avatar_path',
      auth.uid()::text || '/'
    );
  end if;

  update public.profiles
  set display_name = case when p_data ? 'display_name' then p_data ->> 'display_name' else display_name end,
      avatar_path = case when p_data ? 'avatar_path' then p_data ->> 'avatar_path' else avatar_path end,
      updated_at = now()
  where id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'Profile not found';
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- communities
-- ---------------------------------------------------------------------------

-- Accepts an optional client-generated id so the avatar can be uploaded to
-- community-images/{id}/ before the community exists.
-- The handle_new_community trigger adds the owner membership row.
create or replace function public.create_community(p_data jsonb)
returns communities
language plpgsql
set search_path = public
as $$
declare
  result public.communities;
  new_id uuid := coalesce((p_data ->> 'id')::uuid, gen_random_uuid());
begin
  perform public.assert_valid_image_path(
    'community-images',
    p_data ->> 'avatar_path',
    new_id::text || '/'
  );

  insert into public.communities (id, name, owner_id, description, avatar_path)
  values (
    new_id,
    p_data ->> 'name',
    auth.uid(),
    p_data ->> 'description',
    p_data ->> 'avatar_path'
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.update_community(p_community_id uuid, p_data jsonb)
returns communities
language plpgsql
set search_path = public
as $$
declare
  result public.communities;
begin
  if p_data ? 'avatar_path' then
    perform public.assert_valid_image_path(
      'community-images',
      p_data ->> 'avatar_path',
      p_community_id::text || '/'
    );
  end if;

  update public.communities
  set name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      avatar_path = case when p_data ? 'avatar_path' then p_data ->> 'avatar_path' else avatar_path end,
      updated_at = now()
  where id = p_community_id
    and owner_id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'Community not found or not permitted';
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

-- Accepts an optional client-generated id so the image can be uploaded to
-- item-images/{owner_id}/{id}/ before the item exists.
create or replace function public.create_item(p_data jsonb)
returns items
language plpgsql
set search_path = public
as $$
declare
  result public.items;
  target_community uuid := (p_data ->> 'community_id')::uuid;
  new_id uuid := coalesce((p_data ->> 'id')::uuid, gen_random_uuid());
begin
  if not public.is_community_member(target_community) then
    raise exception 'Not a member of this community';
  end if;

  perform public.assert_valid_image_path(
    'item-images',
    p_data ->> 'image_path',
    auth.uid()::text || '/' || new_id::text || '/'
  );

  insert into public.items (id, owner_id, community_id, name, description, category, image_path, return_date)
  values (
    new_id,
    auth.uid(),
    target_community,
    p_data ->> 'name',
    p_data ->> 'description',
    p_data ->> 'category',
    p_data ->> 'image_path',
    (p_data ->> 'return_date')::date
  )
  returning * into result;

  return result;
end;
$$;

-- Status is managed by the borrowing workflow and cannot be set here.
create or replace function public.update_item(p_item_id uuid, p_data jsonb)
returns items
language plpgsql
set search_path = public
as $$
declare
  result public.items;
  new_community uuid;
begin
  if p_data ? 'community_id' then
    new_community := (p_data ->> 'community_id')::uuid;
    if not public.is_community_member(new_community) then
      raise exception 'Not a member of this community';
    end if;
  end if;

  if p_data ? 'image_path' then
    perform public.assert_valid_image_path(
      'item-images',
      p_data ->> 'image_path',
      auth.uid()::text || '/' || p_item_id::text || '/'
    );
  end if;

  update public.items
  set name = case when p_data ? 'name' then p_data ->> 'name' else name end,
      description = case when p_data ? 'description' then p_data ->> 'description' else description end,
      category = case when p_data ? 'category' then p_data ->> 'category' else category end,
      image_path = case when p_data ? 'image_path' then p_data ->> 'image_path' else image_path end,
      return_date = case when p_data ? 'return_date' then (p_data ->> 'return_date')::date else return_date end,
      community_id = coalesce(new_community, community_id),
      updated_at = now()
  where id = p_item_id
    and owner_id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'Item not found or not permitted';
  end if;

  return result;
end;
$$;
