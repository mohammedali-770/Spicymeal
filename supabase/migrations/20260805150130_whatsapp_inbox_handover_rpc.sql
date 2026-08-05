create or replace function public.wa_handover_conversation(
  p_conversation_id uuid,p_category text,p_priority text,p_team_key text,p_reason text,p_ai_confidence numeric default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_team uuid; v_agent uuid; v_agent_name text;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  select id into v_team from public.wa_teams where organization_id=v_org and routing_key=coalesce(nullif(p_team_key,''),'customer-care') and is_active limit 1;
  if v_team is not null then
    select m.user_id,m.display_name into v_agent,v_agent_name
    from public.wa_memberships m join public.wa_team_members tm on tm.user_id=m.user_id and tm.team_id=v_team
    where m.organization_id=v_org and m.is_online and m.role in ('admin','supervisor','agent')
    order by (select count(*) from public.wa_conversations c where c.organization_id=v_org and c.assigned_agent_id=m.user_id and c.status in ('assigned','waiting_customer')),m.last_seen_at desc nulls last limit 1;
  end if;
  update public.wa_conversations set owner=case when v_agent is null then 'unassigned' else 'human' end,status=case when v_agent is null then 'queued' else 'assigned' end,
    priority=case when p_priority in ('normal','high','urgent') then p_priority else 'normal' end,category=coalesce(nullif(p_category,''),'Human review'),team_id=v_team,assigned_agent_id=v_agent,
    handover_reason=coalesce(nullif(p_reason,''),'Human review required'),ai_confidence=p_ai_confidence
  where id=p_conversation_id;
  insert into public.wa_messages(organization_id,conversation_id,direction,sender_type,sender_name,message_type,body,delivery_status,is_internal_note)
  values(v_org,p_conversation_id,'internal','system','Routing engine','note',case when v_agent is null then 'AI paused. Conversation moved to the team queue: '||coalesce(p_reason,'Human review required') else 'AI paused. Conversation assigned to '||v_agent_name||': '||coalesce(p_reason,'Human review required') end,'received',true);
  insert into public.wa_audit_log(organization_id,conversation_id,actor_type,action,details) values(v_org,p_conversation_id,'system','handover',jsonb_build_object('team_id',v_team,'agent_id',v_agent,'category',p_category,'priority',p_priority,'reason',p_reason));
end;$$;

