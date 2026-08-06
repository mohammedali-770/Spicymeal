create or replace view public.wa_my_profile with (security_invoker=true) as
select m.organization_id,o.name as organization_name,m.user_id,m.display_name,m.role,m.is_online
from public.wa_memberships m join public.wa_organizations o on o.id=m.organization_id
where m.user_id=auth.uid();

create or replace view public.wa_inbox with (security_invoker=true) as
select c.id,c.organization_id,coalesce(ct.display_name,ct.phone) as customer_name,ct.phone,c.status,c.owner,c.priority,c.category,
  t.name as team_name,c.assigned_agent_id,m.display_name as assigned_agent_name,c.unread_count,lm.body as last_message,c.last_message_at,
  ct.language,c.ai_confidence,c.handover_reason,coalesce((select array_agg(distinct tag.value) from public.wa_routing_rules rr cross join lateral jsonb_array_elements_text(coalesce(rr.actions->'add_tags','[]'::jsonb)) as tag(value) where rr.organization_id=c.organization_id and rr.is_active),array[]::text[]) as tags
from public.wa_conversations c join public.wa_contacts ct on ct.id=c.contact_id
left join public.wa_teams t on t.id=c.team_id
left join public.wa_memberships m on m.organization_id=c.organization_id and m.user_id=c.assigned_agent_id
left join lateral(select body from public.wa_messages x where x.conversation_id=c.id order by created_at desc limit 1) lm on true;

create or replace view public.wa_agent_workload with (security_invoker=true) as
select m.organization_id,m.user_id as id,m.display_name,coalesce(t.name,'Unassigned') as team_name,m.is_online as online,
  count(c.id) filter(where c.status in('assigned','waiting_customer'))::integer as active_count
from public.wa_memberships m
left join public.wa_team_members tm on tm.user_id=m.user_id
left join public.wa_teams t on t.id=tm.team_id and t.organization_id=m.organization_id
left join public.wa_conversations c on c.organization_id=m.organization_id and c.assigned_agent_id=m.user_id
where m.role in('admin','supervisor','agent') group by m.organization_id,m.user_id,m.display_name,t.name,m.is_online;

create or replace view public.wa_team_directory with (security_invoker=true) as
select m.organization_id,m.user_id as id,m.display_name,coalesce(t.name,'Unassigned') as team_name,m.is_online as online,m.role,
  count(c.id) filter(where c.status in('assigned','waiting_customer'))::integer as active_count,null::text as email
from public.wa_memberships m
left join public.wa_team_members tm on tm.user_id=m.user_id
left join public.wa_teams t on t.id=tm.team_id and t.organization_id=m.organization_id
left join public.wa_conversations c on c.organization_id=m.organization_id and c.assigned_agent_id=m.user_id
group by m.organization_id,m.user_id,m.display_name,t.name,m.is_online,m.role;

