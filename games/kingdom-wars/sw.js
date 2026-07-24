const CACHE = 'skw-mobile-v28';
const ASSETS = [
  './', './index.html', './civilizations.js', './balance.js', './ai.js', './core-runtime.js', './progression-system.js', './build-info.js', './platform-service.js', './analytics-service.js', './save-manager.js', './commerce.js', './stripe-commerce.js', './equipment-system.js', './folklore-system.js', './final-siege-system.js', './soldier-visual-system.js', './art-system.js', './audio-system.js', './war-council.js', './campaign-system.js', './experience.js', './manifest.webmanifest', './icon.svg',
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
