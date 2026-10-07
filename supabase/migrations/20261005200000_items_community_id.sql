-- Link items to the community they are offered in so RLS can scope item
-- visibility to community membership.

alter table items
  add column community_id uuid not null references communities(id) on delete cascade;

create index idx_items_community_id on items (community_id);

-- Nullable so existing rows remain valid. Tighten to NOT NULL once seed data
-- and any existing rows are assigned to communities.

