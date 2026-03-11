const express = require('express');
const { z } = require('zod');
const tokenHandler = require('../../api/token');
const { getSupabaseAdmin } = require('../services/supabaseAdmin');
const { ensureProfile, getBootstrapPayload } = require('../services/bootstrapService');

const router = express.Router();

const idSchema = z.string().min(2).max(80);
const channelTypeSchema = z.enum(['text', 'voice']);
const roleSchema = z.enum(['owner', 'admin', 'mod', 'member']);
const actionSchema = z.enum(['send_message', 'join_voice', 'use_webcam', 'share_screen', 'manage_channel', 'moderate_voice']);
const ROLE_RANK = { member: 1, mod: 2, admin: 3, owner: 4 };

function handleError(res, err) {
  const message = err?.message || 'Error interno';
  return res.status(400).json({ error: message });
}

async function requireAdmin(serverId, userId) {
  const role = await getUserRole(serverId, userId);
  if (!['owner', 'admin'].includes(role)) throw new Error('No tienes permisos de administrador.');
  return role;
}

async function getUserRole(serverId, userId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('server_members')
    .select('role')
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data.role;
}

async function getChannelServer(channelId) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('channels')
    .select('id, server_id')
    .eq('id', channelId)
    .single();
  if (error) throw error;
  return data.server_id;
}

function defaultPermission(role, action) {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'mod') {
    return ['send_message', 'join_voice', 'use_webcam', 'share_screen', 'moderate_voice'].includes(action);
  }
  if (role === 'member') {
    return ['send_message', 'join_voice', 'use_webcam'].includes(action);
  }
  return false;
}

function permissionColumn(action) {
  return {
    send_message: 'can_send_message',
    join_voice: 'can_join_voice',
    use_webcam: 'can_use_webcam',
    share_screen: 'can_share_screen',
    manage_channel: 'can_manage_channel',
    moderate_voice: 'can_moderate_voice',
  }[action];
}

