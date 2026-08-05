import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';
import { decideWithAi } from '../_shared/whatsapp/ai.ts';
import { sendWhatsAppText } from '../_shared/whatsapp/meta.ts';
import { routeInboundMessage } from '../_shared/whatsapp/routing.ts';
import { verifyInternalSecret } from '../_shared/whatsapp/security.ts';

async function handoff(admin: any, conversationId: string, input: { category: string; priority: string; teamKey: string; reason: string; confidence?: number | null }) {
  const { error } = await admin.rpc('wa_handover_conversation', {
    p_conversation_id: conversationId,
    p_category: input.category,
    p_priority: input.priority,
    p_team_key: input.teamKey,
    p_reason: input.reason,
    p_ai_confidence: input.confidence ?? null,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!verifyInternalSecret(request)) return json({ error: 'Unauthorized' }, 401);
  const input = await request.json().catch(() => null) as { conversationId?: string; messageId?: string } | null;
  const conversationId = input?.conversationId?.trim() ?? '';
  const messageId = input?.messageId?.trim() ?? '';
  if (!conversationId || !messageId) return json({ error: 'conversationId and messageId are required' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: claimed, error: claimError } = await admin.rpc('wa_claim_ai_run', { p_inbound_message_id: messageId });
  if (claimError) return json({ error: claimError.message }, 500);
  if (!claimed) return json({ status: 'duplicate' }, 200);

  try {
    const { data: conversation, error: conversationError } = await admin.from('wa_conversations')
      .select('id,organization_id,status,owner,service_window_expires_at,wa_organizations(name,ai_enabled,ai_confidence_threshold,default_language),wa_channels(phone_number_id,graph_version,is_active),wa_contacts(phone,display_name,language)')
      .eq('id', conversationId).single();
    if (conversationError || !conversation) throw conversationError || new Error('Conversation not found');
    if (conversation.status === 'resolved' || conversation.owner === 'human') {
      await admin.from('wa_ai_runs').update({ status: 'skipped', decision: { reason: 'human_or_resolved' }, completed_at: new Date().toISOString() }).eq('inbound_message_id', messageId);
      return json({ status: 'skipped' }, 200);
    }
    const organization = Array.isArray(conversation.wa_organizations) ? conversation.wa_organizations[0] : conversation.wa_organizations;
    const channel = Array.isArray(conversation.wa_channels) ? conversation.wa_channels[0] : conversation.wa_channels;
    const contact = Array.isArray(conversation.wa_contacts) ? conversation.wa_contacts[0] : conversation.wa_contacts;
    const { data: inbound, error: inboundError } = await admin.from('wa_messages').select('*').eq('id', messageId).eq('conversation_id', conversationId).single();
    if (inboundError || !inbound) throw inboundError || new Error('Inbound message not found');

    const deterministic = routeInboundMessage(inbound.body ?? '');
    if (deterministic.action === 'handoff') {
      await handoff(admin, conversationId, { ...deterministic, confidence: null });
      await admin.from('wa_ai_runs').update({ status: 'handoff', decision: deterministic, completed_at: new Date().toISOString() }).eq('inbound_message_id', messageId);
      return json({ status: 'handoff', reason: deterministic.reason }, 200);
    }
    if (!organization?.ai_enabled) {
      await handoff(admin, conversationId, { category: 'AI disabled', priority: 'normal', teamKey: 'customer-care', reason: 'AI is disabled for this organization.', confidence: 0 });
      await admin.from('wa_ai_runs').update({ status: 'handoff', decision: { reason: 'ai_disabled' }, completed_at: new Date().toISOString() }).eq('inbound_message_id', messageId);
      return json({ status: 'handoff', reason: 'ai_disabled' }, 200);
    }

    const [{ data: history }, { data: knowledge }] = await Promise.all([
      admin.from('wa_messages').select('sender_type,body').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12),
      admin.from('wa_knowledge_articles').select('title,content').eq('organization_id', conversation.organization_id).eq('is_active', true).limit(30),
    ]);
    const decision = await decideWithAi({
      organizationName: organization?.name ?? 'Spicy Meal',
      customerName: contact?.display_name ?? contact?.phone ?? 'Customer',
      customerLanguage: contact?.language ?? organization?.default_language ?? 'ar',
      latestMessage: inbound.body ?? '',
      recentMessages: (history ?? []).reverse(),
      knowledge: knowledge ?? [],
    });
    const threshold = Number(organization?.ai_confidence_threshold ?? 0.78);
    if (decision.action === 'handoff' || decision.confidence < threshold || !decision.reply.trim()) {
      await handoff(admin, conversationId, {
        category: decision.category,
        priority: decision.priority,
        teamKey: decision.teamKey,
        reason: decision.action === 'handoff' ? decision.reason : `AI confidence ${decision.confidence.toFixed(2)} is below threshold ${threshold.toFixed(2)}.`,
        confidence: decision.confidence,
      });
      await admin.from('wa_ai_runs').update({ status: 'handoff', decision, completed_at: new Date().toISOString() }).eq('inbound_message_id', messageId);
      return json({ status: 'handoff', confidence: decision.confidence }, 200);
    }
    if (!channel?.is_active || !channel.phone_number_id || !contact?.phone) throw new Error('WhatsApp channel is unavailable');
    const queuedAt = new Date().toISOString();
    const clientMessageId = crypto.randomUUID();
    const { data: queuedMessage, error: queueError } = await admin.from('wa_messages').insert({
      organization_id: conversation.organization_id,
      conversation_id: conversationId,
      client_message_id: clientMessageId,
      direction: 'outbound',
      sender_type: 'ai',
      sender_name: 'AI Assistant',
      message_type: 'text',
      body: decision.reply,
      delivery_status: 'queued',
      reply_to_provider_message_id: inbound.provider_message_id,
      created_at: queuedAt,
      status_updated_at: queuedAt,
    }).select('id').single();
    if (queueError || !queuedMessage) throw queueError || new Error('Unable to queue AI reply');

    let providerMessageId: string;
    try {
      providerMessageId = await sendWhatsAppText({
        phoneNumberId: channel.phone_number_id,
        to: contact.phone,
        body: decision.reply,
        graphVersion: channel.graph_version,
        replyToMessageId: inbound.provider_message_id,
      });
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : 'Meta send failed';
      await admin.from('wa_messages').update({ delivery_status: 'failed', delivery_error: { message: failure.slice(0, 300) }, status_updated_at: new Date().toISOString() }).eq('id', queuedMessage.id);
      throw cause;
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin.from('wa_messages').update({
      provider_message_id: providerMessageId,
      delivery_status: 'sent',
      status_updated_at: sentAt,
    }).eq('id', queuedMessage.id);
    if (updateError) {
      console.error('Meta accepted the AI reply but delivery tracking update failed', updateError.message);
      await handoff(admin, conversationId, {
        category: 'Delivery reconciliation',
        priority: 'high',
        teamKey: 'customer-care',
        reason: 'An AI reply was accepted by WhatsApp, but local delivery tracking requires reconciliation. Review before sending another reply.',
        confidence: decision.confidence,
      });
      await admin.from('wa_ai_runs').update({ status: 'failed', decision, error: 'Meta accepted reply; local tracking update failed', completed_at: sentAt }).eq('inbound_message_id', messageId);
      return json({ status: 'reconciliation_required' }, 202);
    }
    await admin.from('wa_conversations').update({ owner: 'ai', status: 'new', category: decision.category, ai_confidence: decision.confidence, handover_reason: null, last_message_at: sentAt }).eq('id', conversationId);
    await admin.from('wa_ai_runs').update({ status: 'replied', decision, completed_at: sentAt }).eq('inbound_message_id', messageId);
    return json({ status: 'replied', confidence: decision.confidence }, 200);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'Unknown orchestration error';
    console.error('WhatsApp orchestration failed', reason);
    await handoff(admin, conversationId, { category: 'Automation failure', priority: 'high', teamKey: 'customer-care', reason: 'Automation failed safely and transferred the conversation to a human.', confidence: 0 }).catch(() => undefined);
    await admin.from('wa_ai_runs').update({ status: 'failed', error: reason.slice(0, 500), completed_at: new Date().toISOString() }).eq('inbound_message_id', messageId);
    return json({ error: 'Automation failed safely; conversation handed to a human' }, 500);
  }
});
