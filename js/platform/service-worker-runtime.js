const KALAH_CACHE_PREFIX = 'kalah-';

export function isTauriRuntime(globalObject = globalThis) {
  const location = globalObject.location;
  return globalObject.isTauri === true
    || Boolean(globalObject.__TAURI_INTERNALS__)
    || location?.hostname === 'tauri.localhost'
    || location?.protocol === 'tauri:';
}

export async function cleanupTauriServiceWorkerState({ serviceWorker, cacheStorage } = {}) {
  let unregisteredRegistrations = 0;
  let deletedCaches = 0;

  if (typeof serviceWorker?.getRegistrations === 'function') {
    try {
      const registrations = await serviceWorker.getRegistrations();
      const results = await Promise.allSettled(registrations.map((registration) => registration.unregister()));
      unregisteredRegistrations = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    } catch {
      // Cleanup is best-effort so an unavailable browser API cannot block startup.
    }
  }

  if (typeof cacheStorage?.keys === 'function' && typeof cacheStorage?.delete === 'function') {
    try {
      const cacheKeys = await cacheStorage.keys();
      const results = await Promise.allSettled(
        cacheKeys
          .filter((key) => key.startsWith(KALAH_CACHE_PREFIX))
          .map((key) => cacheStorage.delete(key)),
      );
      deletedCaches = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    } catch {
      // Leave unrelated application state untouched if Cache Storage is unavailable.
    }
  }

  return {
    unregisteredRegistrations,
    deletedCaches,
    reloadRequired: unregisteredRegistrations > 0 || deletedCaches > 0,
  };
}

export async function prepareServiceWorkerRuntime(globalObject = globalThis) {
  if (!isTauriRuntime(globalObject)) {
    return { isTauri: false, reloadRequired: false, unregisteredRegistrations: 0, deletedCaches: 0 };
  }

  const cleanup = await cleanupTauriServiceWorkerState({
    serviceWorker: globalObject.navigator?.serviceWorker,
    cacheStorage: globalObject.caches,
  });
  return { isTauri: true, ...cleanup };
}

export async function registerBrowserServiceWorker(globalObject = globalThis) {
  const serviceWorker = globalObject.navigator?.serviceWorker;
  if (!serviceWorker || isTauriRuntime(globalObject)) return null;

  let reloadingForServiceWorkerUpdate = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorkerUpdate) return;
    reloadingForServiceWorkerUpdate = true;
    globalObject.location.reload();
  });

  const registration = await serviceWorker.register('./sw.js');
  try {
    await registration.update();
  } catch {
    // A failed update check must not prevent the browser/PWA from starting.
  }
  return registration;
}
