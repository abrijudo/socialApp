const SUPABASE_URL = 'https://twlqfiatocyeasmnatzj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3bHFmaWF0b2N5ZWFzbW5hdHpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDc5NTEsImV4cCI6MjA4ODYyMzk1MX0.hosd2PCXszVxMeuqfgDb94sTZcF20BYvNptfsVl1qxk';
const VOICE_CHANNEL_KEY = 'voice-channel-id';
const VOICE_REJOIN_KEY = 'voice-rejoin-on-reload';
const STREAM_LAYOUT_KEY = 'stream-layout-mode';
const PRESENCE_IDLE_MS = 2 * 60 * 1000;
const PRESENCE_HEARTBEAT_MS = 30 * 1000;
const MEMBERS_PRESENCE_POLL_MS = 8000;

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
  messagesPollTimer: null,
  lastMessagesFingerprint: '',
  mediaRecorder: null,
  mediaRecorderStream: null,
  mediaChunks: [],
  voiceRecordStartedAt: 0,
  voiceRecordTimerId: null,
  pendingMedia: null,
};
localStorage.setItem('user-id', state.userId);
let lastPresenceStatus = '';
let lastActivityAt = Date.now();
let presenceIdleTimer = null;
let presenceHeartbeatTimer = null;
let membersPresencePollTimer = null;

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
  voiceParticipantsList: document.getElementById('voice-participants-list'),
  messages: document.getElementById('messages'),
  messageForm: document.getElementById('message-form'),
  messageInput: document.getElementById('message-input'),
  btnAttachMedia: document.getElementById('btn-attach-media'),
  btnRecordVoice: document.getElementById('btn-record-voice'),
  voiceRecordTimer: document.getElementById('voice-record-timer'),
  mediaInput: document.getElementById('media-input'),
  mediaPreview: document.getElementById('media-preview'),
  mediaPreviewCard: document.getElementById('media-preview-card'),
  btnCancelMedia: document.getElementById('btn-cancel-media'),
  btnSendMedia: document.getElementById('btn-send-media'),
  uploadProgressWrap: document.getElementById('upload-progress-wrap'),
  uploadProgressBar: document.getElementById('upload-progress-bar'),
  uploadProgressText: document.getElementById('upload-progress-text'),
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
  voiceExitPanel: document.getElementById('voice-exit-panel'),
  voiceExitLabel: document.getElementById('voice-exit-label'),
  btnVoiceLeave: document.getElementById('btn-voice-leave'),
  btnMicToggle: document.getElementById('btn-mic-toggle'),
  btnWebcamToggle: document.getElementById('btn-webcam-toggle'),
  btnScreenToggle: document.getElementById('btn-screen-toggle'),
  btnLayoutToggle: document.getElementById('btn-layout-toggle'),
  streamsGrid: document.getElementById('streams-grid'),
  membersList: document.getElementById('members-list'),
  membersAdminList: document.getElementById('members-admin-list'),
  userCardDialog: document.getElementById('user-card-dialog'),
  userCardAvatar: document.getElementById('user-card-avatar'),
  userCardName: document.getElementById('user-card-name'),
  userCardRole: document.getElementById('user-card-role'),
  userCardUsername: document.getElementById('user-card-username'),
  userCardStatus: document.getElementById('user-card-status'),
  userCardBio: document.getElementById('user-card-bio'),
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

function normalizeStatus(status) {
  if (status === 'online' || status === 'idle' || status === 'dnd' || status === 'offline') return status;
  return 'offline';
}

function resolvePresenceStatus(profile, options = {}) {
  const { forSelf = false } = options;
  const base = normalizeStatus(profile?.status || 'offline');
  if (forSelf) return base;
  if (base === 'offline') return 'offline';

  const updatedMs = Date.parse(profile?.updated_at || '');
  if (!updatedMs || !Number.isFinite(updatedMs)) return 'offline';

  const age = Date.now() - updatedMs;
  if (age > PRESENCE_HEARTBEAT_MS * 3) return 'offline';
  return base;
}

function statusLabel(status) {
  const s = normalizeStatus(status);
  if (s === 'online') return 'En linea';
  if (s === 'idle') return 'Ausente';
  if (s === 'dnd') return 'No molestar';
  return 'Desconectado';
}

