-- quick fix cuz im an idiot
alter table communities
  rename column avitar_path to avatar_path;

-- Database functions called by the client through supabase.rpc().
-- Read/simple-write functions run as the caller (security invoker) so RLS
-- still applies. Multi-table workflows and privileged transitions use
-- security definer and perform their own auth.uid() checks.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create or replace function public.get_profile(p_id uuid)
returns profiles
language sql
stable
set search_path = public
as $$
  select * from public.profiles where id = p_id;
$$;

create or replace function public.get_my_profile()
returns profiles
language sql
stable
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.update_my_profile(p_data jsonb)
returns profiles
language plpgsql
set search_path = public
as $$
declare
  result public.profiles;
begin
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

create or replace function public.get_communities()
returns setof communities
language sql
stable
set search_path = public
as $$
  select * from public.communities order by name;
$$;

create or replace function public.get_my_communities()
returns setof communities
language sql
stable
set search_path = public
as $$
  select c.*
  from public.communities c
  join public.community_members m on m.community_id = c.id
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by c.name;
$$;

create or replace function public.get_community(p_community_id uuid)
returns communities
language sql
stable
set search_path = public
as $$
  select * from public.communities where id = p_community_id;
$$;

-- The handle_new_community trigger adds the owner membership row.
create or replace function public.create_community(p_data jsonb)
returns communities
language plpgsql
set search_path = public
as $$
declare
  result public.communities;
