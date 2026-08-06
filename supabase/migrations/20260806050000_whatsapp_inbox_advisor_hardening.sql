create index if not exists wa_audit_log_actor_user_idx on public.wa_audit_log(actor_user_id);
create index if not exists wa_audit_log_conversation_idx on public.wa_audit_log(conversation_id);
create index if not exists wa_audit_log_organization_idx on public.wa_audit_log(organization_id,created_at desc);
create index if not exists wa_channels_organization_idx on public.wa_channels(organization_id);
create index if not exists wa_conversations_contact_idx on public.wa_conversations(contact_id);
create index if not exists wa_conversations_team_idx on public.wa_conversations(team_id);
create index if not exists wa_knowledge_created_by_idx on public.wa_knowledge_articles(created_by);
create index if not exists wa_messages_sender_user_idx on public.wa_messages(sender_user_id);
create index if not exists wa_routing_rules_organization_idx on public.wa_routing_rules(organization_id);

drop policy if exists wa_knowledge_manage on public.wa_knowledge_articles;
create policy wa_knowledge_insert on public.wa_knowledge_articles
for insert to authenticated
with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_knowledge_update on public.wa_knowledge_articles
for update to authenticated
using (public.wa_has_role(organization_id,array['admin','supervisor']))
with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_knowledge_delete on public.wa_knowledge_articles
for delete to authenticated
using (public.wa_has_role(organization_id,array['admin','supervisor']));

drop policy if exists wa_routing_manage on public.wa_routing_rules;
create policy wa_routing_insert on public.wa_routing_rules
for insert to authenticated
with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_routing_update on public.wa_routing_rules
for update to authenticated
using (public.wa_has_role(organization_id,array['admin','supervisor']))
with check (public.wa_has_role(organization_id,array['admin','supervisor']));
create policy wa_routing_delete on public.wa_routing_rules
for delete to authenticated
using (public.wa_has_role(organization_id,array['admin','supervisor']));