function getDesiredPresenceStatus() {
  if (document.visibilityState !== 'visible') return 'idle';
  return Date.now() - lastActivityAt >= PRESENCE_IDLE_MS ? 'idle' : 'online';
}

function schedulePresenceIdleCheck() {
  if (presenceIdleTimer) clearTimeout(presenceIdleTimer);
  if (document.visibilityState !== 'visible') return;
  const msUntilIdle = Math.max(0, PRESENCE_IDLE_MS - (Date.now() - lastActivityAt));
  presenceIdleTimer = setTimeout(() => {
    syncPresence(getDesiredPresenceStatus());
    schedulePresenceIdleCheck();
  }, msUntilIdle + 50);
}

function startPresenceHeartbeat() {
  if (presenceHeartbeatTimer) clearInterval(presenceHeartbeatTimer);
  presenceHeartbeatTimer = setInterval(() => {
    syncPresence(getDesiredPresenceStatus());
  }, PRESENCE_HEARTBEAT_MS);
}

function stopPresenceHeartbeat() {
  if (!presenceHeartbeatTimer) return;
  clearInterval(presenceHeartbeatTimer);
  presenceHeartbeatTimer = null;
}

function startMembersPresencePolling() {
  if (membersPresencePollTimer) clearInterval(membersPresencePollTimer);
  membersPresencePollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refreshMembers().catch(() => {});
  }, MEMBERS_PRESENCE_POLL_MS);
}

function stopMembersPresencePolling() {
  if (!membersPresencePollTimer) return;
  clearInterval(membersPresencePollTimer);
  membersPresencePollTimer = null;
}

function markUserActivity() {
  lastActivityAt = Date.now();
  if (document.visibilityState === 'visible') {
    syncPresence('online');
    schedulePresenceIdleCheck();
  }
}

