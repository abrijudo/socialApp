import {
  VOICE_CHANNEL_KEY,
  THEME_KEY,
  VOICE_REJOIN_KEY,
  STREAM_LAYOUT_KEY,
  PRESENCE_IDLE_MS,
  PRESENCE_HEARTBEAT_MS,
  MEMBERS_PRESENCE_POLL_MS,
  TYPING_DEBOUNCE_MS,
  MESSAGES_POLL_MS,
  MESSAGES_POLL_MS_HIDDEN,
  MIC_AUDIO_CAPTURE_OPTIONS,
  icons,
  icon,
} from './constants.js';
import {
  parseSimpleMarkdown,
  playMessageSound,
  formatTs,
  formatTsRelative,
  formatDurationMs,
  avatarFromProfile,
  normalizeStatus,
  normalizeUsername,
  debounce,
  setFeedback,
} from './utils.js';

// Captura errores no manejados para depurar "Cannot read properties of null (reading 'id')"
window.addEventListener('error', (e) => {
  if (e.message?.includes("reading 'id'")) {
    console.error('[APP_ERROR]', e.message, '\nStack:', e.error?.stack);
  }
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason);
  if (msg?.includes("reading 'id'")) {
    console.error('[APP_ERROR async]', msg, '\nStack:', e.reason?.stack);
  }
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme || 'dark');
  if (els.btnThemeToggle) {
    els.btnThemeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
    els.btnThemeToggle.title = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  }
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

const { createClient } = supabase;
let sb = null;

const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

async function requestNotificationPermission() {
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'alert');
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  const t = setTimeout(() => {
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 300);
  }, 4200);
  el.addEventListener('click', () => {
    clearTimeout(t);
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 300);
  });
}

const state = {
  userId: '',
  username: '',
  accessToken: null,
  profile: null,
  server: null,
  role: 'member',
  members: [],
  channels: [],
  activeTextChannelId: null,
  activeDmChannelId: null,
  dmChannels: [],
  activeVoiceChannelId: localStorage.getItem(VOICE_CHANNEL_KEY) || null,
  room: null,
  localCameraTrack: null,
  localScreenTrack: null,
  localScreenAudioTrack: null,
  screenAudioEnabled: true,
  streamLayoutMode: localStorage.getItem(STREAM_LAYOUT_KEY) || 'grid',
  pinnedTileId: null,
  screenAdaptTimer: null,
  streamTiles: {},
  messagesPollTimer: null,
  replyTo: null,
  typingUsers: {},
  lastMessagesFingerprint: '',
  mediaRecorder: null,
  mediaRecorderStream: null,
  mediaChunks: [],
  voiceRecordStartedAt: 0,
  voiceRecordTimerId: null,
  pendingMedia: null,
  remoteAudioElements: {},
  lastCaptureSourceName: '',
  selectedPermChannelId: null,
  selectedPermRole: 'member',
  audioUnlockNeeded: false,
  audioContext: null,
  audioDiagLines: [],
  audioInputDevices: [],
  messagesLoading: false,
  channelsLoading: false,
  membersLoading: false,
  pendingJoinCode: null,
  /** Evita dejar la app sin cargar si el usuario cancela el diálogo de invitación sin haber hecho boot. */
  initialBootDone: false,
};
let lastPresenceStatus = '';
let lastActivityAt = Date.now();
let presenceIdleTimer = null;
let presenceHeartbeatTimer = null;
let membersPresencePollTimer = null;

const els = {
  authDialog: document.getElementById('auth-dialog'),
  authForm: document.getElementById('auth-form'),
  authTitle: document.getElementById('auth-title'),
  authSubtitle: document.getElementById('auth-subtitle'),
  authUsername: document.getElementById('auth-username'),
  authFeedback: document.getElementById('auth-feedback'),
  btnAuthSubmit: document.getElementById('btn-auth-submit'),
  profileDialog: document.getElementById('profile-dialog'),
  profileForm: document.getElementById('profile-form'),
  profileDisplayName: document.getElementById('profile-display-name'),
  profileAvatarUrl: document.getElementById('profile-avatar-url'),
  profileBio: document.getElementById('profile-bio'),
  profileStatus: document.getElementById('profile-status'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  btnInvite: document.getElementById('btn-invite'),
  inviteResult: document.getElementById('invite-result'),
  joinDialog: document.getElementById('join-dialog'),
  joinMessage: document.getElementById('join-message'),
  btnJoinCancel: document.getElementById('btn-join-cancel'),
  btnJoinConfirm: document.getElementById('btn-join-confirm'),
  serverDialog: document.getElementById('server-dialog'),
  serverForm: document.getElementById('server-form'),
  serverNameInput: document.getElementById('server-name-input'),
  channelDialog: document.getElementById('channel-dialog'),
  channelForm: document.getElementById('channel-form'),
  channelDialogTitle: document.getElementById('channel-dialog-title'),
  channelNameInput: document.getElementById('channel-name-input'),
  channelTypeInput: document.getElementById('channel-type-input'),
  dmList: document.getElementById('dm-list'),
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
  typingIndicator: document.getElementById('typing-indicator'),
  userAvatar: document.getElementById('user-avatar'),
  userDisplay: document.getElementById('user-display'),
  userStatus: document.getElementById('user-status'),
  btnProfile: document.getElementById('btn-profile'),
  btnLogout: document.getElementById('btn-logout'),
  btnServerSettings: document.getElementById('btn-server-settings'),
  btnNewTextChannel: document.getElementById('btn-new-text-channel'),
  btnNewVoiceChannel: document.getElementById('btn-new-voice-channel'),
  voiceExitPanel: document.getElementById('voice-exit-panel'),
  voiceExitLabel: document.getElementById('voice-exit-label'),
  btnVoiceLeave: document.getElementById('btn-voice-leave'),
  voiceControls: document.getElementById('voice-controls'),
  btnMicToggle: document.getElementById('btn-mic-toggle'),
  btnWebcamToggle: document.getElementById('btn-webcam-toggle'),
  btnScreenToggle: document.getElementById('btn-screen-toggle'),
  btnScreenAudioToggle: document.getElementById('btn-screen-audio-toggle'),
  btnAudioUnlock: document.getElementById('btn-audio-unlock'),
  btnLayoutToggle: document.getElementById('btn-layout-toggle'),
  captureStatus: document.getElementById('capture-status'),
  captureStatusSource: document.getElementById('capture-status-source'),
  captureStatusAudio: document.getElementById('capture-status-audio'),
  audioDiagLog: document.getElementById('audio-diag-log'),
  streamsGrid: document.getElementById('streams-grid'),
  membersList: document.getElementById('members-list'),
  membersAdminList: document.getElementById('members-admin-list'),
  userCardDialog: document.getElementById('user-card-dialog'),
  btnUserDm: document.getElementById('btn-user-dm'),
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
  serverSettingsFeedback: document.getElementById('server-settings-feedback'),
  editMessageDialog: document.getElementById('edit-message-dialog'),
  editMessageBody: document.getElementById('edit-message-body'),
  editMessageForm: document.getElementById('edit-message-form'),
  captureSourceDialog: document.getElementById('capture-source-dialog'),
  captureSourceForm: document.getElementById('capture-source-form'),
  captureSourceList: document.getElementById('capture-source-list'),
  btnCaptureSourceConfirm: document.getElementById('btn-capture-source-confirm'),
};

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
  const fetchOpts = { method: 'GET', headers, ...options };
  if (options.body !== undefined) fetchOpts.body = options.body;
  const res = await fetch(`/api${path}`, fetchOpts);
  const payload = await res.json().catch(() => ({}));
  const errMsg = (payload && typeof payload === 'object' && payload.error) ? String(payload.error) : 'Error en la API';
  if (res.status === 401) {
    state.accessToken = null;
    sb?.auth.signOut();
    els.authDialog?.showModal();
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }
  if (!res.ok) throw new Error(errMsg);
  return payload ?? {};
}

function isElectronDesktop() {
  return Boolean(window.desktopApp?.isElectron);
}

function setAuthFeedback(message = '', type = 'info') {
  setFeedback(els.authFeedback, message, type);
}

function applyAuthenticatedUser(user, session) {
  state.userId = user.id;
  state.accessToken = session?.access_token || null;
  const fromMeta = user.user_metadata?.username || user.user_metadata?.display_name || '';
  const fromEmail = user.email ? user.email.split('@')[0] : '';
  state.username = normalizeUsername(fromMeta || fromEmail || '');
}

async function initAuthAndBoot() {
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Config no disponible.');
  sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const user = data?.session?.user;
  const session = data?.session;
  if (!user) {
    setAuthFeedback('');
    els.authDialog?.showModal();
    return;
  }
  applyAuthenticatedUser(user, session);
  if (state.pendingJoinCode) {
    els.joinDialog?.showModal();
    if (els.joinMessage) els.joinMessage.textContent = 'Cargando...';
    await handleJoinFlow();
  } else {
    await boot();
  }
}

function showServerSettingsFeedback(message, type = 'info') {
  setFeedback(els.serverSettingsFeedback, message, type);
}

function setCaptureDiagnostics({ visible, sourceName = '-', hasAudio = null }) {
  if (!els.captureStatus || !els.captureStatusSource || !els.captureStatusAudio) return;
  if (!visible) {
    els.captureStatus.classList.add('hidden');
    return;
  }
  els.captureStatus.classList.remove('hidden');
  els.captureStatusSource.textContent = `Fuente: ${sourceName || '-'}`;
  const audioText = hasAudio == null ? '-' : (hasAudio ? 'Detectado' : 'No detectado');
  els.captureStatusAudio.textContent = `Audio: ${audioText}`;
}

