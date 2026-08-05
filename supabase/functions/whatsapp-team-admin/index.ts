import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const ROLES = ['admin','supervisor','agent','viewer'];
const TEAMS = ['customer-care','complaints'];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return json({ error: 'Unauthorized' }, 401, request);
  const input = await request.json().catch(() => null) as { organizationId?: string; email?: string; displayName?: string; role?: string; teamKey?: string } | null;
  const organizationId = input?.organizationId?.trim() ?? '';
  const email = input?.email?.trim().toLowerCase() ?? '';
  const displayName = input?.displayName?.trim() ?? '';
  const role = input?.role ?? 'agent';
  const teamKey = input?.teamKey ?? 'customer-care';
  if (!organizationId || !/^\S+@\S+\.\S+$/.test(email) || !displayName || !ROLES.includes(role) || !TEAMS.includes(teamKey)) return json({ error: 'Invalid invitation data' }, 400, request);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: caller } = await admin.from('wa_memberships').select('role').eq('organization_id', organizationId).eq('user_id', userData.user.id).maybeSingle();
  if (caller?.role !== 'admin') return json({ error: 'Administrator access required' }, 403, request);
  const { data: team } = await admin.from('wa_teams').select('id').eq('organization_id', organizationId).eq('routing_key', teamKey).eq('is_active', true).maybeSingle();
  if (!team) return json({ error: 'Routing team is not configured' }, 409, request);

  let invitedUser: any = null;
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName, source: 'whatsapp-inbox' } });
  invitedUser = invitation?.user ?? null;
  if (inviteError || !invitedUser) {
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: listError.message }, 502, request);
    invitedUser = listed.users.find((candidate: any) => candidate.email?.toLowerCase() === email) ?? null;
    if (!invitedUser) return json({ error: inviteError?.message || 'Unable to invite user' }, 502, request);
  }

  const { error: membershipError } = await admin.from('wa_memberships').upsert({ organization_id: organizationId, user_id: invitedUser.id, display_name: displayName, role, is_online: false }, { onConflict: 'organization_id,user_id' });
  if (membershipError) return json({ error: membershipError.message }, 500, request);
  const { data: orgTeams, error: teamsError } = await admin.from('wa_teams').select('id').eq('organization_id', organizationId);
  if (teamsError) return json({ error: teamsError.message }, 500, request);
  const ids = (orgTeams ?? []).map((candidate: any) => candidate.id);
  if (ids.length) {
    const { error } = await admin.from('wa_team_members').delete().eq('user_id', invitedUser.id).in('team_id', ids);
    if (error) return json({ error: error.message }, 500, request);
  }
  const { error: teamMemberError } = await admin.from('wa_team_members').insert({ team_id: team.id, user_id: invitedUser.id });
  if (teamMemberError) return json({ error: teamMemberError.message }, 500, request);
  await admin.from('wa_audit_log').insert({ organization_id: organizationId, actor_user_id: userData.user.id, actor_type: 'user', action: 'team_member_invited', details: { invited_user_id: invitedUser.id, email, role, team_key: teamKey } });
  return json({ status: 'invited', userId: invitedUser.id }, 200, request);
});
