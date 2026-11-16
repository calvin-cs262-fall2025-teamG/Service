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

  update public.community_members
  set status = 'declined'
  where community_id = p_community_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then
    raise exception 'Removable membership not found';
  end if;
end;
$$;