function pushAudioDiag(message, details) {
  const ts = new Date().toLocaleTimeString();
  const line = details ? `[${ts}] ${message} | ${details}` : `[${ts}] ${message}`;
  state.audioDiagLines.push(line);
  if (state.audioDiagLines.length > 60) state.audioDiagLines.shift();
  if (els.audioDiagLog) els.audioDiagLog.textContent = state.audioDiagLines.join('\n');
  console.log('[AUDIO_DIAG]', line);
}

async function refreshAudioInputDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.audioInputDevices = devices.filter((d) => d.kind === 'audioinput');
  } catch (_) {
    state.audioInputDevices = [];
  }
}

function findSystemLoopbackInputDeviceId() {
  const preferred = /(mezcla\s*est(e|é)reo|stereo\s*mix|what\s*u\s*hear|wave\s*out|loopback|cable\s*output|monitor\s*of|monitor.*output|salida.*(loopback|mezcla))/i;
  const match = (state.audioInputDevices || []).find((d) => preferred.test((d.label || '').toLowerCase()));
  return match?.deviceId || null;
}

function setAudioUnlockNeeded(needed) {
  state.audioUnlockNeeded = Boolean(needed);
  els.btnAudioUnlock?.classList.toggle('hidden', !state.audioUnlockNeeded);
}

async function tryResumeRemoteAudio() {
  const nodes = Object.values(state.remoteAudioElements || {});
  if (!nodes.length) return true;
  let blocked = false;
  for (const el of nodes) {
    try {
      await el.play?.();
    } catch (_) {
      blocked = true;
    }
  }
  setAudioUnlockNeeded(blocked);
  pushAudioDiag('Resume audio remoto', `nodos=${nodes.length} blocked=${blocked}`);
  return !blocked;
}

async function ensureAudioContextUnlocked() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return true;
  if (!state.audioContext) {
    state.audioContext = new Ctx();
  }
  if (state.audioContext.state === 'suspended') {
    try {
      await state.audioContext.resume();
    } catch (_) {}
  }
  return state.audioContext.state === 'running';
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

  const     payload = {
      username: state.username,
      displayName: state.profile?.display_name || state.username,
    avatarUrl: state.profile?.avatar_url || '',
    bio: state.profile?.bio || '',
    status,
  };

  const beaconPayload = { ...payload, token: state.accessToken };
  if (beacon && status === 'offline' && navigator.sendBeacon && state.accessToken) {
    const body = new Blob([JSON.stringify(beaconPayload)], { type: 'application/json' });
    const queued = navigator.sendBeacon('/api/presence/offline', body);
    if (queued) return;
  }

  if (beacon && navigator.sendBeacon && state.accessToken) {
    const body = new Blob([JSON.stringify(beaconPayload)], { type: 'application/json' });
    const queued = navigator.sendBeacon('/api/profiles/upsert', body);
    if (queued) return;
  }

  if (beacon && state.accessToken) {
    const endpoint = status === 'offline' ? '/api/presence/offline' : '/api/profiles/upsert';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.accessToken}` },
      body: JSON.stringify(beaconPayload),
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

function isDialogOpen(dialog) {
  return Boolean(dialog?.open);
}

async function checkPermission(action, channelId) {
  if (!state.server?.id || !state.userId) return false;
  const q = new URLSearchParams({
    serverId: state.server.id,
    action,
  });
  if (channelId) q.set('channelId', channelId);
  const result = await api(`/permissions/check?${q.toString()}`);
  return Boolean(result.allowed);
}

function openUserCard(profile = {}, userId = null) {
  if (!els.userCardDialog) return;
  state.userCardUserId = (userId != null && String(userId).trim()) ? String(userId).trim() : null;
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
  els.btnUserDm?.classList.toggle('hidden', !userId || userId === state.userId);

  if (!els.userCardDialog.open) {
    els.userCardDialog.showModal();
  }
}

function renderProfile() {
  if (!state.profile) return;
  els.userAvatar.src = avatarFromProfile(state.profile, state.username);
  els.userDisplay.textContent = state.profile.display_name || state.profile.username;
  els.userStatus.textContent = statusLabel(resolvePresenceStatus(state.profile, { forSelf: true }));
}

function sortChannels(channels) {
  return [...channels].sort((a, b) => (a.position || 0) - (b.position || 0));
}

function renderChannelsSkeleton() {
  els.textChannelList.innerHTML = '';
  els.voiceChannelList.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const btn = document.createElement('div');
    btn.className = 'channel-item channel-skeleton';
    btn.innerHTML = `<span class="skeleton skeleton-text" style="width:20px;height:14px"></span><span class="skeleton skeleton-text" style="width:${80 + i * 15}px;height:14px"></span>`;
    els.textChannelList.appendChild(btn);
  }
  for (let i = 0; i < 2; i++) {
    const btn = document.createElement('div');
    btn.className = 'channel-item channel-skeleton';
    btn.innerHTML = `<span class="skeleton skeleton-text" style="width:20px;height:14px"></span><span class="skeleton skeleton-text" style="width:${100 + i * 20}px;height:14px"></span>`;
    els.voiceChannelList.appendChild(btn);
  }
}

function renderChannels() {
  const channels = state.channels || [];
  const textChannels = sortChannels(channels.filter(c => c && c.type === 'text' && !c.is_archived));
  const voiceChannels = sortChannels(channels.filter(c => c && c.type === 'voice' && !c.is_archived));

  els.textChannelList.innerHTML = '';
  els.voiceChannelList.innerHTML = '';

  if (!textChannels.length) {
    const empty = document.createElement('div');
    empty.className = 'channel-empty-state';
    empty.innerHTML = '<span>Sin canales de texto</span>';
    els.textChannelList.appendChild(empty);
  }
  if (!voiceChannels.length && !state.channelsLoading) {
    const empty = document.createElement('div');
    empty.className = 'channel-empty-state';
    empty.innerHTML = '<span>Sin canales de voz</span>';
    els.voiceChannelList.appendChild(empty);
  }
  textChannels.filter(c => c && c.id).forEach(channel => {
    const btn = document.createElement('button');
    btn.className = `channel-item ${!state.activeDmChannelId && state.activeTextChannelId === channel.id ? 'active' : ''}`;
    btn.innerHTML = `${icon('hashtag')}<span>${channel.name}</span>${canManageServer() ? `<span class="actions"><button type="button" class="channel-action-btn" data-action="rename">${icon('edit')}</button><button type="button" class="channel-action-btn" data-action="archive">${icon('trash')}</button></span>` : ''}`;
    btn.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) return handleChannelAction(channel, actionBtn.dataset.action);
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

  voiceChannels.filter(c => c && c.id).forEach(channel => {
    const wrap = document.createElement('div');
    wrap.className = 'voice-channel-wrap';

    const btn = document.createElement('button');
    btn.className = `channel-item ${state.activeVoiceChannelId === channel.id ? 'active' : ''}`;
    btn.innerHTML = `${icon('speaker')}<span>${channel.name}</span>${canManageServer() ? `<span class="actions"><button type="button" class="channel-action-btn" data-action="rename">${icon('edit')}</button><button type="button" class="channel-action-btn" data-action="archive">${icon('trash')}</button></span>` : ''}`;
    btn.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) return handleChannelAction(channel, actionBtn.dataset.action);
      setActiveVoiceChannel(channel.id);
    });
    btn.addEventListener('dblclick', async (e) => {
      if (e.target.closest('[data-action]')) return;
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
        toast(err.message || 'No se pudo conectar al canal de voz.', 'error');
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
    const prevChannelId = els.permChannelSelect.value || state.selectedPermChannelId;
    const prevRole = els.permRoleSelect.value || state.selectedPermRole || 'member';
    els.permChannelSelect.innerHTML = (state.channels || [])
      .filter(c => c && c.id && !c.is_archived)
      .map(c => `<option value="${c.id}">${c.type === 'text' ? '# ' : '🔊 '}${c.name}</option>`)
      .join('');
    const hasPrevChannel = [...els.permChannelSelect.options].some((opt) => opt.value === prevChannelId);
    if (hasPrevChannel) els.permChannelSelect.value = prevChannelId;
    if (els.permRoleSelect.querySelector(`option[value="${prevRole}"]`)) els.permRoleSelect.value = prevRole;
    state.selectedPermChannelId = els.permChannelSelect.value || null;
    state.selectedPermRole = els.permRoleSelect.value || 'member';
    if (isDialogOpen(els.serverDialog)) {
      loadChannelPermissionPreset().catch(() => {});
    }
  }

  renderVoiceParticipants();
  renderVoiceExitPanel();
  renderVoiceControls();
}

function renderVoiceControls() {
  const inVoice = Boolean(state.room);
  els.voiceControls?.classList.toggle('hidden', !inVoice);
}

function renderVoiceExitPanel() {
  if (!els.voiceExitPanel || !els.voiceExitLabel || !els.btnVoiceLeave) return;
  if (!state.room) {
    els.voiceExitPanel.classList.add('hidden');
    return;
  }
  const activeVoice = (state.channels || []).find((c) => c && c.id === state.activeVoiceChannelId);
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
  if (!state.server?.id) {
    els.membersAdminList.innerHTML = '';
    return;
  }
  if (!canManageServer()) {
    els.membersAdminList.innerHTML = '<div class="system">No tienes permisos para gestionar miembros.</div>';
    return;
  }
  els.membersAdminList.innerHTML = '';
  (state.members || []).filter(Boolean).forEach(member => {
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
          body: JSON.stringify({ role: select.value }),
        });
        await refreshMembers();
      } catch (err) {
        toast(err.message, 'error');
        await refreshMembers();
      }
    });
    els.membersAdminList.appendChild(row);
  });
}

function renderMembersSkeleton() {
  if (!els.membersList) return;
  els.membersList.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'member-item member-skeleton';
    row.innerHTML = `
      <div class="skeleton skeleton-avatar" style="width:34px;height:34px;border-radius:50%"></div>
      <div class="member-main">
        <div class="skeleton skeleton-text" style="width:${90 + i * 10}px;height:14px"></div>
        <div class="skeleton skeleton-text" style="width:60px;height:12px;margin-top:6px"></div>
      </div>
    `;
    els.membersList.appendChild(row);
  }
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

  const sortedMembers = [...(state.members || []).filter(Boolean)].sort((a, b) => {
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

  if (!sortedMembers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state empty-state-small';
    empty.innerHTML = '<p>No hay miembros</p>';
    els.membersList.appendChild(empty);
    return;
  }
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
      openUserCard(member.profile || {}, member?.user_id ?? null);
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
  if (!canManage) return toast('No tienes permiso para gestionar este canal.', 'error');

  if (action === 'rename') {
    const nextName = prompt('Nuevo nombre de canal:', channel.name);
    if (!nextName || nextName.trim().length < 2) return;
    await api(`/channels/${channel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: nextName.trim() }),
    });
    await refreshChannels();
    return;
  }
  if (action === 'archive') {
    if (!confirm(`¿Archivar el canal "${channel.name}"? Ya no aparecerá en la lista.`)) return;
    try {
      await api(`/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: true }),
      });
      await refreshChannels();
      toast(`Canal "${channel.name}" archivado.`, 'success');
    } catch (err) {
      toast(err?.message || 'No se pudo archivar.', 'error');
    }
  }
}

let pendingEditMsg = null;

async function handleMessageEdit(msg) {
  const currentBody = (msg.body || '').trim();
  if (currentBody.startsWith('[') && currentBody.endsWith(']')) return;
  if (!els.editMessageDialog || !els.editMessageBody) return;
  els.editMessageBody.value = currentBody;
  pendingEditMsg = msg;
  els.editMessageDialog.showModal();
}

async function submitMessageEdit() {
  if (!pendingEditMsg) return;
  const trimmed = (els.editMessageBody?.value || '').trim();
  if (!trimmed) {
    toast('El mensaje no puede estar vacío.', 'error');
    return;
  }
  const msg = pendingEditMsg;
  pendingEditMsg = null;
  els.editMessageDialog?.close();
  try {
    await api(`/messages/${msg.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ text: trimmed }),
    });
    await loadMessages({ silent: true, force: true, preserveScroll: true });
    toast('Mensaje editado.', 'success');
  } catch (err) {
    toast(err?.message || 'No se pudo editar.', 'error');
  }
}

