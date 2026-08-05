create or replace function public.wa_assign_conversation(p_conversation_id uuid,p_agent_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_target_role text;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  if not public.wa_has_role(v_org,array['admin','supervisor','agent']) then raise exception 'membership required'; end if;
  select role into v_target_role from public.wa_memberships where organization_id=v_org and user_id=p_agent_id;
  if v_target_role is null or v_target_role='viewer' then raise exception 'target agent is not eligible'; end if;
  if public.wa_has_role(v_org,array['agent']) and not public.wa_has_role(v_org,array['admin','supervisor']) and p_agent_id<>auth.uid() then raise exception 'agents can only claim for themselves'; end if;
  update public.wa_conversations set owner='human',status='assigned',assigned_agent_id=p_agent_id,unread_count=0 where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action,details) values(v_org,p_conversation_id,auth.uid(),'user','assigned',jsonb_build_object('agent_id',p_agent_id));
end;$$;