async function syncPresence(status, options = {}) {
  const { force = false, beacon = false } = options;
  if (!state.userId || !state.username) return;
  if (!force && lastPresenceStatus === status) return;
  lastPresenceStatus = status;

  const payload = {
    userId: state.userId,
    username: state.username,
    displayName: state.profile?.display_name || state.username,
    avatarUrl: state.profile?.avatar_url || '',
    bio: state.profile?.bio || '',
    status,
  };

  if (beacon && status === 'offline' && navigator.sendBeacon) {
    const endpoint = `/api/presence/offline?userId=${encodeURIComponent(state.userId)}&username=${encodeURIComponent(state.username)}`;
    const queued = navigator.sendBeacon(endpoint);
    if (queued) return;
  }

  if (beacon && navigator.sendBeacon) {
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const queued = navigator.sendBeacon('/api/profiles/upsert', body);
    if (queued) return;
  }

  if (beacon) {
    const endpoint = status === 'offline'
      ? `/api/presence/offline?userId=${encodeURIComponent(state.userId)}&username=${encodeURIComponent(state.username)}`
      : '/api/profiles/upsert';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: status === 'offline' ? undefined : JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
    return;
  }

  try {
    const updated = await api('/profiles/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.profile = updated;
    const me = state.members.find((m) => m.user_id === state.userId);
    if (me) me.profile = updated;
    renderProfile();
    renderMembersSidebar();
  } catch (_) {
    // Evitamos ruido si hay cortes de red al cambiar de pestaña.
  }
}

function canManageServer() {
  // Modo servidor de amigos: todos gestionan.
  return true;
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

function openUserCard(profile = {}, userId = null) {
  if (!els.userCardDialog) return;
  const member = userId ? state.members.find(m => m.user_id === userId) : null;
  const role = member?.role || 'member';
  const displayName = profile.display_name || profile.username || 'Usuario';
  const username = profile.username || displayName;
  const status = resolvePresenceStatus(profile, { forSelf: userId === state.userId });
  const bio = profile.bio?.trim() || 'Sin bio.';
  const avatar = avatarFromProfile(profile);

  els.userCardAvatar.src = avatar;
  els.userCardName.textContent = displayName;
  els.userCardRole.textContent = role;
  els.userCardUsername.textContent = `@${username}`;
  els.userCardStatus.textContent = `Estado: ${statusLabel(status)}`;
  els.userCardBio.textContent = bio;

  if (!els.userCardDialog.open) {
    els.userCardDialog.showModal();
  }
}

function renderProfile() {
  if (!state.profile) return;
  els.userAvatar.src = avatarFromProfile(state.profile);
  els.userDisplay.textContent = state.profile.display_name || state.profile.username;
  els.userStatus.textContent = statusLabel(resolvePresenceStatus(state.profile, { forSelf: true }));
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

  const participants = state.room
    ? [state.room.localParticipant, ...state.room.remoteParticipants.values()]
    : [];
  const activeVoiceParticipants = participants.map((p) => ({
    name: p.name || p.identity || 'Usuario',
    isSelf: p === state.room?.localParticipant,
    isSpeaking: Boolean(p.isSpeaking),
    micEnabled: p.isMicrophoneEnabled !== false,
  }));

  voiceChannels.forEach(channel => {
    const wrap = document.createElement('div');
    wrap.className = 'voice-channel-wrap';

    const btn = document.createElement('button');
    btn.className = `channel-item ${state.activeVoiceChannelId === channel.id ? 'active' : ''}`;
    btn.innerHTML = `<span>🔊</span><span>${channel.name}</span>${canManageServer() ? '<span class="actions"><small data-action="rename">✎</small><small data-action="archive">🗑</small></span>' : ''}`;
    btn.addEventListener('click', (e) => {
      const action = e.target?.dataset?.action;
      if (action) return handleChannelAction(channel, action);
      setActiveVoiceChannel(channel.id);
    });
    btn.addEventListener('dblclick', async (e) => {
      if (e.target?.dataset?.action) return;
      try {
        const previousVoiceId = state.activeVoiceChannelId;
        const hadRoom = Boolean(state.room);
        await setActiveVoiceChannel(channel.id);
        if (!hadRoom) {
          await joinVoice();
          return;
        }
        if (previousVoiceId !== channel.id) {
          await leaveVoice();
          await joinVoice();
        }
      } catch (err) {
        alert(err.message || 'No se pudo conectar al canal de voz.');
      }
    });
    wrap.appendChild(btn);

    const isConnectedToThisChannel = Boolean(state.room) && state.activeVoiceChannelId === channel.id;
    if (isConnectedToThisChannel) {
      const inlineList = document.createElement('div');
      inlineList.className = 'voice-participants-inline';
      if (!activeVoiceParticipants.length) {
        inlineList.innerHTML = '<div class="voice-user">Canal vacío</div>';
      } else {
        activeVoiceParticipants.forEach((p) => {
          const row = document.createElement('div');
          row.className = `voice-user ${p.isSpeaking ? 'online' : ''}`;
          row.innerHTML = `<span>${p.name}${p.isSelf ? ' (tú)' : ''}</span><span class="mic-state">${p.micEnabled ? '🎤' : '🔇'}</span>`;
          inlineList.appendChild(row);
        });
      }
      wrap.appendChild(inlineList);
    }

    els.voiceChannelList.appendChild(wrap);
  });

  if (canManageServer()) {
    els.permChannelSelect.innerHTML = state.channels
      .filter(c => !c.is_archived)
      .map(c => `<option value="${c.id}">${c.type === 'text' ? '# ' : '🔊 '}${c.name}</option>`)
      .join('');
  }

  renderVoiceParticipants();
  renderVoiceExitPanel();
}

function renderVoiceExitPanel() {
  if (!els.voiceExitPanel || !els.voiceExitLabel || !els.btnVoiceLeave) return;
  if (!state.room) {
    els.voiceExitPanel.classList.add('hidden');
    return;
  }
  const activeVoice = state.channels.find((c) => c.id === state.activeVoiceChannelId);
  els.voiceExitLabel.textContent = activeVoice ? `En voz: ${activeVoice.name}` : 'Conectado a voz';
  els.voiceExitPanel.classList.remove('hidden');
}

function renderVoiceParticipants() {
  if (!els.voiceParticipantsList) return;
  // Ahora se renderizan inline debajo del canal de voz activo.
  els.voiceParticipantsList.innerHTML = '';
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

function renderMembersSidebar() {
  if (!els.membersList) return;
  els.membersList.innerHTML = '';

  const voiceNames = new Set();
  if (state.room) {
    const participants = [state.room.localParticipant, ...state.room.remoteParticipants.values()];
    participants.forEach((p) => {
      const name = (p.name || p.identity || '').trim().toLowerCase();
      if (name) voiceNames.add(name);
    });
  }

  const sortedMembers = [...state.members].sort((a, b) => {
    const aName = (a.profile?.display_name || a.profile?.username || a.user_id || '').toLowerCase();
    const bName = (b.profile?.display_name || b.profile?.username || b.user_id || '').toLowerCase();
    return aName.localeCompare(bName, 'es');
  });

  const groups = { online: [], idle: [], offline: [] };
  sortedMembers.forEach((member) => {
    const status = resolvePresenceStatus(member.profile || {}, { forSelf: member.user_id === state.userId });
    if (status === 'idle' || status === 'dnd') groups.idle.push(member);
    else if (status === 'online') groups.online.push(member);
    else groups.offline.push(member);
  });

  const addSectionTitle = (title, count) => {
    if (count === 0) return;
    const titleEl = document.createElement('div');
    titleEl.className = 'members-group-title';
    titleEl.textContent = `${title} — ${count}`;
    els.membersList.appendChild(titleEl);
  };

  const renderMemberRow = (member) => {
    const displayName = member.profile?.display_name || member.profile?.username || member.user_id;
    const avatar = avatarFromProfile(member.profile || { display_name: displayName });
    const inVoice = voiceNames.has(String(displayName || '').trim().toLowerCase());
    const isSelf = member.user_id === state.userId;
    const currentStatus = resolvePresenceStatus(member.profile || {}, { forSelf: member.user_id === state.userId });
    const subStatus = inVoice ? `${statusLabel(currentStatus)} · En voz` : statusLabel(currentStatus);

    const row = document.createElement('div');
    row.className = `member-item ${currentStatus === 'offline' ? 'member-offline' : ''}`;
    row.innerHTML = `
      <div class="member-avatar-wrap">
        <img class="member-avatar" src="${avatar}" alt="avatar" />
        <span class="member-dot ${currentStatus}"></span>
      </div>
      <div class="member-main">
        <div class="member-name">${displayName}${isSelf ? ' (tú)' : ''}</div>
        <div class="member-sub">${subStatus}</div>
      </div>
    `;
    row.addEventListener('click', () => {
      openUserCard(member.profile || {}, member.user_id);
    });
    els.membersList.appendChild(row);
  };

  addSectionTitle('En linea', groups.online.length);
  groups.online.forEach(renderMemberRow);

  addSectionTitle('Ausentes', groups.idle.length);
  groups.idle.forEach(renderMemberRow);

  addSectionTitle('Desconectados', groups.offline.length);
  groups.offline.forEach(renderMemberRow);
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
    await refreshChannels();
    return;
  }
  if (action === 'archive') {
    if (!confirm(`Archivar canal "${channel.name}"?`)) return;
    await api(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isArchived: true, userId: state.userId }),
    });
    await refreshChannels();
  }
}

