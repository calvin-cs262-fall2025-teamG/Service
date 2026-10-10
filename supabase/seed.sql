-- Local demo users. The auth trigger creates matching profile rows.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'alex@example.com',
    crypt('neighbor-demo', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Alex Rivera"}',
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'jamie@example.com',
    crypt('neighbor-demo', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Jamie Chen"}',
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'morgan@example.com',
    crypt('neighbor-demo', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Morgan Patel"}',
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('10000000-0000-0000-0000-000000000001', 'Alex Rivera'),
  ('10000000-0000-0000-0000-000000000002', 'Jamie Chen'),
  ('10000000-0000-0000-0000-000000000003', 'Morgan Patel')
on conflict (id) do update
set display_name = excluded.display_name;

insert into public.communities (id, name, owner_id)
values (
  '20000000-0000-0000-0000-000000000001',
  'Maple Street Neighbors',
  '10000000-0000-0000-0000-000000000001'
)
on conflict (id) do update
set
  name = excluded.name,
  owner_id = excluded.owner_id;

insert into public.community_members (community_id, user_id, role, status)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'owner',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'member',
    'active'
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'member',
    'active'
  )
on conflict (community_id, user_id) do update
set
  role = excluded.role,
  status = excluded.status;

insert into public.items (
  id,
  owner_id,
  community_id,
  name,
  description,
  category,
  status,
  return_date
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Cordless drill',
    '18V drill with charger and a small set of bits.',
    'Tools',
    'pending',
    null
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'Folding chairs',
    'Set of four lightweight chairs for a backyard gathering.',
    'Home & Garden',
    'available',
    null
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    'Two-person tent',
    'Compact tent, suitable for a weekend camping trip.',
    'Outdoor',
    'borrowed',
    current_date + 7
  )
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  community_id = excluded.community_id,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  return_date = excluded.return_date;

insert into public.borrowing_requests (
  id,
  item_id,
  requester_id,
  status,
  requested_at,
  decided_at
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'pending',
    now() - interval '2 hours',
    null
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'approved',
    now() - interval '3 days',
    now() - interval '3 days'
  )
on conflict (id) do update
set
  item_id = excluded.item_id,
  requester_id = excluded.requester_id,
  status = excluded.status,
  requested_at = excluded.requested_at,
  decided_at = excluded.decided_at;

insert into public.borrowing_history (request_id, borrowed_at, returned_at)
values (
  '40000000-0000-0000-0000-000000000002',
  now() - interval '3 days',
  null
)
on conflict (request_id) do update
set
  borrowed_at = excluded.borrowed_at,
  returned_at = excluded.returned_at;

insert into public.messages (id, sender_id, receiver_id, item_id, content, created_at)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Hi Alex, could I borrow your drill this weekend?',
    now() - interval '2 hours'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'Sure, I can leave it on the porch Saturday morning.',
    now() - interval '1 hour'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',
    'Thanks for lending me the tent. I will return it next week.',
    now() - interval '1 day'
  )
on conflict (id) do update
set
  sender_id = excluded.sender_id,
  receiver_id = excluded.receiver_id,
  item_id = excluded.item_id,
  content = excluded.content,
  created_at = excluded.created_at;