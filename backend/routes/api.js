const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { getLiveKitToken } = require('./token');
const { getSupabaseAdmin } = require('../services/supabaseAdmin');
const { uploadMedia, MAX_SIZE, ALLOWED_TYPES } = require('../services/storageService');
const { ensureProfile, getBootstrapPayload } = require('../services/bootstrapService');
const { buildProfileMap, enrichItems, MINIMAL_PROFILE_FIELDS } = require('../lib/apiHelpers');

const router = express.Router();

/** Rutas públicas (sin auth) */
router.get('/health', (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

router.get('/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  });
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().optional(),
});

function normalizeRegisterUsername(raw) {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 20);
  return `user${Math.random().toString(36).slice(2, 8)}`;
}

/** Registro con correo ya confirmado (sin depender de la opción "Confirm email" en Supabase). */
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Email válido y contraseña de al menos 6 caracteres.',
    });
  }
  const { email, password } = parsed.data;
  const username = normalizeRegisterUsername(parsed.data.username);
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) {
      return res.status(400).json({ error: error.message || 'No se pudo crear la cuenta.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

/** Middleware de auth para el resto de rutas */
router.use(requireAuth);

const idSchema = z.string().min(2).max(80);
const channelTypeSchema = z.enum(['text', 'voice']);
const roleSchema = z.enum(['owner', 'admin', 'mod', 'member']);
const actionSchema = z.enum(['send_message', 'join_voice', 'use_webcam', 'share_screen', 'manage_channel', 'moderate_voice']);

function handleError(res, err) {
  const message = err?.message || 'Error interno';
  return res.status(400).json({ error: message });
}

async function requireAdmin(serverId, userId) {
  // Modo servidor de amigos: cualquier miembro puede gestionar.
  return getUserRole(serverId, userId);
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
  // Modo servidor de amigos: permisos completos por defecto para todos.
  if (role && action) return true;
  return true;
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

router.post('/presence/offline', async (req, res) => {
  try {
    const raw = typeof req.body === 'object' ? req.body : {};
    const body = z.object({
      userId: idSchema,
      username: z.string().min(2).max(20),
    }).parse({
      userId: raw.userId || req.query?.userId,
      username: raw.username || req.query?.username,
    });
    if (body.userId !== req.userId) throw new Error('No autorizado.');

    await ensureProfile({ userId: body.userId, username: body.username });
    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from('profiles')
      .update({
        status: 'offline',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', body.userId);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/token', (req, res) => getLiveKitToken(req, res));

router.post('/upload', async (req, res) => {
  try {
    const raw = typeof req.body === 'object' ? req.body : {};
    const { data: base64, mimeType, fileName } = z.object({
      data: z.string().min(1),
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
    }).parse(raw);

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    const mime = mimeType || (match ? match[1] : 'application/octet-stream');
    const b64 = match ? match[2] : base64;

    if (!ALLOWED_TYPES.some(t => mime.startsWith(t))) {
      throw new Error('Tipo de archivo no permitido.');
    }
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_SIZE) throw new Error('Archivo demasiado grande.');

    const url = await uploadMedia({
      buffer,
      mimeType: mime,
      fileName: fileName || 'file',
      userId: req.userId,
    });
    return res.json({ url });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/bootstrap', async (req, res) => {
  try {
    const userId = req.userId;
    const username = z.string().min(2).max(20).parse(String(req.query.username || ''));
    const payload = await getBootstrapPayload({ userId, username });
    return res.json(payload);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/profiles/upsert', async (req, res) => {
  try {
    const rawBody = typeof req.body === 'string' ? req.body : null;
    const parsedBody = rawBody ? JSON.parse(rawBody) : req.body;
    const body = z.object({
      username: z.string().min(2).max(20),
      displayName: z.string().min(2).max(30).optional(),
      avatarUrl: z.string().url().optional().or(z.literal('')),
      bio: z.string().max(180).optional(),
      status: z.enum(['online', 'idle', 'dnd', 'offline']).optional(),
    }).parse(parsedBody);

    const userId = req.userId;
    await ensureProfile({ userId, username: body.username });
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
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/servers/:serverId/invitations', async (req, res) => {
  try {
    const { serverId } = z.object({ serverId: idSchema }).parse(req.params);
    const body = z.object({
      expiresInHours: z.number().min(1).max(168).optional().default(24),
      maxUses: z.number().int().min(1).max(100).optional(),
    }).parse(req.body || {});

    const sb = getSupabaseAdmin();
    const { data: member } = await sb.from('server_members').select('role').eq('server_id', serverId).eq('user_id', req.userId).single();
    if (!member || !['owner', 'admin', 'mod'].includes(member.role)) throw new Error('Sin permiso para crear invitaciones.');

    const expiresAt = new Date(Date.now() + body.expiresInHours * 3600 * 1000).toISOString();
    const code = Math.random().toString(36).slice(2, 10).toUpperCase() + Math.random().toString(36).slice(2, 10).toUpperCase();

    const { data, error } = await sb.from('invitations').insert({
      server_id: serverId,
      code,
      created_by: req.userId,
      expires_at: expiresAt,
      max_uses: body.maxUses || null,
    }).select('id, code, expires_at, max_uses').single();

    if (error) throw error;
    return res.json({ ...data, url: `${req.protocol}://${req.get('host')}/join/${data.code}` });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/invitations/:code', async (req, res) => {
  try {
    const { code } = z.object({ code: z.string().min(1).max(20) }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('invitations').select('id, server_id, code, expires_at, max_uses, uses_count').eq('code', String(code).toUpperCase()).single();
    if (error || !data) throw new Error('Invitación no encontrada.');
    if (new Date(data.expires_at) < new Date()) throw new Error('Invitación expirada.');
    if (data.max_uses != null && data.uses_count >= data.max_uses) throw new Error('Invitación agotada.');

    const { data: server } = await sb.from('servers').select('id, name').eq('id', data.server_id).single();
    const { data: member } = await sb.from('server_members').select('user_id').eq('server_id', data.server_id).eq('user_id', req.userId).single();
    return res.json({ server, code: data.code, alreadyMember: !!member });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/invitations/:code/join', async (req, res) => {
  try {
    const { code } = z.object({ code: z.string().min(1).max(20) }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data: inv, error: invErr } = await sb.from('invitations').select('*').eq('code', String(code).toUpperCase()).single();
    if (invErr || !inv) throw new Error('Invitación no encontrada.');
    if (new Date(inv.expires_at) < new Date()) throw new Error('Invitación expirada.');
    if (inv.max_uses != null && inv.uses_count >= inv.max_uses) throw new Error('Invitación agotada.');

    const { error: memberErr } = await sb.from('server_members').upsert({ server_id: inv.server_id, user_id: req.userId, role: 'member' }, { onConflict: 'server_id,user_id' });
    if (memberErr) throw memberErr;

    await sb.from('invitations').update({ uses_count: inv.uses_count + 1 }).eq('id', inv.id);
    return res.json({ ok: true, serverId: inv.server_id });
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/servers/:serverId', async (req, res) => {
  try {
    const params = z.object({ serverId: idSchema }).parse(req.params);
    const body = z.object({ name: z.string().min(2).max(40) }).parse(req.body);
    await requireAdmin(params.serverId, req.userId);
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
      type: channelTypeSchema,
      name: z.string().min(2).max(40),
    }).parse(req.body);
    const sb = getSupabaseAdmin();
    await requireAdmin(body.serverId, req.userId);

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
        created_by: req.userId,
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
      name: z.string().min(2).max(40).optional(),
      isArchived: z.boolean().optional(),
    }).parse(req.body);
    const serverId = await getChannelServer(params.channelId);
    await requireAdmin(serverId, req.userId);
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
    const profileMap = await buildProfileMap(sb, ids);
    return res.json(enrichItems(members || [], profileMap, 'user_id', 'profile'));
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/servers/:serverId/members/:memberUserId/role', async (req, res) => {
  try {
    const params = z.object({ serverId: idSchema, memberUserId: idSchema }).parse(req.params);
    const body = z.object({ role: roleSchema }).parse(req.body);
    await getUserRole(params.serverId, req.userId);

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
      action: actionSchema,
    }).parse(req.query);
    const result = await canPerform({
      serverId: q.serverId,
      channelId: q.channelId,
      userId: req.userId,
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
      role: roleSchema,
      canSendMessage: z.boolean().nullable().optional(),
      canJoinVoice: z.boolean().nullable().optional(),
      canUseWebcam: z.boolean().nullable().optional(),
      canShareScreen: z.boolean().nullable().optional(),
      canManageChannel: z.boolean().nullable().optional(),
      canModerateVoice: z.boolean().nullable().optional(),
    }).parse(req.body);

    const serverId = await getChannelServer(params.channelId);
    await requireAdmin(serverId, req.userId);

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

router.get('/messages/search', async (req, res) => {
  try {
    const q = z.object({
      channelId: idSchema,
      q: z.string().min(1).max(100),
    }).parse(req.query);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('messages')
      .select('id, channel_id, author_id, body, created_at, edited_at, message_type')
      .eq('channel_id', q.channelId)
      .ilike('body', `%${q.q.replace(/%/g, '\\%')}%`)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    const authorIds = [...new Set((data || []).map(m => m.author_id))];
    const profilesMap = await buildProfileMap(sb, authorIds, MINIMAL_PROFILE_FIELDS);
    return res.json(enrichItems(data || [], profilesMap));
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/messages/:channelId', async (req, res) => {
  try {
    const params = z.object({ channelId: idSchema }).parse(req.params);
    const before = req.query.before;
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const sb = getSupabaseAdmin();
    const parentId = req.query.parentMessageId;
    let q = sb
      .from('messages')
      .select('id, channel_id, author_id, body, created_at, edited_at, message_type, media_data, media_mime, media_name, media_duration_ms, parent_message_id')
      .eq('channel_id', params.channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (parentId) q = q.eq('parent_message_id', parentId);
    else q = q.is('parent_message_id', null);
    if (before) q = q.lt('created_at', before);
    const { data: raw, error } = await q;
    if (error) throw error;
    const data = (raw || []).filter(Boolean).filter(m => m && m.id).reverse();

    const authorIds = [...new Set((data || []).map(m => m.author_id))];
    const profilesMap = await buildProfileMap(sb, authorIds);

    const msgIds = (data || []).map(m => m.id);
    let reactionsMap = {};
    let replyCountMap = {};
    if (msgIds.length) {
      const [reactionsRes, repliesRes] = await Promise.allSettled([
        sb.from('message_reactions').select('message_id, user_id, emoji').in('message_id', msgIds),
        sb.from('messages').select('parent_message_id').in('parent_message_id', msgIds),
      ]);
      const reactionsData = reactionsRes.status === 'fulfilled' && reactionsRes.value?.data ? reactionsRes.value.data : [];
      const repliesData = repliesRes.status === 'fulfilled' && repliesRes.value?.data ? repliesRes.value.data : [];
      reactionsData.forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push({ userId: r.user_id, emoji: r.emoji });
      });
      repliesData.forEach(r => {
        if (r?.parent_message_id) replyCountMap[r.parent_message_id] = (replyCountMap[r.parent_message_id] || 0) + 1;
      });
    }
    const enriched = (data || []).map(m => ({
      ...m,
      profiles: profilesMap[m.author_id] || null,
      reactions: reactionsMap[m.id] || [],
      replyCount: replyCountMap[m.id] || 0,
    }));
    return res.json({ messages: enriched, hasMore: (raw || []).length >= limit });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/messages', async (req, res) => {
  try {
    const body = z.object({
      channelId: idSchema,
      parentMessageId: z.string().uuid().optional(),
      text: z.string().max(1000).optional().default(''),
      messageType: z.enum(['text', 'image', 'video', 'audio', 'file']).optional().default('text'),
      mediaUrl: z.string().url().optional(),
      mediaData: z.string().optional(),
      mediaMime: z.string().optional(),
      mediaName: z.string().optional(),
      mediaDurationMs: z.number().int().nonnegative().optional(),
    }).parse(req.body);

    const text = (body.text || '').trim();
    const mediaSource = body.mediaUrl || body.mediaData;
    const hasMedia = Boolean(mediaSource);
    if (!text && !hasMedia) throw new Error('Mensaje vacío.');
    if (body.messageType !== 'text' && !hasMedia) throw new Error('Falta contenido multimedia.');
    if (body.mediaData && body.mediaData.length > 14_000_000) throw new Error('Media demasiado grande.');

    const sb = getSupabaseAdmin();
    const fallbackBody = body.messageType === 'image'
      ? '[imagen]'
      : body.messageType === 'video'
        ? '[video]'
        : body.messageType === 'audio'
          ? '[audio]'
          : body.messageType === 'file'
            ? '[archivo]'
            : '';
    const { data, error } = await sb
      .from('messages')
      .insert({
        channel_id: body.channelId,
        author_id: req.userId,
        parent_message_id: body.parentMessageId || null,
        body: text || fallbackBody,
        message_type: body.messageType,
        media_data: body.mediaUrl || body.mediaData || null,
        media_mime: body.mediaMime || null,
        media_name: body.mediaName || null,
        media_duration_ms: body.mediaDurationMs ?? null,
      })
      .select('id, channel_id, author_id, body, created_at, message_type, media_data, media_mime, media_name, media_duration_ms')
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.patch('/messages/:messageId', async (req, res) => {
  try {
    const params = z.object({ messageId: z.string().uuid() }).parse(req.params);
    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const body = z.object({ text: z.string().min(1).max(1000) }).parse(rawBody);

    const sb = getSupabaseAdmin();
    const { data: msg, error: fetchErr } = await sb
      .from('messages')
      .select('id, channel_id, author_id, message_type')
      .eq('id', params.messageId)
      .single();
    if (fetchErr || !msg) throw new Error('Mensaje no encontrado.');
    if (msg.author_id !== req.userId) throw new Error('Solo el autor puede editar.');

    const { data, error } = await sb
      .from('messages')
      .update({ body: body.text.trim(), edited_at: new Date().toISOString() })
      .eq('id', params.messageId)
      .eq('author_id', req.userId)
      .select('id, body, edited_at')
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete('/messages/:messageId', async (req, res) => {
  try {
    const params = z.object({ messageId: z.string().uuid() }).parse(req.params);

    const sb = getSupabaseAdmin();
    const { data: msg, error: fetchErr } = await sb
      .from('messages')
      .select('id, author_id')
      .eq('id', params.messageId)
      .single();
    if (fetchErr || !msg) throw new Error('Mensaje no encontrado.');
    if (msg.author_id !== req.userId) throw new Error('Solo el autor puede borrar.');

    const { error } = await sb.from('messages').delete().eq('id', params.messageId);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = z.object({ messageId: z.string().uuid() }).parse(req.params);
    const body = z.object({ emoji: z.string().min(1).max(10) }).parse(req.body || {});

    const sb = getSupabaseAdmin();
    const { data: existing } = await sb.from('message_reactions').select('user_id').eq('message_id', messageId).eq('user_id', req.userId).eq('emoji', body.emoji).maybeSingle();
    if (existing) {
      await sb.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', req.userId).eq('emoji', body.emoji);
      return res.json({ action: 'removed' });
    }
    await sb.from('message_reactions').upsert({ message_id: messageId, user_id: req.userId, emoji: body.emoji }, { onConflict: 'message_id,user_id,emoji' });
    return res.json({ action: 'added' });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/dm', async (req, res) => {
  try {
    const sb = getSupabaseAdmin();
    const { data: dms } = await sb.from('dm_participants').select('dm_channel_id').eq('user_id', req.userId);
    if (!dms?.length) return res.json([]);
    const dmIds = dms.map(d => d.dm_channel_id);
    const { data: participants } = await sb.from('dm_participants').select('dm_channel_id, user_id').in('dm_channel_id', dmIds);
    const otherUserIds = (participants || []).filter(p => p.user_id !== req.userId).map(p => p.user_id);
    const profilesMap = await buildProfileMap(sb, otherUserIds, 'user_id, display_name, username, avatar_url, status');
    const dmMap = {};
    (participants || []).forEach(p => {
      if (p.user_id !== req.userId) dmMap[p.dm_channel_id] = { ...profilesMap[p.user_id], user_id: p.user_id };
    });
    return res.json(dms.map(d => ({ id: d.dm_channel_id, otherUser: dmMap[d.dm_channel_id] || null })));
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/dm', async (req, res) => {
  try {
    let otherUserId = req.body?.otherUserId ?? req.query?.otherUserId;
    if (typeof otherUserId !== 'string') {
      if (typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          otherUserId = parsed?.otherUserId;
        } catch (_) {}
      }
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        otherUserId = req.body.otherUserId ?? otherUserId;
      }
    }
    otherUserId = typeof otherUserId === 'string' ? otherUserId.trim() : '';
    if (!otherUserId || otherUserId.length < 2 || otherUserId.length > 80) {
      return res.status(400).json({ error: 'Se requiere otherUserId (ID del usuario). Comprueba que el perfil tenga un ID válido.' });
    }
    if (otherUserId === req.userId) throw new Error('No puedes enviarte DM a ti mismo.');
    const sb = getSupabaseAdmin();
    const { data: otherProfile } = await sb.from('profiles').select('user_id').eq('user_id', otherUserId).maybeSingle();
    if (!otherProfile) {
      const fallbackUsername = `user_${String(otherUserId).slice(0, 8)}`;
      await ensureProfile({ userId: otherUserId, username: fallbackUsername });
    }
    const { data: existing } = await sb.from('dm_participants').select('dm_channel_id').eq('user_id', req.userId);
    const myDmIds = (existing || []).map(d => d.dm_channel_id);
    if (myDmIds.length) {
      const { data: match } = await sb.from('dm_participants').select('dm_channel_id').eq('user_id', otherUserId).in('dm_channel_id', myDmIds).limit(1).maybeSingle();
      if (match) return res.json({ id: match.dm_channel_id });
    }
    const { data: created } = await sb.from('dm_channels').insert({}).select('id').single();
    await sb.from('dm_participants').insert([{ dm_channel_id: created.id, user_id: req.userId }, { dm_channel_id: created.id, user_id: otherUserId }]);
    return res.json({ id: created.id });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/dm/:dmChannelId/messages', async (req, res) => {
  try {
    const { dmChannelId } = z.object({ dmChannelId: idSchema }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data: member } = await sb.from('dm_participants').select('user_id').eq('dm_channel_id', dmChannelId).eq('user_id', req.userId).single();
    if (!member) throw new Error('No tienes acceso a este DM.');
    const { data, error } = await sb.from('dm_messages').select('id, dm_channel_id, author_id, body, created_at, edited_at, message_type, media_data, media_name').eq('dm_channel_id', dmChannelId).order('created_at', { ascending: true }).limit(100);
    if (error) throw error;
    const authorIds = [...new Set((data || []).map(m => m.author_id))];
    const profilesMap = await buildProfileMap(sb, authorIds, MINIMAL_PROFILE_FIELDS);
    return res.json(enrichItems(data || [], profilesMap));
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/dm/:dmChannelId/messages', async (req, res) => {
  try {
    const { dmChannelId } = z.object({ dmChannelId: idSchema }).parse(req.params);
    const body = z.object({
      text: z.string().max(1000).optional().default(''),
      mediaUrl: z.string().url().optional(),
      mediaData: z.string().optional(),
      mediaMime: z.string().optional(),
      mediaName: z.string().optional(),
    }).parse(req.body || {});
    const sb = getSupabaseAdmin();
    const { data: member } = await sb.from('dm_participants').select('user_id').eq('dm_channel_id', dmChannelId).eq('user_id', req.userId).single();
    if (!member) throw new Error('No tienes acceso a este DM.');
    const text = (body.text || '').trim();
    const hasMedia = Boolean(body.mediaUrl || body.mediaData);
    if (!text && !hasMedia) throw new Error('Mensaje vacío.');
    const { data, error } = await sb.from('dm_messages').insert({
      dm_channel_id: dmChannelId,
      author_id: req.userId,
      body: text || '[archivo]',
      message_type: hasMedia ? 'file' : 'text',
      media_data: body.mediaUrl || body.mediaData || null,
      media_mime: body.mediaMime || null,
      media_name: body.mediaName || null,
    }).select('id, dm_channel_id, author_id, body, created_at, message_type, media_data').single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/messages/:channelId/thread/:parentId', async (req, res) => {
  try {
    const { channelId, parentId } = z.object({ channelId: idSchema, parentId: z.string().uuid() }).parse(req.params);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('messages').select('id, channel_id, author_id, body, created_at, edited_at, message_type, media_data, parent_message_id').eq('channel_id', channelId).eq('parent_message_id', parentId).order('created_at', { ascending: true });
    if (error) throw error;
    const authorIds = [...new Set((data || []).map(m => m.author_id))];
    const profilesMap = await buildProfileMap(sb, authorIds, MINIMAL_PROFILE_FIELDS);
    return res.json(enrichItems(data || [], profilesMap));
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
