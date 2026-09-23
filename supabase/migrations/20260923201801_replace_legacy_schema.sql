DROP TABLE IF EXISTS organization_member CASCADE;
DROP TABLE IF EXISTS organization_admin CASCADE;
DROP TABLE IF EXISTS organization CASCADE;
DROP TABLE IF EXISTS borrowinghistory CASCADE;
DROP TABLE IF EXISTS borrowingrequest CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS item CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  category text,
  image_path text,
  status text not null default 'available' check (status in ('available', 'pending', 'borrowed')),
  return_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table borrowing_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table borrowing_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references borrowing_requests(id) on delete cascade,
  borrowed_at timestamptz not null default now(),
  returned_at timestamptz,
  constraint borrowing_history_request_unique unique (request_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  receiver_id uuid not null references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table community_members (
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'declined')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index idx_item_owner_id on items (owner_id);
create index idx_item_status on items (status);
create index idx_borrowing_request_item_id on borrowing_requests (item_id);
create index idx_borrowing_request_requester_id on borrowing_requests (requester_id);
create index idx_borrowing_request_status on borrowing_requests (status);
create unique index borrowing_requests_one_active_request
  on borrowing_requests (item_id, requester_id)
  where status in ('pending', 'approved');
create index idx_message_sender_receiver_ids on messages (sender_id, receiver_id);
create index idx_message_item_id on messages (item_id);
create index idx_message_created_at on messages (created_at);
create index idx_community_member_user_id on community_members (user_id);
create index idx_community_member_community_id on community_members (community_id);
create unique index communities_name_lower_unique on communities (lower(name));

alter table profiles enable row level security;
alter table items enable row level security;
alter table borrowing_requests enable row level security;
alter table borrowing_history enable row level security;
alter table messages enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New Neighbor'
    )
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.handle_new_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_members (community_id, user_id, role, status)
  values (
    new.id,
    new.owner_id,
    'owner',
    'active'
  );

  return new;
end;
$$;

create trigger on_community_created
after insert on communities
for each row
execute function public.handle_new_community();