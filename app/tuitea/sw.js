/* ==========================================================================
   TUITEA service worker — delivery substrate for the installed web app.
   Scope: /app/tuitea/

   ⚠ THIS FILE IS A TEMPLATE. The deployed /app/tuitea/sw.js is GENERATED from
   it by thrive/tool/build_web.sh, which fills in the two placeholders below
   with the identity and the exact file list of the build it just compiled.
   Edit this file; never hand-edit the deployed one, because a hand-edited file
   list is precisely how a release stops being complete.

   It lives under tool/ rather than web/ deliberately: everything in web/ is
   copied verbatim into the build output, and a template full of placeholders
   was duly deployed as part of the app.

   ── WHAT THIS WORKER GUARANTEES ─────────────────────────────────────────────
   A page load is served entirely from ONE release, or entirely from the
   network. Never a mixture.

   WHY THAT NEEDED FIXING. The previous worker served documents network-first
   and everything else cache-first. So a launch could take the NEW index.html
   off the network while `main.dart.js` still came from the OLD cache — the two
   halves of two different releases, running together. That is not cosmetic:
   production auth telemetry from a single URL alternated between two different
   build identities across consecutive loads, which is what half-and-half looks
   like from the outside. Anything that changes a data shape, a table name or a
   contract between the compiled app and its assets would have been silently
   half-applied.

   HOW IT IS ENFORCED, in three rules:
     1. install() precaches the COMPLETE release with one all-or-nothing
        addAll(). If a single file 404s or the network drops halfway, the
        install fails, this worker never activates, and the user stays on the
        previous COMPLETE release. There is no partial release.
     2. Every file that belongs to the release is served CACHE-ONLY. A
        controlled page physically cannot receive a byte of a newer deploy,
        because the worker does not go to the network for those paths at all.
     3. activate() deletes every other tuitea cache. One release is resident at
        a time; `caches.keys()` naming exactly one release is an observable
        proof of it.

   Updating still happens, and is the ONLY way the app moves forward: pwa.js
   calls registration.update() on launch, on foreground and hourly. A changed
   sw.js (its RELEASE constant changes on every build) installs the next
   complete release alongside this one, waits, and swaps only when the user
   accepts the banner.
   ========================================================================== */

/* The deployed release identity: <pubspec build number>.<short commit>.
   Generated. The compiled Dart in this same release reports
   `<build>.<commit>.<variant>` — same build number, same commit — so a
   telemetry row, this cache name and the deployed files can be lined up. */
const RELEASE = '47.73c6cfb';
const CACHE = 'tuitea-release-' + RELEASE;
const SCOPE = '/app/tuitea/';

/* EVERY file this release consists of, generated from the build output.
   Documents appear as their directory form ('/app/tuitea/app/') because that is
   the path a navigation actually requests. */
const RELEASE_FILES = [
  "/app/tuitea/",
  "/app/tuitea/app.html",
  "/app/tuitea/app/",
  "/app/tuitea/app/assets/AssetManifest.bin",
  "/app/tuitea/app/assets/AssetManifest.bin.json",
  "/app/tuitea/app/assets/FontManifest.json",
  "/app/tuitea/app/assets/NOTICES",
  "/app/tuitea/app/assets/fonts/MaterialIcons-Regular.otf",
  "/app/tuitea/app/assets/packages/cupertino_icons/assets/CupertinoIcons.ttf",
  "/app/tuitea/app/assets/packages/record_web/assets/js/record.fixwebmduration.js",
  "/app/tuitea/app/assets/packages/record_web/assets/js/record.worklet.js",
  "/app/tuitea/app/assets/shaders/ink_sparkle.frag",
  "/app/tuitea/app/assets/shaders/stretch_effect.frag",
  "/app/tuitea/app/canvaskit/canvaskit.js",
  "/app/tuitea/app/canvaskit/canvaskit.wasm",
  "/app/tuitea/app/canvaskit/chromium/canvaskit.js",
  "/app/tuitea/app/canvaskit/chromium/canvaskit.wasm",
  "/app/tuitea/app/favicon.png",
  "/app/tuitea/app/flutter.js",
  "/app/tuitea/app/flutter_bootstrap.js",
  "/app/tuitea/app/icons/Icon-192.png",
  "/app/tuitea/app/icons/Icon-512.png",
  "/app/tuitea/app/icons/Icon-maskable-192.png",
  "/app/tuitea/app/icons/Icon-maskable-512.png",
  "/app/tuitea/app/main.dart.js",
  "/app/tuitea/app/main.stamped.dart.js",
  "/app/tuitea/app/manifest.json",
  "/app/tuitea/app/version.json",
  "/app/tuitea/apple-touch-icon.png",
  "/app/tuitea/icon-192.png",
  "/app/tuitea/icon-512.png",
  "/app/tuitea/icon-maskable-512.png",
  "/app/tuitea/manifest.webmanifest",
  "/app/tuitea/pwa.js"
];

const RELEASE_SET = new Set(RELEASE_FILES);

