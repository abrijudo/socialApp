/**
 * Logs del módulo de link preview: detalle solo en dev o con LINK_PREVIEW_LOG=1.
 * Errores reales (BD, etc.) usan el nivel "warn" y sí aparecen en producción.
 */
const wantDetail =
  process.env.LINK_PREVIEW_LOG === '1' || process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

/**
 * @param {string} label
 * @param {unknown} [data]
 */
function logPreviewDebug(label, data) {
  if (!wantDetail) return;
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[link-preview] ${label}`, data);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[link-preview] ${label}`);
  }
}

/**
 * @param {string} message
 * @param {unknown} [err]
 */
function logPreviewWarn(message, err) {
  if (err !== undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[link-preview] ${message}`, err);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`[link-preview] ${message}`);
  }
}

module.exports = { logPreviewDebug, logPreviewWarn, wantDetail };
