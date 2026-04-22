const { getLinkPreview } = require('link-preview-js');
const { getSupabaseAdmin } = require('./supabaseAdmin');
const { logPreviewDebug, logPreviewWarn } = require('../lib/previewLogger');

const MAX_INPUT_URL = 2048;
/** Caché válida 7 días desde `created_at` (última actualización en DB). */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*;q=0.8,*/*;q=0.6',
  'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

function isBlockedHost(hostname) {
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h.startsWith('127.')) return true;
  const parts = h.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

/**
 * @param {string} raw
 * @returns {import('url').URL | null}
 */
function parsePublicHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.length > MAX_INPUT_URL) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (isBlockedHost(u.hostname)) return null;
  u.hash = '';
  return u;
}

/**
 * @param {string} pageUrl
 * @param {string | null | undefined} href
 * @returns {string | null}
 */
function safeAbsoluteUrl(pageUrl, href) {
  if (!href || !String(href).trim()) return null;
  try {
    const out = new URL(href, pageUrl);
    if (out.protocol !== 'http:' && out.protocol !== 'https:') return null;
    if (isBlockedHost(out.hostname)) return null;
    return out.href;
  } catch {
    return null;
  }
}

/**
 * @param {string} u
 * @returns {string}
 */
function hostOnly(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return 'Enlace';
  }
}

/**
 * @param {unknown} raw
 * @param {string} requestHref
 * @returns {{ ok: true, url: string, title: string, description: string | null, image: string | null } | { ok: false } | null}
 */
function mapLibraryResultToPayload(raw, requestHref) {
  if (raw == null || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);

  if (r.mediaType === 'image' && typeof r.url === 'string') {
    const u = r.url;
    return {
      ok: true,
      url: u,
      title: `Imagen · ${hostOnly(u)}`,
      description: null,
      image: u,
    };
  }
  if (
    (r.mediaType === 'audio' || r.mediaType === 'video' || r.mediaType === 'application') &&
    typeof r.url === 'string' &&
    !r.title
  ) {
    const u = r.url;
    return {
      ok: true,
      url: u,
      title: hostOnly(u),
      description: null,
      image: null,
    };
  }

  if (!('url' in r)) return null;

  const finalUrl = typeof r.url === 'string' && r.url ? r.url : requestHref;
  const titleRaw = typeof r.title === 'string' ? r.title.trim() : '';
  const siteName = typeof r.siteName === 'string' ? r.siteName.trim() : '';
  const descRaw = typeof r.description === 'string' ? r.description.trim() : '';
  const title = titleRaw || siteName || hostOnly(finalUrl);
  const description = descRaw || null;

  let image = null;
  if (Array.isArray(r.images) && r.images.length > 0) {
    const first = String(r.images[0] ?? '').trim();
    if (first) {
      image = safeAbsoluteUrl(finalUrl, first) || (first.startsWith('http') ? first : null);
    }
  }

  if (!title && !description && !image) {
    return { ok: false };
  }

  return {
    ok: true,
    url: finalUrl,
    title: title || hostOnly(finalUrl),
    description: description || null,
    image,
  }
}

/**
 * Fila caché vigente (menos de 7 días) o null.
 * @param {string} cacheKey
 * @returns {Promise<{ url: string, response_url: string | null, title: string, description: string | null, image_url: string | null, created_at: string } | null>}
 */
async function getValidCacheRow(cacheKey) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('link_metadata_cache')
      .select('url, response_url, title, description, image_url, created_at')
      .eq('url', cacheKey)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const t = new Date(data.created_at).getTime();
    if (Number.isNaN(t) || Date.now() - t > CACHE_TTL_MS) {
      logPreviewDebug('cache expired', { cacheKey, created_at: data.created_at });
      return null;
    }

    return data;
  } catch (e) {
    logPreviewWarn('lectura caché omitida; se generará el preview en red', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * @param {string} cacheKey
 * @param {{ url: string, title: string, description: string | null, image: string | null }} payload
 * @returns {Promise<void>}
 */
async function upsertCacheRow(cacheKey, payload) {
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from('link_metadata_cache').upsert(
      {
        url: cacheKey,
        response_url: payload.url,
        title: payload.title,
        description: payload.description,
        image_url: payload.image,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'url' },
    );
    if (error) throw error;
    logPreviewDebug('cache guardada', { cacheKey });
  } catch (e) {
    logPreviewWarn('escritura caché fallida; respuesta aún se devuelve al cliente', e instanceof Error ? e.message : e);
  }
}

/**
 * @param {string} targetUrl
 * @returns {Promise<{ ok: true, url: string, title: string, description: string | null, image: string | null } | { ok: false }>}
 */
async function fetchLinkPreview(targetUrl) {
  const u = parsePublicHttpUrl(targetUrl);
  if (!u) {
    logPreviewDebug('rechazado: URL inválida o bloqueada', { targetUrl: String(targetUrl).slice(0, 120) });
    return { ok: false }
  }
  const cacheKey = u.href;

  const cached = await getValidCacheRow(cacheKey);
  if (cached) {
    const out = {
      ok: true,
      url: cached.response_url || cached.url,
      title: cached.title,
      description: cached.description,
      image: cached.image_url,
    };
    logPreviewDebug('cache hit', { key: cacheKey, title: out.title });
    return out
  }

  try {
    const raw = await getLinkPreview(cacheKey, {
      timeout: 18_000,
      followRedirects: 'follow',
      headers: { ...DEFAULT_HEADERS },
    });
    const payload = mapLibraryResultToPayload(raw, cacheKey);
    if (!payload) {
      logPreviewDebug('sin mapeo desde link-preview-js', { cacheKey });
      return { ok: false }
    }
    if (!payload.ok) {
      logPreviewDebug('payload ok:false desde librería', { cacheKey });
      return { ok: false }
    }

    await upsertCacheRow(cacheKey, payload);
    logPreviewDebug('preview generado (red → caché)', { cacheKey, title: payload.title });
    return payload
  } catch (e) {
    logPreviewWarn('fetch/parse del preview', e instanceof Error ? e : new Error(String(e)));
    return { ok: false }
  }
}

module.exports = { fetchLinkPreview };
