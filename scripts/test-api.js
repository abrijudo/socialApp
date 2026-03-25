#!/usr/bin/env node
/**
 * Script de pruebas para la API de SocialApp Pro.
 * Ejecutar con: node scripts/test-api.js
 * Requiere: servidor corriendo en http://localhost:3000
 */

const BASE = 'http://localhost:3000/api';
const FAKE_UUID = '00000000-0000-0000-0000-000000000001';
const FAKE_ID = 'test-server-id';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function runTests() {
  const results = [];
  const log = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}${detail ? ': ' + detail : ''}`);
  };

  console.log('\n=== Tests API SocialApp Pro ===\n');

  // --- Rutas públicas ---
  console.log('--- Públicas ---');
  try {
    const { ok, data } = await fetchJson(`${BASE}/health`);
    log('GET /api/health', ok && data?.ok === true, ok ? '' : JSON.stringify(data));
  } catch (e) {
    log('GET /api/health', false, e.message);
  }

  try {
    const { ok, data } = await fetchJson(`${BASE}/config`);
    const hasKeys = data?.supabaseUrl !== undefined && data?.supabaseAnonKey !== undefined;
    log('GET /api/config', ok && hasKeys, hasKeys ? '' : 'Faltan credenciales');
  } catch (e) {
    log('GET /api/config', false, e.message);
  }

  // --- Rutas con auth (verificar 401 sin token) ---
  console.log('\n--- Con auth (401 sin token) ---');

  const authEndpoints = [
    { method: 'GET', path: '/bootstrap?username=test', name: 'GET /api/bootstrap' },
    { method: 'GET', path: `/messages/${FAKE_UUID}`, name: 'GET /api/messages/:channelId' },
    { method: 'GET', path: '/dm', name: 'GET /api/dm' },
    { method: 'POST', path: '/profiles/upsert', body: { username: 'testuser' }, name: 'POST /api/profiles/upsert' },
    { method: 'GET', path: `/servers/${FAKE_ID}/members`, name: 'GET /api/servers/:serverId/members' },
    { method: 'POST', path: `/servers/${FAKE_ID}/invitations`, body: {}, name: 'POST /api/servers/:serverId/invitations' },
    { method: 'GET', path: '/invitations/FAKECODE', name: 'GET /api/invitations/:code' },
    { method: 'POST', path: '/invitations/FAKECODE/join', body: {}, name: 'POST /api/invitations/:code/join' },
    { method: 'GET', path: `/permissions/check?serverId=${FAKE_ID}&action=send_message`, name: 'GET /api/permissions/check' },
    { method: 'GET', path: `/channels/${FAKE_UUID}/permissions`, name: 'GET /api/channels/:channelId/permissions' },
    { method: 'POST', path: '/upload', body: { data: 'dGVzdA==' }, name: 'POST /api/upload' },
    { method: 'GET', path: '/token', name: 'GET /api/token' },
    { method: 'POST', path: '/presence/offline', body: { userId: FAKE_UUID, username: 'test' }, name: 'POST /api/presence/offline' },
    { method: 'POST', path: '/dm', body: { otherUserId: FAKE_UUID }, name: 'POST /api/dm' },
    { method: 'GET', path: `/dm/${FAKE_UUID}/messages`, name: 'GET /api/dm/:dmChannelId/messages' },
    { method: 'POST', path: `/dm/${FAKE_UUID}/messages`, body: { text: 'test' }, name: 'POST /api/dm/:dmChannelId/messages' },
    { method: 'POST', path: '/channels', body: { serverId: FAKE_ID, type: 'text', name: 'test' }, name: 'POST /api/channels' },
    { method: 'PATCH', path: `/channels/${FAKE_UUID}`, body: { name: 'test' }, name: 'PATCH /api/channels/:channelId' },
    { method: 'PATCH', path: `/servers/${FAKE_ID}`, body: { name: 'test' }, name: 'PATCH /api/servers/:serverId' },
    { method: 'POST', path: '/messages', body: { channelId: FAKE_UUID, text: 'test' }, name: 'POST /api/messages' },
    { method: 'GET', path: `/messages/search?channelId=${FAKE_UUID}&q=test`, name: 'GET /api/messages/search' },
    { method: 'PATCH', path: `/messages/${FAKE_UUID}`, body: { text: 'edit' }, name: 'PATCH /api/messages/:messageId' },
    { method: 'DELETE', path: `/messages/${FAKE_UUID}`, name: 'DELETE /api/messages/:messageId' },
    { method: 'POST', path: `/messages/${FAKE_UUID}/reactions`, body: { emoji: '👍' }, name: 'POST /api/messages/:messageId/reactions' },
    { method: 'GET', path: `/messages/${FAKE_UUID}/thread/${FAKE_UUID}`, name: 'GET /api/messages/:channelId/thread/:parentId' },
    { method: 'PATCH', path: `/servers/${FAKE_ID}/members/${FAKE_UUID}/role`, body: { role: 'member' }, name: 'PATCH /api/servers/:serverId/members/:memberUserId/role' },
    { method: 'PATCH', path: `/channels/${FAKE_UUID}/permissions`, body: { role: 'member', canSendMessage: true }, name: 'PATCH /api/channels/:channelId/permissions' },
  ];

  for (const ep of authEndpoints) {
    try {
      const opts = { method: ep.method };
      if (ep.body && (ep.method === 'POST' || ep.method === 'PATCH')) {
        opts.body = JSON.stringify(ep.body);
      }
      const { status } = await fetchJson(`${BASE}${ep.path}`, opts);
      log(`${ep.name} sin auth → 401`, status === 401, status !== 401 ? `status=${status}` : '');
    } catch (e) {
      log(`${ep.name} sin auth → 401`, false, e.message);
    }
  }

  // --- Resumen ---
  console.log('\n--- Resumen ---');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Pasaron: ${passed}/${results.length}`);
  if (failed.length) {
    console.log('Fallidos:', failed.map(f => f.name + (f.detail ? ` (${f.detail})` : '')).join(', '));
  }
  console.log('');

  if (failed.some(f => f.name.includes('health') || f.name.includes('config'))) {
    console.log('NOTA: Si health o config fallan, el servidor puede no estar corriendo.');
    console.log('Ejecuta: npm run dev (o npm run start)');
    process.exit(1);
  }

  process.exit(failed.length ? 1 : 0);
}

runTests().catch((e) => {
  console.error('Error:', e.message);
  console.log('\n¿Está el servidor corriendo en http://localhost:3000?');
  process.exit(1);
});
