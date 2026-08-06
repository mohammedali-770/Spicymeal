import { Send, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { Agent, Conversation } from '../types';

export function Owner({ conversation }: { conversation: Conversation }) {
  if (conversation.owner === 'ai') return <span className="owner ai">AI</span>;
  if (conversation.owner === 'human') return <span className="owner human">{conversation.assignedAgentName ?? 'Human'}</span>;
  return <span className="owner queue">Queue</span>;
}

export function AgentSelect({ agents, value, disabled, onChange }: { agents: Agent[]; value: string | null; disabled: boolean; onChange: (id: string | null) => void }) {
  return <select aria-label="Assign agent" value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value || null)}><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.online ? ' · online' : ''}</option>)}</select>;
}

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); const value = body.trim(); if (!value || disabled) return; setBody(''); await onSend(value); }
  return <form className="composer" onSubmit={submit}><span><Sparkles size={14}/> Human mode: AI is paused for this chat.</span><div><textarea rows={2} disabled={disabled} value={body} onChange={(event) => setBody(event.target.value)} placeholder={disabled ? 'Conversation is read-only' : 'Write a WhatsApp reply…'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><button disabled={disabled || !body.trim()}><Send size={18}/> Send</button></div></form>;
}
