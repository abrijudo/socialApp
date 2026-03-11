const SUPABASE_URL = 'https://twlqfiatocyeasmnatzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3bHFmaWF0b2N5ZWFzbW5hdHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDc5NTEsImV4cCI6MjA4ODYyMzk1MX0.hosd2PCXszVxMeuqfgDb94sTZcF20BYvNptfsVl1qxk';
const VOICE_CHANNEL_KEY = 'voice-channel-id';
const VOICE_REJOIN_KEY = 'voice-rejoin-on-reload';
const STREAM_LAYOUT_KEY = 'stream-layout-mode';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  userId: localStorage.getItem('user-id') || crypto.randomUUID(),
  username: localStorage.getItem('username') || '',
  profile: null,
  server: null,
  role: 'member',
  members: [],
  channels: [],
  activeTextChannelId: null,
  activeVoiceChannelId: localStorage.getItem(VOICE_CHANNEL_KEY) || null,
  room: null,
  localCameraTrack: null,
  localScreenTrack: null,
  streamLayoutMode: localStorage.getItem(STREAM_LAYOUT_KEY) || 'grid',
  pinnedTileId: null,
  screenAdaptTimer: null,
  streamTiles: {},
};
localStorage.setItem('user-id', state.userId);

const els = {
  usernameDialog: document.getElementById('username-dialog'),
  usernameForm: document.getElementById('username-form'),
  usernameInput: document.getElementById('username-input'),
  profileDialog: document.getElementById('profile-dialog'),
  profileForm: document.getElementById('profile-form'),
  profileDisplayName: document.getElementById('profile-display-name'),
  profileAvatarUrl: document.getElementById('profile-avatar-url'),
  profileBio: document.getElementById('profile-bio'),
  profileStatus: document.getElementById('profile-status'),
  serverDialog: document.getElementById('server-dialog'),
  serverForm: document.getElementById('server-form'),
  serverNameInput: document.getElementById('server-name-input'),
  channelDialog: document.getElementById('channel-dialog'),
  channelForm: document.getElementById('channel-form'),
  channelDialogTitle: document.getElementById('channel-dialog-title'),
  channelNameInput: document.getElementById('channel-name-input'),
  channelTypeInput: document.getElementById('channel-type-input'),
  textChannelList: document.getElementById('text-channel-list'),
  voiceChannelList: document.getElementById('voice-channel-list'),
  messages: document.getElementById('messages'),
  messageForm: document.getElementById('message-form'),
  messageInput: document.getElementById('message-input'),
  serverName: document.getElementById('server-name'),
  activeChannelName: document.getElementById('active-channel-name'),
  channelIcon: document.getElementById('channel-icon'),
  userAvatar: document.getElementById('user-avatar'),
  userDisplay: document.getElementById('user-display'),
  userStatus: document.getElementById('user-status'),
  btnProfile: document.getElementById('btn-profile'),
  btnServerSettings: document.getElementById('btn-server-settings'),
  btnNewTextChannel: document.getElementById('btn-new-text-channel'),
  btnNewVoiceChannel: document.getElementById('btn-new-voice-channel'),
  btnVoiceToggle: document.getElementById('btn-voice-toggle'),
  btnWebcamToggle: document.getElementById('btn-webcam-toggle'),
  btnScreenToggle: document.getElementById('btn-screen-toggle'),
  btnLayoutToggle: document.getElementById('btn-layout-toggle'),
  streamsGrid: document.getElementById('streams-grid'),
  membersAdminList: document.getElementById('members-admin-list'),
  permChannelSelect: document.getElementById('perm-channel-select'),
  permRoleSelect: document.getElementById('perm-role-select'),
  permSendMessage: document.getElementById('perm-send-message'),
  permJoinVoice: document.getElementById('perm-join-voice'),
  permUseWebcam: document.getElementById('perm-use-webcam'),
  permShareScreen: document.getElementById('perm-share-screen'),
  permManageChannel: document.getElementById('perm-manage-channel'),
  permModerateVoice: document.getElementById('perm-moderate-voice'),
  btnSavePermissions: document.getElementById('btn-save-permissions'),
};

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Error en la API');
  return payload;
}

