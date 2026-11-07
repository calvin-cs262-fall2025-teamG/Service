-- Items can be shared with many communities, and a community has many items.
-- Replaces items.community_id with the community_items join table.

create table community_items (
  item_id uuid not null references items(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, community_id)
);

create index idx_community_items_community_id on community_items (community_id);

alter table community_items enable row level security;

insert into community_items (item_id, community_id)
select id, community_id from items
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- helpers (security definer to avoid RLS recursion between items and
-- community_items)
-- ---------------------------------------------------------------------------

create or replace function public.is_item_owner(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.items
    where id = target_item_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.is_item_visible_to_member(target_item_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.community_items ci
    join public.community_members m
      on m.community_id = ci.community_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    where ci.item_id = target_item_id
  );
$$;

-- ---------------------------------------------------------------------------
-- policies
-- ---------------------------------------------------------------------------

revoke all on table community_items from anon, authenticated;
grant select, insert, delete on table community_items to authenticated;

create policy "Members can view community items."
on community_items for select
to authenticated
using (
  public.is_community_member(community_id)
  or public.is_item_owner(item_id)
);

-- Owners can list their items only in communities they actively belong to.
create policy "Owners can add their items to communities they belong to."
on community_items for insert
to authenticated
with check (
  public.is_item_owner(item_id)
  and public.is_community_member(community_id)
);

create policy "Owners can remove their items from communities."
on community_items for delete
to authenticated
using (public.is_item_owner(item_id));

-- The items and storage select policies depend on items.community_id, so they
-- are recreated around dropping the column.
drop policy "Members can view items in their communities." on items;

drop policy if exists "Members can view visible item images" on storage.objects;

alter table items drop column community_id;

create policy "Members can view items in their communities."
on items for select
to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_item_visible_to_member(id)
);

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
        or public.is_item_visible_to_member(item.id)
      )
  )
);

-- ---------------------------------------------------------------------------
-- Leaving, removal or deactivation of a membership unlists that member's
-- items from the community.
-- ---------------------------------------------------------------------------

create or replace function public.remove_member_items_from_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.community_items ci
  using public.items i
  where ci.item_id = i.id
    and ci.community_id = old.community_id
    and i.owner_id = old.user_id;

  return null;
end;
$$;

create trigger community_member_deleted_remove_items
after delete on public.community_members
for each row
execute function public.remove_member_items_from_community();

create trigger community_member_deactivated_remove_items
after update of status on public.community_members
for each row
when (old.status = 'active' and new.status <> 'active')
execute function public.remove_member_items_from_community();

-- ---------------------------------------------------------------------------
-- functions
-- ---------------------------------------------------------------------------

create or replace function public.get_community_items(p_community_id uuid)
returns setof items
language sql
stable
set search_path = public
as $$
  select i.*
  from public.items i
  join public.community_items ci on ci.item_id = i.id
  where ci.community_id = p_community_id
  order by i.created_at desc;
$$;

-- Returns the ids of the communities an item is listed in.
create or replace function public.get_item_community_ids(p_item_id uuid)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select community_id from public.community_items where item_id = p_item_id;
$$;

-- Accepts an optional client-generated id so the image can be uploaded to
-- item-images/{owner_id}/{id}/ before the item exists. community_ids is an
-- array of communities the item should be visible in.
create or replace function public.create_item(p_data jsonb)
returns items
language plpgsql
set search_path = public
as $$
declare
  result public.items;
  target_communities uuid[] := array(
    select jsonb_array_elements_text(coalesce(p_data -> 'community_ids', '[]'::jsonb))::uuid
  );
  target_community uuid;
  new_id uuid := coalesce((p_data ->> 'id')::uuid, gen_random_uuid());
begin
  foreach target_community in array target_communities loop
    if not public.is_community_member(target_community) then
      raise exception 'Not a member of this community';
    end if;
  end loop;

  perform public.assert_valid_image_path(
    'item-images',
    p_data ->> 'image_path',
    auth.uid()::text || '/' || new_id::text || '/'
  );

  insert into public.items (id, owner_id, name, description, category, image_path, return_date)
  values (
    new_id,
    auth.uid(),
    p_data ->> 'name',
    p_data ->> 'description',
    p_data ->> 'category',
    p_data ->> 'image_path',
    (p_data ->> 'return_date')::date
  )
  returning * into result;

  insert into public.community_items (item_id, community_id)
  select new_id, c from unnest(target_communities) as c
  on conflict do nothing;

  return result;
end;
$$;

-- Status is managed by the borrowing workflow and cannot be set here. When
-- community_ids is provided it replaces the item's set of communities.
create or replace function public.update_item(p_item_id uuid, p_data jsonb)
returns items
language plpgsql
set search_path = public
as $$
declare
  result public.items;
  new_communities uuid[];
  target_community uuid;
begin
  if p_data ? 'community_ids' then
    new_communities := array(
      select jsonb_array_elements_text(p_data -> 'community_ids')::uuid
    );
    foreach target_community in array new_communities loop
      if not public.is_community_member(target_community) then
        raise exception 'Not a member of this community';
      end if;
    end loop;
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
      updated_at = now()
  where id = p_item_id
    and owner_id = auth.uid()
  returning * into result;

  if not found then
    raise exception 'Item not found or not permitted';
  end if;

  if new_communities is not null then
    delete from public.community_items
    where item_id = p_item_id
      and community_id <> all (new_communities);

    insert into public.community_items (item_id, community_id)
    select p_item_id, c from unnest(new_communities) as c
    on conflict do nothing;
  end if;

  return result;
end;
$$;

create or replace function public.create_borrowing_request(p_item_id uuid)
returns borrowing_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.items;
  result public.borrowing_requests;
begin
  select * into target from public.items where id = p_item_id;

  if not found
     or not public.is_item_visible_to_member(p_item_id) then
    raise exception 'Item not found';
  end if;

  if target.owner_id = auth.uid() then
    raise exception 'You cannot borrow your own item';
  end if;

  if target.status = 'borrowed' then
    raise exception 'Item is not available';
  end if;

  insert into public.borrowing_requests (item_id, requester_id)
  values (p_item_id, auth.uid())
  returning * into result;

  return result;
end;
$$;
