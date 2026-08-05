import { Bot, CheckCircle2, Inbox, RefreshCw, Search, Send, Sparkles, UserRoundCheck, UsersRound, Wifi } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { demoMode } from './lib/supabase';
import { repository } from './lib/repository';
import type { Conversation, Message, Snapshot } from './types';

type Filter = 'all' | 'unassigned' | 'human' | 'ai' | 'urgent';
const empty: Snapshot = { conversations: [], agents: [] };

function relative(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function Owner({ conversation }: { conversation: Conversation }) {
  if (conversation.owner === 'ai') return <span className="owner ai">AI</span>;
  if (conversation.owner === 'human') return <span className="owner human">{conversation.assignedAgentName ?? 'Human'}</span>;
  return <span className="owner queue">Queue</span>;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const next = await repository.loadSnapshot();
      setSnapshot(next);
      setSelectedId((current) => current && next.conversations.some((c) => c.id === current) ? current : next.conversations[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load inbox');
    }
  };

  useEffect(() => { void load(); return repository.subscribe(() => void load()); }, []);
  useEffect(() => {
    if (!selectedId) return setMessages([]);
    void repository.loadMessages(selectedId).then(setMessages).catch((cause) => setError(cause.message));
  }, [selectedId, snapshot]);

  const selected = snapshot.conversations.find((c) => c.id === selectedId) ?? null;
  const metrics = useMemo(() => ({
    open: snapshot.conversations.filter((c) => c.status !== 'resolved').length,
    queue: snapshot.conversations.filter((c) => c.owner === 'unassigned').length,
    ai: snapshot.conversations.filter((c) => c.owner === 'ai').length,
    urgent: snapshot.conversations.filter((c) => c.priority === 'urgent').length,
  }), [snapshot]);

  const filtered = useMemo(() => snapshot.conversations.filter((c) => {
    const matchesFilter = filter === 'all' || (filter === 'unassigned' && c.owner === 'unassigned') ||
      (filter === 'human' && c.owner === 'human') || (filter === 'ai' && c.owner === 'ai') ||
      (filter === 'urgent' && c.priority === 'urgent');
    const needle = query.trim().toLowerCase();
    return matchesFilter && (!needle || `${c.customerName} ${c.phone} ${c.lastMessage} ${c.category}`.toLowerCase().includes(needle));
  }), [snapshot, filter, query]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed'); }
    finally { setBusy(false); }
  };

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="mark">SM</div><div><strong>Spicy Meal</strong><small>WhatsApp Operations</small></div></div>
      <div className="top-actions">
        {demoMode && <span className="demo">Safe demo</span>}
        <span className="connected"><Wifi size={14}/> Connected</span>
        <button className="icon" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={18}/></button>
        <span className="profile"><b>MA</b><span>Mohammed<small>admin</small></span></span>
      </div>
    </header>

    {error && <div className="error">{error}<button onClick={() => setError(null)}>×</button></div>}

    <aside className="rail">
      <h3><Inbox size={17}/> Inbox</h3>
      {([
        ['all', 'All', metrics.open], ['unassigned', 'Queue', metrics.queue], ['human', 'Human', 0], ['ai', 'AI', metrics.ai], ['urgent', 'Urgent', metrics.urgent],
      ] as const).map(([id, label, count]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}><span>{label}</span>{count > 0 && <b>{count}</b>}</button>)}
      <div className="guardrail"><Bot size={18}/><strong>AI guardrails</strong><p>Payments, refunds, complaints, food safety and explicit human requests always transfer to staff.</p></div>
    </aside>

    <section className="conversation-list">
      <div className="list-head"><div><small>CONVERSATIONS</small><h2>{filtered.length} chats</h2></div><label><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search"/></label></div>
      <div className="cards">{filtered.map((c) => <button className={`conversation-card ${selectedId === c.id ? 'selected' : ''}`} key={c.id} onClick={() => setSelectedId(c.id)}>
        <span className="avatar">{c.initials}</span><span className="summary"><span><strong>{c.customerName}</strong><time>{relative(c.lastMessageAt)}</time></span><small>{c.category} · <Owner conversation={c}/></small><p dir={c.language === 'ar' ? 'rtl' : 'ltr'}>{c.lastMessage}</p><span className="tags">{c.priority !== 'normal' && <i className={c.priority}>{c.priority}</i>}{c.unreadCount > 0 && <b>{c.unreadCount}</b>}</span></span>
      </button>)}</div>
    </section>

    <main className="chat">{selected ? <>
      <header className="chat-head"><div><span className="avatar">{selected.initials}</span><span><h2>{selected.customerName}</h2><small>{selected.phone} · {selected.category}</small></span></div><div className="chat-actions">
        {selected.owner === 'unassigned' && <button className="primary" disabled={busy} onClick={() => void act(() => repository.assign(selected.id, 'a1'))}><UserRoundCheck size={16}/> Take chat</button>}
        <select disabled={busy} value={selected.assignedAgentId ?? ''} onChange={(e) => void act(() => repository.assign(selected.id, e.target.value || null))}><option value="">Unassigned</option>{snapshot.agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.online ? ' · online' : ''}</option>)}</select>
        {selected.status !== 'resolved' ? <button disabled={busy} onClick={() => void act(() => repository.resolve(selected.id))}><CheckCircle2 size={16}/> Resolve</button> : <button disabled={busy} onClick={() => void act(() => repository.returnToAi(selected.id))}><Sparkles size={16}/> Return to AI</button>}
      </div></header>
      <section className="messages">{messages.map((m) => <article key={m.id} className={`bubble ${m.direction} ${m.isNote ? 'note' : ''}`} dir={/[\u0600-\u06FF]/.test(m.body) ? 'rtl' : 'ltr'}><small>{m.senderName}</small><p>{m.body}</p><time>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {m.deliveryStatus}</time></article>)}</section>
      <Composer disabled={busy || selected.status === 'resolved'} onSend={async (body) => { await act(async () => { const msg = await repository.send(selected.id, body); setMessages((current) => [...current, msg]); }); }}/>
    </> : <div className="empty"><Inbox/><h2>Select a conversation</h2></div>}</main>

    <aside className="context">{selected && <>
      <small>CUSTOMER CONTEXT</small><h2>Details</h2><section className="customer"><span className="avatar large">{selected.initials}</span><h3>{selected.customerName}</h3><p>{selected.phone}</p><div>{selected.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></section>
      <section><dl><div><dt>Status</dt><dd>{selected.status.replace('_', ' ')}</dd></div><div><dt>Owner</dt><dd><Owner conversation={selected}/></dd></div><div><dt>Agent</dt><dd>{selected.assignedAgentName ?? 'Unassigned'}</dd></div><div><dt>Language</dt><dd>{selected.language}</dd></div></dl></section>
      {selected.handoverReason && <section className="handover"><Bot size={18}/><div><b>AI handover</b><p>{selected.handoverReason}</p></div>{selected.aiConfidence !== null && <strong>{Math.round(selected.aiConfidence * 100)}%</strong>}</section>}
      <section className="policy"><b>Automation boundary</b><p>AI cannot approve money movement, cancel orders, or disclose private order information without verified human handling.</p></section>
    </>}</aside>
  </div>;
}

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); const value = body.trim(); if (!value || disabled) return; setBody(''); await onSend(value); }
  return <form className="composer" onSubmit={submit}><span><Sparkles size={14}/> Human mode: AI is paused for this chat.</span><div><textarea rows={2} disabled={disabled} value={body} onChange={(e) => setBody(e.target.value)} placeholder={disabled ? 'Conversation is read-only' : 'Write a WhatsApp reply…'} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/><button disabled={disabled || !body.trim()}><Send size={18}/> Send</button></div></form>;
}
