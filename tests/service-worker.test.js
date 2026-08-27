import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

function createWorkerEnvironment({ fetchImplementation, cachesImplementation }) {
  const listeners = new Map();
  const self = {
    location: { origin: 'https://kalah.example' },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
    },
    skipWaiting: async () => {},
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  runInNewContext(worker, {
    self,
    caches: cachesImplementation,
    fetch: fetchImplementation,
    URL,
  });
  return listeners;
}

function dispatchFetch(listener, request) {
  const lifetimePromises = [];
  let responsePromise;
  listener({
    request,
    waitUntil(promise) { lifetimePromises.push(promise); },
    respondWith(promise) { responsePromise = promise; },
  });
  return { lifetimePromises, responsePromise };
}

test('service worker activates updates immediately without forcing a second client navigation', () => {
  assert.match(worker, /skipWaiting/);
  assert.match(worker, /clients\.claim/);
  assert.match(worker, /caches\.delete/);
  assert.doesNotMatch(worker, /client\.navigate/);
});

test('service worker uses network-first application asset loading', () => {
  const fetchPosition = worker.indexOf('fetch(event.request)');
  const cacheMatchPosition = worker.indexOf('caches.match(event.request)');
  assert.ok(fetchPosition >= 0 && cacheMatchPosition > fetchPosition);
});

test('network responses are cloned before consumers can use the body and cache failures stay isolated', async () => {
  const order = [];
  const networkResponse = {
    ok: true,
    clone() {
      order.push('clone');
      return { cachedCopy: true };
    },
  };
  const listeners = createWorkerEnvironment({
    fetchImplementation: async () => networkResponse,
    cachesImplementation: {
      async open() { throw new Error('cache unavailable'); },
      async match() { return undefined; },
    },
  });
  const event = dispatchFetch(listeners.get('fetch'), {
    method: 'GET',
    mode: 'cors',
    url: 'https://kalah.example/js/main.js',
  });

  assert.equal(await event.responsePromise, networkResponse);
  order.push('consumer');
  await Promise.all(event.lifetimePromises);
  assert.deepEqual(order, ['clone', 'consumer']);
  assert.equal(event.lifetimePromises.length, 1);
});

test('network failure keeps cached asset and navigation fallbacks available', async (t) => {
  const cachedAsset = { source: 'asset-cache' };
  const cachedIndex = { source: 'index-cache' };
  const listeners = createWorkerEnvironment({
    fetchImplementation: async () => { throw new Error('offline'); },
    cachesImplementation: {
      async open() { throw new Error('not used while offline'); },
      async match(request) {
        if (request === './index.html') return cachedIndex;
        if (request.url.endsWith('/css/style.css')) return cachedAsset;
        return undefined;
      },
    },
  });

  await t.test('returns an exact cached asset', async () => {
    const event = dispatchFetch(listeners.get('fetch'), {
      method: 'GET',
      mode: 'cors',
      url: 'https://kalah.example/css/style.css',
    });
    assert.equal(await event.responsePromise, cachedAsset);
    await Promise.all(event.lifetimePromises);
  });

  await t.test('falls back to cached index for navigation', async () => {
    const event = dispatchFetch(listeners.get('fetch'), {
      method: 'GET',
      mode: 'navigate',
      url: 'https://kalah.example/game',
    });
    assert.equal(await event.responsePromise, cachedIndex);
    await Promise.all(event.lifetimePromises);
  });
});

test('offline cache includes both audio modules', () => {
  assert.match(worker, /audio\/audio-manager\.js/);
  assert.match(worker, /audio\/web-audio-engine\.js/);
});

test('offline cache includes the app dialog module', () => {
  assert.match(worker, /ui\/app-dialog\.js/);
});

test('offline cache uses a current cache name and includes every direct main module dependency', () => {
  assert.match(worker, /const CACHE = 'kalah-v1-app-dialog-runtime1'/);
  assert.doesNotMatch(worker, /kalah-v1-audio1/);
  const directImports = [...main.matchAll(/from ['"](\.\/[^'"]+)['"]/g)]
    .map(([, relativePath]) => `./js/${relativePath.slice(2)}`);
  for (const asset of directImports) assert.ok(worker.includes(`'${asset}'`), `${asset} must be precached`);
});
