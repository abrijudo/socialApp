const { AccessToken } = require('livekit-server-sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { username, room } = req.query;

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl     = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(500).json({
      error: 'LiveKit no configurado. Añade LIVEKIT_URL, LIVEKIT_API_KEY y LIVEKIT_API_SECRET en las variables de entorno.'
    });
  }

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'El parámetro username es obligatorio.' });
  }

  const cleanName = String(username).trim().slice(0, 20);
  const cleanRoom = String(room || 'general').trim() || 'general';

  const at = new AccessToken(apiKey, apiSecret, {
    identity: cleanName,
    name:     cleanName,
    ttl:      3600, // 1 hora
  });

  at.addGrant({
    room:           cleanRoom,
    roomJoin:       true,
    canPublish:     true,
    canSubscribe:   true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return res.json({ token, url: wsUrl });
};