function handleMessageReply(msg) {
  state.replyTo = msg;
  els.messageInput.placeholder = `Responder a ${msg.profiles?.display_name || 'usuario'}...`;
  els.messageInput.focus();
}

async function toggleReaction(messageId, emoji) {
  try {
    await api(`/messages/${messageId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) });
    await loadMessages({ silent: true, force: true, preserveScroll: true });
  } catch (err) {
    toast(err?.message || 'No se pudo añadir la reacción.', 'error');
  }
}

function toggleReactionPicker(wrap, msg) {
  const existing = wrap.querySelector('.reaction-picker');
  if (existing) {
    existing.remove();
    return;
  }
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  picker.innerHTML = emojis.map(e => `<button type="button" class="reaction-picker-btn" data-emoji="${e}">${e}</button>`).join('');
  picker.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const emoji = btn.dataset.emoji;
      if (!emoji) return;
      btn.disabled = true;
      try {
        await toggleReaction(msg.id, emoji);
        picker.remove();
      } finally {
        btn.disabled = false;
      }
    });
  });
  wrap.querySelector('.message-content')?.appendChild(picker);
}

async function handleMessageDelete(msg) {
  if (!confirm('¿Borrar este mensaje?')) return;
  try {
    await api(`/messages/${msg.id}`, { method: 'DELETE' });
    await loadMessages({ silent: true, force: true, preserveScroll: true });
    toast('Mensaje borrado.', 'success');
  } catch (err) {
    toast(err?.message || 'No se pudo borrar.', 'error');
  }
}

function renderMessagesSkeleton() {
  els.messages.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const wrap = document.createElement('article');
    wrap.className = 'message message-skeleton';
    wrap.innerHTML = `
      <div class="skeleton skeleton-avatar"></div>
      <div class="message-content">
        <div class="message-header">
          <span class="skeleton skeleton-text" style="width:100px"></span>
          <span class="skeleton skeleton-text" style="width:60px"></span>
        </div>
        <div class="skeleton skeleton-text" style="width:${60 + (i % 3) * 20}%"></div>
      </div>
    `;
    els.messages.appendChild(wrap);
  }
}

function renderMessages(messages, append = false) {
  requestAnimationFrame(() => {
  try {
  if (!append) {
    els.messages.innerHTML = '';
    if (state.messagesHasMore) {
      const loadMore = document.createElement('button');
      loadMore.className = 'load-more-btn';
      loadMore.textContent = 'Cargar mensajes anteriores';
      loadMore.addEventListener('click', () => loadMoreMessages());
      els.messages.appendChild(loadMore);
    }
  }
  if (!messages?.length && !append) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">💬</div>
      <h3>No hay mensajes</h3>
      <p>Sé el primero en escribir en este canal.</p>
    `;
    els.messages.appendChild(empty);
    return;
  }
  messages.filter(m => m && m.id).forEach(msg => {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    wrap.dataset.messageId = msg.id;
    const author = msg.profiles?.display_name || msg.profiles?.username || 'Usuario';
    const avatar = avatarFromProfile(msg.profiles || { display_name: author });
    const messageType = msg.message_type || 'text';
    const isOwn = msg.author_id === state.userId;
    const canEdit = isOwn && (messageType === 'text' || (msg.body && !msg.body.startsWith('[')));
    const timeStr = formatTs(msg.edited_at || msg.created_at);
    const timeTitle = formatTsRelative(msg.created_at) + (msg.edited_at ? ' (editado)' : '');
    const reactions = (msg.reactions || []).filter(Boolean);
    const reactionGroups = {};
    reactions.forEach(r => {
      const e = (r?.emoji || '').trim();
      if (e) reactionGroups[e] = (reactionGroups[e] || 0) + 1;
    });
    const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const reactionHtml = Object.entries(reactionGroups).map(([emoji, count]) =>
      `<button type="button" class="reaction-btn" data-emoji="${escapeAttr(emoji)}" data-msg-id="${msg.id}">${emoji} ${count}</button>`
    ).join('');

    wrap.innerHTML = `
      <img class="message-avatar" alt="avatar" src="${avatar}">
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${author}</span>
          <span class="message-time" title="${timeTitle}">${timeStr}${msg.edited_at ? ' (editado)' : ''}</span>
          <span class="message-actions">
            ${!msg.parent_message_id ? `<button type="button" class="message-action-btn" data-action="reply" aria-label="Responder">↩</button>` : ''}
            ${isOwn ? `${canEdit ? `<button type="button" class="message-action-btn" data-action="edit" aria-label="Editar">${icon('edit')}</button>` : ''}<button type="button" class="message-action-btn" data-action="delete" aria-label="Borrar">${icon('trash')}</button>` : ''}
            <button type="button" class="message-action-btn" data-action="react" aria-label="Reaccionar">😀</button>
          </span>
        </div>
        <div class="message-body"></div>
        <div class="message-media" style="display:none;"></div>
        <div class="message-caption" style="display:none;"></div>
        ${reactionHtml ? `<div class="message-reactions">${reactionHtml}</div>` : ''}
        ${!msg.parent_message_id && (msg.replyCount || 0) > 0 ? `<div class="message-thread"><button type="button" class="thread-toggle" data-parent-id="${msg.id}">↩ Ver ${msg.replyCount} ${msg.replyCount === 1 ? 'respuesta' : 'respuestas'}</button><div class="thread-replies" data-parent-id="${msg.id}" style="display:none;"></div></div>` : ''}
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
        captionEl.innerHTML = parseSimpleMarkdown(msg.body, state.members);
      }
    } else if (messageType === 'video' && msg.media_data) {
      mediaEl.style.display = 'block';
      mediaEl.innerHTML = `<video src="${msg.media_data}" controls playsinline></video>`;
      bodyEl.textContent = '';
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.innerHTML = parseSimpleMarkdown(msg.body, state.members);
      }
    } else if (messageType === 'audio' && msg.media_data) {
      mediaEl.style.display = 'block';
      mediaEl.innerHTML = `<audio src="${msg.media_data}" controls></audio>`;
      bodyEl.textContent = msg.body && !msg.body.startsWith('[') ? '' : 'Mensaje de voz';
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.innerHTML = parseSimpleMarkdown(msg.body, state.members);
      }
    } else if (messageType === 'file' && msg.media_data) {
      mediaEl.style.display = 'block';
      const name = msg.media_name || 'archivo';
      mediaEl.innerHTML = `<a href="${msg.media_data}" target="_blank" rel="noopener" class="file-attachment">📎 ${name}</a>`;
      if (msg.body && !msg.body.startsWith('[')) {
        captionEl.style.display = 'block';
        captionEl.innerHTML = parseSimpleMarkdown(msg.body, state.members);
      }
    } else {
      bodyEl.innerHTML = parseSimpleMarkdown(msg.body, state.members);
    }
    avatarEl?.addEventListener('click', () => openUserCard(msg.profiles || {}, msg.author_id || msg.profiles?.user_id || null));
    authorEl?.addEventListener('click', () => openUserCard(msg.profiles || {}, msg.author_id || msg.profiles?.user_id || null));

    wrap.querySelectorAll('.message-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'edit') handleMessageEdit(msg);
        if (action === 'delete') handleMessageDelete(msg);
        if (action === 'reply') handleMessageReply(msg);
        if (action === 'react') toggleReactionPicker(wrap, msg);
      });
    });
    wrap.querySelectorAll('.reaction-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(msg.id, btn.dataset.emoji);
      });
    });
    wrap.querySelector('.thread-toggle')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const parentId = e.target.dataset.parentId;
      const container = wrap.querySelector(`.thread-replies[data-parent-id="${parentId}"]`);
      if (!container) return;
      if (container.style.display === 'none') {
        const replies = await loadThreadReplies(parentId);
        renderThreadReplies(container, replies);
        container.style.display = 'block';
        e.target.textContent = '↩ Ocultar respuestas';
        e.target.dataset.expanded = '1';
      } else {
        container.style.display = 'none';
        container.innerHTML = '';
        e.target.textContent = `↩ Ver ${msg.replyCount || 0} ${(msg.replyCount || 0) === 1 ? 'respuesta' : 'respuestas'}`;
        delete e.target.dataset.expanded;
      }
    });

    if (append) {
      const insertBefore = els.messages.querySelector('.load-more-btn') || els.messages.firstChild;
      els.messages.insertBefore(wrap, insertBefore?.nextSibling || null);
    } else {
      els.messages.appendChild(wrap);
    }
  });
  if (!append) els.messages.scrollTop = els.messages.scrollHeight;
  } catch (err) {
    console.error('[renderMessages]', err, 'messages:', messages?.length, 'sample:', messages?.[0]);
    toast(err?.message || 'Error al mostrar mensajes.', 'error');
  }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  let mediaUrl = null;
  if (dataUrl && (dataUrl.startsWith('data:') || dataUrl.length > 500)) {
    setUploadProgress(50, 'Subiendo a Storage...');
    const { url } = await api('/upload', {
      method: 'POST',
      body: JSON.stringify({ data: dataUrl, mimeType: mime, fileName: name }),
    });
    mediaUrl = url;
  }
  setUploadProgress(80, 'Enviando mensaje...');
  await api('/messages', {
    method: 'POST',
    body: JSON.stringify({
      channelId: state.activeTextChannelId,
      text: caption,
      messageType: type,
      mediaUrl: mediaUrl || (dataUrl?.startsWith('http') ? dataUrl : null),
      mediaData: !mediaUrl && dataUrl ? dataUrl : undefined,
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
  const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
  if (!list.length) return 'empty';
  const last = list[list.length - 1];
  if (!last?.id) return `len:${list.length}`;
  return `${list.length}:${last.id}:${last.created_at || ''}:${last.edited_at || ''}`;
}

function updateHeader() {
  document.querySelectorAll('.composer-icon-btn').forEach(el => { el.style.display = state.activeDmChannelId ? 'none' : ''; });
  if (state.activeDmChannelId) {
    const dm = (state.dmChannels || []).find(d => d && d.id === state.activeDmChannelId);
    els.activeChannelName.textContent = dm?.otherUser?.display_name || dm?.otherUser?.username || 'DM';
    els.channelIcon.innerHTML = '👤';
  } else {
    const channel = (state.channels || []).find(c => c && c.id === state.activeTextChannelId);
    els.activeChannelName.textContent = channel?.name || 'sin-canal';
    els.channelIcon.innerHTML = channel?.type === 'voice' ? icon('speaker') : icon('hashtag');
  }
  els.serverName.textContent = state.server?.name || 'Servidor';
}

async function loadMessages(options = {}) {
  const { silent = false, force = false, before = null, append = false, preserveScroll = false } = options;
  if (!state.activeTextChannelId) return;
  const scrollBefore = preserveScroll && els.messages ? els.messages.scrollTop : null;
  if (!silent) {
    state.messagesLoading = true;
    if (!append) renderMessagesSkeleton();
  }
  try {
    let path = `/messages/${state.activeTextChannelId}?limit=50`;
    if (before) path += `&before=${encodeURIComponent(before)}`;
    const data = await api(path);
    const raw = Array.isArray(data) ? data : (data.messages || []);
    const messages = raw.filter(Boolean).filter(m => m && m.id);
    const hasMore = data.hasMore;
    if (append && state.messages) {
      state.messages = [...messages, ...state.messages];
      state.messagesHasMore = hasMore;
    } else {
      state.messages = messages;
      state.messagesHasMore = hasMore;
    }
    const nextFingerprint = messagesFingerprint(messages);
    if (silent && !force && !append && nextFingerprint === state.lastMessagesFingerprint) return;
    if (!append) state.lastMessagesFingerprint = nextFingerprint;
    renderMessages(messages, append);
    if (preserveScroll && scrollBefore != null && els.messages) {
      els.messages.scrollTop = Math.min(scrollBefore, els.messages.scrollHeight - els.messages.clientHeight);
    }
  } finally {
    state.messagesLoading = false;
  }
}

async function loadDmChannels() {
  try {
    state.dmChannels = await api('/dm') || [];
  } catch (_) {
    state.dmChannels = [];
  }
}

function renderDmList() {
  if (!els.dmList) return;
  els.dmList.innerHTML = '';
  (state.dmChannels || []).filter(dm => dm && dm.id).forEach(dm => {
    const other = dm?.otherUser;
    if (!other) return;
    const btn = document.createElement('button');
    btn.className = `channel-item ${state.activeDmChannelId === dm.id ? 'active' : ''}`;
    btn.innerHTML = `<span class="icon">👤</span><span>${other.display_name || other.username || 'Usuario'}</span>`;
    btn.addEventListener('click', () => {
      state.activeDmChannelId = dm.id;
      state.activeTextChannelId = null;
      updateHeader();
      loadDmMessages();
      renderChannels();
      renderDmList();
      renderVoiceExitPanel();
    });
    els.dmList.appendChild(btn);
  });
}

async function loadDmMessages() {
  if (!state.activeDmChannelId) return;
  state.messagesLoading = true;
  renderMessagesSkeleton();
  try {
    const raw = await api(`/dm/${state.activeDmChannelId}/messages`);
    const messages = Array.isArray(raw) ? raw.filter(m => m && m.id) : [];
    state.messages = messages;
    renderDmMessages(messages);
  } finally {
    state.messagesLoading = false;
  }
}

function renderDmMessages(messages) {
  if (!els.messages) return;
  els.messages.innerHTML = '';
  const list = Array.isArray(messages) ? messages.filter(m => m && m.id) : [];
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state-icon">💬</div><h3>No hay mensajes</h3><p>Envía un mensaje para comenzar.</p>';
    els.messages.appendChild(empty);
    return;
  }
  list.forEach(msg => {
    const wrap = document.createElement('article');
    wrap.className = 'message';
    const author = msg.profiles?.display_name || msg.profiles?.username || 'Usuario';
    const avatar = avatarFromProfile(msg.profiles || { display_name: author });
    wrap.innerHTML = `
      <img class="message-avatar" alt="avatar" src="${avatar}">
      <div class="message-content">
        <div class="message-header"><span class="message-author">${author}</span><span class="message-time">${formatTs(msg.created_at)}</span></div>
        <div class="message-body">${msg.media_data ? `<a href="${msg.media_data}" target="_blank">${msg.body}</a>` : parseSimpleMarkdown(msg.body, [])}</div>
      </div>
    `;
    els.messages.appendChild(wrap);
  });
  els.messages.scrollTop = els.messages.scrollHeight;
}

async function loadThreadReplies(parentId) {
  if (!state.activeTextChannelId) return [];
  try {
    return await api(`/messages/${state.activeTextChannelId}/thread/${parentId}`);
  } catch (_) {
    return [];
  }
}

function renderThreadReplies(container, replies) {
  container.innerHTML = '';
  (replies || []).filter(Boolean).filter(r => r?.id).forEach(r => {
    const author = r.profiles?.display_name || r.profiles?.username || 'Usuario';
    const avatar = avatarFromProfile(r.profiles || { display_name: author });
    let bodyHtml = parseSimpleMarkdown(r.body || '', state.members);
    if (r.message_type === 'image' && r.media_data) bodyHtml = `<img src="${r.media_data}" alt="imagen" loading="lazy" style="max-width:200px;border-radius:6px;">` + (r.body && !r.body.startsWith('[') ? `<p>${bodyHtml}</p>` : '');
    else if (r.message_type === 'file' && r.media_data) bodyHtml = `<a href="${r.media_data}" target="_blank" rel="noopener">📎 ${r.media_name || 'archivo'}</a>` + (r.body && !r.body.startsWith('[') ? `<p>${parseSimpleMarkdown(r.body, state.members)}</p>` : '');
    const el = document.createElement('div');
    el.className = 'message thread-reply';
    el.innerHTML = `
      <img class="message-avatar" alt="avatar" src="${avatar}">
      <div class="message-content">
        <div class="message-header"><span class="message-author">${author}</span><span class="message-time">${formatTs(r.created_at)}</span></div>
        <div class="message-body">${bodyHtml}</div>
      </div>
    `;
    el.querySelector('.message-author')?.addEventListener('click', () => openUserCard(r.profiles || {}, r.author_id));
    container.appendChild(el);
  });
}

async function loadMoreMessages() {
  if (!state.messages?.length || !state.messagesHasMore) return;
  const oldest = state.messages[0];
  const before = oldest?.created_at;
  if (!before) return;
  await loadMessages({ silent: true, before, append: true });
}

function startMessagesPolling() {
  if (state.messagesPollTimer) clearInterval(state.messagesPollTimer);
  const interval = document.hidden ? MESSAGES_POLL_MS_HIDDEN : MESSAGES_POLL_MS;
  state.messagesPollTimer = setInterval(() => {
    if (state.activeDmChannelId) loadDmMessages().catch(() => {});
    else if (state.activeTextChannelId) loadMessages({ silent: true }).catch(() => {});
  }, interval);
}

async function refreshMembers() {
  if (!state.server?.id) return;
  state.membersLoading = true;
  renderMembersSkeleton();
  try {
    state.members = await api(`/servers/${state.server.id}/members`);
    renderMembersAdmin();
    renderMembersSidebar();
  } finally {
    state.membersLoading = false;
  }
}

async function refreshChannels() {
  if (!state.server?.id) return;

  const wasInDmMode = Boolean(state.activeDmChannelId);
  if (wasInDmMode) {
    state.channelsLoading = true;
    renderChannelsSkeleton();
    try {
      const bootstrap = await api(`/bootstrap?username=${encodeURIComponent(state.username)}`);
      state.channels = Array.isArray(bootstrap?.channels) ? bootstrap.channels.filter(c => c && c.id) : [];
      renderChannels();
      updateHeader();
    } finally {
      state.channelsLoading = false;
    }
    if (state.activeDmChannelId) await loadDmMessages();
    return;
  }

  state.channelsLoading = true;
  renderChannelsSkeleton();
  const prevVoiceChannelId = state.activeVoiceChannelId;
  const prevTextChannelId = state.activeTextChannelId;

  try {
  const bootstrap = await api(`/bootstrap?username=${encodeURIComponent(state.username)}`);
  state.channels = Array.isArray(bootstrap?.channels) ? bootstrap.channels.filter(c => c && c.id) : [];

  const hasActiveText = (state.channels || []).some(c => c && c.id === state.activeTextChannelId && c.type === 'text' && !c.is_archived);
  if (!hasActiveText) {
    state.activeTextChannelId = (state.channels || []).find(c => c && c.type === 'text' && !c.is_archived)?.id || null;
  }

  const hasActiveVoice = (state.channels || []).some(c => c && c.id === state.activeVoiceChannelId && c.type === 'voice' && !c.is_archived);
  if (!hasActiveVoice) {
    state.activeVoiceChannelId = (state.channels || []).find(c => c && c.type === 'voice' && !c.is_archived)?.id || null;
  }

  if (state.activeVoiceChannelId) localStorage.setItem(VOICE_CHANNEL_KEY, state.activeVoiceChannelId);
  else localStorage.removeItem(VOICE_CHANNEL_KEY);

  renderChannels();
  updateHeader();

  if (state.activeTextChannelId !== prevTextChannelId) {
    state.lastMessagesFingerprint = '';
    state.activeDmChannelId = null;
  }
  } finally {
    state.channelsLoading = false;
  }
  if (state.activeDmChannelId) await loadDmMessages();
  else if (state.activeTextChannelId) await loadMessages({ silent: true });
  else if (els.messages) els.messages.innerHTML = '';

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
  state.selectedPermChannelId = channelId;
  state.selectedPermRole = role;
  const rows = await api(`/channels/${channelId}/permissions`);
  const row = rows.find(r => r.role === role) || {};
  els.permSendMessage.checked = row.can_send_message ?? false;
  els.permJoinVoice.checked = row.can_join_voice ?? false;
  els.permUseWebcam.checked = row.can_use_webcam ?? false;
  els.permShareScreen.checked = row.can_share_screen ?? false;
  els.permManageChannel.checked = row.can_manage_channel ?? false;
  els.permModerateVoice.checked = row.can_moderate_voice ?? false;
  showServerSettingsFeedback('');
}

async function saveChannelPermissionPreset() {
  if (!canManageServer()) return;
  const channelId = els.permChannelSelect.value;
  const role = els.permRoleSelect.value;
  if (!channelId) return;
  state.selectedPermChannelId = channelId;
  state.selectedPermRole = role;
  await api(`/channels/${channelId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({
      role,
      canSendMessage: els.permSendMessage.checked,
      canJoinVoice: els.permJoinVoice.checked,
      canUseWebcam: els.permUseWebcam.checked,
      canShareScreen: els.permShareScreen.checked,
      canManageChannel: els.permManageChannel.checked,
      canModerateVoice: els.permModerateVoice.checked,
    }),
  });
  showServerSettingsFeedback('Permisos guardados correctamente.', 'success');
}

async function setActiveTextChannel(channelId) {
  state.activeTextChannelId = channelId;
  state.activeDmChannelId = null;
  state.lastMessagesFingerprint = '';
  renderChannels();
  renderDmList();
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
  return `${state.server?.id || ''}:${state.activeVoiceChannelId || ''}`;
}

async function fetchToken(roomName) {
  return api(`/token?username=${encodeURIComponent(state.profile?.display_name || state.username)}&room=${encodeURIComponent(roomName)}`);
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

async function applyScreenAudioBitrate(audioTrack, bps = 510000) {
  const waitForSender = async (maxMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (audioTrack?.sender) return audioTrack.sender;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };
  const sender = await waitForSender();
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (params.encodings?.length) {
      params.encodings.forEach((enc) => {
        enc.maxBitrate = bps;
        enc.priority = 'high';
      });
      await sender.setParameters(params);
      pushAudioDiag('Audio sender bitrate', `maxBitrate=${bps}`);
    }
  } catch (err) {
    pushAudioDiag('Audio sender params', `err=${err?.message || 'unknown'}`);
  }
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

function isScreenShareSource(source) {
  const value = String(source || '').toLowerCase();
  return value.includes('screen');
}

// Measures the peak audio signal level from a MediaStreamTrack.
// Returns 0..1 (0 = completely silent, >0.005 = audible signal).
// Returns -1 on error.
async function measureAudioLevel(track, durationMs = 2500) {
  if (!track || track.readyState === 'ended') return 0;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    // Resume context in case it was suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch (_) {}
    }
    const stream = new MediaStream([track]);
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const data = new Float32Array(analyser.frequencyBinCount);
    let peak = 0;
    const steps = Math.ceil(durationMs / 100);
    for (let i = 0; i < steps; i++) {
      await new Promise((r) => setTimeout(r, 100));
      analyser.getFloatTimeDomainData(data);
      for (let j = 0; j < data.length; j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      // If we already have a clear signal, no need to wait longer
      if (peak > 0.01) break;
    }
    src.disconnect();
    try { await ctx.close(); } catch (_) {}
    return peak;
  } catch (_) {
    return -1;
  }
}

function waitForDisplayAudioTrack(stream, timeoutMs = 1800) {
  return new Promise((resolve) => {
    const existing = stream.getAudioTracks()[0];
    if (existing) return resolve(existing);

    const start = Date.now();
    const onAddTrack = (event) => {
      const track = event?.track;
      if (track?.kind === 'audio') {
        cleanup();
        resolve(track);
      }
    };
    const intervalId = setInterval(() => {
      const track = stream.getAudioTracks()[0];
      if (track) {
        cleanup();
        resolve(track);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        cleanup();
        resolve(null);
      }
    }, 120);

    const cleanup = () => {
      clearInterval(intervalId);
      stream.removeEventListener('addtrack', onAddTrack);
    };

    stream.addEventListener('addtrack', onAddTrack);
  });
}

function normalizeSourceKind(source) {
  if (!source) return 'window';
  if (source.kind) return source.kind;
  if (String(source.id || '').startsWith('screen:')) return 'screen';
  return 'window';
}

async function pickElectronCaptureSource() {
  const rows = await window.desktopApp?.listCaptureSources?.();
  const sources = (rows || []).filter((row) => row?.id);
  if (!sources.length) throw new Error('No hay fuentes de captura disponibles.');
  if (!els.captureSourceDialog || !els.captureSourceForm || !els.captureSourceList) return sources[0];

  els.captureSourceList.innerHTML = '';
  sources.forEach((source, idx) => {
    const kind = normalizeSourceKind(source);
    const item = document.createElement('label');
    item.className = 'capture-source-item';
    item.innerHTML = `
      <input type="radio" name="capture-source" value="${source.id}" ${idx === 0 ? 'checked' : ''} />
      <div class="capture-source-thumb-wrap">
        ${source.thumbnailDataUrl ? `<img class="capture-source-thumb" src="${source.thumbnailDataUrl}" alt="${source.name}" />` : '<div class="capture-source-thumb placeholder"></div>'}
      </div>
      <div class="capture-source-meta">
        <strong>${source.name}</strong>
        <span>${kind === 'screen' ? 'Pantalla' : 'Ventana'}</span>
      </div>
    `;
    els.captureSourceList.appendChild(item);
  });

  return new Promise((resolve, reject) => {
    const onClose = () => {
      els.captureSourceDialog.removeEventListener('close', onClose);
      if (els.captureSourceDialog.returnValue !== 'selected') {
        reject(new Error('Captura cancelada.'));
        return;
      }
      const pickedId = els.captureSourceList.querySelector('input[name="capture-source"]:checked')?.value;
      const picked = sources.find((s) => s.id === pickedId) || sources[0];
      resolve(picked);
    };
    els.captureSourceDialog.addEventListener('close', onClose, { once: true });
    els.captureSourceDialog.showModal();
  });
}

async function getElectronCaptureStream() {
  const sources = (await window.desktopApp?.listCaptureSources?.()) || [];
  const pickedSource = await pickElectronCaptureSource();
  const pickedKind = normalizeSourceKind(pickedSource);
  const screenSource = sources.find((s) => normalizeSourceKind(s) === 'screen');
  // Reliability mode: window video capture can publish silent audio on Windows.
  // When a window is selected, switch to screen source for stable system audio delivery.
  const captureSource = (pickedKind === 'window' && screenSource?.id) ? screenSource : pickedSource;
  const sourceKind = normalizeSourceKind(captureSource);
  state.lastCaptureSourceName = captureSource?.name || (sourceKind === 'screen' ? 'Pantalla' : 'Ventana');
  pushAudioDiag(
    'Electron source selected',
    `${state.lastCaptureSourceName} (${sourceKind})${pickedKind === 'window' && screenSource?.id ? ' [compat window->screen]' : ''}`
  );

  const screenAudioConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
  };
  const captureFromSource = async (sourceId, includeAudio = true) => {
    await window.desktopApp?.setCaptureSource?.(sourceId);
    return navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60, max: 60 } },
      audio: includeAudio ? screenAudioConstraints : false,
    });
  };

  let stream;
  try {
    stream = await captureFromSource(captureSource.id, true);
  } catch (err) {
    if (err?.name === 'NotSupportedError') {
      throw new Error('Este Electron no soporta captura de pantalla en este modo. Reinicia la app y vuelve a probar.');
    }
    if (err?.name === 'NotAllowedError') {
      throw new Error('Captura cancelada o bloqueada. Revisa permisos y vuelve a intentar.');
    }
    throw new Error(err?.message || 'No se pudo iniciar la captura de pantalla en Electron.');
  }

  pushAudioDiag('Electron getDisplayMedia OK', `audioTracks=${stream.getAudioTracks().length} videoTracks=${stream.getVideoTracks().length}`);
  return stream;
}

