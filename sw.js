/* Blunder Buster service worker: makes the app work fully offline.
   Bump VERSION whenever any file changes so installed copies refresh. */
const VERSION = 'bb-v5';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'engine.js', 'app.js', 'play.js', 'pgn.js', 'vault.js', 'dashboard.js', 'pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin GETs: answer from the cache immediately, refresh it in the background.
// Anything else (e.g. the chess.com API) goes straight to the network.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { fresh.catch(() => 0); return hit; }
      const res = await fresh;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