function renderMessages(messages) {
  els.messages.innerHTML = '';
  messages.forEach(msg => {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    const author = msg.profiles?.display_name || msg.profiles?.username || 'Usuario';
    const avatar = avatarFromProfile(msg.profiles || { display_name: author });
    const messageType = msg.message_type || 'text';
    wrap.innerHTML = `
      <img class="message-avatar" alt="avatar" src="${avatar}">
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${author}</span>
          <span>${formatTs(msg.created_at)}</span>
        </div>
        <div class="message-body"></div>
        <div class="message-media" style="display:none;"></div>
        <div class="message-caption" style="display:none;"></div>
      </div>
    `;
    const bodyEl = wrap.querySelector('.message-body');
    const mediaEl = wrap.querySelector('.message-media');
    const captionEl = wrap.querySelector('.message-caption');
    const avatarEl = wrap.querySelector('.message-avatar');
    const authorEl = wrap.querySelector('.message-author');

    if (messageType === 'image' && msg.media_data) {
      mediaEl.style.display = 'block';
      mediaEl.innerHTML = `<img src="${msg.media_data}" alt="${msg.media_name || 'imagen'}" loading="lazy" />`;
      bodyEl.textContent = '';
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.textContent = msg.body;
      }
    } else if (messageType === 'video' && msg.media_data) {
      mediaEl.style.display = 'block';
      mediaEl.innerHTML = `<video src="${msg.media_data}" controls playsinline></video>`;
      bodyEl.textContent = '';
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.textContent = msg.body;
      }
    } else if (messageType === 'audio' && msg.media_data) {
      mediaEl.style.display = 'block';
      mediaEl.innerHTML = `<audio src="${msg.media_data}" controls></audio>`;
      bodyEl.textContent = msg.body && !msg.body.startsWith('[') ? '' : 'Mensaje de voz';
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.textContent = msg.body;
      }
    } else {
      bodyEl.textContent = msg.body;
    }
    avatarEl?.addEventListener('click', () => openUserCard(msg.profiles || {}, msg.author_id || msg.profiles?.user_id || null));
    authorEl?.addEventListener('click', () => openUserCard(msg.profiles || {}, msg.author_id || msg.profiles?.user_id || null));
    els.messages.appendChild(wrap);
  });
  els.messages.scrollTop = els.messages.scrollHeight;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDurationMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function startVoiceRecordTimer() {
  if (state.voiceRecordTimerId) clearInterval(state.voiceRecordTimerId);
  els.voiceRecordTimer.classList.remove('hidden');
  els.voiceRecordTimer.textContent = `● ${formatDurationMs(0)}`;
  state.voiceRecordTimerId = setInterval(() => {
    const elapsed = Date.now() - state.voiceRecordStartedAt;
    els.voiceRecordTimer.textContent = `● ${formatDurationMs(elapsed)}`;
  }, 250);
}

