/* AOW2-3D offline service worker.
 * HTML is network-first (so a deploy is picked up immediately); the vendored
 * three.js, game modules and icons are cache-first (they are versioned by the
 * cache name). Cleanup is scoped to the 'aow2-3d-' prefix so this never
 * deletes another game's offline data on the same origin. */
const CACHE = 'aow2-3d-v3';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './vendor/three.min.js', './vendor/CopyShader.js', './vendor/LuminosityHighPassShader.js',
  './vendor/SMAAShader.js', './vendor/FXAAShader.js', './vendor/EffectComposer.js',
  './vendor/RenderPass.js', './vendor/ShaderPass.js', './vendor/UnrealBloomPass.js',
  './vendor/SMAAPass.js',
  './src/game/core.js', './src/render/renderer.js', './src/render/environment.js',
  './src/render/forts.js', './src/render/units3d.js', './src/render/vfx.js',
  './src/game/sim.js', './src/game/economy.js', './src/game/campaign.js',
  './src/ui/hud.js', './src/audio/audio.js', './src/boot.js',
  './app-icon-192.png', './app-icon-512.png', './app-icon-maskable.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // addAll rejects the whole install if ANY entry 404s — add individually.
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(k => k.indexOf('aow2-3d-') === 0 && k !== CACHE)
      .map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1;
  if (isHTML) {
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && r.status === 200 && r.type === 'basic') {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    }
    return r;
  }).catch(() => hit)));
});
