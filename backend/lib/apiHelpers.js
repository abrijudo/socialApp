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

/**
 * Cuando un mensaje tiene `parent_message_id` y el padre no va en el mismo lote,
 * carga el padre e inyecta `parent_message` con `profiles` (misma forma que enriqueItems).
 * `channelKey` = columna de ámbito (`channel_id` o `dm_channel_id`).
 */
async function attachParentMessages(
  sb,
  items,
  { table, channelKey, channelId, parentSelect, profileFields = MINIMAL_PROFILE_FIELDS } = {},
) {
  if (!items?.length) return items;
  const byId = new Map();
  for (const m of items) {
    if (m?.id) byId.set(m.id, m);
  }
  const pids = [...new Set((items || []).map((m) => m.parent_message_id).filter(Boolean))];
  if (!pids.length) return items;
  const missing = pids.filter((id) => !byId.has(id));
  if (missing.length) {
    const { data: extra, error } = await sb
      .from(table)
      .select(parentSelect)
      .eq(channelKey, channelId)
      .in('id', missing);
    if (error) throw error;
    for (const r of extra || []) {
      if (r?.id) byId.set(r.id, r);
    }
  }
  const parentRows = pids
    .map((id) => byId.get(id))
    .filter(Boolean);
  const parentAuthorIds = parentRows.map((m) => m.author_id);
  const profileMap = await buildProfileMap(sb, parentAuthorIds, profileFields);
  return (items || []).map((m) => {
    if (!m.parent_message_id) return m;
    const p = byId.get(m.parent_message_id);
    if (!p) return m;
    return {
      ...m,
      parent_message: enrichItems([p], profileMap)[0],
    };
  });
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
  attachParentMessages,
  listDmChannelSummaries,
  DEFAULT_PROFILE_FIELDS,
  MINIMAL_PROFILE_FIELDS,
};
