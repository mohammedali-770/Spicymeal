create or replace function public.wa_unassign_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  if not public.wa_has_role(v_org,array['admin','supervisor']) then raise exception 'supervisor access required'; end if;
  update public.wa_conversations set owner='unassigned',status='queued',assigned_agent_id=null where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action) values(v_org,p_conversation_id,auth.uid(),'user','unassigned');
end;$$;

