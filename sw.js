const CACHE = 'kalah-v1-audio1';
const ASSETS = [
  './', './index.html', './css/style.css', './js/main.js', './js/core/game.js', './js/ai/ai.js',
  './js/i18n/i18n.js', './js/i18n/translations.js', './js/storage/storage.js', './js/statistics/statistics.js',
  './js/ui/board-view.js', './js/ui/name-state.js', './js/ui/ai-turn-controller.js',
  './js/ui/move-animation.js', './js/ui/runtime-session.js',
  './js/audio/audio-manager.js', './js/audio/web-audio-engine.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('kalah-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      // Existing pages may still be executing a cache-first main.js that has
      // no controllerchange handler. One activation-time navigation moves
      // those clients onto this worker and the current controller bundle.
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url)))),
  );
});

// Network-first prevents a previously cached controller bundle from surviving
// a deployed lifecycle fix. The cache remains a complete offline fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