function avatarFromProfile(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(profile?.display_name || state.username || 'user')}`;
}

function canManageServer() {
  return ['owner', 'admin'].includes(state.role);
}

async function checkPermission(action, channelId) {
  if (!state.server?.id || !state.userId) return false;
  const q = new URLSearchParams({
    serverId: state.server.id,
    userId: state.userId,
    action,
  });
  if (channelId) q.set('channelId', channelId);
  const result = await api(`/permissions/check?${q.toString()}`);
  return Boolean(result.allowed);
}

function formatTs(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function renderProfile() {
  if (!state.profile) return;
  els.userAvatar.src = avatarFromProfile(state.profile);
  els.userDisplay.textContent = state.profile.display_name || state.profile.username;
  els.userStatus.textContent = state.profile.status || 'online';
}

function sortChannels(channels) {
  return [...channels].sort((a, b) => (a.position || 0) - (b.position || 0));
}

function renderChannels() {
  const textChannels = sortChannels(state.channels.filter(c => c.type === 'text' && !c.is_archived));
  const voiceChannels = sortChannels(state.channels.filter(c => c.type === 'voice' && !c.is_archived));

  els.textChannelList.innerHTML = '';
  els.voiceChannelList.innerHTML = '';

  textChannels.forEach(channel => {
    const btn = document.createElement('button');
    btn.className = `channel-item ${state.activeTextChannelId === channel.id ? 'active' : ''}`;
    btn.innerHTML = `<span>#</span><span>${channel.name}</span>${canManageServer() ? '<span class="actions"><small data-action="rename">✎</small><small data-action="archive">🗑</small></span>' : ''}`;
    btn.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (action) return handleChannelAction(channel, action);
      setActiveTextChannel(channel.id);
    });
    els.textChannelList.appendChild(btn);
  });

  voiceChannels.forEach(channel => {
    const btn = document.createElement('button');
    btn.className = `channel-item ${state.activeVoiceChannelId === channel.id ? 'active' : ''}`;
    btn.innerHTML = `<span>🔊</span><span>${channel.name}</span>${canManageServer() ? '<span class="actions"><small data-action="rename">✎</small><small data-action="archive">🗑</small></span>' : ''}`;
    btn.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (action) return handleChannelAction(channel, action);
      setActiveVoiceChannel(channel.id);
    });
    els.voiceChannelList.appendChild(btn);
  });

  if (canManageServer()) {
    els.permChannelSelect.innerHTML = state.channels
      .filter(c => !c.is_archived)
      .map(c => `<option value="${c.id}">${c.type === 'text' ? '# ' : '🔊 '}${c.name}</option>`)
      .join('');
  }
}

