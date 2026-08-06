import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';

const URL = 'https://daifcmqjtkmkxxxnnyos.supabase.co';
const KEY = 'sb_publishable_vFjCrktsy1JyidvMIo1CXg_Ox7VioRv';
const sb = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const q = (id) => document.getElementById(id);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || 'WA').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'WA';
const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const fail = (error) => alert(error instanceof Error ? error.message : String(error));

let me = null;
let chats = [];
let agents = [];
let members = [];
let selected = null;
let filter = 'all';
let search = '';

async function session() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function invoke(name, body) {
  const current = await session();
  if (!current) throw new Error('Session expired.');
  const response = await fetch(`${URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${current.access_token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `${name} failed`);
  return payload;
}

async function boot() {
  const current = await session();
  if (!current) { q('login').classList.remove('hidden'); q('app').classList.add('hidden'); return; }
  const { data, error } = await sb.from('wa_my_profile').select('*').maybeSingle();
  if (error) throw error;
  if (!data) { await sb.auth.signOut(); throw new Error('Account is not assigned to this inbox.'); }
  me = { ...data, id: current.user.id };
  q('user-name').textContent = data.display_name;
  q('user-role').textContent = data.role;
  q('user-initials').textContent = initials(data.display_name);
  q('team-button').classList.toggle('hidden', data.role !== 'admin');
  q('knowledge-button').classList.toggle('hidden', !['admin', 'supervisor'].includes(data.role));
  q('login').classList.add('hidden'); q('app').classList.remove('hidden');
  await sb.rpc('wa_set_presence', { p_online: true }).catch(() => undefined);
  await load();
  sb.channel('wa-live').on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversations' }, () => load().catch(console.error)).on('postgres_changes', { event: '*', schema: 'public', table: 'wa_messages' }, () => load().catch(console.error)).subscribe();
}

async function load() {
  const [c, a, m] = await Promise.all([
    sb.from('wa_inbox').select('*').order('last_message_at', { ascending: false }),
    sb.from('wa_agent_workload').select('*').order('display_name'),
    sb.from('wa_team_directory').select('*').order('display_name'),
  ]);
  if (c.error) throw c.error; if (a.error) throw a.error; if (m.error) throw m.error;
  chats = c.data || []; agents = a.data || []; members = m.data || [];
  if (selected && !chats.some((chat) => chat.id === selected)) selected = null;
  renderList();
  if (selected) await renderChat();
}

function visibleChats() {
  const needle = search.trim().toLowerCase();
  return chats.filter((chat) => {
    const ok = filter === 'all' || filter === 'unassigned' && chat.owner === 'unassigned' || filter === 'mine' && chat.assigned_agent_id === me.id || filter === 'ai' && chat.owner === 'ai' || filter === 'urgent' && chat.priority === 'urgent';
    return ok && (!needle || `${chat.customer_name} ${chat.phone} ${chat.last_message || ''} ${chat.category}`.toLowerCase().includes(needle));
  });
}

function renderList() {
  const list = visibleChats();
  q('all-count').textContent = chats.filter((chat) => chat.status !== 'resolved').length;
  q('queue-count').textContent = chats.filter((chat) => chat.owner === 'unassigned').length;
  q('mine-count').textContent = chats.filter((chat) => chat.assigned_agent_id === me.id).length;
  q('ai-count').textContent = chats.filter((chat) => chat.owner === 'ai').length;
  q('urgent-count').textContent = chats.filter((chat) => chat.priority === 'urgent').length;
  q('chat-count').textContent = `${list.length} chats`;
  q('cards').innerHTML = list.map((chat) => `<button class="card ${selected === chat.id ? 'selected' : ''}" data-id="${chat.id}"><span class="avatar">${safe(initials(chat.customer_name))}</span><span class="summary"><span class="title"><strong>${safe(chat.customer_name)}</strong><time>${ago(chat.last_message_at)}</time></span><small>${safe(chat.category)} · ${safe(chat.owner === 'human' ? chat.assigned_agent_name || 'Human' : chat.owner === 'ai' ? 'AI' : 'Queue')}</small><p dir="${chat.language === 'ar' ? 'rtl' : 'ltr'}">${safe(chat.last_message || '')}</p><span class="tag ${safe(chat.priority)}">${safe(chat.priority)}</span>${chat.unread_count ? `<span class="tag">${chat.unread_count}</span>` : ''}</span></button>`).join('');
  document.querySelectorAll('.card').forEach((card) => card.onclick = async () => { selected = card.dataset.id; renderList(); await renderChat().catch(fail); });
}

async function mutate(request) {
  const { error } = await request();
  if (error) throw error;
  await load();
}

async function renderChat() {
  const chat = chats.find((item) => item.id === selected);
  if (!chat) return;
  const { data, error } = await sb.from('wa_messages').select('*').eq('conversation_id', chat.id).order('created_at');
  if (error) throw error;
  const writable = me.role !== 'viewer' && chat.status !== 'resolved';
  const canAssign = ['admin', 'supervisor'].includes(me.role);
  q('chat').innerHTML = `<header class="chat-head"><div><span class="avatar">${safe(initials(chat.customer_name))}</span><span><h2>${safe(chat.customer_name)}</h2><small>${safe(chat.phone)} · ${safe(chat.category)}</small></span></div><div class="chat-actions">${chat.owner === 'unassigned' && me.role !== 'viewer' ? '<button id="take-chat" class="take">Take chat</button>' : ''}<select id="agent-select" ${canAssign ? '' : 'disabled'}><option value="">Unassigned</option>${agents.map((agent) => `<option value="${agent.id}" ${agent.id === chat.assigned_agent_id ? 'selected' : ''}>${safe(agent.display_name)}${agent.online ? ' · online' : ''}</option>`).join('')}</select><button id="state-button" ${me.role === 'viewer' ? 'disabled' : ''}>${chat.status === 'resolved' ? 'Return to AI' : 'Resolve'}</button></div></header><section id="message-list" class="messages">${(data || []).map((msg) => `<article class="bubble ${safe(msg.direction)} ${msg.is_internal_note ? 'internal' : ''}" dir="${/[\u0600-\u06FF]/.test(msg.body) ? 'rtl' : 'ltr'}"><small>${safe(msg.sender_name || msg.sender_type)}</small><p>${safe(msg.body)}</p><time>${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${safe(msg.delivery_status)}</time></article>`).join('')}</section><form id="composer" class="composer"><small>Human mode: AI is paused when staff replies.</small><div><textarea id="reply" rows="2" placeholder="${writable ? 'Write a WhatsApp reply…' : 'Conversation is read-only'}" ${writable ? '' : 'disabled'}></textarea><button ${writable ? '' : 'disabled'}>Send</button></div></form>`;
  q('context').innerHTML = `<small class="eyebrow">CUSTOMER CONTEXT</small><h2>Details</h2><section class="panel customer"><span class="avatar large">${safe(initials(chat.customer_name))}</span><h3>${safe(chat.customer_name)}</h3><p>${safe(chat.phone)}</p></section><section class="panel"><dl><div><dt>Status</dt><dd>${safe(chat.status)}</dd></div><div><dt>Owner</dt><dd>${safe(chat.owner)}</dd></div><div><dt>Team</dt><dd>${safe(chat.team_name || 'Not routed')}</dd></div><div><dt>Agent</dt><dd>${safe(chat.assigned_agent_name || 'Unassigned')}</dd></div><div><dt>Language</dt><dd>${safe(chat.language)}</dd></div></dl></section>${chat.handover_reason ? `<section class="panel handover"><b>AI handover</b><p>${safe(chat.handover_reason)}</p></section>` : ''}`;
  q('message-list').scrollTop = q('message-list').scrollHeight;
  if (q('take-chat')) q('take-chat').onclick = () => mutate(() => sb.rpc('wa_assign_conversation', { p_conversation_id: chat.id, p_agent_id: me.id })).catch(fail);
  q('agent-select').onchange = (event) => mutate(() => event.target.value ? sb.rpc('wa_assign_conversation', { p_conversation_id: chat.id, p_agent_id: event.target.value }) : sb.rpc('wa_unassign_conversation', { p_conversation_id: chat.id })).catch(fail);
  q('state-button').onclick = () => mutate(() => chat.status === 'resolved' ? sb.rpc('wa_return_to_ai', { p_conversation_id: chat.id }) : sb.rpc('wa_resolve_conversation', { p_conversation_id: chat.id })).catch(fail);
  q('composer').onsubmit = async (event) => { event.preventDefault(); const body = q('reply').value.trim(); if (!body) return; try { await invoke('whatsapp-send', { conversationId: chat.id, body, clientMessageId: crypto.randomUUID() }); q('reply').value = ''; await load(); } catch (error) { fail(error); } };
}

function openModal(title, content) { q('modal-title').textContent = title; q('modal-content').innerHTML = content; q('modal').classList.remove('hidden'); }
function closeModal() { q('modal').classList.add('hidden'); }

async function knowledge() {
  const { data, error } = await sb.from('wa_knowledge_articles').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  openModal('Approved AI knowledge', `<div class="modal-grid"><section><button id="new-article" class="wide">New article</button>${(data || []).map((article) => `<div class="item"><b>${safe(article.title)}</b><small>${safe(article.language)} · ${article.is_active ? 'active' : 'paused'}</small><div class="item-actions"><button class="edit-article" data-id="${article.id}">Edit</button><button class="delete-article danger" data-id="${article.id}">Delete</button></div></div>`).join('')}</section><section><form id="article-form"><input id="article-id" type="hidden"><label>Title<input id="article-title" required></label><label>Language<select id="article-language"><option value="both">Arabic & English</option><option value="ar">Arabic</option><option value="en">English</option></select></label><label>Approved content<textarea id="article-content" rows="12" required></textarea></label><label class="check"><input id="article-active" type="checkbox" checked> Active for AI</label><button class="primary wide">Save</button></form></section></div>`);
  const fill = (article) => { q('article-id').value = article?.id || ''; q('article-title').value = article?.title || ''; q('article-language').value = article?.language || 'both'; q('article-content').value = article?.content || ''; q('article-active').checked = article?.is_active ?? true; };
  q('new-article').onclick = () => fill(null);
  document.querySelectorAll('.edit-article').forEach((button) => button.onclick = () => fill(data.find((article) => article.id === button.dataset.id)));
  document.querySelectorAll('.delete-article').forEach((button) => button.onclick = async () => { if (!confirm('Delete this article?')) return; const result = await sb.from('wa_knowledge_articles').delete().eq('id', button.dataset.id); result.error ? fail(result.error) : await knowledge(); });
  q('article-form').onsubmit = async (event) => { event.preventDefault(); const id = q('article-id').value; const row = { organization_id: me.organization_id, title: q('article-title').value.trim(), language: q('article-language').value, content: q('article-content').value.trim(), is_active: q('article-active').checked }; const result = id ? await sb.from('wa_knowledge_articles').update(row).eq('id', id) : await sb.from('wa_knowledge_articles').insert(row); result.error ? fail(result.error) : await knowledge(); };
}

function team() {
  openModal('Team accounts', `<div class="modal-grid"><section>${members.map((member) => `<div class="item"><b>${safe(member.display_name)}</b><small>${safe(member.team_name)} · ${safe(member.role)} · ${member.online ? 'online' : 'offline'}</small></div>`).join('')}</section><section><form id="invite-form"><label>Name<input id="invite-name" required></label><label>Email<input id="invite-email" type="email" required></label><label>Role<select id="invite-role"><option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><label>Team<select id="invite-team"><option value="customer-care">Customer Care</option><option value="complaints">Complaints</option></select></label><button class="primary wide">Send invitation</button></form></section></div>`);
  q('invite-form').onsubmit = async (event) => { event.preventDefault(); try { await invoke('whatsapp-team-admin', { organizationId: me.organization_id, email: q('invite-email').value.trim(), displayName: q('invite-name').value.trim(), role: q('invite-role').value, teamKey: q('invite-team').value }); alert('Invitation sent.'); closeModal(); await load(); } catch (error) { fail(error); } };
}

q('login-form').onsubmit = async (event) => { event.preventDefault(); q('login-error').classList.add('hidden'); const { error } = await sb.auth.signInWithPassword({ email: q('email').value.trim(), password: q('password').value }); if (error) { q('login-error').textContent = error.message; q('login-error').classList.remove('hidden'); } else await boot().catch(fail); };
q('logout-button').onclick = async () => { await sb.rpc('wa_set_presence', { p_online: false }).catch(() => undefined); await sb.auth.signOut(); location.reload(); };
q('password-button').onclick = async () => { const password = prompt('New password (minimum 8 characters):'); if (!password) return; if (password.length < 8) return alert('Password is too short.'); const { error } = await sb.auth.updateUser({ password }); error ? fail(error) : alert('Password changed.'); };
q('refresh-button').onclick = () => load().catch(fail);
q('search').oninput = (event) => { search = event.target.value; renderList(); };
document.querySelectorAll('.filter').forEach((button) => button.onclick = () => { document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); filter = button.dataset.filter; renderList(); });
q('knowledge-button').onclick = () => knowledge().catch(fail);
q('team-button').onclick = team;
q('modal-close').onclick = closeModal;
q('modal').onclick = (event) => { if (event.target === q('modal')) closeModal(); };
boot().catch(fail);
