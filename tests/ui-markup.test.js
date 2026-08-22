import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');

test('production board markup has visual seed containers and no engine index labels', () => {
  assert.match(html, /top-store-seeds/);
  assert.match(html, /bottom-store-seeds/);
  assert.doesNotMatch(html, /\[0\]|\[12\]|store-13|store-6/);
});

test('PvP has two player-side resign controls and no resign in common actions', () => {
  assert.match(html, /id="top-resign"/);
  assert.match(html, /id="bottom-resign"/);
  const actions = html.match(/<div class="actions">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.doesNotMatch(actions, /resign/);
});

test('AI difficulty starts hidden and author CSS preserves the hidden attribute', () => {
  assert.match(html, /id="difficulty-wrap" hidden/);
  assert.match(css, /\[hidden\]\{display:none!important\}/);
});

test('stone palette and adaptive size classes are present', () => {
  for (let tone = 0; tone < 6; tone += 1) assert.match(css, new RegExp(`seed\\.tone-${tone}`));
  for (const size of ['large', 'medium', 'small', 'compact']) assert.match(css, new RegExp(`seeds-${size}`));
  assert.match(css, /pit\.view-own/); assert.match(css, /pit\.view-opponent/);
});
