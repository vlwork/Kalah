import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
const main = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

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
  assert.match(css, /\.pit \.seeds-small:has\(> \.seed:nth-child\(9\):last-child\)/);
  assert.match(css, /\.seeds-large \.seed, \.seeds-medium \.seed, \.seeds-small \.seed, \.seeds-compact \.seed\s*\{[^}]*width:\s*var\(--seed-width\);[^}]*height:\s*var\(--seed-height\)/);
  assert.doesNotMatch(css, /\.seed:nth-child\([^)]*\)\s*\{[^}]*scale\(/);
});

test('pit seed row capacities map counts 5 through 10 and retain a narrow legacy fallback', () => {
  const rowCapacity = (ruleBody) => (ruleBody.match(/var\(--seed-width\)/g) ?? []).length;
  const mediumFallbacks = [...css.matchAll(/\.pit \.seeds-medium\s*\{([^}]*)\}/g)].map((match) => rowCapacity(match[1]));
  const mediumSevenEight = css.match(/\.pit \.seeds-medium:has\(> \.seed:nth-child\(7\):last-child\),\s*\.pit \.seeds-medium:has\(> \.seed:nth-child\(8\):last-child\)\s*\{([^}]*)\}/)?.[1] ?? '';
  const mediumFiveSixNarrow = css.match(/\.pit \.seeds-medium:has\(> \.seed:nth-child\(5\):last-child\),\s*\.pit \.seeds-medium:has\(> \.seed:nth-child\(6\):last-child\)\s*\{([^}]*)\}/)?.[1] ?? '';
  const smallFallback = css.match(/\.pit \.seeds-small\s*\{([^}]*)\}/)?.[1] ?? '';
  const smallNine = css.match(/\.pit \.seeds-small:has\(> \.seed:nth-child\(9\):last-child\)\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.deepEqual(mediumFallbacks, [3, 4]);
  assert.equal(rowCapacity(mediumSevenEight), 4);
  assert.equal(rowCapacity(mediumFiveSixNarrow), 3);
  assert.equal(rowCapacity(smallNine), 3);
  assert.equal(rowCapacity(smallFallback), 5);
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

test('moving stones use an unclipped fixed viewport transport layer', () => {
  const overlayRule = css.match(/\.board-animation-overlay\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(overlayRule, /position:\s*fixed/);
  assert.match(overlayRule, /inset:\s*0/);
  assert.match(overlayRule, /overflow:\s*visible/);
  assert.match(overlayRule, /pointer-events:\s*none/);
  assert.match(overlayRule, /z-index:\s*10000/);
});

test('moving sow stone keeps stable opacity and scale with transform-only travel', () => {
  const startRule = css.match(/\.moving-stone\.moving-sow\s*\{([^}]*)\}/)?.[1] ?? '';
  const flightRule = css.match(/\.moving-stone\.moving-sow\.in-flight\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(startRule, /opacity:\s*1/); assert.match(flightRule, /opacity:\s*1/);
  assert.match(startRule, /animation:\s*none/); assert.match(flightRule, /animation:\s*none/);
  assert.match(startRule, /transition:\s*transform\b/); assert.doesNotMatch(startRule, /transition:[^;]*opacity/);
  assert.match(startRule, /scale\(1\.02\)/); assert.match(flightRule, /scale\(1\.02\)/);
  assert.match(css, /\.seed\.stone--just-landed\s*\{/);
});

test('Settings exposes global animation toggle and a 25–200 percent speed control', () => {
  assert.match(main, /animationEnabled\.type = 'checkbox'/);
  assert.match(main, /speed\.min = '25'/); assert.match(main, /speed\.max = '200'/); assert.match(main, /speed\.step = '5'/);
  assert.match(main, /getAnimationSettings:\s*\(\) => \(\{ \.\.\.animationSettings \}\)/);
});

test('all primary game and modal controls retain native button semantics', () => {
  for (const id of ['save', 'load', 'rules', 'statistics', 'new-game', 'settings', 'top-resign', 'bottom-resign']) {
    assert.match(html, new RegExp(`<button[^>]*id="${id}"`));
  }
  assert.match(html, /<dialog id="modal"/); assert.match(html, /<form method="dialog">/);
  assert.match(html, /<button id="modal-action" type="button"/);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('app dialog uses one accessible responsive native modal surface', () => {
  assert.equal((html.match(/id="app-dialog"/g) ?? []).length, 1);
  assert.match(html, /<dialog id="app-dialog"[^>]*aria-labelledby="app-dialog-title"[^>]*aria-describedby="app-dialog-message"/);
  assert.match(html, /<button id="app-dialog-cancel" type="button"/);
  assert.match(html, /<button id="app-dialog-confirm" type="button"/);
  assert.match(css, /\.app-confirm-dialog\s*\{[^}]*width:\s*min\(460px, calc\(100vw - 24px\)\)/);
  assert.match(css, /safe-area-inset-left/); assert.match(css, /safe-area-inset-right/);
  assert.match(css, /\.app-dialog-actions\s*\{[^}]*flex-wrap:\s*wrap/);
});

test('reduced motion keeps the fixed extra-turn text visible', () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? '';
  assert.doesNotMatch(reduced, /\.animation-message\s*\{[^}]*display:\s*none/);
  assert.match(css, /@keyframes message-appear[^}]*opacity:\s*0[\s\S]*opacity:\s*1/);
});
