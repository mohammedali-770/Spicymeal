import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { sendWhatsAppText } from '../_shared/whatsapp/meta.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401, request);
  const input = await request.json().catch(() => null) as { conversationId?: string; body?: string; clientMessageId?: string } | null;
  const conversationId = input?.conversationId?.trim() ?? '';
  const body = input?.body?.trim() ?? '';
  const clientMessageId = input?.clientMessageId?.trim() ?? '';
  if (!conversationId || !body || !/^[0-9a-f-]{36}$/i.test(clientMessageId)) return json({ error: 'conversationId, body and clientMessageId are required' }, 400, request);
  if (body.length > 4096) return json({ error: 'Message exceeds the WhatsApp text limit' }, 400, request);

  const { data: conversation, error: conversationError } = await userClient.from('wa_conversations')
    .select('id,organization_id,status,assigned_agent_id,service_window_expires_at,wa_contacts(phone),wa_channels(phone_number_id,graph_version,is_active)')
    .eq('id', conversationId).single();
  if (conversationError || !conversation) return json({ error: 'Conversation not found' }, 404, request);
  const { data: membership } = await userClient.from('wa_memberships').select('display_name,role').eq('organization_id', conversation.organization_id).eq('user_id', userData.user.id).single();
  if (!membership || membership.role === 'viewer') return json({ error: 'This account cannot send messages' }, 403, request);
  if (membership.role === 'agent' && conversation.assigned_agent_id !== userData.user.id) {
    return json({ error: conversation.assigned_agent_id ? 'Conversation is assigned to another agent' : 'Take the conversation before replying' }, 409, request);
  }
  if (conversation.status === 'resolved') return json({ error: 'Conversation is resolved' }, 409, request);
  if (!conversation.service_window_expires_at || new Date(conversation.service_window_expires_at).getTime() < Date.now()) {
    return json({ error: 'Customer-service window is closed. Use an approved WhatsApp template.' }, 409, request);
  }

  const channel = Array.isArray(conversation.wa_channels) ? conversation.wa_channels[0] : conversation.wa_channels;
  const contact = Array.isArray(conversation.wa_contacts) ? conversation.wa_contacts[0] : conversation.wa_contacts;
  if (!channel?.is_active || !channel.phone_number_id || !contact?.phone) return json({ error: 'WhatsApp channel is not configured' }, 503, request);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date().toISOString();
  const { data: existing } = await admin.from('wa_messages').select('*').eq('client_message_id', clientMessageId).maybeSingle();
  if (existing) return json({ message: existing }, 200, request);
  const { data: queued, error: queueError } = await admin.from('wa_messages').insert({
    organization_id: conversation.organization_id, conversation_id: conversation.id, client_message_id: clientMessageId,
    direction: 'outbound', sender_type: 'agent', sender_user_id: userData.user.id, sender_name: membership.display_name,
    body, delivery_status: 'queued', created_at: now, status_updated_at: now,
  }).select('*').single();
  if (queueError || !queued) {
    if (queueError?.code === '23505') {
      const { data: duplicate } = await admin.from('wa_messages').select('*').eq('client_message_id', clientMessageId).maybeSingle();
      if (duplicate) return json({ message: duplicate }, 200, request);
    }
    return json({ error: queueError?.message || 'Unable to queue message' }, 500, request);
  }

  try {
    const providerMessageId = await sendWhatsAppText({ phoneNumberId: channel.phone_number_id, to: contact.phone, body, graphVersion: channel.graph_version });
    const sentAt = new Date().toISOString();
    const { data: message, error: updateError } = await admin.from('wa_messages').update({ provider_message_id: providerMessageId, delivery_status: 'sent', status_updated_at: sentAt }).eq('id', queued.id).select('*').single();
    if (updateError || !message) {
      console.error('Meta accepted the message but local update failed', updateError?.message);
      await admin.from('wa_audit_log').insert({
        organization_id: conversation.organization_id,
        conversation_id: conversation.id,
        actor_user_id: userData.user.id,
        actor_type: 'user',
        action: 'delivery_reconciliation_required',
        details: { local_message_id: queued.id, provider_message_id: providerMessageId },
      });
      return json({ message: { ...queued, provider_message_id: providerMessageId, delivery_status: 'sent', status_updated_at: sentAt }, warning: 'Delivery tracking requires reconciliation.' }, 202, request);
    }
    await admin.from('wa_conversations').update({ owner: 'human', status: 'assigned', assigned_agent_id: conversation.assigned_agent_id ?? userData.user.id, last_message_at: sentAt, unread_count: 0 }).eq('id', conversation.id);
    return json({ message }, 200, request);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'Meta send failed';
    await admin.from('wa_messages').update({ delivery_status: 'failed', delivery_error: { message: reason.slice(0, 300) }, status_updated_at: new Date().toISOString() }).eq('id', queued.id);
    return json({ error: reason }, 502, request);
  }
});