function renderMembersAdmin() {
  if (!els.membersAdminList) return;
  if (!canManageServer()) {
    els.membersAdminList.innerHTML = '<div class="system">No tienes permisos para gestionar miembros.</div>';
    return;
  }
  els.membersAdminList.innerHTML = '';
  state.members.forEach(member => {
    const row = document.createElement('div');
    row.className = 'member-admin-row';
    const name = member.profile?.display_name || member.profile?.username || member.user_id;
    row.innerHTML = `
      <span>${name}</span>
      <select data-user-id="${member.user_id}">
        <option value="member" ${member.role === 'member' ? 'selected' : ''}>member</option>
        <option value="mod" ${member.role === 'mod' ? 'selected' : ''}>mod</option>
        <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>admin</option>
        <option value="owner" ${member.role === 'owner' ? 'selected' : ''}>owner</option>
      </select>
    `;
    const select = row.querySelector('select');
    select.disabled = member.user_id === state.userId && state.role === 'owner';
    select.addEventListener('change', async () => {
      try {
        await api(`/servers/${state.server.id}/members/${member.user_id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ actorUserId: state.userId, role: select.value }),
        });
        await refreshMembers();
      } catch (err) {
        alert(err.message);
        await refreshMembers();
      }
    });
    els.membersAdminList.appendChild(row);
  });
}

async function handleChannelAction(channel, action) {
  const canManage = await checkPermission('manage_channel', channel.id);
  if (!canManage) return alert('No tienes permiso para gestionar este canal.');

  if (action === 'rename') {
    const nextName = prompt('Nuevo nombre de canal:', channel.name);
    if (!nextName || nextName.trim().length < 2) return;
    await api(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: nextName.trim(), userId: state.userId }),
    });
    return;
  }
  if (action === 'archive') {
    if (!confirm(`Archivar canal "${channel.name}"?`)) return;
    await api(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isArchived: true, userId: state.userId }),
    });
  }
}

function renderMessages(messages) {
  els.messages.innerHTML = '';
  messages.forEach(msg => {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    const author = msg.profiles?.display_name || msg.profiles?.username || 'Usuario';
    wrap.innerHTML = `
      <div class="message-header">
        <span class="message-author">${author}</span>
        <span>${formatTs(msg.created_at)}</span>
      </div>
      <div class="message-body"></div>
    `;
    wrap.querySelector('.message-body').textContent = msg.body;
    els.messages.appendChild(wrap);
  });
  els.messages.scrollTop = els.messages.scrollHeight;
}

function updateHeader() {
  const channel = state.channels.find(c => c.id === state.activeTextChannelId);
  els.activeChannelName.textContent = channel?.name || 'sin-canal';
  els.channelIcon.textContent = channel?.type === 'voice' ? '🔊' : '#';
  els.serverName.textContent = state.server?.name || 'Servidor';
}

async function loadMessages() {
  if (!state.activeTextChannelId) return;
  const messages = await api(`/messages/${state.activeTextChannelId}`);
  renderMessages(messages);
}

async function refreshMembers() {
  if (!state.server?.id) return;
  state.members = await api(`/servers/${state.server.id}/members`);
  renderMembersAdmin();
}

async function loadChannelPermissionPreset() {
  if (!canManageServer()) return;
  const channelId = els.permChannelSelect.value;
  const role = els.permRoleSelect.value;
  if (!channelId) return;
  const rows = await api(`/channels/${channelId}/permissions`);
  const row = rows.find(r => r.role === role) || {};
  els.permSendMessage.checked = row.can_send_message ?? false;
  els.permJoinVoice.checked = row.can_join_voice ?? false;
  els.permUseWebcam.checked = row.can_use_webcam ?? false;
  els.permShareScreen.checked = row.can_share_screen ?? false;
  els.permManageChannel.checked = row.can_manage_channel ?? false;
  els.permModerateVoice.checked = row.can_moderate_voice ?? false;
}

async function saveChannelPermissionPreset() {
  if (!canManageServer()) return;
  const channelId = els.permChannelSelect.value;
  const role = els.permRoleSelect.value;
  if (!channelId) return;
  await api(`/channels/${channelId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({
      actorUserId: state.userId,
      role,
      canSendMessage: els.permSendMessage.checked,
      canJoinVoice: els.permJoinVoice.checked,
      canUseWebcam: els.permUseWebcam.checked,
      canShareScreen: els.permShareScreen.checked,
      canManageChannel: els.permManageChannel.checked,
      canModerateVoice: els.permModerateVoice.checked,
    }),
  });
}

async function setActiveTextChannel(channelId) {
  state.activeTextChannelId = channelId;
  renderChannels();
  updateHeader();
  await loadMessages();
}

async function setActiveVoiceChannel(channelId) {
  state.activeVoiceChannelId = channelId;
  localStorage.setItem(VOICE_CHANNEL_KEY, channelId);
  renderChannels();
  if (state.room) {
    await leaveVoice();
    await joinVoice();
  }
}

function getVoiceRoomName() {
  return `${state.server.id}:${state.activeVoiceChannelId}`;
}

async function fetchToken(roomName) {
  const res = await fetch(`/api/token?username=${encodeURIComponent(state.profile.display_name)}&room=${encodeURIComponent(roomName)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo obtener token');
  return data;
}

function chooseBestCodec() {
  try {
    const codecs = RTCRtpSender.getCapabilities('video')?.codecs || [];
    const mimes = codecs.map(c => (c.mimeType || '').toLowerCase());
    if (mimes.includes('video/av1')) return 'av1';
    if (mimes.includes('video/vp9')) return 'vp9';
  } catch (_) {}
  return 'vp8';
}

function setStreamLayout(mode) {
  state.streamLayoutMode = mode;
  localStorage.setItem(STREAM_LAYOUT_KEY, mode);
  els.streamsGrid.classList.toggle('focus', mode === 'focus');
  els.btnLayoutToggle.textContent = mode === 'focus' ? 'Vista grilla' : 'Vista foco';
}

function updatePinnedTileStyles() {
  Object.values(state.streamTiles).forEach(tile => {
    tile.card.classList.toggle('pinned', tile.id === state.pinnedTileId);
  });
}

function setPinnedTile(tileId) {
  state.pinnedTileId = state.pinnedTileId === tileId ? null : tileId;
  updatePinnedTileStyles();
}

function setSpeakingTiles(speakers = []) {
  const bySid = new Set(speakers.map(p => p.sid));
  Object.values(state.streamTiles).forEach(tile => {
    const speaking = tile.participantSid && bySid.has(tile.participantSid);
    tile.card.classList.toggle('speaking', speaking);
  });
}

async function applyScreenSenderParams(track, kbps, fps) {
  if (!track?.sender) return;
  const params = track.sender.getParameters();
  if (!params.encodings?.length) return;
  params.encodings.forEach(enc => {
    enc.maxBitrate = kbps * 1000;
    enc.maxFramerate = fps;
    enc.priority = 'high';
    enc.networkPriority = 'high';
  });
  await track.sender.setParameters(params);
}

function startScreenAdaptation(track, baseKbps = 18000, fps = 60) {
  if (state.screenAdaptTimer) clearInterval(state.screenAdaptTimer);
  let target = Math.round(baseKbps * 0.85);

  state.screenAdaptTimer = setInterval(async () => {
    if (track !== state.localScreenTrack || !state.room) {
      clearInterval(state.screenAdaptTimer);
      state.screenAdaptTimer = null;
      return;
    }
    if (!track.sender) return;
    try {
      const stats = await track.sender.getStats();
      let limitedByBw = false;
      let actualFps = fps;
      stats.forEach(r => {
        if (r.type === 'outbound-rtp' && r.kind === 'video') {
          if (r.qualityLimitationReason === 'bandwidth') limitedByBw = true;
          if (typeof r.framesPerSecond === 'number') actualFps = r.framesPerSecond;
        }
      });
      if (limitedByBw || actualFps < fps * 0.65) target = Math.max(3000, Math.round(target * 0.86));
      else target = Math.min(baseKbps, Math.round(target * 1.06));
      await applyScreenSenderParams(track, target, fps);
    } catch (_) {}
  }, 2500);
}

function upsertStreamTile(id, label, mediaTrack, opts = {}) {
  const { muted = false, participantSid = null } = opts;
  let card = document.getElementById(`stream-${id}`);
  if (!card) {
    card = document.createElement('article');
    card.className = 'stream-card';
    card.id = `stream-${id}`;
    card.innerHTML = `
      <div class="stream-head">
        <span>${label}</span>
        <span class="stream-actions">
          <button class="stream-btn" data-action="pin">Pin</button>
          <button class="stream-btn" data-action="fs">Full</button>
        </span>
      </div>
      <video autoplay playsinline ${muted ? 'muted' : ''}></video>
    `;
    els.streamsGrid.appendChild(card);
    card.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (action === 'pin') return setPinnedTile(id);
      if (action === 'fs') {
        const video = card.querySelector('video');
        video?.requestFullscreen?.().catch(() => {});
      }
    });
  }
  const video = card.querySelector('video');
  mediaTrack.attach(video);
  els.streamsGrid.classList.remove('hidden');
  state.streamTiles[id] = { id, card, participantSid };
  updatePinnedTileStyles();
}

function removeStreamTile(id) {
  const node = document.getElementById(`stream-${id}`);
  node?.remove();
  delete state.streamTiles[id];
  if (state.pinnedTileId === id) state.pinnedTileId = null;
  if (!els.streamsGrid.children.length) els.streamsGrid.classList.add('hidden');
}

async function joinVoice() {
  if (!state.activeVoiceChannelId || !state.profile || state.room) return;
  const allowed = await checkPermission('join_voice', state.activeVoiceChannelId);
  if (!allowed) return alert('No tienes permiso para entrar al canal de voz.');
  const { Room, RoomEvent, Track } = LivekitClient;
  const roomName = getVoiceRoomName();
  const { token, url } = await fetchToken(roomName);
  const room = new Room();

  room
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.style.display = 'none';
        document.body.appendChild(el);
      } else if (track.kind === Track.Kind.Video) {
        const source = publication?.source || track.source || 'video';
        const tileId = `${participant.sid}:${source}`;
        const label = `${participant.name || participant.identity} · ${source === Track.Source.ScreenShare ? 'pantalla' : 'webcam'}`;
        upsertStreamTile(tileId, label, track, { participantSid: participant.sid });
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      track.detach();
      if (track.kind === Track.Kind.Video) {
        const source = publication?.source || track.source || 'video';
        removeStreamTile(`${participant.sid}:${source}`);
      }
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeakingTiles(speakers))
    .on(RoomEvent.Disconnected, () => {
      state.room = null;
      els.btnVoiceToggle.textContent = 'Conectar voz';
      els.btnVoiceToggle.classList.remove('danger');
      Object.keys(state.streamTiles).forEach(removeStreamTile);
      state.pinnedTileId = null;
    });

  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  state.room = room;
  localStorage.setItem(VOICE_REJOIN_KEY, '1');
  els.btnVoiceToggle.textContent = 'Salir de voz';
  els.btnVoiceToggle.classList.add('danger');
}

async function leaveVoice() {
  if (!state.room) return;
  if (state.localCameraTrack) await toggleWebcam(true);
  if (state.localScreenTrack) await toggleScreen(true);
  await state.room.disconnect();
  state.room = null;
  localStorage.removeItem(VOICE_REJOIN_KEY);
  els.btnVoiceToggle.textContent = 'Conectar voz';
  els.btnVoiceToggle.classList.remove('danger');
}

async function toggleWebcam(forceOff = false) {
  if (!state.room) return;
  const { Track } = LivekitClient;
  if (!forceOff) {
    const allowed = await checkPermission('use_webcam', state.activeVoiceChannelId);
    if (!allowed) return alert('No tienes permiso para usar webcam en este canal.');
  }
  if (state.localCameraTrack || forceOff) {
    if (!state.localCameraTrack) return;
    const t = state.localCameraTrack;
    state.localCameraTrack = null;
    t.mediaStreamTrack.stop();
    await state.room.localParticipant.unpublishTrack(t);
    removeStreamTile('local:camera');
    els.btnWebcamToggle.classList.remove('danger');
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    audio: false,
  });
  const camTrack = new LivekitClient.LocalVideoTrack(stream.getVideoTracks()[0], undefined, false);
  await state.room.localParticipant.publishTrack(camTrack, {
    source: Track.Source.Camera,
    videoCodec: chooseBestCodec(),
    videoEncoding: { maxBitrate: 4500 * 1000, maxFramerate: 30, priority: 'high' },
  });
  state.localCameraTrack = camTrack;
  upsertStreamTile('local:camera', `${state.profile.display_name} (tú) · webcam`, camTrack, { muted: true });
  els.btnWebcamToggle.classList.add('danger');
}

async function toggleScreen(forceOff = false) {
  if (!state.room) return;
  const { Track } = LivekitClient;
  if (!forceOff) {
    const allowed = await checkPermission('share_screen', state.activeVoiceChannelId);
    if (!allowed) return alert('No tienes permiso para compartir pantalla en este canal.');
  }
  if (state.localScreenTrack || forceOff) {
    if (!state.localScreenTrack) return;
    const t = state.localScreenTrack;
    state.localScreenTrack = null;
    t.mediaStreamTrack.stop();
    await state.room.localParticipant.unpublishTrack(t);
    removeStreamTile('local:screen');
    if (state.screenAdaptTimer) {
      clearInterval(state.screenAdaptTimer);
      state.screenAdaptTimer = null;
    }
    els.btnScreenToggle.classList.remove('danger');
    return;
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60, max: 60 } },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  try {
    await track.applyConstraints({ frameRate: { ideal: 60, max: 60 } });
    track.contentHint = 'detail';
  } catch (_) {}
  const screenTrack = new LivekitClient.LocalVideoTrack(track, undefined, false);
  await state.room.localParticipant.publishTrack(screenTrack, {
    source: Track.Source.ScreenShare,
    videoCodec: chooseBestCodec(),
    videoEncoding: { maxBitrate: 20000 * 1000, maxFramerate: 60, priority: 'high' },
    degradationPreference: 'balanced',
    backupCodec: true,
  });
  await applyScreenSenderParams(screenTrack, 18000, 60).catch(() => {});
  startScreenAdaptation(screenTrack, 20000, 60);
  state.localScreenTrack = screenTrack;
  upsertStreamTile('local:screen', `${state.profile.display_name} (tú) · pantalla`, screenTrack, { muted: true });
  track.addEventListener('ended', () => { toggleScreen(true).catch(() => {}); });
  els.btnScreenToggle.classList.add('danger');
}

function wireEvents() {
  els.usernameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = els.usernameInput.value.trim();
    if (username.length < 2) return;
    localStorage.setItem('username', username);
    state.username = username;
    els.usernameDialog.close();
    await boot();
  });

  els.messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text || !state.activeTextChannelId) return;
    const allowed = await checkPermission('send_message', state.activeTextChannelId);
    if (!allowed) {
      alert('No tienes permiso para enviar mensajes en este canal.');
      return;
    }
    await api('/messages', {
      method: 'POST',
      body: JSON.stringify({ channelId: state.activeTextChannelId, authorId: state.userId, text }),
    });
    els.messageInput.value = '';
  });

  els.btnProfile.addEventListener('click', () => {
    if (!state.profile) return;
    els.profileDisplayName.value = state.profile.display_name || '';
    els.profileAvatarUrl.value = state.profile.avatar_url || '';
    els.profileBio.value = state.profile.bio || '';
    els.profileStatus.value = state.profile.status || 'online';
    els.profileDialog.showModal();
  });

  els.profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.profile = await api('/profiles/upsert', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        username: state.username,
        displayName: els.profileDisplayName.value.trim(),
        avatarUrl: els.profileAvatarUrl.value.trim(),
        bio: els.profileBio.value.trim(),
        status: els.profileStatus.value,
      }),
    });
    renderProfile();
    els.profileDialog.close();
  });

  els.btnServerSettings.addEventListener('click', () => {
    if (!canManageServer()) return;
    els.serverNameInput.value = state.server?.name || '';
    els.serverDialog.showModal();
    loadChannelPermissionPreset().catch(() => {});
  });

  els.serverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.server = await api(`/servers/${state.server.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: els.serverNameInput.value.trim(), userId: state.userId }),
    });
    updateHeader();
    els.serverDialog.close();
  });

  const openChannelDialog = (type) => {
    els.channelTypeInput.value = type;
    els.channelDialogTitle.textContent = type === 'text' ? 'Nuevo canal de texto' : 'Nuevo canal de voz';
    els.channelNameInput.value = '';
    els.channelDialog.showModal();
  };
  els.btnNewTextChannel.addEventListener('click', () => openChannelDialog('text'));
  els.btnNewVoiceChannel.addEventListener('click', () => openChannelDialog('voice'));

  els.channelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canManageServer()) return;
    await api('/channels', {
      method: 'POST',
      body: JSON.stringify({
        serverId: state.server.id,
        userId: state.userId,
        type: els.channelTypeInput.value,
        name: els.channelNameInput.value.trim(),
      }),
    });
    els.channelDialog.close();
  });

  els.btnVoiceToggle.addEventListener('click', async () => {
    if (state.room) await leaveVoice();
    else await joinVoice();
  });
  els.btnWebcamToggle.addEventListener('click', () => toggleWebcam());
  els.btnScreenToggle.addEventListener('click', () => toggleScreen());
  els.btnLayoutToggle.addEventListener('click', () => {
    setStreamLayout(state.streamLayoutMode === 'focus' ? 'grid' : 'focus');
  });
  els.permChannelSelect.addEventListener('change', () => loadChannelPermissionPreset().catch(err => alert(err.message)));
  els.permRoleSelect.addEventListener('change', () => loadChannelPermissionPreset().catch(err => alert(err.message)));
  els.btnSavePermissions.addEventListener('click', async () => {
    try {
      await saveChannelPermissionPreset();
      alert('Permisos guardados.');
    } catch (err) {
      alert(err.message);
    }
  });
}

