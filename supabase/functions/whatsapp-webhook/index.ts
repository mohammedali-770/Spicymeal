import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';
import { verifyMetaSignature } from '../_shared/whatsapp/security.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function timestamp(value?: string) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function messageBody(message: any) {
  if (message.type === 'text') return message.text?.body?.trim() ?? '';
  if (message.type === 'button') return message.button?.text?.trim() ?? '';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title?.trim() ?? message.interactive?.list_reply?.title?.trim() ?? '';
  return '';
}

async function invokeOrchestrator(conversationId: string, messageId: string) {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const secret = Deno.env.get('WHATSAPP_INTERNAL_SECRET') ?? '';
  if (!base || !secret) throw new Error('SUPABASE_URL or WHATSAPP_INTERNAL_SECRET is missing');
  const response = await fetch(`${base}/functions/v1/whatsapp-orchestrator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-whatsapp-internal-secret': secret },
    body: JSON.stringify({ conversationId, messageId }),
  });
  if (!response.ok) throw new Error(`Orchestrator returned HTTP ${response.status}`);
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
    const valid = url.searchParams.get('hub.mode') === 'subscribe'
      && url.searchParams.get('hub.verify_token') === expected
      && Boolean(url.searchParams.get('hub.challenge'));
    return valid ? new Response(url.searchParams.get('hub.challenge')!, { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await request.text();
  if (!(await verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), Deno.env.get('WHATSAPP_APP_SECRET') ?? ''))) {
    return json({ error: 'Invalid signature' }, 401);
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (payload.object !== 'whatsapp_business_account') return json({ status: 'ignored' }, 200);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jobs: Promise<unknown>[] = [];
  let accepted = 0;
  let statuses = 0;

  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    if (change.field !== 'messages') continue;
    const value = change.value ?? {};
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const { data: channel } = await admin.from('wa_channels').select('id,organization_id').eq('phone_number_id', phoneNumberId).eq('is_active', true).maybeSingle();
    if (!channel) continue;

    for (const status of value.statuses ?? []) {
      if (!status.id || !status.status) continue;
      const safeError = status.errors?.[0] ? { code: status.errors[0].code ?? null, title: status.errors[0].title ?? null } : null;
      const { data } = await admin.rpc('wa_update_delivery_status', {
        p_provider_message_id: status.id,
        p_status: status.status,
        p_error: safeError,
        p_status_at: timestamp(status.timestamp),
      });
      if (data) statuses += 1;
    }

    const names = new Map<string, string | null>((value.contacts ?? []).map((contact: any) => [contact.wa_id ?? '', contact.profile?.name ?? null]));
    for (const message of value.messages ?? []) {
      if (!message.id || !message.from) continue;
      const body = messageBody(message);
      const { data, error } = await admin.rpc('wa_ingest_inbound_message', {
        p_organization_id: channel.organization_id,
        p_channel_id: channel.id,
        p_provider_message_id: message.id,
        p_provider_contact_id: message.from,
        p_phone: message.from,
        p_display_name: names.get(message.from) ?? null,
        p_message_type: message.type ?? 'unknown',
        p_body: body,
        p_received_at: timestamp(message.timestamp),
        p_raw_metadata: { type: message.type ?? 'unknown', has_context: Boolean(message.context?.id) },
      });
      if (error) { console.error('Inbound ingest failed', error.message); continue; }
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.inserted) continue;
      accepted += 1;
      jobs.push(invokeOrchestrator(result.conversation_id, result.message_id).catch(async (cause) => {
        const reason = cause instanceof Error ? cause.message : 'Unable to invoke orchestrator';
        console.error('Orchestrator invocation failed', reason);
        const { error: handoffError } = await admin.rpc('wa_handover_conversation', {
          p_conversation_id: result.conversation_id,
          p_category: 'Automation unavailable',
          p_priority: 'high',
          p_team_key: 'customer-care',
          p_reason: 'Automation could not start. The conversation was transferred to a human.',
          p_ai_confidence: 0,
        });
        if (handoffError) console.error('Fallback handoff failed', handoffError.message);
      }));
    }
  }

  const work = Promise.allSettled(jobs).then((results) => results.forEach((result) => {
    if (result.status === 'rejected') console.error('Orchestrator failed', result.reason);
  }));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work); else await work;
  return json({ status: 'accepted', messages: accepted, statuses }, 200);
});
