/* KEEPITIL PWA service worker — scope "/".
   CONSERVATIVE BY DESIGN (a previous SW was kill-switched for stale caches):
   - Page HTML is NEVER cached: navigations are network-first, offline fallback only.
   - Supabase (*.supabase.co) is NEVER intercepted — data is always live.
   - Only the static app shell + fonts are cached, cache-first WITH background
     revalidation, so a deploy still propagates without a kill-switch.
   To retire this SW: bump VERSION and ship, or restore the self-destruct worker. */
var VERSION = 'kil-pwa-v1-20260716';
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

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      // add() individually so one missing file doesn't sink the whole install
      return Promise.allSettled(SHELL.map(function (u) { return cache.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.filter(function (n) { return n !== VERSION; })
        .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isShellAsset(url) {
  if (url.origin === self.location.origin) {
    return SHELL.indexOf(url.pathname) !== -1;
  }
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // NEVER touch Supabase or any non-shell third party — straight to network.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Navigations: network-first, live HTML always; offline fallback page if unreachable.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('/v3/offline.html'); }));
    return;
  }

  // Static shell + fonts: cache-first with background revalidation (?v= ignored for match).
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
  }
  // Everything else: default network behavior (not intercepted).
});