function subscribeRealtime() {
  sb.channel('channels-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, ({ new: row, old }) => {
      if (row?.server_id !== state.server?.id && old?.server_id !== state.server?.id) return;
      const id = row?.id || old?.id;
      state.channels = state.channels.filter(c => c.id !== id);
      if (row) state.channels.push(row);
      renderChannels();
      updateHeader();
    })
    .subscribe();

  sb.channel('messages-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: row }) => {
      if (row.channel_id !== state.activeTextChannelId) return;
      await loadMessages();
    })
    .subscribe();

  sb.channel('server-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers' }, ({ new: row }) => {
      if (row.id !== state.server?.id) return;
      state.server = row;
      updateHeader();
    })
    .subscribe();

  sb.channel('profiles-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      if (row.user_id !== state.userId) return;
      state.profile = row;
      renderProfile();
    })
    .subscribe();

  sb.channel('members-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, async ({ new: row, old }) => {
      if (row?.server_id !== state.server?.id && old?.server_id !== state.server?.id) return;
      await refreshMembers();
      const me = state.members.find(m => m.user_id === state.userId);
      if (me) {
        state.role = me.role;
        renderChannels();
        renderMembersAdmin();
      }
    })
    .subscribe();
}

async function boot() {
  setStreamLayout(state.streamLayoutMode);
  const bootstrap = await api(`/bootstrap?userId=${encodeURIComponent(state.userId)}&username=${encodeURIComponent(state.username)}`);
  state.profile = bootstrap.profile;
  state.server = bootstrap.server;
  state.role = bootstrap.membership?.role || 'member';
  state.members = bootstrap.members || [];
  state.channels = bootstrap.channels || [];
  renderProfile();
  renderChannels();
  renderMembersAdmin();

  const text = state.channels.find(c => c.type === 'text' && !c.is_archived);
  state.activeTextChannelId = text?.id || null;
  if (!state.activeVoiceChannelId) {
    state.activeVoiceChannelId = state.channels.find(c => c.type === 'voice' && !c.is_archived)?.id || null;
  }
  updateHeader();
  if (state.activeTextChannelId) await loadMessages();
  await refreshMembers();
  subscribeRealtime();
  if (localStorage.getItem(VOICE_REJOIN_KEY) === '1' && state.activeVoiceChannelId) {
    joinVoice().catch(() => {
      localStorage.removeItem(VOICE_REJOIN_KEY);
    });
  }
}

wireEvents();
if (!state.username) {
  els.usernameDialog.showModal();
} else {
  boot().catch(err => {
    console.error(err);
    alert(err.message || 'No se pudo iniciar la app');
  });
}
