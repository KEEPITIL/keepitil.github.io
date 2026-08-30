/* KEEPITIL App service worker v3 — scope "/".
   v3 FIX (Atlas-diagnosed, 2026-07-16): v2 served shared JS cache-first with ignoreSearch,
   so deployed shell updates never reached returning users ("fixes don't stick").
   NEW RULES — code is NEVER served stale:
   - ALL JavaScript and CSS: NETWORK-FIRST. Cache is a fallback for offline only.
   - Page HTML: network-first (unchanged). Supabase: never intercepted (unchanged).
   - Only images/fonts/icons keep stale-while-revalidate (stale pixels can't break logic).
   - VERSION bump evicts every v1/v2 cache on activate + clients.claim().
   To retire this SW: bump VERSION and ship, or restore the self-destruct worker. */
/* CACHE VERSIONS BUMPED 2026-08-26 for the launch closeout. The previous set dated from
   2026-08-22 — before the /v3/ purge, the asset migration and the AI/Radio consolidation — so
   an installed device could still hold entries for files that no longer exist (/keepitil-ai.js,
   /keepitil-radio.js, /v3/*). Navigations and JS/CSS are network-first so the shell itself was
   never stale, but MEDIA is stale-while-revalidate, and bumping evicts those on activate via
   the KEEP list rather than leaving them to age out.
   Previous: kil-pwa-v44-20260827a */
/* Earlier note, 2026-08-22 (Founder: "update the mobile version. its showing the old
   version"). The strategy was already network-first for HTML and JS/CSS, so this is not a fix to
   the rules — it is an eviction. Renaming every cache makes `activate` delete the old ones and
   clients.claim() take over immediately, which clears anything a phone or an installed PWA was
   still holding from before. Bump these four names whenever a release must reach returning
   users regardless of what they have cached. */
var VERSION = 'kil-pwa-v59-20260829f';
var PAGES = 'kil-pages-v41';
var ASSETS = 'kil-assets-v40';
var CODE = 'kil-code-v57';
var KEEP = [VERSION, PAGES, ASSETS, CODE];
var PAGE_LIMIT = 40;
var PRECACHE = [
  '/offline.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest'
];
var CODE_EXT = /\.(js|css)(\?|$)/i;
var MEDIA_EXT = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf)$/i;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.allSettled(PRECACHE.map(function (u) { return cache.add(u); }));
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

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // NEVER touch Supabase — user data stays live.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Navigations: network-first; cached copy ONLY when the network fails.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(caches.open(PAGES).then(function (c) { return c.put(req, copy); }));
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('/offline.html'); });
      })
    );
    return;
  }

  // CODE (all JS/CSS, same-origin or CDN incl. fonts.googleapis.com CSS): NETWORK-FIRST.
  // Full URL (incl. ?v=) is the cache key. Never stale while online.
  if (CODE_EXT.test(url.pathname) || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(caches.open(CODE).then(function (c) { return c.put(req, copy); }));
        }
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // Media/fonts/icons: stale-while-revalidate (visual assets only — can't break logic).
  if ((url.origin === self.location.origin && MEDIA_EXT.test(url.pathname)) || url.hostname === 'fonts.gstatic.com') {
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
    data: { url: d.url || '/', category: d.category || '' },
    tag: d.tag || undefined
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