function stopVoiceRecordTimer() {
  if (state.voiceRecordTimerId) {
    clearInterval(state.voiceRecordTimerId);
    state.voiceRecordTimerId = null;
  }
  els.voiceRecordTimer.classList.add('hidden');
  els.voiceRecordTimer.textContent = '● 00:00';
}

function getPreferredVoiceMimeType() {
  const preferred = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
  ];
  for (const m of preferred) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

async function sendMediaMessage({ type, dataUrl, mime, name, durationMs = null, caption = '' }) {
  if (!state.activeTextChannelId) return;
  await api('/messages', {
    method: 'POST',
    body: JSON.stringify({
      channelId: state.activeTextChannelId,
      authorId: state.userId,
      text: caption,
      messageType: type,
      mediaData: dataUrl,
      mediaMime: mime,
      mediaName: name,
      mediaDurationMs: durationMs,
    }),
  });
  await loadMessages({ silent: true });
}

function setUploadProgress(percent, text) {
  els.uploadProgressWrap.classList.remove('hidden');
  els.uploadProgressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  els.uploadProgressText.textContent = text;
}

function resetUploadProgress() {
  els.uploadProgressBar.style.width = '0%';
  els.uploadProgressText.textContent = 'Preparando...';
  els.uploadProgressWrap.classList.add('hidden');
}

function clearPendingMedia() {
  state.pendingMedia = null;
  els.mediaPreview.classList.add('hidden');
  els.mediaPreviewCard.innerHTML = '';
  resetUploadProgress();
}

function renderPendingMediaPreview() {
  if (!state.pendingMedia) {
    clearPendingMedia();
    return;
  }
  const m = state.pendingMedia;
  let html = '';
  if (m.type === 'image') html = `<img src="${m.dataUrl}" alt="${m.name || 'imagen'}" />`;
  if (m.type === 'video') html = `<video src="${m.dataUrl}" controls playsinline></video>`;
  if (m.type === 'audio') html = `<audio src="${m.dataUrl}" controls></audio>`;
  html += `<div class="media-preview-meta">${m.name || 'archivo'} · ${Math.round((m.bytes || 0) / 1024)} KB</div>`;
  els.mediaPreviewCard.innerHTML = html;
  els.mediaPreview.classList.remove('hidden');
  resetUploadProgress();
}

