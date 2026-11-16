create or replace function public.transfer_community_ownership(
  p_community_id uuid,
  p_new_owner_id uuid
)
returns communities
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.communities;
begin
  perform 1
  from public.communities
  where id = p_community_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Community not found or not permitted';
  end if;

  if p_new_owner_id = auth.uid() then
    raise exception 'New owner must be another community member';
  end if;

  update public.community_members
  set role = 'owner'
  where community_id = p_community_id
    and user_id = p_new_owner_id
    and role in ('admin', 'member')
    and status = 'active';

  if not found then
    raise exception 'New owner must be an active member or admin';
  end if;

  update public.community_members
  set role = 'admin'
  where community_id = p_community_id
    and user_id = auth.uid()
    and role = 'owner'
    and status = 'active';

  if not found then
    raise exception 'Current owner membership not found';
  end if;

  update public.communities
  set owner_id = p_new_owner_id,
      updated_at = now()
  where id = p_community_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.set_community_member_status(
  p_community_id uuid,
  p_user_id uuid,
  p_status text
)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if p_status is null or p_status not in ('pending', 'active', 'declined') then
    raise exception 'Invalid status';
  end if;

  if not public.is_community_admin(p_community_id) then
    raise exception 'Not permitted';
  end if;

  if exists (
    select 1
    from public.community_members
    where community_id = p_community_id
      and user_id = p_user_id
      and status = 'declined'
      and p_status <> 'declined'
  ) and not exists (
    select 1
    from public.communities
    where id = p_community_id
      and owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can undecline a member';
  end if;

  update public.community_members
  set status = p_status
  where community_id = p_community_id
    and user_id = p_user_id
    and role <> 'owner'
  returning * into result;

  if not found then
    raise exception 'Non-owner membership not found';
  end if;

  return result;
end;
$$;

create or replace function public.remove_community_item(
  p_community_id uuid,
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Not permitted';
  end if;

  delete from public.community_items
  where community_id = p_community_id
    and item_id = p_item_id;

  if not found then
    raise exception 'Community item not found';
  end if;
end;
$$;

create or replace function public.invite_community_member(
  p_community_id uuid,
  p_user_id uuid
)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if not public.is_community_member(p_community_id) then
    raise exception 'Only active community members can invite members';
  end if;

  if exists (
    select 1
    from public.community_members
    where community_id = p_community_id
      and user_id = p_user_id
      and status = 'declined'
  ) then
    raise exception 'Declined members cannot be invited';
  end if;

  insert into public.community_members (community_id, user_id, role, status)
  values (p_community_id, p_user_id, 'member', 'pending')
  returning * into result;

  return result;
end;
$$;