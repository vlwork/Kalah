import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isTauriRuntime,
  prepareServiceWorkerRuntime,
  registerBrowserServiceWorker,
} from '../js/platform/service-worker-runtime.js';

test('Tauri runtime is identified by injected state and packaged asset URLs', () => {
  assert.equal(isTauriRuntime({ isTauri: true, location: { hostname: 'example.test', protocol: 'https:' } }), true);
  assert.equal(isTauriRuntime({ __TAURI_INTERNALS__: {}, location: { hostname: 'example.test', protocol: 'https:' } }), true);
  assert.equal(isTauriRuntime({ location: { hostname: 'tauri.localhost', protocol: 'http:' } }), true);
  assert.equal(isTauriRuntime({ location: { hostname: 'localhost', protocol: 'tauri:' } }), true);
  assert.equal(isTauriRuntime({ location: { hostname: 'example.test', protocol: 'https:' } }), false);
});

test('Tauri cleanup unregisters workers and removes only Kalah caches without registering or clearing storage', async () => {
  let registrationPresent = true;
  let registerCalls = 0;
  let localStorageClears = 0;
  const remainingCaches = new Set(['kalah-v1-audio1', 'kalah-obsolete', 'unrelated-cache']);
  const registration = {
    async unregister() {
      if (!registrationPresent) return false;
      registrationPresent = false;
      return true;
    },
  };
  const globalObject = {
    isTauri: true,
    location: { hostname: 'tauri.localhost', protocol: 'http:', reload() {} },
    localStorage: { clear() { localStorageClears += 1; } },
    navigator: {
      serviceWorker: {
        async getRegistrations() { return registrationPresent ? [registration] : []; },
        async register() { registerCalls += 1; },
      },
    },
    caches: {
      async keys() { return [...remainingCaches]; },
      async delete(key) { return remainingCaches.delete(key); },
    },
  };

  const firstCleanup = await prepareServiceWorkerRuntime(globalObject);
  assert.deepEqual(firstCleanup, {
    isTauri: true,
    unregisteredRegistrations: 1,
    deletedCaches: 2,
    reloadRequired: true,
  });
  assert.equal(await registerBrowserServiceWorker(globalObject), null);
  assert.equal(registerCalls, 0);
  assert.equal(localStorageClears, 0);
  assert.deepEqual([...remainingCaches], ['unrelated-cache']);

  const secondCleanup = await prepareServiceWorkerRuntime(globalObject);
  assert.equal(secondCleanup.reloadRequired, false);
  assert.equal(localStorageClears, 0);
});

test('regular browser runtime registers and updates the PWA service worker', async () => {
  let registeredUrl = null;
  let updateCalls = 0;
  let reloadCalls = 0;
  let controllerChange;
  const registration = { async update() { updateCalls += 1; } };
  const globalObject = {
    location: {
      hostname: 'kalah.example',
      protocol: 'https:',
      reload() { reloadCalls += 1; },
    },
    navigator: {
      serviceWorker: {
        addEventListener(type, listener) {
          if (type === 'controllerchange') controllerChange = listener;
        },
        async register(url) {
          registeredUrl = url;
          return registration;
        },
      },
    },
  };

  assert.equal(await registerBrowserServiceWorker(globalObject), registration);
  assert.equal(registeredUrl, './sw.js');
  assert.equal(updateCalls, 1);
  controllerChange();
  controllerChange();
  assert.equal(reloadCalls, 1);
});

test('Tauri cleanup is awaited before DOM-dependent application startup', async () => {
  const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  const cleanupPosition = main.indexOf('await prepareServiceWorkerRuntime()');
  const domStartupPosition = main.indexOf("const $ = (selector) => document.querySelector(selector)");
  assert.ok(cleanupPosition >= 0 && domStartupPosition > cleanupPosition);
});