function messagesFingerprint(messages) {
  if (!messages?.length) return 'empty';
  const last = messages[messages.length - 1];
  return `${messages.length}:${last.id}:${last.created_at}`;
}

function updateHeader() {
  const channel = state.channels.find(c => c.id === state.activeTextChannelId);
  els.activeChannelName.textContent = channel?.name || 'sin-canal';
  els.channelIcon.textContent = channel?.type === 'voice' ? '🔊' : '#';
  els.serverName.textContent = state.server?.name || 'Servidor';
}

async function loadMessages(options = {}) {
  const { silent = false } = options;
  if (!state.activeTextChannelId) return;
  const messages = await api(`/messages/${state.activeTextChannelId}`);
  const nextFingerprint = messagesFingerprint(messages);
  if (silent && nextFingerprint === state.lastMessagesFingerprint) return;
  state.lastMessagesFingerprint = nextFingerprint;
  renderMessages(messages);
}

function startMessagesPolling() {
  if (state.messagesPollTimer) clearInterval(state.messagesPollTimer);
  state.messagesPollTimer = setInterval(() => {
    if (!state.activeTextChannelId) return;
    if (document.hidden) return;
    loadMessages({ silent: true }).catch(() => {});
  }, 1500);
}

async function refreshMembers() {
  if (!state.server?.id) return;
  state.members = await api(`/servers/${state.server.id}/members`);
  renderMembersAdmin();
  renderMembersSidebar();
}

async function refreshChannels() {
  if (!state.server?.id) return;

  const prevVoiceChannelId = state.activeVoiceChannelId;
  const prevTextChannelId = state.activeTextChannelId;

  const bootstrap = await api(`/bootstrap?userId=${encodeURIComponent(state.userId)}&username=${encodeURIComponent(state.username)}`);
  state.channels = bootstrap.channels || [];

  const hasActiveText = state.channels.some(c => c.id === state.activeTextChannelId && c.type === 'text' && !c.is_archived);
  if (!hasActiveText) {
    state.activeTextChannelId = state.channels.find(c => c.type === 'text' && !c.is_archived)?.id || null;
  }

  const hasActiveVoice = state.channels.some(c => c.id === state.activeVoiceChannelId && c.type === 'voice' && !c.is_archived);
  if (!hasActiveVoice) {
    state.activeVoiceChannelId = state.channels.find(c => c.type === 'voice' && !c.is_archived)?.id || null;
  }

  if (state.activeVoiceChannelId) localStorage.setItem(VOICE_CHANNEL_KEY, state.activeVoiceChannelId);
  else localStorage.removeItem(VOICE_CHANNEL_KEY);

  renderChannels();
  updateHeader();

  if (state.activeTextChannelId !== prevTextChannelId) {
    state.lastMessagesFingerprint = '';
  }
  if (state.activeTextChannelId) await loadMessages({ silent: true });
  else els.messages.innerHTML = '';

  if (state.room && state.activeVoiceChannelId !== prevVoiceChannelId) {
    await leaveVoice();
    if (state.activeVoiceChannelId) await joinVoice();
  }
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
  state.lastMessagesFingerprint = '';
  renderChannels();
  updateHeader();
  await loadMessages();
  startMessagesPolling();
}

async function setActiveVoiceChannel(channelId) {
  state.activeVoiceChannelId = channelId;
  localStorage.setItem(VOICE_CHANNEL_KEY, channelId);
  renderChannels();
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

  try {
    const preflight = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    preflight.getTracks().forEach(t => t.stop());
  } catch (err) {
    throw new Error('No se pudo acceder al micrófono. Revisa permisos del navegador.');
  }

  room
    .on(RoomEvent.ParticipantConnected, () => {
      renderChannels();
      renderMembersSidebar();
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      renderChannels();
      renderMembersSidebar();
    })
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
    .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      setSpeakingTiles(speakers);
      renderChannels();
    })
    .on(RoomEvent.TrackMuted, () => {
      renderChannels();
      renderMembersSidebar();
    })
    .on(RoomEvent.TrackUnmuted, () => {
      renderChannels();
      renderMembersSidebar();
    })
    .on(RoomEvent.Disconnected, () => {
      state.room = null;
      els.btnMicToggle.textContent = 'Mic ON';
      els.btnMicToggle.disabled = true;
      Object.keys(state.streamTiles).forEach(removeStreamTile);
      state.pinnedTileId = null;
      renderChannels();
      renderVoiceExitPanel();
      renderMembersSidebar();
    });

  await room.connect(url, token);
  try {
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (err) {
    await room.disconnect();
    throw new Error('No se pudo activar el micrófono en la sala.');
  }

  state.room = room;
  localStorage.setItem(VOICE_REJOIN_KEY, '1');
  els.btnMicToggle.disabled = false;
  els.btnMicToggle.textContent = 'Mic ON';
  renderChannels();
  renderVoiceExitPanel();
  renderMembersSidebar();
}

