import { LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { repository } from '../lib/repository';
import { demoMode } from '../lib/supabase';

export function Login({ onDone, error }: { onDone: () => Promise<void>; error: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setLocal(null);
    try { await repository.signIn(email, password); await onDone(); }
    catch (cause) { setLocal(cause instanceof Error ? cause.message : 'Sign in failed'); }
    finally { setBusy(false); }
  }

  return <main className="login"><section><div className="brand-mark">SM</div><small>WHATSAPP OPERATIONS</small><h1>Shared inbox</h1><p>AI-assisted support with controlled human handover.</p>{demoMode ? <button className="primary wide" onClick={() => void onDone()}>Open safe demo</button> : <form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)}/></label><button className="primary wide" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : 'Sign in'}</button></form>}{(local || error) && <div className="form-error">{local || error}</div>}</section></main>;
}
