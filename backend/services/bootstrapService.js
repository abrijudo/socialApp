const { getSupabaseAdmin } = require('./supabaseAdmin');

const DEFAULT_SERVER_NAME = 'Mi Servidor';
const DEFAULT_TEXT_CHANNEL = 'general';
const DEFAULT_VOICE_CHANNEL = 'voz-general';

async function ensureProfile({ userId, username }) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .upsert({
      user_id: userId,
      username: username.toLowerCase(),
      display_name: username,
      status: 'online',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

async function ensureDefaultServer(userId) {
  const sb = getSupabaseAdmin();

  const { data: existingMember } = await sb
    .from('server_members')
    .select('server_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingMember?.server_id) return existingMember.server_id;

  const { data: anyServer } = await sb.from('servers').select('id').limit(1).maybeSingle();
  let serverId = anyServer?.id;

  if (!serverId) {
    const { data: createdServer, error: serverError } = await sb
      .from('servers')
      .insert({
        name: DEFAULT_SERVER_NAME,
        created_by: userId,
      })
      .select('id')
      .single();

    if (serverError) throw serverError;
    serverId = createdServer.id;

    const { error: channelError } = await sb.from('channels').insert([
      { server_id: serverId, type: 'text', name: DEFAULT_TEXT_CHANNEL, position: 1, created_by: userId },
      { server_id: serverId, type: 'voice', name: DEFAULT_VOICE_CHANNEL, position: 2, created_by: userId },
    ]);

    if (channelError) throw channelError;
  }

  const { data: currentMembers } = await sb
    .from('server_members')
    .select('user_id')
    .eq('server_id', serverId)
    .limit(1);

  const role = currentMembers?.length ? 'member' : 'owner';
  const { error: memberError } = await sb
    .from('server_members')
    .upsert({ server_id: serverId, user_id: userId, role }, { onConflict: 'server_id,user_id' });
  if (memberError) throw memberError;

  return serverId;
}

async function getBootstrapPayload({ userId, username }) {
  const sb = getSupabaseAdmin();
  const profile = await ensureProfile({ userId, username });
  const serverId = await ensureDefaultServer(userId);

  const [{ data: server, error: serverError }, { data: channels, error: channelsError }, { data: membership, error: memberError }, { data: members, error: membersError }] = await Promise.all([
    sb.from('servers').select('*').eq('id', serverId).single(),
    sb.from('channels').select('*').eq('server_id', serverId).eq('is_archived', false).order('position', { ascending: true }),
    sb.from('server_members').select('role').eq('server_id', serverId).eq('user_id', userId).single(),
    sb.from('server_members').select('user_id, role, joined_at').eq('server_id', serverId).order('joined_at', { ascending: true }),
  ]);

  if (serverError) throw serverError;
  if (channelsError) throw channelsError;
  if (memberError) throw memberError;
  if (membersError) throw membersError;
  if (!server || !server.id) throw new Error('Servidor no encontrado.');

  const memberIds = (members || []).filter(m => m && m.user_id).map(m => m.user_id);
  let profileMap = {};
  if (memberIds.length) {
    const { data: memberProfiles, error: profilesErr } = await sb
      .from('profiles')
      .select('user_id, username, display_name, avatar_url, status, bio, updated_at')
      .in('user_id', memberIds);
    if (profilesErr) throw profilesErr;
    profileMap = Object.fromEntries((memberProfiles || []).filter(p => p && p.user_id).map(p => [p.user_id, p]));
  }

  const enrichedMembers = (members || []).filter(m => m && m.user_id).map(m => ({
    ...m,
    profile: profileMap[m.user_id] || null,
  }));

  const safeChannels = (channels || []).filter(c => c && c.id);
  return { profile, server, channels: safeChannels, membership, members: enrichedMembers };
}

module.exports = { ensureProfile, getBootstrapPayload };