async function canPerform({ serverId, channelId, userId, action }) {
  const sb = getSupabaseAdmin();
  const role = await getUserRole(serverId, userId);
  const base = defaultPermission(role, action);

  if (!channelId) return { allowed: base, role, source: 'role-default' };

  const { data, error } = await sb
    .from('channel_permissions')
    .select('*')
    .eq('channel_id', channelId)
    .eq('role', role)
    .maybeSingle();
  if (error) throw error;

  if (!data) return { allowed: base, role, source: 'role-default' };
  const column = permissionColumn(action);
  const override = data[column];
  if (override === null || override === undefined) return { allowed: base, role, source: 'role-default' };
  return { allowed: Boolean(override), role, source: 'channel-override' };
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

router.get('/token', (req, res) => tokenHandler(req, res));

router.get('/bootstrap', async (req, res) => {
  try {
    const userId = idSchema.parse(String(req.query.userId || ''));
    const username = z.string().min(2).max(20).parse(String(req.query.username || ''));
    const payload = await getBootstrapPayload({ userId, username });
    return res.json(payload);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/profiles/upsert', async (req, res) => {
  try {
    const body = z.object({
      userId: idSchema,
      username: z.string().min(2).max(20),
      displayName: z.string().min(2).max(30).optional(),
      avatarUrl: z.string().url().optional().or(z.literal('')),
      bio: z.string().max(180).optional(),
      status: z.enum(['online', 'idle', 'dnd']).optional(),
    }).parse(req.body);

    await ensureProfile({ userId: body.userId, username: body.username });
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('profiles')
      .update({
        username: body.username.toLowerCase(),
        display_name: body.displayName || body.username,
        avatar_url: body.avatarUrl || null,
        bio: body.bio || '',
        status: body.status || 'online',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', body.userId)
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/servers/:serverId', async (req, res) => {
  try {
    const params = z.object({ serverId: idSchema }).parse(req.params);
    const body = z.object({
      name: z.string().min(2).max(40),
      userId: idSchema,
    }).parse(req.body);
    await requireAdmin(params.serverId, body.userId);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('servers')
      .update({ name: body.name })
      .eq('id', params.serverId)
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/channels', async (req, res) => {
  try {
    const body = z.object({
      serverId: idSchema,
      userId: idSchema,
      type: channelTypeSchema,
      name: z.string().min(2).max(40),
    }).parse(req.body);
    const sb = getSupabaseAdmin();
    await requireAdmin(body.serverId, body.userId);

    const { count, error: countError } = await sb
      .from('channels')
      .select('id', { count: 'exact', head: true })
      .eq('server_id', body.serverId);
    if (countError) throw countError;

    const { data, error } = await sb
      .from('channels')
      .insert({
        server_id: body.serverId,
        type: body.type,
        name: body.name,
        position: (count || 0) + 1,
        created_by: body.userId,
      })
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/channels/:channelId', async (req, res) => {
  try {
    const params = z.object({ channelId: idSchema }).parse(req.params);
    const body = z.object({
      userId: idSchema,
      name: z.string().min(2).max(40).optional(),
      isArchived: z.boolean().optional(),
    }).parse(req.body);
    const serverId = await getChannelServer(params.channelId);
    await requireAdmin(serverId, body.userId);
    const sb = getSupabaseAdmin();
    const patch = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.isArchived !== undefined) patch.is_archived = body.isArchived;

    const { data, error } = await sb
      .from('channels')
      .update(patch)
      .eq('id', params.channelId)
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/servers/:serverId/members', async (req, res) => {
  try {
    const params = z.object({ serverId: idSchema }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data: members, error } = await sb
      .from('server_members')
      .select('server_id, user_id, role, joined_at')
      .eq('server_id', params.serverId)
      .order('joined_at', { ascending: true });
    if (error) throw error;

    const ids = (members || []).map(m => m.user_id);
    let profileMap = {};
    if (ids.length) {
      const { data: profiles, error: pErr } = await sb
        .from('profiles')
        .select('user_id, username, display_name, avatar_url, status')
        .in('user_id', ids);
      if (pErr) throw pErr;
      profileMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
    }

    return res.json((members || []).map(m => ({ ...m, profile: profileMap[m.user_id] || null })));
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/servers/:serverId/members/:memberUserId/role', async (req, res) => {
  try {
    const params = z.object({ serverId: idSchema, memberUserId: idSchema }).parse(req.params);
    const body = z.object({ actorUserId: idSchema, role: roleSchema }).parse(req.body);
    const actorRole = await getUserRole(params.serverId, body.actorUserId);
    if (!['owner', 'admin'].includes(actorRole)) throw new Error('No tienes permisos para cambiar roles.');
    if (body.role === 'owner' && actorRole !== 'owner') throw new Error('Solo owner puede asignar owner.');

    const targetRole = await getUserRole(params.serverId, params.memberUserId);
    if (ROLE_RANK[actorRole] <= ROLE_RANK[targetRole] && body.actorUserId !== params.memberUserId) {
      throw new Error('No puedes modificar un miembro con rango igual o superior.');
    }
    if (params.memberUserId === body.actorUserId && actorRole === 'owner' && body.role !== 'owner') {
      throw new Error('El owner no puede degradarse a sí mismo.');
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('server_members')
      .update({ role: body.role })
      .eq('server_id', params.serverId)
      .eq('user_id', params.memberUserId)
      .select('server_id, user_id, role, joined_at')
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/permissions/check', async (req, res) => {
  try {
    const q = z.object({
      serverId: idSchema,
      channelId: idSchema.optional(),
      userId: idSchema,
      action: actionSchema,
    }).parse(req.query);
    const result = await canPerform({
      serverId: q.serverId,
      channelId: q.channelId,
      userId: q.userId,
      action: q.action,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/channels/:channelId/permissions', async (req, res) => {
  try {
    const params = z.object({ channelId: idSchema }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('channel_permissions')
      .select('*')
      .eq('channel_id', params.channelId)
      .order('role', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/channels/:channelId/permissions', async (req, res) => {
  try {
    const params = z.object({ channelId: idSchema }).parse(req.params);
    const body = z.object({
      actorUserId: idSchema,
      role: roleSchema,
      canSendMessage: z.boolean().nullable().optional(),
      canJoinVoice: z.boolean().nullable().optional(),
      canUseWebcam: z.boolean().nullable().optional(),
      canShareScreen: z.boolean().nullable().optional(),
      canManageChannel: z.boolean().nullable().optional(),
      canModerateVoice: z.boolean().nullable().optional(),
    }).parse(req.body);

    const serverId = await getChannelServer(params.channelId);
    await requireAdmin(serverId, body.actorUserId);

    const patch = {
      channel_id: params.channelId,
      role: body.role,
      updated_at: new Date().toISOString(),
    };
    if (body.canSendMessage !== undefined) patch.can_send_message = body.canSendMessage;
    if (body.canJoinVoice !== undefined) patch.can_join_voice = body.canJoinVoice;
    if (body.canUseWebcam !== undefined) patch.can_use_webcam = body.canUseWebcam;
    if (body.canShareScreen !== undefined) patch.can_share_screen = body.canShareScreen;
    if (body.canManageChannel !== undefined) patch.can_manage_channel = body.canManageChannel;
    if (body.canModerateVoice !== undefined) patch.can_moderate_voice = body.canModerateVoice;

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('channel_permissions')
      .upsert(patch, { onConflict: 'channel_id,role' })
      .select('*')
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/messages/:channelId', async (req, res) => {
  try {
    const params = z.object({ channelId: idSchema }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .select('id, channel_id, author_id, body, created_at')
      .eq('channel_id', params.channelId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;

    const authorIds = [...new Set((data || []).map(m => m.author_id))];
    let profilesMap = {};
    if (authorIds.length) {
      const { data: profiles, error: pErr } = await sb
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', authorIds);
      if (pErr) throw pErr;
      profilesMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
    }

    const enriched = (data || []).map(m => ({
      ...m,
      profiles: profilesMap[m.author_id] || null,
    }));
    return res.json(enriched);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/messages', async (req, res) => {
  try {
    const body = z.object({
      channelId: idSchema,
      authorId: idSchema,
      text: z.string().min(1).max(1000),
    }).parse(req.body);

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .insert({
        channel_id: body.channelId,
        author_id: body.authorId,
        body: body.text,
      })
      .select('id, channel_id, author_id, body, created_at')
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
