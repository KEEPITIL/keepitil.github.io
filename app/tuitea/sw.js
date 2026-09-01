/* ==========================================================================
   TUITEA service worker — delivery substrate for the installed web app.
   Scope: /app/tuitea/

   CACHE VERSION IS THE ONLY THING TO BUMP.
   Change CACHE_VERSION on every deploy of the shell. Everything else keys off
   it: a new version means a new cache name, which means activate() deletes the
   old one outright. There is no partial/merge path, because partially-updated
   caches are how PWAs end up serving a 2-month-old HTML file forever.
   ========================================================================== */

const CACHE_VERSION = 'tuitea-v4';
const CACHE = CACHE_VERSION;
const SCOPE = '/app/tuitea/';

/* Static, content-addressed-by-version assets. Safe to serve from cache first
   because a deploy changes CACHE_VERSION and therefore refetches all of them. */
const PRECACHE = [
  SCOPE + 'app/',          // the compiled Flutter app's host document
  SCOPE + 'app.html',      // legacy entry, now a redirect into app/
  SCOPE + 'pwa.js',
  SCOPE + 'manifest.webmanifest',
  SCOPE + 'icon-192.png',
  SCOPE + 'icon-512.png'
];

/* WHY not precache flags.json: it is the rollback lever. It must always be
   read from the network so a flag flip takes effect on the next launch. */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll() is all-or-nothing; one 404 would abort the whole install and
    // leave the user on the previous SW. Tolerate individual misses instead.
    await Promise.all(PRECACHE.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
  // NOTE: no skipWaiting() here. The new worker deliberately waits so the page
  // can tell the user "a new version is ready" instead of swapping the app out
  // from under them mid-use. The page calls SKIP_WAITING when it is ready.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('tuitea-') && n !== CACHE)
           .map((n) => caches.delete(n))
    );
    // navigationPreload lets the browser start the network request for a
    // navigation in parallel with booting this worker — removes the SW
    // cold-start penalty on the network-first document path.
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((ns) =>
      Promise.all(ns.filter((n) => n.startsWith('tuitea-')).map((n) => caches.delete(n)))));
  }
});

function isDocument(request) {
  return request.mode === 'navigate' ||
         (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch cross-origin
  if (!url.pathname.startsWith(SCOPE)) return;       // stay inside our scope

  /* NOTHING THAT IS SOMEBODY'S RECORD EVER ENTERS THIS CACHE.
     TUITEA's data lives in Supabase, on another origin, so the cross-origin
     bail above already excludes every API response and every signed media URL.
     This second guard exists so that adding a same-origin endpoint later
     cannot quietly start persisting family records into a static cache. */
  if (/\/(api|auth|rest|storage|functions)\//.test(url.pathname)) return;

  /* flags.json: network-only, with a last-known-good fallback purely so a
     flight-mode launch is not a blank screen. Never served from cache while
     the network is answering — otherwise a rollback would not take. */
  if (url.pathname.endsWith('/flags.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(new Request(req.url, { cache: 'no-store' }));
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  /* Documents: NETWORK FIRST. This is the rule that guarantees the owner never
     gets stuck on a stale shell — HTML is only ever served from cache when the
     network actually failed. */
  if (isDocument(req)) {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        const res = preloaded || await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req) || await caches.match(SCOPE + 'app/');
        return cached || new Response(
          '<!doctype html><meta charset=utf-8><title>TUITEA offline</title>' +
          '<body style="font:17px system-ui;background:#FBF7EF;color:#20261F;padding:2rem">' +
          '<h1>Offline</h1><p>TUITEA could not reach the network and has no saved copy ' +
          'of this screen yet. Reconnect and try again.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  /* Everything else (js, css, png, fonts under scope): CACHE FIRST with a
     background refresh. Cheap and instant; correctness comes from the fact
     that a deploy bumps CACHE_VERSION and empties the old cache entirely. */
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) ||
      new Response('', { status: 504, statusText: 'Offline' });
  })());
});
