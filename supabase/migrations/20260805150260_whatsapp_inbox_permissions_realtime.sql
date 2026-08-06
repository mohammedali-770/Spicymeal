revoke all on public.wa_organizations,public.wa_channels,public.wa_memberships,public.wa_teams,public.wa_team_members,public.wa_contacts,public.wa_conversations,public.wa_messages,public.wa_knowledge_articles,public.wa_routing_rules,public.wa_ai_runs,public.wa_audit_log from anon;
revoke insert,update,delete,truncate,references,trigger on public.wa_organizations,public.wa_channels,public.wa_memberships,public.wa_teams,public.wa_team_members,public.wa_contacts,public.wa_conversations,public.wa_messages,public.wa_ai_runs,public.wa_audit_log from authenticated;
grant select on public.wa_organizations,public.wa_channels,public.wa_memberships,public.wa_teams,public.wa_team_members,public.wa_contacts,public.wa_conversations,public.wa_messages,public.wa_knowledge_articles,public.wa_routing_rules,public.wa_audit_log to authenticated;
grant insert,update,delete on public.wa_knowledge_articles,public.wa_routing_rules to authenticated;
grant select on public.wa_my_profile,public.wa_inbox,public.wa_agent_workload,public.wa_team_directory to authenticated;
revoke all on function public.wa_ingest_inbound_message(uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.wa_update_delivery_status(text,text,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.wa_claim_ai_run(uuid) from public,anon,authenticated;
revoke all on function public.wa_handover_conversation(uuid,text,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.wa_ingest_inbound_message(uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb) to service_role;
grant execute on function public.wa_update_delivery_status(text,text,jsonb,timestamptz) to service_role;
grant execute on function public.wa_claim_ai_run(uuid) to service_role;
grant execute on function public.wa_handover_conversation(uuid,text,text,text,text,numeric) to service_role;
revoke all on function public.wa_set_presence(boolean),public.wa_assign_conversation(uuid,uuid),public.wa_unassign_conversation(uuid),public.wa_resolve_conversation(uuid),public.wa_return_to_ai(uuid) from public,anon;
grant execute on function public.wa_set_presence(boolean),public.wa_assign_conversation(uuid,uuid),public.wa_unassign_conversation(uuid),public.wa_resolve_conversation(uuid),public.wa_return_to_ai(uuid) to authenticated;

revoke all on function public.wa_is_member(uuid),public.wa_has_role(uuid,text[]) from public,anon;
grant execute on function public.wa_is_member(uuid),public.wa_has_role(uuid,text[]) to authenticated;

do $$ begin alter publication supabase_realtime add table public.wa_conversations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.wa_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.wa_memberships; exception when duplicate_object then null; end $$;
