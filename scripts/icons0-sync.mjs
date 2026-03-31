/**
 * Sincroniza SVG desde el mismo registro que usa:
 *   npx shadcn@latest add @icons0/lucide/<nombre>
 * URL: https://icons0.dev/r/lucide/<nombre>.json
 *
 * Genera fragmentos listos para pegar o validar contra components/icons (si usas shadcn add).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

/** Mapa: clave en `icons` -> ruta en registro icons0 (lucide/nombre) */
const MAP = {
  settings: 'settings',
  edit: 'square-pen',
  logout: 'log-out',
  add: 'plus',
  hashtag: 'hash',
  speaker: 'volume-2',
  paperclip: 'paperclip',
  mic: 'mic',
  micOff: 'mic-off',
  monitor: 'monitor',
  volume: 'volume-2',
  volumeOff: 'volume-x',
  send: 'send',
  trash: 'trash-2',
  layout: 'layout-grid',
  users: 'users',
  moon: 'moon',
  sun: 'sun',
  user: 'user',
  video: 'video',
};

const WIDTH = { settings: 18, edit: 16, logout: 16, add: 16, hashtag: 18, speaker: 18, paperclip: 18, mic: 18, micOff: 18, monitor: 18, volume: 18, volumeOff: 18, send: 18, trash: 16, layout: 18, users: 18, moon: 18, sun: 18, user: 18, video: 18 };

function jsxSvgToHtml(svgInner) {
  return svgInner
    .replace(/\bstrokeWidth=/g, 'stroke-width=')
    .replace(/\bstrokeLinecap=/g, 'stroke-linecap=')
    .replace(/\bstrokeLinejoin=/g, 'stroke-linejoin=')
    .replace(/\bfillRule=/g, 'fill-rule=')
    .replace(/\bclipRule=/g, 'clip-rule=')
    .replace(/\bclipPath=/g, 'clip-path=')
    .replace(/\bstrokeDasharray=/g, 'stroke-dasharray=')
    .replace(/\bstrokeDashoffset=/g, 'stroke-dashoffset=')
    .replace(/\bclassName=/g, 'class=');
}

function extractSvg(tsx) {
  const m = tsx.match(/<svg[\s\S]*?<\/svg>/);
  if (!m) return null;
  let s = m[0];
  s = jsxSvgToHtml(s);
  s = s.replace(/\{\.\.\.props\}\s*/g, '');
  return s;
}

async function fetchIcon(lucideName) {
  const url = `https://icons0.dev/r/lucide/${lucideName}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const data = await res.json();
  const file = data.files?.[0];
  if (!file?.content) throw new Error(`Sin content en ${url}`);
  const svg = extractSvg(file.content);
  if (!svg) throw new Error(`Sin <svg> en ${url}`);
  return svg;
}

function setSize(svg, w) {
  return svg.replace(/width="1em"/, `width="${w}"`).replace(/height="1em"/, `height="${w}"`);
}

async function main() {
  const out = {};
  for (const [key, lucide] of Object.entries(MAP)) {
    const raw = await fetchIcon(lucide);
    out[key] = setSize(raw, WIDTH[key] || 18);
    console.error('OK', key, '<-', lucide);
  }

  const lines = Object.entries(out)
    .map(([k, svg]) => `  ${k}: ${JSON.stringify(svg)},`)
    .join('\n');

  const block = `export const icons = {\n${lines}\n};`;
  const constantsPath = path.join(ROOT, 'client', 'constants.js');
  let existing = fs.readFileSync(constantsPath, 'utf8');
  const replaced = existing.replace(/export const icons = \{[\s\S]*?\n\};/m, block);
  if (replaced === existing) throw new Error('No se reemplazó export const icons en constants.js');
  fs.writeFileSync(constantsPath, replaced, 'utf8');
  console.error('Actualizado client/constants.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
