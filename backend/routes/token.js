const { AccessToken } = require('livekit-server-sdk');

/** Genera token LiveKit. Requiere req.userId (auth middleware). */
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
