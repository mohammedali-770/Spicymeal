with organization as (
  insert into public.wa_organizations(name,slug,ai_enabled,default_language)
  values('Spicy Meal','spicy-meal',false,'ar')
  on conflict(slug) do update set name=excluded.name
  returning id
)
insert into public.wa_teams(organization_id,name,routing_key)
select id,'Customer Care','customer-care' from organization
union all
select id,'Complaints','complaints' from organization
on conflict(organization_id,routing_key) do update set name=excluded.name,is_active=true;

insert into public.wa_routing_rules(organization_id,name,priority,conditions,actions)
select o.id,'Payment and refund handover',10,'{"keywords":["payment","refund","charged","دفع","استرجاع","انخصم"]}'::jsonb,'{"team_key":"customer-care","priority":"urgent","add_tags":["payment"]}'::jsonb
from public.wa_organizations o where o.slug='spicy-meal'
on conflict do nothing;

insert into public.wa_routing_rules(organization_id,name,priority,conditions,actions)
select o.id,'Complaint handover',20,'{"keywords":["missing","wrong","cold","ناقص","غلط","بارد"]}'::jsonb,'{"team_key":"complaints","priority":"high","add_tags":["complaint"]}'::jsonb
from public.wa_organizations o where o.slug='spicy-meal'
on conflict do nothing;
