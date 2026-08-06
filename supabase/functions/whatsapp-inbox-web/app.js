import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';

const PROJECT_URL = 'https://daifcmqjtkmkxxxnnyos.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_vFjCrktsy1JyidvMIo1CXg_Ox7VioRv';
const supabase = createClient(PROJECT_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const initials = (name) => String(name || 'WA').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'WA';
const relative = (iso) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
};

let profile = null;
let conversations = [];
let agents = [];
let members = [];
let selectedId = null;
let activeFilter = 'all';
let searchQuery = '';
let realtimeChannel = null;

function reportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  window.alert(message);
}

async function currentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function invokeFunction(name, body) {
  const session = await currentSession();
  if (!session) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`${PROJECT_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${name} failed`);
  return payload;
}

function showSignedOut() {
  byId('login').classList.remove('hidden');
  byId('app').classList.add('hidden');
}

function showSignedIn() {
  byId('login').classList.add('hidden');
  byId('app').classList.remove('hidden');
}

async function initialize() {
  const session = await currentSession();
  if (!session) {
    showSignedOut();
    return;
  }

  const { data, error } = await supabase.from('wa_my_profile').select('*').maybeSingle();
  if (error) throw error;
  if (!data) {
    await supabase.auth.signOut();
    throw new Error('This account is not assigned to the WhatsApp inbox.');
  }

  profile = { ...data, id: session.user.id, email: session.user.email };
  byId('user-name').textContent = data.display_name;
  byId('user-role').textContent = data.role;
  byId('user-initials').textContent = initials(data.display_name);
  byId('team-button').classList.toggle('hidden', data.role !== 'admin');
  byId('knowledge-button').classList.toggle('hidden', !['admin', 'supervisor'].includes(data.role));
  showSignedIn();
  await supabase.rpc('wa_set_presence', { p_online: true }).catch(() => undefined);
  await loadInbox();
  startRealtime();
}

async function loadInbox() {
  const [conversationResult, agentResult, memberResult] = await Promise.all([
    supabase.from('wa_inbox').select('*').order('last_message_at', { ascending: false }),
    supabase.from('wa_agent_workload').select('*').order('display_name'),
    supabase.from('wa_team_directory').select('*').order('display_name'),
  ]);
  if (conversationResult.error) throw conversationResult.error;
  if (agentResult.error) throw agentResult.error;
  if (memberResult.error) throw memberResult.error;
  conversations = conversationResult.data || [];
  agents = agentResult.data || [];
  members = memberResult.data || [];
  if (selectedId && !conversations.some((conversation) => conversation.id === selectedId)) selectedId = null;
  renderConversationList();
  if (selectedId) await renderSelectedConversation();
}

function filteredConversations() {
  const needle = searchQuery.trim().toLowerCase();
  return conversations.filter((conversation) => {
    const matchesFilter = activeFilter === 'all'
      || (activeFilter === 'unassigned' && conversation.owner === 'unassigned')
      || (activeFilter === 'mine' && conversation.assigned_agent_id === profile.id)
      || (activeFilter === 'ai' && conversation.owner === 'ai')
      || (activeFilter === 'urgent' && conversation.priority === 'urgent');
    const haystack = `${conversation.customer_name} ${conversation.phone} ${conversation.last_message || ''} ${conversation.category}`.toLowerCase();
    return matchesFilter && (!needle || haystack.includes(needle));
  });
}

