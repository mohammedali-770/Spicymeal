import { demoKnowledge, demoMessages, demoSnapshot, demoUser } from '../demo';
import type { Conversation, InviteMemberInput, KnowledgeArticle, KnowledgeInput, Message, SessionUser, Snapshot, TeamMember } from '../types';
import { demoMode, functionsUrl, supabase } from './supabase';

let snapshot: Snapshot = structuredClone(demoSnapshot);
let messages: Record<string, Message[]> = structuredClone(demoMessages);
let knowledge: KnowledgeArticle[] = structuredClone(demoKnowledge);

function updateConversation(id: string, patch: Partial<Conversation>) {
  snapshot.conversations = snapshot.conversations.map((conversation) => conversation.id === id ? { ...conversation, ...patch } : conversation);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'WA';
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!functionsUrl) throw new Error('VITE_FUNCTIONS_URL is not configured');
  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${name} failed`);
  return payload as T;
}

export const repository = {
  async getSessionUser(): Promise<SessionUser | null> {
    if (demoMode) return structuredClone(demoUser);
    if (!supabase) return null;
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const authUser = sessionData.session?.user;
    if (!authUser) return null;
    const { data: profile, error } = await supabase.from('wa_my_profile').select('*').maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error('Your account is not assigned to the WhatsApp inbox');
    return {
      id: authUser.id,
      email: authUser.email ?? '',
      displayName: profile.display_name,
      initials: initials(profile.display_name),
      role: profile.role,
      organizationId: profile.organization_id,
      organizationName: profile.organization_name,
      online: profile.is_online,
    };
  },

  async signIn(email: string, password: string): Promise<void> {
    if (demoMode) return;
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    if (demoMode) return;
    if (!supabase) return;
    try { await supabase.rpc('wa_set_presence', { p_online: false }); } catch { /* sign-out still proceeds */ }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async setPresence(online: boolean): Promise<void> {
    if (demoMode) return;
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.rpc('wa_set_presence', { p_online: online });
    if (error) throw error;
  },

  async loadSnapshot(): Promise<Snapshot> {
    if (demoMode) return structuredClone(snapshot);
    if (!supabase) throw new Error('Supabase is not configured');
    const [{ data: conversations, error: conversationError }, { data: agents, error: agentError }, { data: members, error: memberError }] = await Promise.all([
      supabase.from('wa_inbox').select('*').order('last_message_at', { ascending: false }),
      supabase.from('wa_agent_workload').select('*').order('display_name'),
      supabase.from('wa_team_directory').select('*').order('display_name'),
    ]);
    if (conversationError) throw conversationError;
    if (agentError) throw agentError;
    if (memberError) throw memberError;
    return {
      conversations: (conversations ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        customerName: row.customer_name,
        phone: row.phone,
        initials: initials(String(row.customer_name || row.phone || 'WA')),
        status: row.status,
        owner: row.owner,
        priority: row.priority,
        category: row.category,
        teamName: row.team_name,
        assignedAgentId: row.assigned_agent_id,
        assignedAgentName: row.assigned_agent_name,
        unreadCount: row.unread_count,
        lastMessage: row.last_message || '',
        lastMessageAt: row.last_message_at,
        language: row.language === 'ar' ? 'ar' : 'en',
        aiConfidence: row.ai_confidence,
        handoverReason: row.handover_reason,
        tags: row.tags || [],
      })),
      agents: (agents ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        name: row.display_name,
        initials: initials(row.display_name),
        team: row.team_name,
        online: row.online,
        activeCount: Number(row.active_count || 0),
      })),
      members: (members ?? []).map((row: Record<string, any>) => ({
        id: row.id,
        name: row.display_name,
        initials: initials(row.display_name),
        team: row.team_name,
        online: row.online,
        activeCount: Number(row.active_count || 0),
        role: row.role,
        email: row.email,
      })) as TeamMember[],
    };
  },

  async loadMessages(conversationId: string): Promise<Message[]> {
    if (demoMode) return structuredClone(messages[conversationId] ?? []);
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.from('wa_messages').select('*').eq('conversation_id', conversationId).order('created_at');
    if (error) throw error;
    return (data ?? []).map((row: Record<string, any>) => ({
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction,
      senderType: row.sender_type,
      senderName: row.sender_name ?? row.sender_type,
      body: row.body,
      createdAt: row.created_at,
      deliveryStatus: row.delivery_status,
      isNote: row.is_internal_note,
    }));
  },

  async assign(conversationId: string, agentId: string | null): Promise<void> {
    if (demoMode) {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId) ?? null;
      updateConversation(conversationId, {
        owner: agent ? 'human' : 'unassigned',
        status: agent ? 'assigned' : 'queued',
        assignedAgentId: agent?.id ?? null,
        assignedAgentName: agent?.name ?? null,
        unreadCount: 0,
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
      const message: Message = {
        id: crypto.randomUUID(), conversationId, direction: 'outbound', senderType: 'agent', senderName: 'You',
        body, createdAt: new Date().toISOString(), deliveryStatus: 'sent',
      };
      messages[conversationId] = [...(messages[conversationId] ?? []), message];
      updateConversation(conversationId, { owner: 'human', status: 'assigned', lastMessage: body, lastMessageAt: message.createdAt, unreadCount: 0 });
      return structuredClone(message);
    }
    const payload = await callFunction<{ message: Record<string, any> }>('whatsapp-send', {
      conversationId,
      body,
      clientMessageId: crypto.randomUUID(),
    });
    const row = payload.message;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      direction: row.direction,
      senderType: row.sender_type,
      senderName: row.sender_name ?? 'Agent',
      body: row.body,
      createdAt: row.created_at,
      deliveryStatus: row.delivery_status,
      isNote: row.is_internal_note,
    };
  },

  async loadKnowledge(): Promise<KnowledgeArticle[]> {
    if (demoMode) return structuredClone(knowledge);
    if (!supabase) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.from('wa_knowledge_articles').select('id,title,content,language,is_active').order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, any>) => ({ id: row.id, title: row.title, content: row.content, language: row.language, active: row.is_active }));
  },

  async saveKnowledge(input: KnowledgeInput): Promise<void> {
    if (demoMode) {
      if (input.id) knowledge = knowledge.map((article) => article.id === input.id ? { id: input.id!, title: input.title, content: input.content, language: input.language, active: input.active } : article);
      else knowledge = [{ id: crypto.randomUUID(), title: input.title, content: input.content, language: input.language, active: input.active }, ...knowledge];
      return;
    }
    if (!supabase) throw new Error('Supabase is not configured');
    const row = { organization_id: input.organizationId, title: input.title.trim(), content: input.content.trim(), language: input.language, is_active: input.active };
    const query = input.id ? supabase.from('wa_knowledge_articles').update(row).eq('id', input.id) : supabase.from('wa_knowledge_articles').insert(row);
    const { error } = await query;
    if (error) throw error;
  },

  async deleteKnowledge(id: string): Promise<void> {
    if (demoMode) { knowledge = knowledge.filter((article) => article.id !== id); return; }
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.from('wa_knowledge_articles').delete().eq('id', id);
    if (error) throw error;
  },

  async inviteMember(input: InviteMemberInput & { organizationId: string }): Promise<void> {
    if (demoMode) {
      const id = crypto.randomUUID();
      snapshot.members.push({ id, name: input.displayName, initials: initials(input.displayName), team: input.teamKey === 'complaints' ? 'Complaints' : 'Customer Care', online: false, activeCount: 0, role: input.role, email: input.email });
      if (input.role !== 'viewer') snapshot.agents.push({ id, name: input.displayName, initials: initials(input.displayName), team: input.teamKey === 'complaints' ? 'Complaints' : 'Customer Care', online: false, activeCount: 0 });
      return;
    }
    await callFunction('whatsapp-team-admin', input);
  },

  subscribe(callback: () => void): () => void {
    if (demoMode || !supabase) return () => undefined;
    const channel = supabase.channel('wa-inbox-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_memberships' }, callback)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
};