async function leaveVoice() {
  if (!state.room) return;
  if (state.localCameraTrack) await toggleWebcam(true);
  if (state.localScreenTrack) await toggleScreen(true);
  await state.room.disconnect();
  state.room = null;
  localStorage.removeItem(VOICE_REJOIN_KEY);
  els.btnMicToggle.textContent = 'Mic ON';
  els.btnMicToggle.disabled = true;
  renderChannels();
  renderVoiceExitPanel();
  renderMembersSidebar();
}

async function toggleMic() {
  if (!state.room) return;
  const enabled = state.room.localParticipant.isMicrophoneEnabled;
  await state.room.localParticipant.setMicrophoneEnabled(!enabled);
  els.btnMicToggle.textContent = enabled ? 'Mic OFF' : 'Mic ON';
  renderChannels();
  renderMembersSidebar();
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
  const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, markUserActivity, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startPresenceHeartbeat();
      startMembersPresencePolling();
      refreshMembers().catch(() => {});
      markUserActivity();
      return;
    }
    if (presenceIdleTimer) {
      clearTimeout(presenceIdleTimer);
      presenceIdleTimer = null;
    }
    syncPresence('idle');
  });
  window.addEventListener('pagehide', () => {
    stopPresenceHeartbeat();
    stopMembersPresencePolling();
    syncPresence('offline', { force: true, beacon: true });
  });
  window.addEventListener('beforeunload', () => {
    stopPresenceHeartbeat();
    stopMembersPresencePolling();
    syncPresence('offline', { force: true, beacon: true });
  });
  window.addEventListener('unload', () => {
    stopPresenceHeartbeat();
    stopMembersPresencePolling();
    syncPresence('offline', { force: true, beacon: true });
  });

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
    await loadMessages({ silent: true });
  });

  els.btnAttachMedia.addEventListener('click', () => {
    els.mediaInput.value = '';
    els.mediaInput.click();
  });

  els.mediaInput.addEventListener('change', async () => {
    const file = els.mediaInput.files?.[0];
    if (!file) return;
    const canSend = await checkPermission('send_message', state.activeTextChannelId);
    if (!canSend) return alert('No tienes permiso para enviar mensajes en este canal.');

    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : null;
    if (!type) return alert('Solo se permiten imagen o video.');

    const maxBytes = type === 'image' ? 8 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      return alert(type === 'image' ? 'La imagen supera 8MB.' : 'El video supera 25MB.');
    }

    try {
      setUploadProgress(15, 'Preparando archivo...');
      const dataUrl = await readFileAsDataUrl(file);
      setUploadProgress(35, 'Preview listo');
      state.pendingMedia = {
        type,
        dataUrl,
        mime: file.type,
        name: file.name,
        caption: '',
        bytes: file.size,
      };
      renderPendingMediaPreview();
    } catch (err) {
      alert(err.message || 'No se pudo enviar el archivo.');
      clearPendingMedia();
    }
  });

  els.btnRecordVoice.addEventListener('click', async () => {
    const canSend = await checkPermission('send_message', state.activeTextChannelId);
    if (!canSend) return alert('No tienes permiso para enviar mensajes en este canal.');

    if (state.mediaRecorder) {
      state.mediaRecorder.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return alert('Tu navegador no soporta grabación de voz.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      const mimeType = getPreferredVoiceMimeType();
      const recorderOptions = { audioBitsPerSecond: 96000 };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, recorderOptions);
      state.mediaChunks = [];
      state.mediaRecorder = recorder;
      state.mediaRecorderStream = stream;
      state.voiceRecordStartedAt = Date.now();
      els.btnRecordVoice.classList.add('recording');
      els.btnRecordVoice.textContent = '⏹️';
      startVoiceRecordTimer();

      recorder.ondataavailable = (ev) => {
        if (ev.data?.size) state.mediaChunks.push(ev.data);
      };

      recorder.onstop = async () => {
        const durationMs = Math.max(0, Date.now() - state.voiceRecordStartedAt);
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const ext = finalMime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(state.mediaChunks, { type: finalMime });
        state.mediaRecorder = null;
        state.mediaChunks = [];
        state.voiceRecordStartedAt = 0;
        stopVoiceRecordTimer();
        els.btnRecordVoice.classList.remove('recording');
        els.btnRecordVoice.textContent = '🎙️';
        state.mediaRecorderStream?.getTracks().forEach(t => t.stop());
        state.mediaRecorderStream = null;

        if (blob.size < 1024) return;
        if (blob.size > 10 * 1024 * 1024) return alert('El mensaje de voz supera 10MB.');

        try {
          setUploadProgress(20, 'Procesando mensaje de voz...');
          const file = new File([blob], `voz-${Date.now()}.${ext}`, { type: finalMime });
          const dataUrl = await readFileAsDataUrl(file);
          setUploadProgress(40, 'Preview listo');
          state.pendingMedia = {
            type: 'audio',
            dataUrl,
            mime: finalMime,
            name: file.name,
            durationMs,
            bytes: file.size,
          };
          renderPendingMediaPreview();
        } catch (err) {
          alert(err.message || 'No se pudo enviar el mensaje de voz.');
          clearPendingMedia();
        }
      };

      recorder.start(200);
    } catch (err) {
      alert('No se pudo iniciar la grabación de voz.');
      stopVoiceRecordTimer();
    }
  });

  els.btnCancelMedia.addEventListener('click', () => {
    clearPendingMedia();
  });

  els.btnSendMedia.addEventListener('click', async () => {
    if (!state.pendingMedia) return;
    try {
      setUploadProgress(65, 'Enviando al chat...');
      await sendMediaMessage(state.pendingMedia);
      setUploadProgress(100, 'Enviado');
      setTimeout(() => clearPendingMedia(), 600);
    } catch (err) {
      alert(err.message || 'No se pudo enviar el archivo.');
      clearPendingMedia();
    }
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
    await refreshChannels();
    els.channelDialog.close();
  });

  els.btnVoiceLeave?.addEventListener('click', async () => {
    if (!state.room) return;
    await leaveVoice();
  });
  els.btnMicToggle.addEventListener('click', async () => {
    try {
      await toggleMic();
    } catch (err) {
      alert(err.message || 'No se pudo cambiar el micrófono.');
    }
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, async ({ new: row, old }) => {
      if (row?.server_id !== state.server?.id && old?.server_id !== state.server?.id) return;
      await refreshChannels();
    })
    .subscribe();

  sb.channel('messages-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: row }) => {
      if (row.channel_id !== state.activeTextChannelId) return;
      await loadMessages({ silent: true });
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      if (row.user_id === state.userId) {
        state.profile = row;
        renderProfile();
      }
      const member = state.members.find((m) => m.user_id === row.user_id);
      if (member) {
        member.profile = { ...(member.profile || {}), ...row };
        renderMembersSidebar();
      }
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
        renderMembersSidebar();
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
  renderMembersSidebar();

  const text = state.channels.find(c => c.type === 'text' && !c.is_archived);
  state.activeTextChannelId = text?.id || null;
  if (!state.activeVoiceChannelId) {
    state.activeVoiceChannelId = state.channels.find(c => c.type === 'voice' && !c.is_archived)?.id || null;
  }
  updateHeader();
  lastActivityAt = Date.now();
  await syncPresence('online', { force: true });
  schedulePresenceIdleCheck();
  startPresenceHeartbeat();
  startMembersPresencePolling();
  if (state.activeTextChannelId) await loadMessages();
  startMessagesPolling();
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
