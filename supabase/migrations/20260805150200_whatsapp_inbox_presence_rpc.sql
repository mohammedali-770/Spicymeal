create or replace function public.wa_set_presence(p_online boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.wa_memberships set is_online=p_online,last_seen_at=now() where user_id=auth.uid();
  if not found then raise exception 'membership required'; end if;
end;$$;

