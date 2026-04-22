/**
 * Helpers compartidos para las rutas API
 */

const DEFAULT_PROFILE_FIELDS = 'user_id, display_name, username, avatar_url, status, bio, updated_at, last_login';
const MINIMAL_PROFILE_FIELDS = 'user_id, display_name, username, avatar_url';

async function buildProfileMap(sb, userIds, fields = DEFAULT_PROFILE_FIELDS) {
  if (!userIds?.length) return {};
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data: profiles, error } = await sb.from('profiles').select(fields).in('user_id', ids);
  if (error) {
    console.warn('buildProfileMap error:', error.message);
    return {};
  }
  return Object.fromEntries((profiles || []).filter(p => p && p.user_id).map(p => [p.user_id, p]));
}

function enrichItems(items, profileMap, idKey = 'author_id', profileKey = 'profiles') {
  return (items || []).map(item => ({
    ...item,
    [profileKey]: profileMap[item[idKey] || item.user_id] || null,
  }));
}

const DM_SUMMARY_PROFILE_FIELDS = 'user_id, display_name, username, avatar_url, status';

/**
 * Lista de conversaciones DM del usuario: mismos datos que GET /api/dm.
 */
async function listDmChannelSummaries(sb, userId) {
  const { data: dms, error: dmsErr } = await sb.from('dm_participants').select('dm_channel_id').eq('user_id', userId);
  if (dmsErr) throw dmsErr;
  if (!dms?.length) return [];
  const dmIds = dms.map((d) => d.dm_channel_id);
  const { data: participants, error: partErr } = await sb
    .from('dm_participants')
    .select('dm_channel_id, user_id')
    .in('dm_channel_id', dmIds);
  if (partErr) throw partErr;
  const otherUserIds = (participants || []).filter((p) => p.user_id !== userId).map((p) => p.user_id);
  const profilesMap = await buildProfileMap(sb, otherUserIds, DM_SUMMARY_PROFILE_FIELDS);
  const dmMap = {};
  (participants || []).forEach((p) => {
    if (p.user_id !== userId) {
      dmMap[p.dm_channel_id] = { ...profilesMap[p.user_id], user_id: p.user_id };
    }
  });
  return dms.map((d) => ({ id: d.dm_channel_id, otherUser: dmMap[d.dm_channel_id] || null }));
}

module.exports = {
  buildProfileMap,
  enrichItems,
  listDmChannelSummaries,
  DEFAULT_PROFILE_FIELDS,
  MINIMAL_PROFILE_FIELDS,
};
