-- RLS policies for the uniform member experience.
-- All identity checks use auth.uid(); clients cannot act as other users,
-- and role/status changes stay server-controlled.

-- Security definer helpers avoid infinite recursion when policies need to
-- read community_members. They run as the function owner, which owns the
-- tables and therefore bypasses RLS here. They must be defined before any
-- policy that references them.

create or replace function public.is_community_member(target_community_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = target_community_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_community_admin(target_community_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_members
    where community_id = target_community_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

revoke all on table profiles from anon, authenticated;
grant select, insert, update on table profiles to authenticated;

-- Confirmed members can browse the public profile data used by the app.
create policy "Members can view profiles."
on profiles for select
to authenticated
using (true);

-- Profile rows are normally created by the handle_new_user trigger; this
-- policy only permits a user to create their own row.
create policy "Users can create only their own profile."
on profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update only their own profile."
on profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

revoke all on table items from anon, authenticated;
grant select, insert, update, delete on table items to authenticated;

-- Items are visible to their owner and to active members of the item's
-- community.
create policy "Members can view items in their communities."
on items for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (
    community_id is not null
    and public.is_community_member(community_id)
  )
);

create policy "Users can create items only as themselves."
on items for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update only their own items."
on items for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete only their own items."
on items for delete
to authenticated
using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- borrowing_requests
-- ---------------------------------------------------------------------------

revoke all on table borrowing_requests from anon, authenticated;
grant select, insert, update on table borrowing_requests to authenticated;

create policy "Requesters and item owners can view a borrowing request."
on borrowing_requests for select
to authenticated
using (
  (select auth.uid()) = requester_id
  or exists (
    select 1 from items
    where items.id = borrowing_requests.item_id
      and items.owner_id = (select auth.uid())
  )
);

create policy "Users can create borrowing requests only as themselves."
on borrowing_requests for insert
to authenticated
with check ((select auth.uid()) = requester_id);

-- Only the item owner can approve or decline a request.
create policy "Item owners can approve or decline requests."
on borrowing_requests for update
to authenticated
using (
  exists (
    select 1 from items
    where items.id = borrowing_requests.item_id
      and items.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from items
    where items.id = borrowing_requests.item_id
      and items.owner_id = (select auth.uid())
  )
);

-- A requester may only cancel their own request; they cannot change status
-- to approved/declined.
create policy "Requesters can cancel their own requests."
on borrowing_requests for update
to authenticated
using ((select auth.uid()) = requester_id)
with check (
  (select auth.uid()) = requester_id
  and status = 'cancelled'
);

-- ---------------------------------------------------------------------------
-- borrowing_history
-- ---------------------------------------------------------------------------

revoke all on table borrowing_history from anon, authenticated;
grant select on table borrowing_history to authenticated;

-- History rows are created by trusted database workflows, not by clients.
create policy "Requesters and item owners can view borrowing history."
on borrowing_history for select
to authenticated
using (
  exists (
    select 1
    from borrowing_requests
    join items on items.id = borrowing_requests.item_id
    where borrowing_requests.id = borrowing_history.request_id
      and (
        borrowing_requests.requester_id = (select auth.uid())
        or items.owner_id = (select auth.uid())
      )
  )
);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

revoke all on table messages from anon, authenticated;
grant select, insert on table messages to authenticated;

create policy "Conversation participants can view their messages."
on messages for select
to authenticated
using (
  (select auth.uid()) = sender_id
  or (select auth.uid()) = receiver_id
);

create policy "Users can send messages only as themselves."
on messages for insert
to authenticated
with check ((select auth.uid()) = sender_id);

-- ---------------------------------------------------------------------------
-- communities
-- ---------------------------------------------------------------------------

revoke all on table communities from anon, authenticated;
grant select, insert, update, delete on table communities to authenticated;

create policy "Members can view communities."
on communities for select
to authenticated
using (true);

create policy "Users can create communities only as themselves."
on communities for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Community owners can update their communities."
on communities for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Community owners can delete their communities."
on communities for delete
to authenticated
using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- community_members
-- ---------------------------------------------------------------------------

revoke all on table community_members from anon, authenticated;
grant select, insert, update, delete on table community_members to authenticated;

create policy "Members can view memberships in their communities."
on community_members for select
to authenticated
using (
  (select auth.uid()) = user_id
  or public.is_community_member(community_id)
  or exists (
    select 1 from communities
    where communities.id = community_members.community_id
      and communities.owner_id = (select auth.uid())
  )
);

-- New memberships are self-service join requests only. The community owner
-- row is created by the handle_new_community trigger, and clients cannot
-- elevate role or status through supplied values.
create policy "Users can request membership only as themselves."
on community_members for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and role = 'member'
  and status = 'pending'
);

create policy "Community owners and admins can manage memberships."
on community_members for update
to authenticated
using (
  public.is_community_admin(community_id)
  or exists (
    select 1 from communities
    where communities.id = community_members.community_id
      and communities.owner_id = (select auth.uid())
  )
)
with check (
  public.is_community_admin(community_id)
  or exists (
    select 1 from communities
    where communities.id = community_members.community_id
      and communities.owner_id = (select auth.uid())
  )
);

create policy "Users can leave; owners and admins can remove members."
on community_members for delete
to authenticated
using (
  (select auth.uid()) = user_id
  or public.is_community_admin(community_id)
  or exists (
    select 1 from communities
    where communities.id = community_members.community_id
      and communities.owner_id = (select auth.uid())
  )
);