function upsertStreamTile(id, label, mediaTrack, opts = {}) {
  const { muted = false, participantSid = null, isScreenShare = false } = opts;
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
  card.classList.toggle('screen-share', Boolean(isScreenShare));
  const video = card.querySelector('video');
  mediaTrack.attach(video);
  if (isScreenShare) {
    video.style.objectFit = 'contain';
    video.style.background = '#000';
  } else {
    video.style.objectFit = 'cover';
    video.style.background = '';
  }
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
  if (!allowed) return toast('No tienes permiso para entrar al canal de voz.', 'error');
  const { Room, RoomEvent, Track } = LivekitClient;
  const roomName = getVoiceRoomName();
  const { token, url } = await fetchToken(roomName);
  pushAudioDiag('Join voice', `room=${roomName}`);
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: MIC_AUDIO_CAPTURE_OPTIONS,
    audioOutput: { deviceId: 'default' },
    disconnectOnPageLeave: false,
    webAudioMix: true,
  });

  try {
    const preflight = await navigator.mediaDevices.getUserMedia({
      audio: MIC_AUDIO_CAPTURE_OPTIONS,
      video: false,
    });
    preflight.getTracks().forEach(t => t.stop());
  } catch (_) {
    toast(
      !window.isSecureContext
        ? 'Se necesita HTTPS (o localhost) para usar el micrófono y entrar al canal de voz.'
        : 'Permite el micrófono para entrar al canal de voz.',
      'error',
    );
    return;
  }
  await refreshAudioInputDevices();
  pushAudioDiag('Audio inputs', `count=${state.audioInputDevices.length}`);
  if (state.audioInputDevices.length) {
    const labels = state.audioInputDevices
      .map((d, i) => `${i + 1}. ${d.label || '(sin etiqueta)'}`)
      .join(' | ');
    pushAudioDiag('Audio input labels', labels);
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
        const el = document.createElement('audio');
        el.className = 'remote-audio-sink';
        el.autoplay = true;
        el.setAttribute('autoplay', '');
        el.playsInline = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        el.preload = 'auto';
        el.muted = false;
        el.volume = 1;
        track.attach(el);
        const audioKey = publication?.trackSid || `${participant.sid}:${Date.now()}`;
        state.remoteAudioElements[audioKey] = el;
        document.body.appendChild(el);
        pushAudioDiag('TrackSubscribed audio', `from=${participant.identity} source=${publication?.source || track?.source || 'unknown'} sid=${publication?.trackSid || '-'}`);
        tryResumeRemoteAudio().catch(() => {
          setAudioUnlockNeeded(true);
        });
      } else if (track.kind === Track.Kind.Video) {
        const source = publication?.source || track.source || 'video';
        const tileId = `${participant.sid}:${source}`;
        const isScreenShare = isScreenShareSource(source) || source === Track.Source.ScreenShare;
        const label = `${participant.name || participant.identity} · ${isScreenShare ? 'pantalla' : 'webcam'}`;
        upsertStreamTile(tileId, label, track, {
          participantSid: participant.sid,
          isScreenShare,
        });
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      const detached = track.detach();
      detached?.forEach((node) => node.remove?.());
      if (track.kind === Track.Kind.Audio && publication?.trackSid) {
        delete state.remoteAudioElements[publication.trackSid];
      }
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
      setAudioUnlockNeeded(false);
      Object.values(state.remoteAudioElements).forEach((el) => el?.remove?.());
      state.remoteAudioElements = {};
      Object.keys(state.streamTiles).forEach(removeStreamTile);
      state.pinnedTileId = null;
      renderChannels();
      renderVoiceExitPanel();
      renderVoiceControls();
      renderMembersSidebar();
    });

  await room.connect(url, token);
  pushAudioDiag('Room connected', `participants=${room.remoteParticipants.size}`);
  await ensureAudioContextUnlocked();
  try {
    await room.localParticipant.setMicrophoneEnabled(true, MIC_AUDIO_CAPTURE_OPTIONS);
  } catch (_) {
    await room.disconnect();
    toast('No se pudo activar el micrófono en el canal de voz.', 'error');
    return;
  }

  state.room = room;
  localStorage.setItem(VOICE_REJOIN_KEY, '1');
  els.btnMicToggle.disabled = false;
  els.btnMicToggle.textContent = 'Mic ON';
  renderChannels();
  renderVoiceExitPanel();
  renderVoiceControls();
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
  renderVoiceControls();
  renderMembersSidebar();
}

