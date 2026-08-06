import { LoaderCircle, MailPlus, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { InviteMemberInput, Snapshot } from '../types';

export function TeamModal({ members, onClose, onInvite }: { members: Snapshot['members']; onClose: () => void; onInvite: (input: InviteMemberInput) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<InviteMemberInput['role']>('agent');
  const [teamKey, setTeamKey] = useState<InviteMemberInput['teamKey']>('customer-care');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await onInvite({ email, displayName, role, teamKey }); setMessage('Invitation sent'); setEmail(''); setDisplayName(''); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Invitation failed'); }
    finally { setBusy(false); }
  }

  return <div className="modal" onMouseDown={onClose}><section onMouseDown={(event) => event.stopPropagation()}><header><div><small>ADMINISTRATION</small><h2>Team accounts</h2></div><button className="icon" onClick={onClose}><X size={18}/></button></header><div className="modal-grid"><div><h3>Current members</h3>{members.map((member) => <div className="member" key={member.id}><span className="avatar">{member.initials}</span><span><b>{member.name}</b><small>{member.team} · {member.role}</small></span><i>{member.online ? 'Online' : 'Offline'}</i></div>)}</div><form onSubmit={submit}><h3><MailPlus size={18}/> Invite member</h3>{message && <p className="notice">{message}</p>}<label>Name<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)}/></label><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as InviteMemberInput['role'])}><option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><label>Routing team<select value={teamKey} onChange={(event) => setTeamKey(event.target.value as InviteMemberInput['teamKey'])}><option value="customer-care">Customer Care</option><option value="complaints">Complaints</option></select></label><button className="primary wide" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <><MailPlus size={17}/> Send invitation</>}</button></form></div></section></div>;
}
