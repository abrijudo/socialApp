const { RoomServiceClient } = require('livekit-server-sdk');

const CAMERA_SOURCE = 1; // livekit.TrackSource.CAMERA
const MIC_SOURCE = 2; // livekit.TrackSource.MICROPHONE
const SCREEN_SOURCE = 3; // livekit.TrackSource.SCREEN_SHARE

function wsUrlToHttpHost(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^wss:\/\//i.test(s)) return `https://${s.slice(6)}`;
  if (/^ws:\/\//i.test(s)) return `http://${s.slice(5)}`;
  return s;
}

function isMicrophoneTrackSource(src) {
  if (src === MIC_SOURCE) return true;
  if (typeof src === 'string' && src.toUpperCase() === 'MICROPHONE') return true;
  return false;
}

function isCameraTrackSource(src) {
  if (src === CAMERA_SOURCE) return true;
  if (typeof src === 'string' && src.toUpperCase() === 'CAMERA') return true;
  return false;
}

function isScreenTrackSource(src) {
  if (src === SCREEN_SOURCE) return true;
  if (typeof src === 'string' && src.toUpperCase() === 'SCREEN_SHARE') return true;
  return false;
}

function mapParticipant(p) {
  const tracks = p.tracks || [];
  let micMuted = true;
  let hasCamera = false;
  let hasScreenShare = false;
  for (let i = 0; i < tracks.length; i += 1) {
    const t = tracks[i];
    let src = t.source;
    if (src != null && typeof src === 'object' && 'valueOf' in src) src = Number(src);
    if (isMicrophoneTrackSource(src)) {
      micMuted = Boolean(t.muted);
      continue;
    }
    if (isCameraTrackSource(src) && !t.muted) {
      hasCamera = true;
      continue;
    }
    if (isScreenTrackSource(src) && !t.muted) {
      hasScreenShare = true;
    }
  }
  return {
    identity: String(p.identity || ''),
    name: String(p.name || p.identity || 'Usuario').slice(0, 80),
    micMuted,
    hasCamera,
    hasScreenShare,
  };
}

/**
 * @param {string} serverId
 * @param {string[]} voiceChannelIds
 * @returns {Promise<Record<string, Array<{ identity: string, name: string, micMuted: boolean, hasCamera: boolean, hasScreenShare: boolean }>>>}
 */
async function listParticipantsByVoiceChannels(serverId, voiceChannelIds) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL;
  const out = {};
  if (!apiKey || !apiSecret || !wsUrl || !serverId || !voiceChannelIds?.length) {
    voiceChannelIds.forEach((id) => {
      out[id] = [];
    });
    return out;
  }
  const host = wsUrlToHttpHost(wsUrl);
  if (!host) {
    voiceChannelIds.forEach((id) => {
      out[id] = [];
    });
    return out;
  }
  const client = new RoomServiceClient(host, apiKey, apiSecret);
  await Promise.all(
    voiceChannelIds.map(async (channelId) => {
      const room = `${serverId}:${channelId}`;
      try {
        const parts = await client.listParticipants(room);
        out[channelId] = (parts || []).map(mapParticipant);
      } catch (_) {
        out[channelId] = [];
      }
    }),
  );
  return out;
}

module.exports = { listParticipantsByVoiceChannels, wsUrlToHttpHost };
