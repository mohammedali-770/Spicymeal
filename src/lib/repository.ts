import { demoMessages, demoSnapshot } from '../demo';
import type { Conversation, Message, Snapshot } from '../types';
import { demoMode, functionsUrl, supabase } from './supabase';

let snapshot: Snapshot = structuredClone(demoSnapshot);
let messages: Record<string, Message[]> = structuredClone(demoMessages);

function updateConversation(id: string, patch: Partial<Conversation>) {
  snapshot.conversations = snapshot.conversations.map((c) => c.id === id ? { ...c, ...patch } : c);
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export const repository = {
  async loadSnapshot(): Promise<Snapshot> {
    if (demoMode) return structuredClone(snapshot);
    if (!supabase) throw new Error('Supabase is not configured');
    const [{ data: conversations, error: cError }, { data: agents, error: aError }] = await Promise.all([
      supabase.from('wa_inbox').select('*').order('last_message_at', { ascending: false }),
      supabase.from('wa_agent_workload').select('*').order('display_name'),
    ]);
    if (cError) throw cError;
    if (aError) throw aError;
    return {
      conversations: (conversations ?? []).map((row: any) => ({
        id: row.id, customerName: row.customer_name, phone: row.phone,
        initials: String(row.customer_name || row.phone || 'WA').split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase(),
        status: row.status, owner: row.owner, priority: row.priority, category: row.category,
        assignedAgentId: row.assigned_agent_id, assignedAgentName: row.assigned_agent_name,
        unreadCount: row.unread_count, lastMessage: row.last_message || '', lastMessageAt: row.last_message_at,
        language: row.language === 'ar' ? 'ar' : 'en', aiConfidence: row.ai_confidence,
        handoverReason: row.handover_reason, tags: row.tags || [],
      })),
      agents: (agents ?? []).map((row: any) => ({
        id: row.id, name: row.name, initials: row.initials, team: row.team, online: row.online, activeCount: row.active_count,
      })),
    };
  },

  async loadMessages(conversationId: string): Promise<Message[]> {
    if (demoMode) return structuredClone(messages[conversationId] ?? []);
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.from('wa_messages').select('*').eq('conversation_id', conversationId).order('created_at');
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id, conversationId: row.conversation_id, direction: row.direction,
      senderType: row.sender_type, senderName: row.sender_name ?? row.sender_type,
      body: row.body, createdAt: row.created_at, deliveryStatus: row.delivery_status,
      isNote: row.is_internal_note,
    }));
  },

  async assign(conversationId: string, agentId: string | null): Promise<void> {
    if (demoMode) {
      const agent = snapshot.agents.find((a) => a.id === agentId) ?? null;
      updateConversation(conversationId, {
        owner: agent ? 'human' : 'unassigned', status: agent ? 'assigned' : 'queued',
        assignedAgentId: agent?.id ?? null, assignedAgentName: agent?.name ?? null, unreadCount: 0,
      });
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const rpc = agentId ? 'wa_assign_conversation' : 'wa_unassign_conversation';
    const args = agentId ? { p_conversation_id: conversationId, p_agent_id: agentId } : { p_conversation_id: conversationId };
    const { error } = await supabase.rpc(rpc, args);
    if (error) throw error;
  },

  async resolve(conversationId: string): Promise<void> {
    if (demoMode) return updateConversation(conversationId, { status: 'resolved', unreadCount: 0 });
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.rpc('wa_resolve_conversation', { p_conversation_id: conversationId });
    if (error) throw error;
  },

  async returnToAi(conversationId: string): Promise<void> {
    if (demoMode) return updateConversation(conversationId, { owner: 'ai', status: 'new', assignedAgentId: null, assignedAgentName: null, handoverReason: null });
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.rpc('wa_return_to_ai', { p_conversation_id: conversationId });
    if (error) throw error;
  },

  async send(conversationId: string, body: string): Promise<Message> {
    if (demoMode) {
      const msg: Message = { id: crypto.randomUUID(), conversationId, direction: 'outbound', senderType: 'agent', senderName: 'You', body, createdAt: new Date().toISOString(), deliveryStatus: 'sent' };
      messages[conversationId] = [...(messages[conversationId] ?? []), msg];
      updateConversation(conversationId, { owner: 'human', status: 'assigned', lastMessage: body, lastMessageAt: msg.createdAt, unreadCount: 0 });
      return structuredClone(msg);
    }
    const response = await fetch(`${functionsUrl}/whatsapp-send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ conversationId, body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to send WhatsApp message');
    return payload.message as Message;
  },

  subscribe(callback: () => void): () => void {
    if (demoMode || !supabase) return () => undefined;
    const channel = supabase.channel('wa-inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, callback).subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
};
