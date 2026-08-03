// AOW2 — Age of Wars 3D · offline service worker
// The game is a single self-contained index.html, so the cache is small.
// Bump CACHE (date/time) whenever the build is redeployed to force an update.
const CACHE = 'aow2-v1-202608022135';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './app-icon-192.png', './app-icon-512.png', './app-icon-maskable.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Navigations: try network first (fresh gameplay), fall back to cached shell offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Everything else: cache-first with background refresh.
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetched = fetch(e.request)
        .then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
