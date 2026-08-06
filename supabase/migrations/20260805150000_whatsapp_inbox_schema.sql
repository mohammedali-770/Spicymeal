create extension if not exists pgcrypto;

create table if not exists public.wa_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  ai_enabled boolean not null default true,
  ai_confidence_threshold numeric(4,3) not null default 0.780 check (ai_confidence_threshold between 0 and 1),
  default_language text not null default 'ar' check (default_language in ('ar','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  phone_number_id text not null unique,
  display_phone_number text,
  waba_id text,
  graph_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_memberships (
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'agent' check (role in ('admin','supervisor','agent','viewer')),
  is_online boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id),
  unique (user_id)
);

create table if not exists public.wa_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  name text not null,
  routing_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,routing_key)
);

create table if not exists public.wa_team_members (
  team_id uuid not null references public.wa_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id,user_id),
  unique (user_id)
);

create table if not exists public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  provider_contact_id text not null,
  phone text not null,
  display_name text,
  language text not null default 'unknown' check (language in ('ar','en','unknown')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,provider_contact_id)
);

create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  channel_id uuid not null references public.wa_channels(id) on delete restrict,
  contact_id uuid not null references public.wa_contacts(id) on delete restrict,
  status text not null default 'new' check (status in ('new','queued','assigned','waiting_customer','resolved')),
  owner text not null default 'ai' check (owner in ('ai','human','unassigned')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  category text not null default 'General inquiry',
  team_id uuid references public.wa_teams(id) on delete set null,
  assigned_agent_id uuid references auth.users(id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  ai_confidence numeric(4,3) check (ai_confidence is null or ai_confidence between 0 and 1),
  handover_reason text,
  service_window_expires_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
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
  raw_metadata jsonb not null default '{}'::jsonb,
  is_internal_note boolean not null default false,
  reply_to_provider_message_id text,
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.wa_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  title text not null,
  content text not null,
  language text not null default 'both' check (language in ('ar','en','both')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wa_routing_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  name text not null,
  priority integer not null default 100,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wa_ai_runs (
  inbound_message_id uuid primary key references public.wa_messages(id) on delete cascade,
  status text not null default 'processing' check (status in ('processing','replied','handoff','skipped','failed')),
  decision jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.wa_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.wa_organizations(id) on delete cascade,
  conversation_id uuid references public.wa_conversations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user','ai','system')),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wa_conversations_org_status_idx on public.wa_conversations(organization_id,status,last_message_at desc);
create index if not exists wa_conversations_assigned_idx on public.wa_conversations(assigned_agent_id,status) where status <> 'resolved';
create index if not exists wa_messages_conversation_idx on public.wa_messages(conversation_id,created_at);
create index if not exists wa_messages_org_created_idx on public.wa_messages(organization_id,created_at desc);
create index if not exists wa_knowledge_active_idx on public.wa_knowledge_articles(organization_id,is_active);

create or replace function public.wa_set_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists wa_organizations_updated_at on public.wa_organizations;
create trigger wa_organizations_updated_at before update on public.wa_organizations for each row execute function public.wa_set_updated_at();
drop trigger if exists wa_channels_updated_at on public.wa_channels;
create trigger wa_channels_updated_at before update on public.wa_channels for each row execute function public.wa_set_updated_at();
drop trigger if exists wa_contacts_updated_at on public.wa_contacts;
create trigger wa_contacts_updated_at before update on public.wa_contacts for each row execute function public.wa_set_updated_at();
drop trigger if exists wa_conversations_updated_at on public.wa_conversations;
create trigger wa_conversations_updated_at before update on public.wa_conversations for each row execute function public.wa_set_updated_at();
drop trigger if exists wa_knowledge_updated_at on public.wa_knowledge_articles;
create trigger wa_knowledge_updated_at before update on public.wa_knowledge_articles for each row execute function public.wa_set_updated_at();

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
alter table public.wa_teams enable row level security;
alter table public.wa_team_members enable row level security;
alter table public.wa_contacts enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
alter table public.wa_knowledge_articles enable row level security;
alter table public.wa_routing_rules enable row level security;
alter table public.wa_ai_runs enable row level security;
alter table public.wa_audit_log enable row level security;

create policy wa_org_read on public.wa_organizations for select to authenticated using (public.wa_is_member(id));
create policy wa_channel_read on public.wa_channels for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_membership_read on public.wa_memberships for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_team_read on public.wa_teams for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_team_member_read on public.wa_team_members for select to authenticated using (exists(select 1 from public.wa_teams t where t.id=team_id and public.wa_is_member(t.organization_id)));
create policy wa_contact_read on public.wa_contacts for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_conversation_read on public.wa_conversations for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_message_read on public.wa_messages for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_knowledge_read on public.wa_knowledge_articles for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_knowledge_manage on public.wa_knowledge_articles for all to authenticated using (public.wa_has_role(organization_id,array['admin','supervisor'])) with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_routing_read on public.wa_routing_rules for select to authenticated using (public.wa_is_member(organization_id));
create policy wa_routing_manage on public.wa_routing_rules for all to authenticated using (public.wa_has_role(organization_id,array['admin','supervisor'])) with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_audit_read on public.wa_audit_log for select to authenticated using (public.wa_has_role(organization_id,array['admin','supervisor']));

