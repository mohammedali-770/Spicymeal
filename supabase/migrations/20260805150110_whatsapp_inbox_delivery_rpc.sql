create or replace function public.wa_update_delivery_status(p_provider_message_id text,p_status text,p_error jsonb default null,p_status_at timestamptz default now())
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_updated integer; v_rank integer;
begin
  v_rank := case p_status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else null end;
  if v_rank is null then return false; end if;
  update public.wa_messages m set delivery_status=p_status,delivery_error=case when p_status='failed' then p_error else null end,status_updated_at=greatest(m.status_updated_at,p_status_at)
  where m.provider_message_id=p_provider_message_id
    and (case m.delivery_status when 'received' then 0 when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end) <= v_rank
    and not (p_status='failed' and m.delivery_status in ('delivered','read'));
  get diagnostics v_updated=row_count;
  return v_updated=1;
end;$$;

