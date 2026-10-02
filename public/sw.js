/* Service worker CEA FOR AFRICA (CDC §5.4 : application installable, consultation hors ligne des contenus déjà ouverts).
   - Pages : réseau d'abord, copie mise en cache ; hors connexion → copie, sinon page « hors ligne ».
   - Fichiers statiques (/_astro, icônes, polices) : cache d'abord.
   Changer VERSION à chaque évolution de cette stratégie. */
const VERSION = 'cea-v1';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const PRECACHE = ['/', '/hors-ligne/', '/en/', '/en/hors-ligne/', '/favicon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];
const MAX_PAGES = 60;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonts) return;

  // Pages HTML : réseau d'abord
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy)).then(() => trim(PAGES, MAX_PAGES));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(url.pathname.startsWith('/en/') ? '/en/hors-ligne/' : '/hors-ligne/'))),
    );
    return;
  }

  // Fichiers statiques : cache d'abord
  if (fonts || url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/media/') || url.pathname === '/favicon.svg') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});