begin
  insert into public.communities (name, owner_id, description, avatar_path)
  values (
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

create or replace function public.delete_community(p_community_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.communities
  where id = p_community_id
    and owner_id = auth.uid();

  if not found then
    raise exception 'Community not found or not permitted';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- community_members
-- ---------------------------------------------------------------------------

create or replace function public.get_community_members(p_community_id uuid)
returns setof community_members
language sql
stable
set search_path = public
as $$
  select *
  from public.community_members
  where community_id = p_community_id
    and status = 'active'
  order by created_at;
$$;

create or replace function public.get_pending_community_members(p_community_id uuid)
returns setof community_members
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.community_members m
  where m.community_id = p_community_id
    and m.status = 'pending'
    and public.is_community_admin(p_community_id)
  order by m.created_at;
$$;

-- Re-requesting after a decline resets the membership to pending.
create or replace function public.request_join_community(p_community_id uuid)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.community_members (community_id, user_id, role, status)
  values (p_community_id, auth.uid(), 'member', 'pending')
  on conflict (community_id, user_id) do update
    set status = 'pending'
    where public.community_members.status = 'declined'
  returning * into result;

  if result.community_id is null then
    select * into result
    from public.community_members
    where community_id = p_community_id and user_id = auth.uid();
  end if;

  return result;
end;
$$;

create or replace function public.approve_community_member(p_community_id uuid, p_user_id uuid)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Not permitted';
  end if;

  update public.community_members
  set status = 'active'
  where community_id = p_community_id
    and user_id = p_user_id
    and status = 'pending'
  returning * into result;

  if not found then
    raise exception 'Pending membership not found';
  end if;

  return result;
end;
$$;

create or replace function public.decline_community_member(p_community_id uuid, p_user_id uuid)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Not permitted';
  end if;

  update public.community_members
  set status = 'declined'
  where community_id = p_community_id
    and user_id = p_user_id
    and status = 'pending'
  returning * into result;

  if not found then
    raise exception 'Pending membership not found';
  end if;

  return result;
end;
$$;

-- Only the community owner can promote or demote between admin and member.
create or replace function public.set_community_member_role(
  p_community_id uuid,
  p_user_id uuid,
  p_role text
)
returns community_members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.community_members;
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  if not exists (
    select 1 from public.communities
    where id = p_community_id and owner_id = auth.uid()
  ) then
    raise exception 'Not permitted';
  end if;

  update public.community_members
  set role = p_role
  where community_id = p_community_id
    and user_id = p_user_id
    and role <> 'owner'
    and status = 'active'
  returning * into result;

  if not found then
    raise exception 'Active non-owner membership not found';
  end if;

  return result;
end;
$$;

create or replace function public.remove_community_member(p_community_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_community_admin(p_community_id) then
    raise exception 'Not permitted';
  end if;

  delete from public.community_members
  where community_id = p_community_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then
    raise exception 'Removable membership not found';
  end if;
end;
$$;

create or replace function public.leave_community(p_community_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.community_members
  where community_id = p_community_id
    and user_id = auth.uid()
    and role <> 'owner';

  if not found then
    raise exception 'Membership not found, or owners cannot leave';
  end if;
end;
$$;

create or replace function public.mark_community_read(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_members
  set last_read_at = now()
  where community_id = p_community_id
    and user_id = auth.uid()
    and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- community_messages
-- ---------------------------------------------------------------------------

create or replace function public.get_community_messages(
  p_community_id uuid,
  p_limit integer default null,
  p_before timestamptz default null
)
returns setof community_messages
language sql
stable
set search_path = public
as $$
  select *
  from public.community_messages
  where community_id = p_community_id
    and (p_before is null or created_at < p_before)
  order by created_at desc
  limit p_limit;
$$;

create or replace function public.create_community_message(
  p_community_id uuid,
  p_content text,
  p_item_id uuid default null
)
returns community_messages
language plpgsql
set search_path = public
as $$
declare
  result public.community_messages;
begin
  insert into public.community_messages (sender_id, community_id, item_id, content)
  values (auth.uid(), p_community_id, p_item_id, p_content)
  returning * into result;

  return result;
end;
$$;

-- Senders can delete their own messages; community admins can delete any.
create or replace function public.delete_community_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.community_messages
  where id = p_message_id
    and (sender_id = auth.uid() or public.is_community_admin(community_id));

  if not found then
    raise exception 'Message not found or not permitted';
  end if;
end;
$$;

create or replace function public.get_community_unread_count(p_community_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.community_messages msg
  join public.community_members m
    on m.community_id = msg.community_id
   and m.user_id = auth.uid()
   and m.status = 'active'
  where msg.community_id = p_community_id
    and msg.sender_id <> auth.uid()
    and (m.last_read_at is null or msg.created_at > m.last_read_at);
$$;

-- ---------------------------------------------------------------------------
-- direct_messages
-- ---------------------------------------------------------------------------

create or replace function public.get_my_direct_messages()
returns setof direct_messages
language sql
stable
set search_path = public
as $$
  select *
  from public.direct_messages
  where sender_id = auth.uid() or receiver_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.get_direct_conversation(p_other_user_id uuid)
returns setof direct_messages
language sql
stable
set search_path = public
as $$
  select *
  from public.direct_messages
  where (sender_id = auth.uid() and receiver_id = p_other_user_id)
     or (sender_id = p_other_user_id and receiver_id = auth.uid())
  order by created_at;
$$;

-- Latest message of each conversation, newest first.
create or replace function public.get_my_conversations()
returns setof direct_messages
language sql
stable
set search_path = public
as $$
  select latest.*
  from (
    select distinct on (
      least(sender_id, receiver_id),
      greatest(sender_id, receiver_id)
    ) *
    from public.direct_messages
    where sender_id = auth.uid() or receiver_id = auth.uid()
    order by
      least(sender_id, receiver_id),
      greatest(sender_id, receiver_id),
      created_at desc
  ) latest
  order by latest.created_at desc;
$$;

create or replace function public.create_direct_message(
  p_receiver_id uuid,
  p_content text,
  p_item_id uuid default null
)
returns direct_messages
language plpgsql
set search_path = public
as $$
declare
  result public.direct_messages;
begin
  insert into public.direct_messages (sender_id, receiver_id, item_id, content)
  values (auth.uid(), p_receiver_id, p_item_id, p_content)
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

create or replace function public.get_items()
returns setof items
language sql
stable
set search_path = public
as $$
  select * from public.items order by created_at desc;
$$;

create or replace function public.get_community_items(p_community_id uuid)
returns setof items
language sql
stable
set search_path = public
as $$
  select * from public.items
  where community_id = p_community_id
  order by created_at desc;
$$;

create or replace function public.get_my_items()
returns setof items
language sql
stable
set search_path = public
as $$
  select * from public.items
  where owner_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.get_item(p_item_id uuid)
returns items
language sql
stable
set search_path = public
as $$
  select * from public.items where id = p_item_id;
$$;

create or replace function public.create_item(p_data jsonb)
returns items
language plpgsql
set search_path = public
as $$
declare
  result public.items;
  target_community uuid := (p_data ->> 'community_id')::uuid;
begin
  if not public.is_community_member(target_community) then
    raise exception 'Not a member of this community';
  end if;

  insert into public.items (owner_id, community_id, name, description, category, image_path, return_date)
  values (
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

create or replace function public.delete_item(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.items
  where id = p_item_id
    and owner_id = auth.uid();

  if not found then
    raise exception 'Item not found or not permitted';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrowing_requests
-- ---------------------------------------------------------------------------

create or replace function public.get_borrowing_request(p_request_id uuid)
returns borrowing_requests
language sql
stable
set search_path = public
as $$
  select * from public.borrowing_requests where id = p_request_id;
$$;

create or replace function public.get_my_borrowing_requests()
returns setof borrowing_requests
language sql
stable
set search_path = public
as $$
  select * from public.borrowing_requests
  where requester_id = auth.uid()
  order by requested_at desc;
$$;

create or replace function public.get_incoming_borrowing_requests()
returns setof borrowing_requests
language sql
stable
set search_path = public
as $$
  select r.*
  from public.borrowing_requests r
  join public.items i on i.id = r.item_id
  where i.owner_id = auth.uid()
  order by r.requested_at desc;
$$;

create or replace function public.get_item_borrowing_requests(p_item_id uuid)
returns setof borrowing_requests
language sql
stable
set search_path = public
as $$
  select * from public.borrowing_requests
  where item_id = p_item_id
  order by requested_at desc;
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
     or not public.is_community_member(target.community_id) then
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

-- Approving marks the item borrowed, opens a history row and declines the
-- item's other pending requests.
create or replace function public.approve_borrowing_request(p_request_id uuid)
returns borrowing_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.borrowing_requests;
begin
  update public.borrowing_requests r
  set status = 'approved', decided_at = now()
  from public.items i
  where r.id = p_request_id
    and i.id = r.item_id
    and i.owner_id = auth.uid()
    and i.status <> 'borrowed'
    and r.status = 'pending'
  returning r.* into result;

  if not found then
    raise exception 'Pending request not found or not permitted';
  end if;

  update public.items
  set status = 'borrowed', updated_at = now()
  where id = result.item_id;

  insert into public.borrowing_history (request_id) values (result.id);

  update public.borrowing_requests
  set status = 'declined', decided_at = now()
  where item_id = result.item_id
    and id <> result.id
    and status = 'pending';

  return result;
end;
$$;

create or replace function public.decline_borrowing_request(p_request_id uuid)
returns borrowing_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.borrowing_requests;
begin
  update public.borrowing_requests r
  set status = 'declined', decided_at = now()
  from public.items i
  where r.id = p_request_id
    and i.id = r.item_id
    and i.owner_id = auth.uid()
    and r.status = 'pending'
  returning r.* into result;

  if not found then
    raise exception 'Pending request not found or not permitted';
  end if;

  return result;
end;
$$;

create or replace function public.cancel_borrowing_request(p_request_id uuid)
returns borrowing_requests
language plpgsql
set search_path = public
as $$
declare
  result public.borrowing_requests;
begin
  update public.borrowing_requests
  set status = 'cancelled', decided_at = now()
  where id = p_request_id
    and requester_id = auth.uid()
    and status = 'pending'
  returning * into result;

  if not found then
    raise exception 'Pending request not found or not permitted';
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- borrowing_history
-- ---------------------------------------------------------------------------

create or replace function public.get_my_borrowing_history()
returns setof borrowing_history
language sql
stable
set search_path = public
as $$
  select * from public.borrowing_history
  order by borrowed_at desc;
$$;

create or replace function public.get_item_borrowing_history(p_item_id uuid)
returns setof borrowing_history
language sql
stable
set search_path = public
as $$
  select h.*
  from public.borrowing_history h
  join public.borrowing_requests r on r.id = h.request_id
  where r.item_id = p_item_id
  order by h.borrowed_at desc;
$$;

create or replace function public.get_borrowing_history_by_request(p_request_id uuid)
returns borrowing_history
language sql
stable
set search_path = public
as $$
  select * from public.borrowing_history where request_id = p_request_id;
$$;

-- Only the item owner can confirm the return; the item becomes available again.
create or replace function public.mark_item_returned(p_request_id uuid)
returns borrowing_history
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.borrowing_history;
  borrowed_item uuid;
begin
  select r.item_id into borrowed_item
  from public.borrowing_requests r
  join public.items i on i.id = r.item_id
  where r.id = p_request_id
    and i.owner_id = auth.uid();

  if not found then
    raise exception 'Request not found or not permitted';
  end if;

  update public.borrowing_history
  set returned_at = now()
  where request_id = p_request_id
    and returned_at is null
  returning * into result;

  if not found then
    raise exception 'No open borrowing found for this request';
  end if;

  update public.items
  set status = 'available', return_date = null, updated_at = now()
  where id = borrowed_item;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- execute privileges
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not in ('handle_new_user', 'handle_new_community')
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
  end loop;
end;
$$;