function renderConversationList() {
  const filtered = filteredConversations();
  byId('all-count').textContent = conversations.filter((conversation) => conversation.status !== 'resolved').length;
  byId('queue-count').textContent = conversations.filter((conversation) => conversation.owner === 'unassigned').length;
  byId('mine-count').textContent = conversations.filter((conversation) => conversation.assigned_agent_id === profile.id).length;
  byId('ai-count').textContent = conversations.filter((conversation) => conversation.owner === 'ai').length;
  byId('urgent-count').textContent = conversations.filter((conversation) => conversation.priority === 'urgent').length;
  byId('chat-count').textContent = `${filtered.length} chats`;
  byId('cards').innerHTML = filtered.map((conversation) => `
    <button class="card ${selectedId === conversation.id ? 'selected' : ''}" data-id="${conversation.id}">
      <span class="avatar">${escapeHtml(initials(conversation.customer_name))}</span>
      <span class="summary">
        <span class="title"><strong>${escapeHtml(conversation.customer_name)}</strong><time>${relative(conversation.last_message_at)}</time></span>
        <small>${escapeHtml(conversation.category)} · ${escapeHtml(conversation.owner === 'human' ? (conversation.assigned_agent_name || 'Human') : conversation.owner === 'ai' ? 'AI' : 'Queue')}</small>
        <p dir="${conversation.language === 'ar' ? 'rtl' : 'ltr'}">${escapeHtml(conversation.last_message || '')}</p>
        <span class="tag ${escapeHtml(conversation.priority)}">${escapeHtml(conversation.priority)}</span>
        ${conversation.unread_count ? `<span class="tag">${conversation.unread_count}</span>` : ''}
      </span>
    </button>`).join('');
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', async () => {
      selectedId = card.dataset.id;
      renderConversationList();
      await renderSelectedConversation().catch(reportError);
    });
  });
}

async function executeAction(action) {
  const { error } = await action();
  if (error) throw error;
  await loadInbox();
}

async function renderSelectedConversation() {
  const conversation = conversations.find((item) => item.id === selectedId);
  if (!conversation) return;
  const { data: messages, error } = await supabase.from('wa_messages').select('*').eq('conversation_id', conversation.id).order('created_at');
  if (error) throw error;
  const canWrite = profile.role !== 'viewer' && conversation.status !== 'resolved';
  const canReassign = ['admin', 'supervisor'].includes(profile.role);

  byId('chat').innerHTML = `
    <header class="chat-head">
      <div><span class="avatar">${escapeHtml(initials(conversation.customer_name))}</span><span><h2>${escapeHtml(conversation.customer_name)}</h2><small>${escapeHtml(conversation.phone)} · ${escapeHtml(conversation.category)}</small></span></div>
      <div class="chat-actions">
        ${conversation.owner === 'unassigned' && profile.role !== 'viewer' ? '<button id="take-chat" class="take">Take chat</button>' : ''}
        <select id="agent-select" ${canReassign ? '' : 'disabled'}><option value="">Unassigned</option>${agents.map((agent) => `<option value="${agent.id}" ${agent.id === conversation.assigned_agent_id ? 'selected' : ''}>${escapeHtml(agent.display_name)}${agent.online ? ' · online' : ''}</option>`).join('')}</select>
        <button id="state-button" ${profile.role === 'viewer' ? 'disabled' : ''}>${conversation.status === 'resolved' ? 'Return to AI' : 'Resolve'}</button>
      </div>
    </header>
    <section id="message-list" class="messages">${(messages || []).map((message) => `
      <article class="bubble ${escapeHtml(message.direction)} ${message.is_internal_note ? 'internal' : ''}" dir="${/[\u0600-\u06FF]/.test(message.body) ? 'rtl' : 'ltr'}">
        <small>${escapeHtml(message.sender_name || message.sender_type)}</small><p>${escapeHtml(message.body)}</p>
        <time>${new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${escapeHtml(message.delivery_status)}</time>
      </article>`).join('')}</section>
    <form id="composer" class="composer"><small>Human mode: AI is paused when a staff member replies.</small><div><textarea id="reply" rows="2" placeholder="${canWrite ? 'Write a WhatsApp reply…' : 'Conversation is read-only'}" ${canWrite ? '' : 'disabled'}></textarea><button ${canWrite ? '' : 'disabled'}>Send</button></div></form>`;

  byId('context').innerHTML = `
    <small class="eyebrow">CUSTOMER CONTEXT</small><h2>Details</h2>
    <section class="panel customer"><span class="avatar large">${escapeHtml(initials(conversation.customer_name))}</span><h3>${escapeHtml(conversation.customer_name)}</h3><p>${escapeHtml(conversation.phone)}</p></section>
    <section class="panel"><dl><div><dt>Status</dt><dd>${escapeHtml(conversation.status)}</dd></div><div><dt>Owner</dt><dd>${escapeHtml(conversation.owner)}</dd></div><div><dt>Team</dt><dd>${escapeHtml(conversation.team_name || 'Not routed')}</dd></div><div><dt>Agent</dt><dd>${escapeHtml(conversation.assigned_agent_name || 'Unassigned')}</dd></div><div><dt>Language</dt><dd>${escapeHtml(conversation.language)}</dd></div></dl></section>
    ${conversation.handover_reason ? `<section class="panel handover"><b>AI handover</b><p>${escapeHtml(conversation.handover_reason)}</p></section>` : ''}
    <section class="panel"><b>Automation boundary</b><p class="muted">AI cannot approve money movement, cancel orders, or disclose private order information without verified human handling.</p></section>`;

  const messageList = byId('message-list');
  messageList.scrollTop = messageList.scrollHeight;
  if (byId('take-chat')) {
    byId('take-chat').addEventListener('click', () => executeAction(() => supabase.rpc('wa_assign_conversation', { p_conversation_id: conversation.id, p_agent_id: profile.id })).catch(reportError));
  }
  byId('agent-select').addEventListener('change', (event) => {
    const agentId = event.target.value;
    const request = agentId
      ? () => supabase.rpc('wa_assign_conversation', { p_conversation_id: conversation.id, p_agent_id: agentId })
      : () => supabase.rpc('wa_unassign_conversation', { p_conversation_id: conversation.id });
    executeAction(request).catch(reportError);
  });
  byId('state-button').addEventListener('click', () => {
    const request = conversation.status === 'resolved'
      ? () => supabase.rpc('wa_return_to_ai', { p_conversation_id: conversation.id })
      : () => supabase.rpc('wa_resolve_conversation', { p_conversation_id: conversation.id });
    executeAction(request).catch(reportError);
  });
  byId('composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = byId('reply').value.trim();
    if (!body) return;
    try {
      await invokeFunction('whatsapp-send', { conversationId: conversation.id, body, clientMessageId: crypto.randomUUID() });
      byId('reply').value = '';
      await loadInbox();
    } catch (sendError) {
      reportError(sendError);
    }
  });
}

