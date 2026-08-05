import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

function hex(bytes: Uint8Array) { return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); }
async function verify(raw: string, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=') || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return signature.toLowerCase() === `sha256=${hex(new Uint8Array(digest))}`;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
    return url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === expected
      ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
      : new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const raw = await request.text();
  if (!(await verify(raw, request.headers.get('x-hub-signature-256'), Deno.env.get('WHATSAPP_APP_SECRET') ?? ''))) return json({ error: 'Invalid signature' }, 401);
  const payload = JSON.parse(raw);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let accepted = 0;
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value ?? {};
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) continue;
    const { data: channel } = await admin.from('wa_channels').select('id,organization_id').eq('phone_number_id', phoneNumberId).eq('is_active', true).maybeSingle();
    if (!channel) continue;
    const names = new Map((value.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name ?? null]));
    for (const message of value.messages ?? []) {
      const body = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '';
      const { data, error } = await admin.rpc('wa_ingest_message', {
        p_organization_id: channel.organization_id, p_channel_id: channel.id,
        p_provider_message_id: message.id, p_provider_contact_id: message.from, p_phone: message.from,
        p_display_name: names.get(message.from) ?? null, p_message_type: message.type ?? 'unknown', p_body: body,
        p_received_at: new Date(Number(message.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
      });
      if (!error && data) accepted += 1;
    }
  }
  return json({ status: 'accepted', accepted });
});
