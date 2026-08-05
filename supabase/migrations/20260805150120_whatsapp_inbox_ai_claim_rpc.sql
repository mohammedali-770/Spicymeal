create or replace function public.wa_claim_ai_run(p_inbound_message_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  insert into public.wa_ai_runs(inbound_message_id,status) values(p_inbound_message_id,'processing') on conflict do nothing;
  get diagnostics v_count=row_count;
  return v_count=1;
end;$$;

