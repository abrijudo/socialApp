/**
 * Utilidades puras compartidas
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseSimpleMarkdown(text, members = []) {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  // Escapar HTML primero para evitar XSS
  out = escapeHtml(out);
  // Bold: **text** (debe ir antes de italic)
  out = out.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* (después de bold, los * sueltos son italic)
  out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  // Code: `text`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links: [text](url) - solo http/https para evitar XSS (text/url ya escapados arriba)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const u = url.trim();
    if (/^https?:\/\//i.test(u)) return `<a href="${u}" target="_blank" rel="noopener">${text}</a>`;
    return `[${text}](${url})`;
  });
  // Menciones @username
  if (members?.length) {
    (Array.isArray(members) ? members : []).filter(Boolean).forEach(m => {
      const un = (m.profile?.username || m.user_id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (un) out = out.replace(new RegExp(`@${un}\\b`, 'gi'), `<span class="mention">@${escapeHtml(m.profile?.display_name || m.profile?.username || 'usuario')}</span>`);
    });
  }
  return out;
}

export function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (_) {}
}

export function formatTs(ts) {
  const d = new Date(ts);
  const now = new Date();
  const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return timeStr;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + timeStr;
}

export function formatTsRelative(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const isToday = d.toDateString() === now.toDateString();
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24 && isToday) return `Hace ${diffHours} h`;
  if (isToday) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function formatDurationMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function avatarFromProfile(profile, fallbackSeed = 'user') {
  const url = profile?.avatar_url?.trim();
  if (url) return url;
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(profile?.display_name || fallbackSeed)}`;
}

export function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['online', 'idle', 'dnd', 'offline'].includes(s)) return s;
  return 'offline';
}

export function normalizeUsername(raw = '') {
  const cleaned = String(raw).trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (cleaned.length >= 2) return cleaned.slice(0, 20);
  return `user${crypto.randomUUID().slice(0, 6)}`;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function setFeedback(el, message = '', type = 'info') {
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.className = 'server-settings-feedback hidden';
    return;
  }
  el.textContent = message;
  el.className = `server-settings-feedback ${type}`;
}
