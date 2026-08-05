import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Unauthorized' }, 401);
  const { conversationId, body } = await request.json();
  if (!conversationId || !String(body ?? '').trim()) return json({ error: 'conversationId and body are required' }, 400);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: conversation } = await userClient.from('wa_conversations').select('id,organization_id,contact_id,channel_id,status,assigned_agent_id,wa_contacts(phone),wa_channels(phone_number_id,graph_version,is_active)').eq('id', conversationId).single();
  if (!conversation) return json({ error: 'Conversation not found' }, 404);
  const channel: any = conversation.wa_channels;
  const contact: any = conversation.wa_contacts;
  const version = channel.graph_version || Deno.env.get('WHATSAPP_GRAPH_VERSION');
  if (!version || !channel.is_active) return json({ error: 'WhatsApp channel is not configured' }, 503);
  const response = await fetch(`https://graph.facebook.com/${version}/${channel.phone_number_id}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.phone, type: 'text', text: { preview_url: false, body: String(body).trim() } }),
  });
  const result = await response.json();
  if (!response.ok || !result.messages?.[0]?.id) return json({ error: result.error?.message ?? 'Meta send failed' }, 502);
  const now = new Date().toISOString();
  const { data: membership } = await userClient.from('wa_memberships').select('display_name').eq('organization_id', conversation.organization_id).eq('user_id', userData.user.id).single();
  const { data: message, error } = await admin.from('wa_messages').insert({ organization_id: conversation.organization_id, conversation_id: conversation.id, provider_message_id: result.messages[0].id, direction: 'outbound', sender_type: 'agent', sender_user_id: userData.user.id, sender_name: membership?.display_name ?? 'Agent', body: String(body).trim(), delivery_status: 'sent', created_at: now }).select('*').single();
  if (error) return json({ error: error.message }, 500);
  await admin.from('wa_conversations').update({ owner: 'human', status: 'assigned', assigned_agent_id: conversation.assigned_agent_id ?? userData.user.id, last_message_at: now, unread_count: 0 }).eq('id', conversation.id);
  return json({ message });
});
