/**
 * Helpers compartidos para las rutas API
 */

const DEFAULT_PROFILE_FIELDS = 'user_id, display_name, username, avatar_url, status, bio, updated_at';
const MINIMAL_PROFILE_FIELDS = 'user_id, display_name, username, avatar_url';

async function buildProfileMap(sb, userIds, fields = DEFAULT_PROFILE_FIELDS) {
  if (!userIds?.length) return {};
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data: profiles } = await sb.from('profiles').select(fields).in('user_id', ids);
  return Object.fromEntries((profiles || []).filter(p => p && p.user_id).map(p => [p.user_id, p]));
}

function enrichItems(items, profileMap, idKey = 'author_id', profileKey = 'profiles') {
  return (items || []).map(item => ({
    ...item,
    [profileKey]: profileMap[item[idKey] || item.user_id] || null,
  }));
}

module.exports = { buildProfileMap, enrichItems, DEFAULT_PROFILE_FIELDS, MINIMAL_PROFILE_FIELDS };
