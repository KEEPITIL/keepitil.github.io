// KODE service worker — NETWORK-FIRST by design.
// Fresh HTML/JS always wins when online; cache is only a fallback for offline.
// (Never flip this to cache-first for HTML/JS — stale-shell trap.)
const CACHE = 'kode-v2';
const PRECACHE = ['./app.html', './icon.svg', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'KODE', {
      body: data.body || 'Time to post — open KODE.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'kode',
      data: { url: data.url || './app.html' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes('app.html') && 'focus' in c) return c.focus();
      return clients.openWindow(event.notification.data?.url || './app.html');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Never intercept API calls (Supabase), CDN scripts, or non-GET traffic.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('./app.html') : Response.error())
        )
      )
  );
});
