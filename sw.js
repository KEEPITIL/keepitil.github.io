/* KEEPITIL App service worker — scope "/".
   CONSERVATIVE BY DESIGN (a previous SW was kill-switched for stale caches):
   - Navigations are ALWAYS network-first. Cached pages are served ONLY when the
     network fails (offline "feel alive": recently viewed pages keep working).
   - Supabase (*.supabase.co) is NEVER intercepted — user data is always live.
   - Shell: cache-first + background revalidation. Other same-origin static
     assets (css/js/images/fonts): stale-while-revalidate.
   - Push: displays VAPID web push sent by the push-send edge function.
   To retire this SW: bump VERSION and ship, or restore the self-destruct worker. */
var VERSION = 'kil-pwa-v2-20260716';
var PAGES = 'kil-pages-v2';
var ASSETS = 'kil-assets-v2';
var KEEP = [VERSION, PAGES, ASSETS];
var PAGE_LIMIT = 40;
var SHELL = [
  '/v3/offline.html',
  '/v3/v3-tokens.css',
  '/v3/v3-shell.js',
  '/v3/keepitil-radio.js',
  '/keepitil-x-blue.png',
  '/v3/logo-blue-nav.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];
var STATIC_EXT = /\.(css|js|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.allSettled(SHELL.map(function (u) { return cache.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return KEEP.indexOf(n) === -1; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function trimCache(name, max) {
  return caches.open(name).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= max) return;
      return cache.delete(keys[0]).then(function () { return trimCache(name, max); });
    });
  });
}

function isShellAsset(url) {
  if (url.origin === self.location.origin) return SHELL.indexOf(url.pathname) !== -1;
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // NEVER touch Supabase — user data stays live.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Navigations: network-first. Cache a copy for offline; cached copy is used ONLY on network failure.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(caches.open(PAGES).then(function (c) { return c.put(req, copy); })
            .then(function () { return trimCache(PAGES, PAGE_LIMIT); }));
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: false }).then(function (hit) {
          return hit || caches.match('/v3/offline.html');
        });
      })
    );
    return;
  }

  // App shell + fonts: cache-first with background revalidation (?v= ignored for match).
  if (isShellAsset(url)) {
    e.respondWith(
      caches.open(VERSION).then(function (cache) {
        return cache.match(req, { ignoreSearch: true }).then(function (hit) {
          var refresh = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || refresh;
        });
      })
    );
    return;
  }

  // Other same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin && STATIC_EXT.test(url.pathname)) {
    e.respondWith(
      caches.open(ASSETS).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var refresh = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || refresh;
        });
      })
    );
  }
  // Everything else: default network behavior.
});

/* ── Web Push (KEEPITIL App notifications) ── */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  var title = d.title || 'KEEPITIL';
  var opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/v3/', category: d.category || '' },
    tag: d.tag || undefined
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/v3/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
