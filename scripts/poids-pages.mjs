// Poids des pages publiques (CDC §13.1 : ≤ 1 Mo au premier chargement, ≤ 300 Ko en mode « Lite »).
// À lancer après « npm run build » : node scripts/poids-pages.mjs
// Mesure, pour chaque page HTML générée, le HTML et les ressources locales qu'il charge (CSS, JS, scripts importés, images),
// en octets transférés (compression gzip, comme servie par le CDN). Les polices Google Fonts sont comptées à part (estimation).
// Le mode « Lite » masque vidéos, cartes et animations : on retire les images et polices du total.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = 'dist/client';
if (!existsSync(ROOT)) { console.error('Lancez d’abord « npm run build ».'); process.exit(1); }
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const FONTS_EST = 60_000; // 4 graisses Sora + Source Sans 3 en WOFF2, sous-ensemble latin (estimation)
const LIMIT = 1_000_000, LITE = 300_000;

const htmls = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) htmls.push(p); } };
walk(ROOT);

const cache = new Map();
const sizeOf = (url) => {
  const p = join(ROOT, url.split('?')[0]);
  if (!cache.has(p)) cache.set(p, existsSync(p) ? gz(readFileSync(p)) : 0);
  return cache.get(p);
};
// Scripts : les modules importés par un script le sont aussi (import statique) — on suit les imports relatifs
const jsDeps = (url, seen = new Set()) => {
  if (seen.has(url)) return seen;
  seen.add(url);
  const p = join(ROOT, url);
  if (!existsSync(p)) return seen;
  for (const m of readFileSync(p, 'utf8').matchAll(/(?:import|from)\s*["'](\.\/[^"']+\.js)["']/g)) jsDeps(`/_astro/${m[1].slice(2)}`, seen);
  return seen;
};

const rows = htmls.map((h) => {
  const html = readFileSync(h, 'utf8');
  const urls = (re) => [...html.matchAll(re)].map((m) => m[1]).filter((u) => u.startsWith('/') && !u.startsWith('//'));
  const css = urls(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g);
  const js = new Set(); for (const u of urls(/<script[^>]+src="([^"]+)"/g)) for (const d of jsDeps(u)) js.add(d);
  const imgs = urls(/<img[^>]+src="([^"]+)"/g);
  const base = gz(Buffer.from(html)) + css.reduce((n, u) => n + sizeOf(u), 0) + [...js].reduce((n, u) => n + sizeOf(u), 0);
  const images = imgs.reduce((n, u) => n + sizeOf(u), 0);
  return { page: '/' + relative(ROOT, h).replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\.html$/, ''), total: base + images + FONTS_EST, lite: base };
}).sort((a, b) => b.total - a.total);

const ko = (n) => `${(n / 1000).toFixed(0)} Ko`;
console.log(`${rows.length} pages générées. Polices estimées à ${ko(FONTS_EST)} par page.\n`);
console.log('Page'.padEnd(46), 'Complet'.padStart(9), 'Lite'.padStart(9));
for (const r of rows.slice(0, 12)) console.log(r.page.padEnd(46).slice(0, 46), ko(r.total).padStart(9), ko(r.lite).padStart(9));
const over = rows.filter((r) => r.total > LIMIT), overLite = rows.filter((r) => r.lite > LITE);
const med = (k) => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`\nMédiane : ${ko(med('total'))} (complet), ${ko(med('lite'))} (Lite). Plus lourde : ${rows[0].page} — ${ko(rows[0].total)}.`);
console.log(over.length ? `⚠ ${over.length} page(s) au-delà de 1 Mo : ${over.map((r) => r.page).join(', ')}` : '✓ Toutes les pages sont sous 1 Mo au premier chargement.');
console.log(overLite.length ? `⚠ ${overLite.length} page(s) au-delà de 300 Ko en Lite : ${overLite.map((r) => r.page).join(', ')}` : '✓ Toutes les pages sont sous 300 Ko en mode Lite.');
process.exit(over.length || overLite.length ? 1 : 0);
