/* Service worker CEA FOR AFRICA (CDC §5.4 : application installable, consultation hors ligne des contenus déjà ouverts).
   - Pages : réseau d'abord, copie mise en cache ; hors connexion → copie, sinon page « hors ligne ».
   - Fichiers statiques (/_astro, icônes, polices) : cache d'abord.
   - Notifications push : affichage et ouverture de la page liée (voir en bas de fichier).
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

/* Notifications push (CDC §10) : affichage, puis ouverture de la page liée au clic (onglet existant réutilisé). */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'CEA FOR AFRICA', {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag, lang: 'fr',
    data: { url: d.url || '/espace/notifications' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/espace/notifications', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => c.url === url);
    if (same) return same.focus();
    const any = list.find((c) => new URL(c.url).origin === location.origin);
    return any ? any.navigate(url).then((c) => c && c.focus()) : self.clients.openWindow(url);
  }));
});