function startRealtime() {
  if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel('wa-inbox-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => loadInbox().catch(console.error))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, () => loadInbox().catch(console.error))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_memberships' }, () => loadInbox().catch(console.error))
    .subscribe();
}

function openModal(title, content) {
  byId('modal-title').textContent = title;
  byId('modal-content').innerHTML = content;
  byId('modal').classList.remove('hidden');
}
function closeModal() { byId('modal').classList.add('hidden'); }

function fillKnowledgeForm(article) {
  byId('knowledge-id').value = article?.id || '';
  byId('knowledge-title').value = article?.title || '';
  byId('knowledge-content').value = article?.content || '';
  byId('knowledge-language').value = article?.language || 'both';
  byId('knowledge-active').checked = article?.is_active ?? true;
}

async function openKnowledge() {
  const { data, error } = await supabase.from('wa_knowledge_articles').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  openModal('Approved AI knowledge', `<div class="modal-grid"><section><button id="new-knowledge" class="wide">New article</button>${(data || []).map((article) => `<div class="item"><b>${escapeHtml(article.title)}</b><small>${escapeHtml(article.language)} · ${article.is_active ? 'active' : 'paused'}</small><div class="item-actions"><button class="edit-knowledge" data-id="${article.id}">Edit</button><button class="delete-knowledge danger" data-id="${article.id}">Delete</button></div></div>`).join('')}</section><section><form id="knowledge-form"><input id="knowledge-id" type="hidden"><label>Title<input id="knowledge-title" required></label><label>Language<select id="knowledge-language"><option value="both">Arabic & English</option><option value="ar">Arabic</option><option value="en">English</option></select></label><label>Approved content<textarea id="knowledge-content" rows="12" required></textarea></label><label class="check"><input id="knowledge-active" type="checkbox" checked> Active for AI</label><button class="primary wide">Save knowledge</button></form></section></div>`);
  byId('new-knowledge').addEventListener('click', () => fillKnowledgeForm(null));
  document.querySelectorAll('.edit-knowledge').forEach((button) => button.addEventListener('click', () => fillKnowledgeForm(data.find((article) => article.id === button.dataset.id))));
  document.querySelectorAll('.delete-knowledge').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Delete this approved article?')) return;
    const result = await supabase.from('wa_knowledge_articles').delete().eq('id', button.dataset.id);
    if (result.error) reportError(result.error); else await openKnowledge();
  }));
  byId('knowledge-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = byId('knowledge-id').value;
    const row = {
      organization_id: profile.organization_id,
      title: byId('knowledge-title').value.trim(),
      content: byId('knowledge-content').value.trim(),
      language: byId('knowledge-language').value,
      is_active: byId('knowledge-active').checked,
    };
    const result = id
      ? await supabase.from('wa_knowledge_articles').update(row).eq('id', id)
      : await supabase.from('wa_knowledge_articles').insert(row);
    if (result.error) reportError(result.error); else await openKnowledge();
  });
}