/* Deliberately NOT part of the release, and each for a different reason:

   flags.json      — the rollback lever. Network-only, always, or a flag flip
                     would not take until the next deploy.
   sw.js           — this file. The browser fetches and compares it itself;
                     caching it would freeze the update mechanism shut.
   fastbeta/**     — a separate artefact with its own lifecycle. Not ours.
   fallback-fonts/ — ~140 Noto shards, 9 MB, of which a given device pulls two
                     or three. Precaching them would multiply every install by
                     nine for files that are passive glyph data: a woff2 cannot
                     be the wrong half of a release the way a code bundle can.
                     They are cached lazily into this release's cache, so they
                     still vanish with it. This is the one deliberate exception
                     to rule 1, and it is an exception about bytes, not about
                     code. */
function isFallbackFont(pathname) {
  return pathname.startsWith(SCOPE + 'app/fallback-fonts/');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* ALL-OR-NOTHING, ON PURPOSE. The previous worker caught each add()
       individually so one 404 could not abort the install — which meant a
       release could activate with pieces missing. Here a rejection is the
       feature: it aborts the install and leaves the user on the last release
       that was whole. `cache: 'reload'` bypasses the HTTP cache so the release
       is assembled from the deploy, not from whatever the browser kept. */
    await cache.addAll(
      RELEASE_FILES.map((url) => new Request(url, { cache: 'reload' }))
    );
  })());
  // No skipWaiting(): the page offers "a new version is ready" and the person
  // decides when the app is swapped out from under them.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('tuitea-') && n !== CACHE)
           .map((n) => caches.delete(n))
    );
    if (self.registration.navigationPreload) {
      // Only useful for the paths that still touch the network at all.
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION') {
    var reply = { type: 'VERSION', version: CACHE, release: RELEASE };
    // Answer on the caller's port when they opened one; a MessageChannel reply
    // reaches the asker directly instead of every handler on the client.
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((ns) =>
      Promise.all(ns.filter((n) => n.startsWith('tuitea-')).map((n) => caches.delete(n)))));
  }
});

/* Cache keys are PATHS, never full URLs.
   Requests arrive with query strings that mean nothing to the stored bytes:
   Flutter appends ?cachebuster=<timestamp> to version.json on every launch, and
   the shell passes ?cohort=... through. Keyed by URL those mint a new entry per
   launch; keyed by path there is exactly one entry per file — which is also
   what makes RELEASE_SET membership decidable. */
function cacheKey(request) {
  return new URL(request.url).pathname;
}

function isDocument(request) {
  return request.mode === 'navigate' ||
         (request.headers.get('accept') || '').includes('text/html');
}

function offlineDocument() {
  return new Response(
    '<!doctype html><meta charset=utf-8><title>TUITEA offline</title>' +
    '<body style="font:17px system-ui;background:#FBF7EF;color:#20261F;padding:2rem">' +
    '<h1>Offline</h1><p>TUITEA could not reach the network and has no saved copy ' +
    'of this screen yet. Reconnect and try again.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch cross-origin
  if (!url.pathname.startsWith(SCOPE)) return;       // stay inside our scope
  if (url.pathname.startsWith(SCOPE + 'fastbeta/')) return;  // not our artefact

  /* NOTHING THAT IS SOMEBODY'S RECORD EVER ENTERS THIS CACHE.
     TUITEA's data lives in Supabase, on another origin, so the cross-origin
     bail above already excludes every API response and every signed media URL.
     This second guard exists so that adding a same-origin endpoint later cannot
     quietly start persisting family records into a static cache. */
  if (/\/(api|auth|rest|storage|functions)\//.test(url.pathname)) return;

  const key = cacheKey(req);

  /* flags.json: network-only, with a last-known-good fallback purely so a
     flight-mode launch is not a blank screen. */
  if (url.pathname.endsWith('/flags.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'no-store' }));
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(key, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match(key);
        return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  /* ── THE ATOMICITY RULE ──────────────────────────────────────────────────
     Anything that is part of this release is served from this release's cache
     and from nowhere else. No network revalidation, no background refresh, no
     "stale-while-revalidate" — every one of those is a door through which a
     newer deploy's bytes could join an older deploy's already-running JS.

     The network fallback below is not a hole in that: it only runs if the entry
     is missing, which install()'s all-or-nothing addAll() is there to make
     impossible. It exists so an evicted cache degrades to a working app rather
     than a blank screen, and it never overwrites the release. */
  if (RELEASE_SET.has(key)) {
    event.respondWith((async () => {
      const cached = await caches.match(key);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch (e) {
        return isDocument(req) ? offlineDocument()
                               : new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  /* Fallback fonts: lazily filled into THIS release's cache. */
  if (isFallbackFont(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(key);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(key, res.clone());
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  /* Anything else under the scope is not part of a release: a path added to the
     site after this build, or a document we do not know about. Network-first so
     it is never stale, and never written into the release cache — an unknown
     path must not be able to grow the thing whose completeness is the whole
     guarantee. */
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse;
      return preloaded || await fetch(req);
    } catch (e) {
      const cached = await caches.match(key);
      if (cached) return cached;
      return isDocument(req) ? offlineDocument()
                             : new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