async function toggleMic() {
  if (!state.room) return;
  const enabled = state.room.localParticipant.isMicrophoneEnabled;
  await state.room.localParticipant.setMicrophoneEnabled(!enabled, !enabled ? MIC_AUDIO_CAPTURE_OPTIONS : undefined);
  els.btnMicToggle.textContent = enabled ? 'Mic OFF' : 'Mic ON';
  renderChannels();
  renderMembersSidebar();
}

async function toggleWebcam(forceOff = false) {
  if (!state.room) return;
  const { Track } = LivekitClient;
  if (!forceOff) {
    const allowed = state.room ? true : await checkPermission('use_webcam', state.activeVoiceChannelId || undefined);
    if (!allowed) return toast('No tienes permiso para usar webcam en este canal.', 'error');
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
    video: {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 360 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
  const camTrack = new LivekitClient.LocalVideoTrack(stream.getVideoTracks()[0], undefined, false);
  await state.room.localParticipant.publishTrack(camTrack, {
    source: Track.Source.Camera,
    videoCodec: chooseBestCodec(),
    videoEncoding: {
      maxBitrate: 4500 * 1000,
      maxFramerate: 30,
      priority: 'high',
    },
    degradationPreference: 'maintain-framerate',
  });
  state.localCameraTrack = camTrack;
  upsertStreamTile('local:camera', `${state.profile.display_name} (tú) · webcam`, camTrack, { muted: true });
  els.btnWebcamToggle.classList.add('danger');
}

async function toggleScreen(forceOff = false) {
  if (!state.room) return;
  const { Track } = LivekitClient;
  if (!forceOff) {
    const allowed = state.room ? true : await checkPermission('share_screen', state.activeVoiceChannelId || undefined);
    if (!allowed) return toast('No tienes permiso para compartir pantalla en este canal.', 'error');
  }
  if (state.localScreenTrack || forceOff) {
    if (!state.localScreenTrack) return;
    const t = state.localScreenTrack;
    state.localScreenTrack = null;
    t.mediaStreamTrack.stop();
    await state.room.localParticipant.unpublishTrack(t);
    if (state.localScreenAudioTrack) {
      try { state.localScreenAudioTrack.mediaStreamTrack.stop(); } catch (_) {}
      try { await state.room.localParticipant.unpublishTrack(state.localScreenAudioTrack); } catch (_) {}
      state.localScreenAudioTrack = null;
    }
    removeStreamTile('local:screen');
    if (state.screenAdaptTimer) {
      clearInterval(state.screenAdaptTimer);
      state.screenAdaptTimer = null;
    }
    els.btnScreenToggle.classList.remove('danger');
    els.btnScreenAudioToggle.classList.add('hidden');
    setCaptureDiagnostics({ visible: false });
    pushAudioDiag('Screen share stopped');
    return;
  }
  const screenAudioConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
  };
  const captureDisplay = async (advanced) => {
    const videoOpts = {
      width: { ideal: 2560 },
      height: { ideal: 1440 },
      frameRate: { ideal: 60, max: 60 },
    };
    const audioOpts = advanced ? screenAudioConstraints : true;
    return navigator.mediaDevices.getDisplayMedia({
      video: videoOpts,
      audio: audioOpts,
    });
  };

  let stream;
  if (isElectronDesktop()) {
    stream = await getElectronCaptureStream();
  } else {
    try {
      stream = await captureDisplay(true);
    } catch (_) {
      stream = await captureDisplay(false);
    }
    state.lastCaptureSourceName = '';
  }
  pushAudioDiag('Screen capture started', `isElectron=${isElectronDesktop()} audioTracks=${stream.getAudioTracks().length}`);

  let audioTrack = await waitForDisplayAudioTrack(stream);
  let videoTrack = stream.getVideoTracks()[0];
  let surface = videoTrack?.getSettings?.().displaySurface || 'desconocida';

  if (!audioTrack) {
    // Reintento simple para navegadores que ignoran constraints avanzadas de audio.
    stream.getTracks().forEach((t) => t.stop());
    stream = await captureDisplay(false);
    audioTrack = await waitForDisplayAudioTrack(stream);
    videoTrack = stream.getVideoTracks()[0];
    surface = videoTrack?.getSettings?.().displaySurface || 'desconocida';
  }
  pushAudioDiag('Screen tracks resolved', `surface=${surface} audioTrack=${audioTrack ? 'yes' : 'no'}`);

  const track = videoTrack;
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
  pushAudioDiag('Published screen video');
  await applyScreenSenderParams(screenTrack, 18000, 60).catch(() => {});
  startScreenAdaptation(screenTrack, 20000, 60);
  state.localScreenTrack = screenTrack;

  if (audioTrack) {
    // Measure the actual signal level from the captured track to diagnose loopback issues
    const signalLevel = await measureAudioLevel(audioTrack, 2500);
    const signalTag = signalLevel < 0 ? 'error' : signalLevel > 0.005 ? `✓ señal (peak=${signalLevel.toFixed(4)})` : `⚠ silencioso (peak=${signalLevel.toFixed(4)})`;
    pushAudioDiag('Audio level check', signalTag);
    if (signalLevel >= 0 && signalLevel < 0.005) {
      pushAudioDiag('AVISO loopback', 'El track capturado parece silencioso. ¿Hay audio reproduciéndose? En Windows, activa "Mezcla Estéreo" en Sonido > Grabación.');
    }

    try {
      audioTrack.contentHint = 'music';
      audioTrack.enabled = true;
      await audioTrack.applyConstraints({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      });
    } catch (_) {}

    const screenAudio = new LivekitClient.LocalAudioTrack(
      audioTrack,
      { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      false
    );
    try {
      await state.room.localParticipant.publishTrack(screenAudio, {
        source: Track.Source.ScreenShareAudio,
        audioBitrate: 510000,
        dtx: false,
        red: true,
        stopMicTrackOnMute: false,
      });
      await applyScreenAudioBitrate(screenAudio, 510000);
    } catch (err) {
      pushAudioDiag('ERROR publish ScreenShareAudio', err?.message || 'unknown');
      throw err;
    }
    state.localScreenAudioTrack = screenAudio;
    pushAudioDiag('Published screen audio', `trackId=${audioTrack.id || '-'} level=${signalLevel.toFixed(4)}`);

    state.screenAudioEnabled = true;
    els.btnScreenAudioToggle.textContent = '🔊 Audio';
    els.btnScreenAudioToggle.classList.remove('hidden', 'danger');
    setCaptureDiagnostics({
      visible: true,
      sourceName: state.lastCaptureSourceName || surface,
      hasAudio: true,
    });
  } else {
    state.localScreenAudioTrack = null;
    state.screenAudioEnabled = false;
    els.btnScreenAudioToggle.classList.add('hidden');
    setCaptureDiagnostics({
      visible: true,
      sourceName: state.lastCaptureSourceName || surface,
      hasAudio: false,
    });
    if (!isElectronDesktop()) {
      if (surface !== 'browser') toast('La imagen se comparte correctamente. Esta fuente no entregó audio del sistema.', 'info');
      else toast('La imagen se comparte correctamente, pero el navegador no entregó pista de audio del sistema.', 'info');
    }
    pushAudioDiag('No audio track in capture');
  }

  upsertStreamTile('local:screen', `${state.profile.display_name} (tú) · pantalla`, screenTrack, {
    muted: true,
    isScreenShare: true,
  });
  track.addEventListener('ended', () => { toggleScreen(true).catch(() => {}); });
  els.btnScreenToggle.classList.add('danger');
}

function toggleScreenAudio() {
  if (!state.localScreenAudioTrack) return;
  if (state.screenAudioEnabled) {
    state.localScreenAudioTrack.mediaStreamTrack.enabled = false;
    state.screenAudioEnabled = false;
    els.btnScreenAudioToggle.textContent = '🔇 Audio';
    els.btnScreenAudioToggle.classList.add('danger');
  } else {
    state.localScreenAudioTrack.mediaStreamTrack.enabled = true;
    state.screenAudioEnabled = true;
    els.btnScreenAudioToggle.textContent = '🔊 Audio';
    els.btnScreenAudioToggle.classList.remove('danger');
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (document.activeElement === els.messageInput) {
        e.preventDefault();
        els.messageForm?.requestSubmit();
      }
    }
  });
}

