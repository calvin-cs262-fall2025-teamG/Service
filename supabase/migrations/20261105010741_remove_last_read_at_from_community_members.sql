-- Read state is tracked client-side; the server-side functions that depended
-- on community_members.last_read_at are removed along with the column.
drop function if exists public.mark_community_read(uuid);
drop function if exists public.get_community_unread_count(uuid);

alter table public.community_members
  drop column if exists last_read_at;
