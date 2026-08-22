import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('service worker activates updates immediately and removes stale Kalah caches', () => {
  assert.match(worker, /skipWaiting/);
  assert.match(worker, /clients\.claim/);
  assert.match(worker, /clients\.matchAll/);
  assert.match(worker, /client\.navigate/);
  assert.match(worker, /caches\.delete/);
});

test('service worker uses network-first application asset loading', () => {
  const fetchPosition = worker.indexOf('fetch(event.request)');
  const cacheMatchPosition = worker.indexOf('caches.match(event.request)');
  assert.ok(fetchPosition >= 0 && cacheMatchPosition > fetchPosition);
});

test('offline cache includes both audio modules', () => {
  assert.match(worker, /audio\/audio-manager\.js/);
  assert.match(worker, /audio\/web-audio-engine\.js/);
});
