import { BookOpen, Bot, CheckCircle2, Inbox, LoaderCircle, LogOut, RefreshCw, Search, Sparkles, UserRoundCheck, UsersRound, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentSelect, Composer, Owner } from './components/ChatComponents';
import { KnowledgeModal } from './components/KnowledgeModal';
import { Login } from './components/Login';
import { TeamModal } from './components/TeamModal';
import { demoMode } from './lib/supabase';
import { repository } from './lib/repository';
import type { Message, SessionUser, Snapshot } from './types';

type Filter = 'all' | 'unassigned' | 'mine' | 'ai' | 'urgent';
const empty: Snapshot = { conversations: [], agents: [], members: [] };

function relative(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [data, setData] = useState<Snapshot>(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  const load = useCallback(async (preserve = true) => {
    try {
      setError(null);
      const next = await repository.loadSnapshot();
      setData(next);
      setSelectedId((current) => preserve && current && next.conversations.some((conversation) => conversation.id === current)
        ? current
        : next.conversations[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load inbox');
    }
  }, []);

  const initialize = useCallback(async () => {
    try {
      const sessionUser = await repository.getSessionUser();
      setUser(sessionUser);
      if (sessionUser) {
        await repository.setPresence(true).catch(() => undefined);
        await load(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to initialize inbox');
    } finally {
      setReady(true);
    }
  }, [load]);

  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => user ? repository.subscribe(() => void load(true)) : undefined, [user, load]);
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void repository.loadMessages(selectedId).then(setMessages).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load messages'));
  }, [selectedId, data]);

  const selected = data.conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const metrics = useMemo(() => ({
    open: data.conversations.filter((conversation) => conversation.status !== 'resolved').length,
    waiting: data.conversations.filter((conversation) => conversation.owner === 'unassigned').length,
    ai: data.conversations.filter((conversation) => conversation.owner === 'ai').length,
    urgent: data.conversations.filter((conversation) => conversation.priority === 'urgent').length,
  }), [data.conversations]);

  const filtered = useMemo(() => data.conversations.filter((conversation) => {
    const matchesFilter = filter === 'all'
      || (filter === 'unassigned' && conversation.owner === 'unassigned')
      || (filter === 'mine' && conversation.assignedAgentId === user?.id)
      || (filter === 'ai' && conversation.owner === 'ai')
      || (filter === 'urgent' && conversation.priority === 'urgent');
    const needle = query.trim().toLowerCase();
    return matchesFilter && (!needle || `${conversation.customerName} ${conversation.phone} ${conversation.lastMessage} ${conversation.category}`.toLowerCase().includes(needle));
  }), [data.conversations, filter, query, user?.id]);

  async function act(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); await load(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(false); }
  }

  if (!ready) return <main className="center"><LoaderCircle className="spin"/><p>Loading WhatsApp inbox…</p></main>;
  if (!user) return <Login onDone={initialize} error={error}/>;

  return <div className="app">
    <header className="topbar">
      <div className="brand"><b className="mark">SM</b><span><strong>{user.organizationName}</strong><small>WhatsApp Operations</small></span></div>
      <div className="top-actions">
        {demoMode && <em>Safe demo</em>}
        <span className={navigator.onLine ? 'online' : 'offline'}>{navigator.onLine ? <Wifi size={14}/> : <WifiOff size={14}/>} {navigator.onLine ? 'Connected' : 'Offline'}</span>
        <button className="icon" onClick={() => void load(true)} title="Refresh"><RefreshCw size={18}/></button>
        {['admin', 'supervisor'].includes(user.role) && <button className="secondary" onClick={() => setKnowledgeOpen(true)}><BookOpen size={16}/> Knowledge</button>}
        {user.role === 'admin' && <button className="secondary" onClick={() => setTeamOpen(true)}><UsersRound size={16}/> Team</button>}
        <span className="who"><b>{user.initials}</b><span>{user.displayName}<small>{user.role}</small></span></span>
        <button className="icon" title="Sign out" onClick={() => void repository.signOut().then(() => setUser(null)).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Sign out failed'))}><LogOut size={17}/></button>
      </div>
    </header>

    {error && <div className="error">{error}<button onClick={() => setError(null)}>×</button></div>}

    <aside className="rail">
      <h3><Inbox size={17}/> Inbox</h3>
      {([
        ['all', 'All', metrics.open], ['unassigned', 'Queue', metrics.waiting], ['mine', 'Mine', 0], ['ai', 'AI', metrics.ai], ['urgent', 'Urgent', metrics.urgent],
      ] as const).map(([id, label, count]) => <button className={filter === id ? 'active' : ''} onClick={() => setFilter(id)} key={id}><span>{label}</span>{count > 0 && <b>{count}</b>}</button>)}
      <div className="guardrail"><Bot size={18}/><strong>AI guardrails</strong><p>Payments, refunds, complaints, food safety and explicit human requests always transfer to staff.</p></div>
    </aside>

    <section className="conversation-list">
      <div className="list-head"><div><small>CONVERSATIONS</small><h2>{filtered.length} chats</h2></div><label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search"/></label></div>
      <div className="cards">{filtered.map((conversation) => <button className={`conversation-card ${selectedId === conversation.id ? 'selected' : ''}`} key={conversation.id} onClick={() => setSelectedId(conversation.id)}>
        <span className="avatar">{conversation.initials}</span><span className="summary"><span><strong>{conversation.customerName}</strong><time>{relative(conversation.lastMessageAt)}</time></span><small>{conversation.category} · <Owner conversation={conversation}/></small><p dir={conversation.language === 'ar' ? 'rtl' : 'ltr'}>{conversation.lastMessage}</p><span className="tags">{conversation.priority !== 'normal' && <i className={conversation.priority}>{conversation.priority}</i>}{conversation.unreadCount > 0 && <b>{conversation.unreadCount}</b>}</span></span>
      </button>)}</div>
    </section>

    <main className="chat">{selected ? <>
      <header className="chat-head"><div><span className="avatar">{selected.initials}</span><span><h2>{selected.customerName}</h2><small>{selected.phone} · {selected.category}</small></span></div><div className="chat-actions">
        {selected.owner === 'unassigned' && user.role !== 'viewer' && <button className="primary" disabled={busy} onClick={() => void act(() => repository.assign(selected.id, user.id))}><UserRoundCheck size={16}/> Take chat</button>}
        <AgentSelect agents={data.agents} value={selected.assignedAgentId} disabled={busy || !['admin', 'supervisor'].includes(user.role)} onChange={(agentId) => void act(() => repository.assign(selected.id, agentId))}/>
        {selected.status !== 'resolved'
          ? <button disabled={busy || user.role === 'viewer'} onClick={() => void act(() => repository.resolve(selected.id))}><CheckCircle2 size={16}/> Resolve</button>
          : <button disabled={busy || user.role === 'viewer'} onClick={() => void act(() => repository.returnToAi(selected.id))}><Sparkles size={16}/> Return to AI</button>}
      </div></header>
      <section className="messages">{messages.map((message) => <article key={message.id} className={`bubble ${message.direction} ${message.isNote ? 'note' : ''}`} dir={/[\u0600-\u06FF]/.test(message.body) ? 'rtl' : 'ltr'}><small>{message.senderName}</small><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {message.deliveryStatus}</time></article>)}</section>
      <Composer disabled={busy || user.role === 'viewer' || selected.status === 'resolved'} onSend={async (body) => { await act(async () => { const message = await repository.send(selected.id, body); setMessages((current) => [...current, message]); }); }}/>
    </> : <div className="empty"><Inbox/><h2>Select a conversation</h2></div>}</main>

    <aside className="context">{selected && <>
      <small>CUSTOMER CONTEXT</small><h2>Details</h2>
      <section className="customer"><span className="avatar large">{selected.initials}</span><h3>{selected.customerName}</h3><p>{selected.phone}</p><div>{selected.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></section>
      <section><dl><div><dt>Status</dt><dd>{selected.status.replace('_', ' ')}</dd></div><div><dt>Owner</dt><dd><Owner conversation={selected}/></dd></div><div><dt>Team</dt><dd>{selected.teamName ?? 'Not routed'}</dd></div><div><dt>Agent</dt><dd>{selected.assignedAgentName ?? 'Unassigned'}</dd></div><div><dt>Language</dt><dd>{selected.language}</dd></div></dl></section>
      {selected.handoverReason && <section className="handover"><Bot size={18}/><div><b>AI handover</b><p>{selected.handoverReason}</p></div>{selected.aiConfidence !== null && <strong>{Math.round(selected.aiConfidence * 100)}%</strong>}</section>}
      <section className="policy"><b>Automation boundary</b><p>AI cannot approve money movement, cancel orders, or disclose private order information without verified human handling.</p></section>
    </>}</aside>

    {knowledgeOpen && <KnowledgeModal organizationId={user.organizationId} onClose={() => setKnowledgeOpen(false)}/>}
    {teamOpen && <TeamModal members={data.members} onClose={() => setTeamOpen(false)} onInvite={(input) => act(() => repository.inviteMember({ ...input, organizationId: user.organizationId }))}/>} 
  </div>;
}
