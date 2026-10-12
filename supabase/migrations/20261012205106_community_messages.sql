alter table communities
  add column description text;
alter table communities
  add column avitar_path text;
alter table community_members
  add column last_read_at timestamptz;

alter table messages
  rename to direct_messages;

create table community_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  community_id uuid not null references communities(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_community_message_sender_community_ids on community_messages (sender_id, community_id);
create index idx_community_message_item_id on community_messages (item_id);
create index idx_community_message_created_at on community_messages (created_at);

alter table community_messages enable row level security;

-- ---------------------------------------------------------------------------
-- community_messages
-- ---------------------------------------------------------------------------

revoke all on table community_messages from anon, authenticated;
grant select, insert on table community_messages to authenticated;

create policy "Active community members can view community messages."
on community_messages for select
to authenticated
using (public.is_community_member(community_id));

create policy "Users can send community_messages only as themselves."
on community_messages for insert
to authenticated
with check ((select auth.uid()) = sender_id);