function openTeam() {
  openModal('Team accounts', `<div class="modal-grid"><section>${members.map((member) => `<div class="item"><b>${escapeHtml(member.display_name)}</b><small>${escapeHtml(member.team_name)} · ${escapeHtml(member.role)} · ${member.online ? 'online' : 'offline'}</small></div>`).join('')}</section><section><form id="invite-form"><label>Name<input id="invite-name" required></label><label>Email<input id="invite-email" type="email" required></label><label>Role<select id="invite-role"><option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><label>Routing team<select id="invite-team"><option value="customer-care">Customer Care</option><option value="complaints">Complaints</option></select></label><button class="primary wide">Send invitation</button></form></section></div>`);
  byId('invite-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await invokeFunction('whatsapp-team-admin', {
        organizationId: profile.organization_id,
        email: byId('invite-email').value.trim(),
        displayName: byId('invite-name').value.trim(),
        role: byId('invite-role').value,
        teamKey: byId('invite-team').value,
      });
      window.alert('Invitation sent.');
      closeModal();
      await loadInbox();
    } catch (inviteError) {
      reportError(inviteError);
    }
  });
}

byId('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  byId('login-error').classList.add('hidden');
  const { error } = await supabase.auth.signInWithPassword({ email: byId('email').value.trim(), password: byId('password').value });
  if (error) {
    byId('login-error').textContent = error.message;
    byId('login-error').classList.remove('hidden');
  } else {
    await initialize().catch(reportError);
  }
});
byId('logout-button').addEventListener('click', async () => {
  await supabase.rpc('wa_set_presence', { p_online: false }).catch(() => undefined);
  await supabase.auth.signOut();
  window.location.reload();
});
byId('password-button').addEventListener('click', async () => {
  const password = window.prompt('Enter a new password with at least 8 characters:');
  if (!password) return;
  if (password.length < 8) { window.alert('Password is too short.'); return; }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) reportError(error); else window.alert('Password changed successfully.');
});
byId('refresh-button').addEventListener('click', () => loadInbox().catch(reportError));
byId('search').addEventListener('input', (event) => { searchQuery = event.target.value; renderConversationList(); });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  activeFilter = button.dataset.filter;
  renderConversationList();
}));
byId('knowledge-button').addEventListener('click', () => openKnowledge().catch(reportError));
byId('team-button').addEventListener('click', openTeam);
byId('modal-close').addEventListener('click', closeModal);
byId('modal').addEventListener('click', (event) => { if (event.target === byId('modal')) closeModal(); });

initialize().catch(reportError);