function wireEvents() {
  setupKeyboardShortcuts();
  const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, markUserActivity, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      startPresenceHeartbeat();
      startMembersPresencePolling();
      startMessagesPolling();
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

  els.captureSourceForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const checked = els.captureSourceList?.querySelector('input[name="capture-source"]:checked');
    if (!checked) return;
    els.captureSourceDialog?.close('selected');
  });
  els.authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAuthFeedback('');
    const username = normalizeUsername(els.authUsername?.value);
    try {
      const { data, error } = await sb.auth.signInAnonymously({
        options: { data: { username, display_name: username } },
      });
      if (error) throw error;
      const session = data?.session;
      const user = data?.user ?? session?.user;
      if (!user || !session) {
        throw new Error('No se pudo entrar. Revisa la configuración de Supabase.');
      }
      applyAuthenticatedUser(user, session);
      els.authDialog.close();
      if (state.pendingJoinCode) {
        els.joinDialog?.showModal();
        if (els.joinMessage) els.joinMessage.textContent = 'Cargando...';
        await handleJoinFlow();
      } else {
        await boot();
      }
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/signups?\s+not\s+allowed/i.test(msg)) {
        setAuthFeedback(
          'En Supabase: Authentication → (ajustes generales) activa "Allow new users to sign up". '
          + 'Los usuarios anónimos cuentan como registro nuevo; sin eso GoTrue lo bloquea.',
          'error',
        );
      } else if (/anonymous|anon/i.test(msg) && /not\s+enabled|disabled|not\s+allowed|forbidden/i.test(msg)) {
        setAuthFeedback(
          'En Supabase: Authentication → Sign In / Providers → activa "Anonymous sign-ins".',
          'error',
        );
      } else {
        setAuthFeedback(msg || 'No se pudo entrar.', 'error');
      }
    }
  });

  let typingTimeout = null;
  els.messageInput?.addEventListener('input', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    els.typingIndicator?.classList.toggle('hidden', !els.messageInput.value.trim());
    typingTimeout = setTimeout(() => {
      els.typingIndicator?.classList.add('hidden');
    }, 2000);
  });
  els.messageInput?.addEventListener('blur', () => {
    els.typingIndicator?.classList.add('hidden');
  });

  const sendTyping = debounce(() => {
    if (!state.activeTextChannelId || !sb || !state.userId) return;
    sb.channel('typing').send({
      type: 'broadcast',
      event: 'typing',
      payload: { channelId: state.activeTextChannelId, userId: state.userId, username: state.profile?.display_name || state.username },
    });
  }, TYPING_DEBOUNCE_MS);
  els.messageInput?.addEventListener('input', () => {
    if (els.messageInput.value.trim()) {
      els.typingIndicator?.classList.remove('hidden');
      els.typingIndicator.textContent = 'Escribiendo...';
      sendTyping();
    } else {
      els.typingIndicator?.classList.add('hidden');
    }
  });

  els.messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text) return;
    if (state.activeDmChannelId) {
      try {
        await api(`/dm/${state.activeDmChannelId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
        els.messageInput.value = '';
        await loadDmMessages();
      } catch (err) {
        toast(err?.message || 'No se pudo enviar.', 'error');
      }
      return;
    }
    if (!state.activeTextChannelId) return;
    const submitBtn = els.messageForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add('loading');
    }
    try {
      const allowed = await checkPermission('send_message', state.activeTextChannelId);
      if (!allowed) {
        toast('No tienes permiso para enviar mensajes en este canal.', 'error');
        return;
      }
      await api('/messages', {
        method: 'POST',
        body: JSON.stringify({
          channelId: state.activeTextChannelId,
          text,
          parentMessageId: state.replyTo?.id,
        }),
      });
      els.messageInput.value = '';
      els.messageInput.placeholder = 'Escribe un mensaje...';
      state.replyTo = null;
      els.typingIndicator?.classList.add('hidden');
      await loadMessages({ silent: true });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
      }
    }
  });

  els.btnAttachMedia.addEventListener('click', () => {
    els.mediaInput.value = '';
    els.mediaInput.click();
  });

  els.mediaInput.addEventListener('change', async () => {
    const file = els.mediaInput.files?.[0];
    if (!file) return;
    const canSend = await checkPermission('send_message', state.activeTextChannelId);
    if (!canSend) return toast('No tienes permiso para enviar mensajes en este canal.', 'error');

    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : file.type === 'application/pdf'
            ? 'file'
            : null;
    if (!type) return toast('Solo se permiten imagen, video, audio o PDF.', 'error');

    const maxBytes = type === 'image' ? 8 * 1024 * 1024 : type === 'file' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      return toast(type === 'image' ? 'La imagen supera 8MB.' : 'El video supera 25MB.', 'error');
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
      toast(err.message || 'No se pudo enviar el archivo.', 'error');
      clearPendingMedia();
    }
  });

  els.btnRecordVoice.addEventListener('click', async () => {
    const canSend = await checkPermission('send_message', state.activeTextChannelId);
    if (!canSend) return toast('No tienes permiso para enviar mensajes en este canal.', 'error');

    if (state.mediaRecorder) {
      state.mediaRecorder.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return toast('Tu navegador no soporta grabación de voz.', 'error');
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
        if (blob.size > 10 * 1024 * 1024) return toast('El mensaje de voz supera 10MB.', 'error');

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
          toast(err.message || 'No se pudo enviar el mensaje de voz.', 'error');
          clearPendingMedia();
        }
      };

      recorder.start(200);
    } catch (err) {
      toast('No se pudo iniciar la grabación de voz.', 'error');
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
      toast(err.message || 'No se pudo enviar el archivo.', 'error');
      clearPendingMedia();
    }
  });

  els.btnThemeToggle?.addEventListener('click', toggleTheme);

  els.btnUserDm?.addEventListener('click', async () => {
    const otherId = (state.userCardUserId != null) ? String(state.userCardUserId).trim() : '';
    if (!otherId || otherId === state.userId) {
      toast('No se pudo identificar al usuario. Vuelve a abrir el perfil.', 'error');
      return;
    }
    try {
      const res = await api('/dm', { method: 'POST', body: JSON.stringify({ otherUserId: otherId }) });
      const id = (res && typeof res === 'object' && res.id) ? res.id : null;
      if (!id) {
        toast('No se recibió el canal de DM. Intenta de nuevo.', 'error');
        return;
      }
      state.activeDmChannelId = id;
      state.activeTextChannelId = null;
      els.userCardDialog?.close();
      updateHeader();
      await loadDmChannels();
      renderDmList();
      renderChannels();
      await loadDmMessages();
    } catch (err) {
      const msg = (err && typeof err === 'object' && err.message) ? err.message : 'No se pudo abrir el mensaje directo.';
      toast(msg, 'error');
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
  els.btnLogout?.addEventListener('click', async () => {
    try {
      await syncPresence('offline', { force: true });
      await sb.auth.signOut();
      location.reload();
    } catch (err) {
      toast(err.message || 'No se pudo cerrar sesión.', 'error');
    }
  });

  els.editMessageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitMessageEdit();
  });

  els.profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.profile = await api('/profiles/upsert', {
      method: 'POST',
      body: JSON.stringify({
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

  els.btnInvite?.addEventListener('click', async () => {
    if (!state.server?.id) return;
    try {
      const { url, code } = await api(`/servers/${state.server.id}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ expiresInHours: 24 }),
      });
      els.inviteResult.classList.remove('hidden');
      els.inviteResult.innerHTML = `<input readonly value="${url}" class="invite-url" /><button type="button" class="mini-btn copy-invite">Copiar</button>`;
      els.inviteResult.querySelector('.copy-invite')?.addEventListener('click', () => {
        navigator.clipboard.writeText(url);
        toast('Enlace copiado.', 'success');
      });
    } catch (err) {
      toast(err?.message || 'No se pudo crear invitación.', 'error');
    }
  });

  els.btnServerSettings.addEventListener('click', () => {
    if (!canManageServer()) return;
    els.serverNameInput.value = state.server?.name || '';
    els.inviteResult?.classList.add('hidden');
    showServerSettingsFeedback('');
    els.serverDialog.showModal();
    renderMembersAdmin();
    loadChannelPermissionPreset().catch(() => {});
  });

  els.serverDialog.addEventListener('close', () => {
    showServerSettingsFeedback('');
  });

  els.serverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.server = await api(`/servers/${state.server.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: els.serverNameInput.value.trim() }),
      });
      updateHeader();
      showServerSettingsFeedback('Cambios del servidor guardados.', 'success');
      els.serverDialog.close();
    } catch (err) {
      showServerSettingsFeedback(err.message || 'No se pudo guardar el servidor.', 'error');
    }
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
    if (!canManageServer() || !state.server?.id) return;
    await api('/channels', {
      method: 'POST',
      body: JSON.stringify({
        serverId: state.server.id,
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
      toast(err.message || 'No se pudo cambiar el micrófono.', 'error');
    }
  });
  els.btnWebcamToggle.addEventListener('click', () => toggleWebcam());
  els.btnScreenToggle.addEventListener('click', async () => {
    try {
      await toggleScreen();
    } catch (err) {
      toast(err.message || 'No se pudo compartir pantalla.', 'error');
    }
  });
  els.btnScreenAudioToggle.addEventListener('click', () => toggleScreenAudio());
  els.btnLayoutToggle.addEventListener('click', () => {
    setStreamLayout(state.streamLayoutMode === 'focus' ? 'grid' : 'focus');
  });
  els.btnAudioUnlock?.addEventListener('click', async () => {
    await ensureAudioContextUnlocked();
    const ok = await tryResumeRemoteAudio();
    pushAudioDiag('Audio unlock clicked', `ok=${ok}`);
    if (!ok) toast('El navegador sigue bloqueando audio automático. Prueba a tocar cualquier parte de la pantalla y vuelve a pulsar "Activar audio".');
  });
  els.permChannelSelect.addEventListener('change', () => {
    loadChannelPermissionPreset().catch(err => showServerSettingsFeedback(err.message, 'error'));
  });
  els.permRoleSelect.addEventListener('change', () => {
    loadChannelPermissionPreset().catch(err => showServerSettingsFeedback(err.message, 'error'));
  });
  els.btnSavePermissions.addEventListener('click', async () => {
    try {
      await saveChannelPermissionPreset();
    } catch (err) {
      showServerSettingsFeedback(err.message, 'error');
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
      if (!row || row.channel_id !== state.activeTextChannelId) return;
      const isFromOther = row.author_id !== state.userId;
      if (isFromOther && document.hidden) {
        const channel = (state.channels || []).find(c => c && c.id === state.activeTextChannelId);
        const author = (state.members || []).find(m => m && m.user_id === row.author_id)?.profile?.display_name || 'Alguien';
        if (Notification.permission === 'granted') {
          new Notification(`${author} en #${channel?.name || 'general'}`, {
            body: (row.body || '').slice(0, 80) + (row.body?.length > 80 ? '…' : ''),
            icon: '/frontend/favicon.ico',
          });
        }
        playMessageSound();
      }
      await loadMessages({ silent: true });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async ({ new: row }) => {
      if (!row || row.channel_id !== state.activeTextChannelId) return;
      await loadMessages({ silent: true, force: true });
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, async ({ old: row }) => {
      if (row?.channel_id !== state.activeTextChannelId) return;
      await loadMessages({ silent: true, force: true });
    })
    .subscribe();

  sb.channel('server-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'servers' }, ({ new: row }) => {
      if (!row || row.id !== state.server?.id) return;
      state.server = row;
      updateHeader();
    })
    .subscribe();

  sb.channel('profiles-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      if (!row) return;
      if (row.user_id === state.userId) {
        state.profile = row;
        renderProfile();
      }
      const member = (state.members || []).find((m) => m && m.user_id === row.user_id);
      if (member) {
        member.profile = { ...(member.profile || {}), ...row };
        renderMembersSidebar();
      }
    })
    .subscribe();

  if (sb) {
    sb.channel('typing')
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.channelId !== state.activeTextChannelId || payload?.userId === state.userId) return;
        state.typingUsers = state.typingUsers || {};
        state.typingUsers[payload.userId] = Date.now();
        els.typingIndicator?.classList.remove('hidden');
        els.typingIndicator.textContent = `${payload?.username || 'Alguien'} está escribiendo...`;
        setTimeout(() => {
          if (state.typingUsers?.[payload?.userId] && Date.now() - state.typingUsers[payload.userId] > 3000) {
            els.typingIndicator?.classList.add('hidden');
          }
        }, 3500);
      })
      .subscribe();
  }

  sb.channel('members-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, async ({ new: row, old }) => {
      if (row?.server_id !== state.server?.id && old?.server_id !== state.server?.id) return;
      await refreshMembers();
      const me = (state.members || []).find(m => m && m.user_id === state.userId);
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
  const bootstrap = await api(`/bootstrap?username=${encodeURIComponent(state.username)}`);
  state.profile = bootstrap.profile || null;
  state.server = bootstrap.server && bootstrap.server.id ? bootstrap.server : null;
  state.role = bootstrap.membership?.role || 'member';
  state.members = Array.isArray(bootstrap.members) ? bootstrap.members.filter(Boolean) : [];
  state.channels = Array.isArray(bootstrap.channels) ? bootstrap.channels.filter(c => c && c.id) : [];
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
  await loadDmChannels();
  renderDmList();
  if (state.activeDmChannelId) await loadDmMessages();
  else if (state.activeTextChannelId) await loadMessages();
  startMessagesPolling();
  await refreshMembers();
  subscribeRealtime();
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  requestNotificationPermission();
  if (localStorage.getItem(VOICE_REJOIN_KEY) === '1' && state.activeVoiceChannelId) {
    joinVoice().catch(() => {
      localStorage.removeItem(VOICE_REJOIN_KEY);
    });
  }
  state.initialBootDone = true;
}

function injectIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (icons[name]) {
      el.innerHTML = icons[name] + (el.tagName === 'BUTTON' && el.textContent ? el.textContent : '');
      el.classList.add('has-icon');
    }
  });
}

function checkJoinFromUrl() {
  const m = location.pathname.match(/^\/join\/([A-Za-z0-9]+)$/);
  if (!m) return;
  state.pendingJoinCode = m[1];
}

async function handleJoinFlow() {
  const code = state.pendingJoinCode;
  if (!code || !sb) return;
  try {
    const data = await api(`/invitations/${code}`);
    if (data.alreadyMember) {
      if (els.joinMessage) {
        els.joinMessage.textContent = `Ya eres miembro de "${data.server?.name}".`;
      }
      els.btnJoinConfirm?.classList.add('hidden');
      state.pendingJoinCode = null;
      history.replaceState({}, '', '/');
      els.joinDialog?.close();
      await boot();
      return;
    }
    if (els.joinMessage) {
      els.joinMessage.textContent = `¿Unirse a "${data.server?.name}"?`;
    }
    els.btnJoinConfirm?.classList.remove('hidden');
    els.btnJoinConfirm.onclick = async () => {
      await api(`/invitations/${code}/join`, { method: 'POST' });
      toast('Te has unido al servidor.', 'success');
      state.pendingJoinCode = null;
      els.joinDialog?.close();
      history.replaceState({}, '', '/');
      await boot();
    };
  } catch (err) {
    if (els.joinMessage) {
      els.joinMessage.textContent = err?.message || 'Invitación inválida.';
    }
    els.btnJoinConfirm?.classList.add('hidden');
  }
}

wireEvents();
injectIcons();
const audioDiagEl = document.getElementById('audio-diag');
if (audioDiagEl && !IS_DEV) audioDiagEl.style.display = 'none';
els.btnJoinCancel?.addEventListener('click', async () => {
  els.joinDialog?.close();
  state.pendingJoinCode = null;
  history.replaceState({}, '', '/');
  if (!state.initialBootDone) {
    try {
      await boot();
    } catch (e) {
      toast(e?.message || 'No se pudo cargar la app.', 'error');
    }
  }
});
checkJoinFromUrl();
initAuthAndBoot().catch((err) => {
  console.error(err);
  toast(err.message || 'No se pudo iniciar la app', 'error');
});
