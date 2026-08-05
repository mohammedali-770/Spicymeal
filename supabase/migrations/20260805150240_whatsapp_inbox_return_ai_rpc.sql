create or replace function public.wa_return_to_ai(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_agent uuid;
begin
  select organization_id,assigned_agent_id into v_org,v_agent from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  if not (public.wa_has_role(v_org,array['admin','supervisor']) or (v_agent=auth.uid() and public.wa_has_role(v_org,array['agent']))) then raise exception 'assigned agent or supervisor required'; end if;
  update public.wa_conversations set owner='ai',status='new',assigned_agent_id=null,team_id=null,handover_reason=null,ai_confidence=null where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action) values(v_org,p_conversation_id,auth.uid(),'user','returned_to_ai');
end;$$;

