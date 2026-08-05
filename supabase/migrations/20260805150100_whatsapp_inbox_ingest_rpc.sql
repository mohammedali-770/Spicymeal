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
  on conflict(organization_id,provider_contact_id) do update set phone=excluded.phone,display_name=coalesce(excluded.display_name,wa_contacts.display_name),language=case when excluded.language='unknown' then wa_contacts.language else excluded.language end,last_seen_at=excluded.last_seen_at
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
    service_window_expires_at=p_received_at+interval '24 hours',last_message_at=greatest(wa_conversations.last_message_at,p_received_at)
  returning id into v_conversation;
  insert into public.wa_messages(organization_id,conversation_id,provider_message_id,direction,sender_type,sender_name,message_type,body,delivery_status,raw_metadata,created_at,status_updated_at)
  values(p_organization_id,v_conversation,p_provider_message_id,'inbound','customer',nullif(p_display_name,''),coalesce(nullif(p_message_type,''),'unknown'),coalesce(p_body,''),'received',coalesce(p_raw_metadata,'{}'::jsonb),p_received_at,p_received_at)
  returning id into v_message;
  return query select v_conversation,v_message,true;
end;$$;

