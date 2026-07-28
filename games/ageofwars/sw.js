const CACHE = 'skw-mobile-v49c';
const ASSETS = [
  './', './index.html', './src/platform/platform.js', './src/platform/platform.css', './src/core/civilizations.js', './src/core/balance.js', './src/core/ai.js', './src/core/core-runtime.js', './src/core/progression-system.js', './src/systems/build-info.js', './src/systems/platform-service.js', './src/systems/analytics-service.js', './src/systems/save-manager.js', './src/systems/commerce.js', './src/systems/stripe-links.config.js', './src/systems/stripe-commerce.js', './src/systems/purchase-bridge.js', './src/systems/equipment-system.js', './src/systems/folklore-system.js', './src/systems/final-siege-system.js', './src/render/soldier-visual-system.js', './src/render/soldier-rig.js', './src/render/monster-rig.js', './src/render/art-system.js', './src/render/audio-system.js', './src/systems/war-council.js', './src/systems/campaign-system.js', './src/systems/experience.js', './manifest.webmanifest', './icon.svg',
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
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(res=>{if(res&&res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => {
      const fetched = fetch(e.request)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetched;
    })
  );
});
