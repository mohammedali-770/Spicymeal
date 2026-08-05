create extension if not exists pgcrypto;

create table if not exists public.wa_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ai_enabled boolean not null default true,
  ai_confidence_threshold numeric(4,3) not null default 0.780 check (ai_confidence_threshold between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.wa_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  phone_number_id text not null unique,
  display_phone_number text,
  graph_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wa_memberships (
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'agent' check (role in ('admin','supervisor','agent','viewer')),
  is_online boolean not null default false,
  primary key (organization_id,user_id)
);

create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  provider_contact_id text not null,
  phone text not null,
  display_name text,
  language text not null default 'unknown' check (language in ('ar','en','unknown')),
  updated_at timestamptz not null default now(),
  unique (organization_id,provider_contact_id)
);

create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  channel_id uuid not null references public.wa_channels(id),
  contact_id uuid not null references public.wa_contacts(id),
  status text not null default 'new' check (status in ('new','queued','assigned','waiting_customer','resolved')),
  owner text not null default 'ai' check (owner in ('ai','human','unassigned')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  category text not null default 'General inquiry',
  assigned_agent_id uuid references auth.users(id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  ai_confidence numeric(4,3) check (ai_confidence is null or ai_confidence between 0 and 1),
  handover_reason text,
  service_window_expires_at timestamptz,
  last_message_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id,contact_id)
);

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  provider_message_id text unique,
  client_message_id uuid unique,
  direction text not null check (direction in ('inbound','outbound','internal')),
  sender_type text not null check (sender_type in ('customer','agent','ai','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text,
  message_type text not null default 'text',
  body text not null default '',
  delivery_status text not null default 'received' check (delivery_status in ('received','queued','sent','delivered','read','failed')),
  delivery_error jsonb,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.wa_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  title text not null,
  content text not null,
  language text not null default 'both' check (language in ('ar','en','both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists wa_conversations_org_status_idx on public.wa_conversations(organization_id,status,last_message_at desc);
create index if not exists wa_messages_conversation_idx on public.wa_messages(conversation_id,created_at);

create or replace function public.wa_is_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.wa_memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid());
$$;

create or replace function public.wa_has_role(p_organization_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.wa_memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.role=any(p_roles));
$$;

alter table public.wa_organizations enable row level security;
alter table public.wa_channels enable row level security;
alter table public.wa_memberships enable row level security;
alter table public.wa_contacts enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_knowledge_articles enable row level security;

create policy wa_org_read on public.wa_organizations for select to authenticated using (public.wa_is_member(id));
create policy wa_channel_read on public.wa_channels for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_membership_read on public.wa_memberships for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_contact_read on public.wa_contacts for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_conversation_read on public.wa_conversations for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_message_read on public.wa_messages for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_knowledge_read on public.wa_knowledge_articles for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_knowledge_manage on public.wa_knowledge_articles for all to authenticated using (public.wa_has_role(organization_id,array['admin','supervisor'])) with check (public.wa_has_role(organization_id,array['admin','supervisor']));

create or replace function public.wa_assign_conversation(p_conversation_id uuid,p_agent_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_role text;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if v_org is null then raise exception 'conversation not found'; end if;
  if not public.wa_has_role(v_org,array['admin','supervisor','agent']) then raise exception 'membership required'; end if;
  select role into v_role from public.wa_memberships where organization_id=v_org and user_id=p_agent_id;
  if v_role is null or v_role='viewer' then raise exception 'target agent is not eligible'; end if;
  if public.wa_has_role(v_org,array['agent']) and p_agent_id<>auth.uid() then raise exception 'agents can only claim for themselves'; end if;
  update public.wa_conversations set owner='human',status='assigned',assigned_agent_id=p_agent_id,unread_count=0,updated_at=now() where id=p_conversation_id;
end;$$;

create or replace function public.wa_unassign_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if not public.wa_has_role(v_org,array['admin','supervisor']) then raise exception 'supervisor access required'; end if;
  update public.wa_conversations set owner='unassigned',status='queued',assigned_agent_id=null,updated_at=now() where id=p_conversation_id;
end;$$;

create or replace function public.wa_resolve_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid; v_agent uuid;
begin
  select organization_id,assigned_agent_id into v_org,v_agent from public.wa_conversations where id=p_conversation_id for update;
  if not (public.wa_has_role(v_org,array['admin','supervisor']) or (v_agent=auth.uid() and public.wa_has_role(v_org,array['agent']))) then raise exception 'assigned agent or supervisor required'; end if;
  update public.wa_conversations set status='resolved',unread_count=0,updated_at=now() where id=p_conversation_id;
end;$$;

create or replace function public.wa_return_to_ai(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.wa_conversations where id=p_conversation_id for update;
  if not public.wa_has_role(v_org,array['admin','supervisor','agent']) then raise exception 'membership required'; end if;
  update public.wa_conversations set owner='ai',status='new',assigned_agent_id=null,handover_reason=null,ai_confidence=null,updated_at=now() where id=p_conversation_id;
end;$$;

create or replace function public.wa_ingest_message(
  p_organization_id uuid,p_channel_id uuid,p_provider_message_id text,p_provider_contact_id text,
  p_phone text,p_display_name text,p_message_type text,p_body text,p_received_at timestamptz
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_contact uuid; v_conversation uuid; v_message uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider_message_id,0));
  select id into v_message from public.wa_messages where provider_message_id=p_provider_message_id;
  if v_message is not null then return v_message; end if;
  insert into public.wa_contacts(organization_id,provider_contact_id,phone,display_name,updated_at)
  values(p_organization_id,p_provider_contact_id,p_phone,nullif(p_display_name,''),p_received_at)
  on conflict(organization_id,provider_contact_id) do update set phone=excluded.phone,display_name=coalesce(excluded.display_name,wa_contacts.display_name),updated_at=excluded.updated_at returning id into v_contact;
  insert into public.wa_conversations(organization_id,channel_id,contact_id,status,owner,unread_count,service_window_expires_at,last_message_at)
  values(p_organization_id,p_channel_id,v_contact,'new','ai',1,p_received_at+interval '24 hours',p_received_at)
  on conflict(channel_id,contact_id) do update set status=case when wa_conversations.status='resolved' then 'new' else wa_conversations.status end,owner=case when wa_conversations.status='resolved' then 'ai' else wa_conversations.owner end,unread_count=wa_conversations.unread_count+1,service_window_expires_at=p_received_at+interval '24 hours',last_message_at=greatest(wa_conversations.last_message_at,p_received_at),updated_at=now() returning id into v_conversation;
  insert into public.wa_messages(organization_id,conversation_id,provider_message_id,direction,sender_type,sender_name,message_type,body,delivery_status,created_at)
  values(p_organization_id,v_conversation,p_provider_message_id,'inbound','customer',nullif(p_display_name,''),coalesce(nullif(p_message_type,''),'unknown'),coalesce(p_body,''),'received',p_received_at)
  returning id into v_message;
  return v_message;
end;$$;

create or replace view public.wa_inbox with (security_invoker=true) as
select c.id,c.organization_id,coalesce(ct.display_name,ct.phone) as customer_name,ct.phone,
  c.status,c.owner,c.priority,c.category,c.assigned_agent_id,m.display_name as assigned_agent_name,
  c.unread_count,lm.body as last_message,c.last_message_at,ct.language,c.ai_confidence,c.handover_reason,
  array[]::text[] as tags
from public.wa_conversations c join public.wa_contacts ct on ct.id=c.contact_id
left join public.wa_memberships m on m.organization_id=c.organization_id and m.user_id=c.assigned_agent_id
left join lateral(select body from public.wa_messages x where x.conversation_id=c.id order by created_at desc limit 1) lm on true;

create or replace view public.wa_agent_workload with (security_invoker=true) as
select m.organization_id,m.user_id as id,m.display_name as name,
  upper(left(split_part(m.display_name,' ',1),1)||left(coalesce(nullif(split_part(m.display_name,' ',2),''),split_part(m.display_name,' ',1)),1)) as initials,
  'Customer Care'::text as team,m.is_online as online,
  count(c.id) filter(where c.status in('assigned','waiting_customer'))::integer as active_count
from public.wa_memberships m left join public.wa_conversations c on c.organization_id=m.organization_id and c.assigned_agent_id=m.user_id
where m.role in('admin','supervisor','agent') group by m.organization_id,m.user_id,m.display_name,m.is_online;

grant select on public.wa_inbox,public.wa_agent_workload to authenticated;
revoke all on function public.wa_ingest_message(uuid,uuid,text,text,text,text,text,text,timestamptz) from anon,authenticated;
grant execute on function public.wa_assign_conversation(uuid,uuid),public.wa_unassign_conversation(uuid),public.wa_resolve_conversation(uuid),public.wa_return_to_ai(uuid) to authenticated;
