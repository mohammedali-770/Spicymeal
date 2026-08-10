create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated,service_role;

create or replace function private.wa_is_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.wa_memberships m
    where m.organization_id=p_organization_id and m.user_id=auth.uid()
  );
$$;

create or replace function private.wa_has_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.wa_memberships m
    where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role=any(p_roles)
  );
$$;

revoke all on function private.wa_is_member(uuid),private.wa_has_role(uuid,text[]) from public,anon;
grant execute on function private.wa_is_member(uuid),private.wa_has_role(uuid,text[]) to authenticated,service_role;

alter policy wa_org_read on public.wa_organizations using (private.wa_is_member(id));
alter policy wa_channel_read on public.wa_channels using (private.wa_is_member(organization_id));
alter policy wa_membership_read on public.wa_memberships using (private.wa_is_member(organization_id));
alter policy wa_team_read on public.wa_teams using (private.wa_is_member(organization_id));
alter policy wa_team_member_read on public.wa_team_members using (
  exists(select 1 from public.wa_teams t where t.id=team_id and private.wa_is_member(t.organization_id))
);
alter policy wa_contact_read on public.wa_contacts using (private.wa_is_member(organization_id));
alter policy wa_conversation_read on public.wa_conversations using (private.wa_is_member(organization_id));
alter policy wa_message_read on public.wa_messages using (private.wa_is_member(organization_id));
alter policy wa_knowledge_read on public.wa_knowledge_articles using (private.wa_is_member(organization_id));
alter policy wa_knowledge_insert on public.wa_knowledge_articles with check (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_knowledge_update on public.wa_knowledge_articles
  using (private.wa_has_role(organization_id,array['admin','supervisor']))
  with check (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_knowledge_delete on public.wa_knowledge_articles using (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_routing_read on public.wa_routing_rules using (private.wa_is_member(organization_id));
alter policy wa_routing_insert on public.wa_routing_rules with check (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_routing_update on public.wa_routing_rules
  using (private.wa_has_role(organization_id,array['admin','supervisor']))
  with check (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_routing_delete on public.wa_routing_rules using (private.wa_has_role(organization_id,array['admin','supervisor']));
alter policy wa_audit_read on public.wa_audit_log using (private.wa_has_role(organization_id,array['admin','supervisor']));

revoke all on function public.wa_is_member(uuid),public.wa_has_role(uuid,text[]) from authenticated;

create or replace function public.wa_ingest_inbound_message(
  p_organization_id uuid,p_channel_id uuid,p_provider_message_id text,p_provider_contact_id text,
  p_phone text,p_display_name text,p_message_type text,p_body text,p_received_at timestamptz,p_raw_metadata jsonb default '{}'::jsonb
) returns table(conversation_id uuid,message_id uuid,inserted boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_contact uuid; v_conversation uuid; v_existing uuid; v_message uuid; v_language text;
begin
  if coalesce(p_provider_message_id,'')='' then raise exception 'provider message id required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_message_id,0));
  select m.id,m.conversation_id into v_existing,v_conversation from public.wa_messages m where m.provider_message_id=p_provider_message_id;
  if v_existing is not null then return query select v_conversation,v_existing,false; return; end if;
  if not exists(select 1 from public.wa_channels c where c.id=p_channel_id and c.organization_id=p_organization_id and c.is_active) then raise exception 'channel unavailable'; end if;
  v_language := case when coalesce(p_body,'') ~ '[ء-ي]' then 'ar' else 'unknown' end;
  insert into public.wa_contacts(organization_id,provider_contact_id,phone,display_name,language,last_seen_at)
  values(p_organization_id,p_provider_contact_id,p_phone,nullif(p_display_name,''),v_language,p_received_at)
  on conflict(organization_id,provider_contact_id) do update set
    phone=excluded.phone,
    display_name=coalesce(excluded.display_name,wa_contacts.display_name),
    language=case when excluded.language='unknown' then wa_contacts.language else excluded.language end,
    last_seen_at=greatest(wa_contacts.last_seen_at,excluded.last_seen_at)
  returning id into v_contact;
  insert into public.wa_conversations(organization_id,channel_id,contact_id,status,owner,unread_count,service_window_expires_at,last_message_at)
  values(p_organization_id,p_channel_id,v_contact,'new','ai',1,p_received_at+interval '24 hours',p_received_at)
  on conflict(channel_id,contact_id) do update set
    status=case when wa_conversations.status='resolved' then 'new' else wa_conversations.status end,
    owner=case when wa_conversations.status='resolved' then 'ai' else wa_conversations.owner end,
    assigned_agent_id=case when wa_conversations.status='resolved' then null else wa_conversations.assigned_agent_id end,
    team_id=case when wa_conversations.status='resolved' then null else wa_conversations.team_id end,
    priority=case when wa_conversations.status='resolved' then 'normal' else wa_conversations.priority end,
    category=case when wa_conversations.status='resolved' then 'General inquiry' else wa_conversations.category end,
    handover_reason=case when wa_conversations.status='resolved' then null else wa_conversations.handover_reason end,
    ai_confidence=case when wa_conversations.status='resolved' then null else wa_conversations.ai_confidence end,
    unread_count=wa_conversations.unread_count+1,
    service_window_expires_at=greatest(wa_conversations.service_window_expires_at,p_received_at+interval '24 hours'),
    last_message_at=greatest(wa_conversations.last_message_at,p_received_at)
  returning id into v_conversation;
  insert into public.wa_messages(organization_id,conversation_id,provider_message_id,direction,sender_type,sender_name,message_type,body,delivery_status,raw_metadata,created_at,status_updated_at)
  values(p_organization_id,v_conversation,p_provider_message_id,'inbound','customer',nullif(p_display_name,''),coalesce(nullif(p_message_type,''),'unknown'),coalesce(p_body,''),'received',coalesce(p_raw_metadata,'{}'::jsonb),p_received_at,p_received_at)
  returning id into v_message;
  return query select v_conversation,v_message,true;
end;$$;

create or replace function public.wa_assign_conversation(p_conversation_id uuid,p_agent_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_target_role text; v_caller_role text; v_current_agent uuid; v_status text;
begin
  select organization_id,assigned_agent_id,status into v_org,v_current_agent,v_status
  from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  if v_status='resolved' then raise exception 'resolved conversation cannot be assigned'; end if;
  select role into v_caller_role from public.wa_memberships where organization_id=v_org and user_id=auth.uid();
  if v_caller_role not in ('admin','supervisor','agent') then raise exception 'membership required'; end if;
  select role into v_target_role from public.wa_memberships where organization_id=v_org and user_id=p_agent_id;
  if v_target_role is null or v_target_role='viewer' then raise exception 'target agent is not eligible'; end if;
  if v_caller_role='agent' then
    if p_agent_id<>auth.uid() then raise exception 'agents can only claim for themselves'; end if;
    if v_current_agent is not null and v_current_agent<>auth.uid() then raise exception 'conversation already assigned to another agent'; end if;
  end if;
  update public.wa_conversations set owner='human',status='assigned',assigned_agent_id=p_agent_id,unread_count=0 where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action,details)
  values(v_org,p_conversation_id,auth.uid(),'user','assigned',jsonb_build_object('agent_id',p_agent_id));
end;$$;

create or replace function public.wa_unassign_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_status text; v_caller_role text;
begin
  select organization_id,status into v_org,v_status from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  select role into v_caller_role from public.wa_memberships where organization_id=v_org and user_id=auth.uid();
  if v_caller_role not in ('admin','supervisor') then raise exception 'supervisor access required'; end if;
  if v_status='resolved' then raise exception 'resolved conversation cannot be unassigned'; end if;
  update public.wa_conversations set owner='unassigned',status='queued',assigned_agent_id=null where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action)
  values(v_org,p_conversation_id,auth.uid(),'user','unassigned');
end;$$;

create or replace function public.wa_resolve_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_agent uuid; v_caller_role text;
begin
  select organization_id,assigned_agent_id into v_org,v_agent from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  select role into v_caller_role from public.wa_memberships where organization_id=v_org and user_id=auth.uid();
  if not (v_caller_role in ('admin','supervisor') or (v_caller_role='agent' and v_agent=auth.uid())) then raise exception 'assigned agent or supervisor required'; end if;
  update public.wa_conversations set status='resolved',unread_count=0 where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action)
  values(v_org,p_conversation_id,auth.uid(),'user','resolved');
end;$$;

create or replace function public.wa_return_to_ai(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_agent uuid; v_caller_role text;
begin
  select organization_id,assigned_agent_id into v_org,v_agent from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  select role into v_caller_role from public.wa_memberships where organization_id=v_org and user_id=auth.uid();
  if not (v_caller_role in ('admin','supervisor') or (v_caller_role='agent' and v_agent=auth.uid())) then raise exception 'assigned agent or supervisor required'; end if;
  update public.wa_conversations set owner='ai',status='new',assigned_agent_id=null,team_id=null,handover_reason=null,ai_confidence=null where id=p_conversation_id;
  insert into public.wa_audit_log(organization_id,conversation_id,actor_user_id,actor_type,action)
  values(v_org,p_conversation_id,auth.uid(),'user','returned_to_ai');
end;$$;

create or replace function public.wa_handover_conversation(
  p_conversation_id uuid,p_category text,p_priority text,p_team_key text,p_reason text,p_ai_confidence numeric default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_team uuid; v_agent uuid; v_agent_name text;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  select id into v_team from public.wa_teams
  where organization_id=v_org and routing_key=coalesce(nullif(p_team_key,''),'customer-care') and is_active limit 1;
  if v_team is not null then
    select m.user_id,m.display_name into v_agent,v_agent_name
    from public.wa_memberships m
    join public.wa_team_members tm on tm.user_id=m.user_id and tm.team_id=v_team
    where m.organization_id=v_org
      and m.is_online
      and m.last_seen_at is not null
      and m.last_seen_at >= now()-interval '2 minutes'
      and m.role in ('admin','supervisor','agent')
    order by (
      select count(*) from public.wa_conversations c
      where c.organization_id=v_org and c.assigned_agent_id=m.user_id and c.status in ('assigned','waiting_customer')
    ),m.last_seen_at desc
    limit 1;
  end if;
  update public.wa_conversations set
    owner=case when v_agent is null then 'unassigned' else 'human' end,
    status=case when v_agent is null then 'queued' else 'assigned' end,
    priority=case when p_priority in ('normal','high','urgent') then p_priority else 'normal' end,
    category=coalesce(nullif(p_category,''),'Human review'),team_id=v_team,assigned_agent_id=v_agent,
    handover_reason=coalesce(nullif(p_reason,''),'Human review required'),ai_confidence=p_ai_confidence
  where id=p_conversation_id;
  insert into public.wa_messages(organization_id,conversation_id,direction,sender_type,sender_name,message_type,body,delivery_status,is_internal_note)
  values(v_org,p_conversation_id,'internal','system','Routing engine','note',
    case when v_agent is null then 'AI paused. Conversation moved to the team queue: '||coalesce(p_reason,'Human review required')
    else 'AI paused. Conversation assigned to '||v_agent_name||': '||coalesce(p_reason,'Human review required') end,
    'received',true);
  insert into public.wa_audit_log(organization_id,conversation_id,actor_type,action,details)
  values(v_org,p_conversation_id,'system','handover',jsonb_build_object('team_id',v_team,'agent_id',v_agent,'category',p_category,'priority',p_priority,'reason',p_reason));
end;$$;

create index if not exists wa_memberships_presence_idx on public.wa_memberships(organization_id,last_seen_at desc)
where is_online and role in ('admin','supervisor','agent');

create or replace view public.wa_my_profile with (security_invoker=true) as
select m.organization_id,o.name as organization_name,m.user_id,m.display_name,m.role,
  (m.is_online and m.last_seen_at is not null and m.last_seen_at>=now()-interval '2 minutes') as is_online
from public.wa_memberships m join public.wa_organizations o on o.id=m.organization_id
where m.user_id=auth.uid();

create or replace view public.wa_agent_workload with (security_invoker=true) as
select m.organization_id,m.user_id as id,m.display_name,coalesce(t.name,'Unassigned') as team_name,
  (m.is_online and m.last_seen_at is not null and m.last_seen_at>=now()-interval '2 minutes') as online,
  count(c.id) filter(where c.status in('assigned','waiting_customer'))::integer as active_count
from public.wa_memberships m
left join public.wa_team_members tm on tm.user_id=m.user_id
left join public.wa_teams t on t.id=tm.team_id and t.organization_id=m.organization_id
left join public.wa_conversations c on c.organization_id=m.organization_id and c.assigned_agent_id=m.user_id
where m.role in('admin','supervisor','agent')
group by m.organization_id,m.user_id,m.display_name,t.name,m.is_online,m.last_seen_at;

create or replace view public.wa_team_directory with (security_invoker=true) as
select m.organization_id,m.user_id as id,m.display_name,coalesce(t.name,'Unassigned') as team_name,
  (m.is_online and m.last_seen_at is not null and m.last_seen_at>=now()-interval '2 minutes') as online,
  m.role,count(c.id) filter(where c.status in('assigned','waiting_customer'))::integer as active_count,null::text as email
from public.wa_memberships m
left join public.wa_team_members tm on tm.user_id=m.user_id
left join public.wa_teams t on t.id=tm.team_id and t.organization_id=m.organization_id
left join public.wa_conversations c on c.organization_id=m.organization_id and c.assigned_agent_id=m.user_id
group by m.organization_id,m.user_id,m.display_name,t.name,m.is_online,m.last_seen_at,m.role;
