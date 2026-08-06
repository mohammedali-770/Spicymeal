import { BookOpen, LoaderCircle, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { repository } from '../lib/repository';
import type { KnowledgeArticle, KnowledgeInput } from '../types';

export function KnowledgeModal({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState<KnowledgeInput['language']>('both');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => setArticles(await repository.loadKnowledge()), []);

  useEffect(() => { void load(); }, [load]);
  function edit(article: KnowledgeArticle | null) {
    setSelected(article); setTitle(article?.title ?? ''); setContent(article?.content ?? ''); setLanguage(article?.language ?? 'both'); setActive(article?.active ?? true); setMessage('');
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await repository.saveKnowledge({ id: selected?.id, title, content, language, active, organizationId }); await load(); edit(null); setMessage('Knowledge saved'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to save knowledge'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setMessage('');
    try { await repository.deleteKnowledge(id); await load(); if (selected?.id === id) edit(null); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Unable to delete knowledge'); }
    finally { setBusy(false); }
  }

  return <div className="modal" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><div><small>AI KNOWLEDGE</small><h2>Approved answers</h2></div><button className="icon" onClick={onClose}><X size={18}/></button></header><div className="modal-grid knowledge-grid"><div><h3>Articles</h3><button className="secondary wide" onClick={() => edit(null)}>New article</button>{articles.map((article) => <div className={`knowledge-item ${selected?.id === article.id ? 'selected' : ''}`} key={article.id}><button onClick={() => edit(article)}><b>{article.title}</b><small>{article.language} · {article.active ? 'active' : 'paused'}</small></button><button className="icon danger" disabled={busy} onClick={() => void remove(article.id)} title="Delete"><Trash2 size={15}/></button></div>)}</div><form onSubmit={save}><h3><BookOpen size={18}/> {selected ? 'Edit article' : 'New article'}</h3>{message && <p className="notice">{message}</p>}<label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)}/></label><label>Language<select value={language} onChange={(event) => setLanguage(event.target.value as KnowledgeInput['language'])}><option value="both">Arabic & English</option><option value="ar">Arabic</option><option value="en">English</option></select></label><label>Approved content<textarea rows={10} required value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write only verified information the AI may use."/></label><label className="check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/> Active for AI</label><button className="primary wide" disabled={busy || !title.trim() || !content.trim()}>{busy ? <LoaderCircle className="spin"/> : 'Save knowledge'}</button></form></div></section></div>;
}
