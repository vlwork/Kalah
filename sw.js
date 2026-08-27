const CACHE = 'kalah-v1-app-dialog-runtime1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icons/kalah.svg', './css/style.css',
  './js/main.js', './js/core/game.js', './js/ai/ai.js',
  './js/i18n/i18n.js', './js/i18n/translations.js', './js/storage/storage.js', './js/statistics/statistics.js',
  './js/ui/board-view.js', './js/ui/name-state.js', './js/ui/ai-turn-controller.js', './js/ui/ai-resignation.js',
  './js/ui/app-dialog.js', './js/ui/result-dialog.js', './js/ui/move-animation.js', './js/ui/runtime-session.js',
  './js/audio/audio-manager.js', './js/audio/web-audio-engine.js',
  './js/platform/service-worker-runtime.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('kalah-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network-first prevents a previously cached controller bundle from surviving
// a deployed lifecycle fix. The cache remains a complete offline fallback.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const networkResponse = fetch(event.request);
  const cacheUpdate = networkResponse
    .then((response) => {
      if (!response.ok || new URL(event.request.url).origin !== self.location.origin) return;

      let responseForCache;
      try {
        responseForCache = response.clone();
      } catch {
        return;
      }
      return caches.open(CACHE).then((cache) => cache.put(event.request, responseForCache));
    })
    .catch(() => {});

  event.waitUntil(cacheUpdate);
  event.respondWith(
    networkResponse
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
