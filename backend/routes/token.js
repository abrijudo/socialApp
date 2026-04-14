const { AccessToken } = require('livekit-server-sdk');
const { getSupabaseAdmin } = require('../services/supabaseAdmin');

async function getLiveKitToken(req, res) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(500).json({
      error: 'LiveKit no configurado.',
    });
  }

  const username = String(req.query.username || req.query.name || '').trim().slice(0, 20) || 'Usuario';
  const room = String(req.query.room || 'general').trim() || 'general';

  const parts = room.split(':');
  if (parts.length >= 2) {
    const serverId = parts[0];
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from('server_members')
      .select('user_id')
      .eq('server_id', serverId)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (!data) {
      return res.status(403).json({ error: 'No eres miembro de este servidor.' });
    }
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: req.userId,
    name: username,
    ttl: 3600,
  });

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return res.json({ token, url: wsUrl });
}

module.exports = { getLiveKitToken };
