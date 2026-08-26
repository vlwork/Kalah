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
  const actions = html.match(/<div class="[^"]*\bactions\b[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.ok(actions);
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
  assert.match(css, /\.pit \.seeds-medium\s*\{\s*grid-template-columns:\s*repeat\(3, max-content\)/);
  assert.match(css, /\.pit \.seeds-compact\s*\{\s*grid-template-columns:\s*repeat\(6, max-content\)/);
});

test('responsive shell preserves browser zoom and protects narrow safe areas', () => {
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
  assert.match(viewport, /width=device-width/); assert.match(viewport, /initial-scale=1/);
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/);
  assert.match(css, /100dvh/); assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:\s*hidden/); assert.match(css, /--control-height:\s*44px/);
  assert.match(css, /@media \(min-width: 900px\) and \(min-height: 650px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.top-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /width:\s*min\(100%, 1060px\)/);
});

test('game surface exposes neutral animation anchors without duplicating engine indices', () => {
  assert.match(html, /class="board"[^>]*data-animation-surface="board"/);
  assert.equal((html.match(/data-effect-anchor="store"/g) ?? []).length, 2);
  assert.match(html, /id="status"[^>]*data-effect-anchor="turn"/);
  assert.match(html, /id="left-pits"/); assert.match(html, /id="right-pits"/);
});

test('all primary game and modal controls retain native button semantics', () => {
  for (const id of ['save', 'load', 'rules', 'statistics', 'new-game', 'settings', 'top-resign', 'bottom-resign']) {
    assert.match(html, new RegExp(`<button[^>]*id="${id}"`));
  }
  assert.match(html, /<dialog id="modal"/); assert.match(html, /<form method="dialog">/);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
