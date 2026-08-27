import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { AppDialogController, runConfirmedAction } from '../js/ui/app-dialog.js';
import { createI18n } from '../js/i18n/i18n.js';

const mainSource = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');

function element(documentRoot) {
  const listeners = new Map();
  return {
    open: false,
    hidden: false,
    isConnected: true,
    dataset: {},
    className: '',
    textContent: '',
    opens: 0,
    closes: 0,
    deferCloseEvents: false,
    pendingCloseEvents: 0,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type, event = {}) {
      for (const callback of listeners.get(type) ?? []) callback(event);
    },
    listenerCount(type) { return listeners.get(type)?.length ?? 0; },
    focus() { documentRoot.activeElement = this; },
    showModal() { this.open = true; this.opens += 1; },
    close() {
      if (!this.open) return;
      this.open = false;
      this.closes += 1;
      if (this.deferCloseEvents) this.pendingCloseEvents += 1;
      else this.dispatch('close');
    },
    dispatchNextClose() {
      if (!this.pendingCloseEvents) return false;
      this.pendingCloseEvents -= 1;
      this.dispatch('close');
      return true;
    },
  };
}

function dialogHarness({ translate } = {}) {
  const documentRoot = { activeElement: null, body: {} };
  const dialog = element(documentRoot);
  const title = element(documentRoot);
  const message = element(documentRoot);
  const primary = element(documentRoot);
  const cancel = element(documentRoot);
  const fallback = element(documentRoot);
  const controller = new AppDialogController({
    dialog,
    titleElement: title,
    messageElement: message,
    confirmButton: primary,
    cancelButton: cancel,
    translate: translate ?? ((key) => key),
    documentRoot,
    fallbackFocus: () => fallback,
  });
  return { controller, dialog, title, message, primary, cancel, fallback, documentRoot, trigger: element(documentRoot) };
}

const options = {
  titleKey: 'title',
  messageKey: 'message',
  confirmLabelKey: 'yes',
  cancelLabelKey: 'no',
};

test('primary and cancel actions resolve a confirmation exactly once', async () => {
  const harness = dialogHarness();
  const accepted = harness.controller.ask(options);
  harness.primary.dispatch('click');
  harness.primary.dispatch('click');
  assert.equal(await accepted, true);
  assert.equal(harness.dialog.closes, 1);

  const cancelled = harness.controller.ask(options);
  harness.cancel.dispatch('click');
  assert.equal(await cancelled, false);
  assert.equal(harness.dialog.closes, 2);
});

test('info resolves after OK and closes the dialog', async () => {
  const harness = dialogHarness();
  const result = harness.controller.info({ titleKey:'title', messageKey:'message', confirmLabelKey:'ok' });
  assert.equal(harness.cancel.hidden, true);
  harness.primary.dispatch('click');
  assert.equal(await result, undefined);
  assert.equal(harness.dialog.open, false);
});

test('one modal instance is safely reusable without duplicate listeners or overlays', async () => {
  const harness = dialogHarness();
  const first = harness.controller.ask(options);
  const second = harness.controller.warn(options);
  assert.equal(await first, false);
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.dialog.listenerCount('cancel'), 1);
  assert.equal(harness.primary.listenerCount('click'), 1);
  harness.primary.dispatch('click');
  assert.equal(await second, true);
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.dialog.opens, 2);
});

test('a delayed close event from a replaced request cannot settle the new request', async () => {
  const harness = dialogHarness();
  harness.dialog.deferCloseEvents = true;
  const first = harness.controller.ask(options);
  let secondSettlements = 0;
  const second = harness.controller.warn(options).then((value) => {
    secondSettlements += 1;
    return value;
  });

  assert.equal(await first, false);
  assert.equal(harness.dialog.pendingCloseEvents, 1);
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.dialog.dispatchNextClose(), true);
  await Promise.resolve();
  assert.notEqual(harness.controller.active, null);
  assert.equal(harness.dialog.open, true);
  assert.equal(secondSettlements, 0);

  harness.primary.dispatch('click');
  assert.equal(await second, true);
  assert.equal(secondSettlements, 1);
  assert.equal(harness.dialog.dispatchNextClose(), true);
  await Promise.resolve();
  assert.equal(secondSettlements, 1);
});

test('warning focuses Cancel and closing restores focus to the initiator', async () => {
  const harness = dialogHarness();
  harness.trigger.focus();
  const result = harness.controller.warn(options);
  assert.equal(harness.documentRoot.activeElement, harness.cancel);
  harness.cancel.dispatch('click');
  assert.equal(await result, false);
  assert.equal(harness.documentRoot.activeElement, harness.trigger);
});

test('Escape cancels a confirmation and invalidation settles an outstanding request', async () => {
  const harness = dialogHarness();
  let prevented = false;
  const escaped = harness.controller.ask(options);
  harness.dialog.dispatch('cancel', { preventDefault: () => { prevented = true; } });
  assert.equal(await escaped, false);
  assert.equal(prevented, true);

  const invalidated = harness.controller.warn(options);
  assert.equal(harness.controller.invalidate(), true);
  assert.equal(await invalidated, false);
  assert.equal(harness.dialog.open, false);
});

test('open dialog copy refreshes from synchronized RU and EN localization', async () => {
  const i18n = createI18n('ru');
  const harness = dialogHarness({ translate: (key, parameters) => i18n.t(key, parameters) });
  const result = harness.controller.warn({
    titleKey:'newGame', messageKey:'activeGame', confirmLabelKey:'startNewGame', cancelLabelKey:'cancel',
  });
  assert.deepEqual(
    [harness.title.textContent, harness.message.textContent, harness.primary.textContent, harness.cancel.textContent],
    ['Новая игра', 'Есть активная партия. Начать новую?', 'Начать новую', 'Отмена'],
  );
  i18n.setLanguage('en');
  harness.controller.refresh();
  assert.deepEqual(
    [harness.title.textContent, harness.message.textContent, harness.primary.textContent, harness.cancel.textContent],
    ['New game', 'An active game exists. Start a new one?', 'Start new game', 'Cancel'],
  );
  assert.doesNotMatch([harness.title, harness.message, harness.primary, harness.cancel].map((item) => item.textContent).join(' '), /activeGame|startNewGame/);
  harness.cancel.dispatch('click');
  await result;
});

function newGameFlowHarness() {
  const oldGame = { gameOver:false, board:[6, 6, 6] };
  const state = {
    game:oldGame,
    match:{ matchId:'active-match' },
    statistics:{ moves:3 },
    setupSettings:{ mode:'ai', difficulty:'hard' },
    gameAreaHidden:false,
    setupHidden:true,
    generation:4,
  };
  let requests = 0;
  let resignations = 0;
  let results = 0;
  const enterSetup = async (accepted) => runConfirmedAction({
    request:async () => { requests += 1; return accepted; },
    isCurrent:() => true,
    action:() => {
      state.generation += 1;
      state.game = null;
      state.match = null;
      state.statistics = null;
      state.gameAreaHidden = true;
      state.setupHidden = false;
    },
  });
  const startGame = async () => {
    if (state.game && !state.game.gameOver) requests += 1;
    state.game = { gameOver:false, board:[6, 6, 6], session:'new' };
    state.match = { matchId:'new-match' };
    state.statistics = { moves:0 };
    state.gameAreaHidden = false;
    state.setupHidden = true;
  };
  return {
    state, oldGame, enterSetup, startGame,
    get requests() { return requests; },
    get resignations() { return resignations; },
    get results() { return results; },
  };
}

test('New Game cancellation leaves the active runtime and setup state unchanged', async () => {
  const harness = newGameFlowHarness();
  const original = structuredClone(harness.state);
  assert.equal(await harness.enterSetup(false), false);
  assert.deepEqual(harness.state, original);
  assert.equal(harness.state.game, harness.oldGame);
  assert.equal(harness.requests, 1);
});

test('confirmed New Game discards the old runtime so Start Game creates a new match without a second request', async () => {
  const harness = newGameFlowHarness();
  assert.equal(await harness.enterSetup(true), true);
  assert.equal(harness.state.setupHidden, false);
  assert.equal(harness.state.gameAreaHidden, true);
  assert.equal(harness.state.game, null);
  assert.equal(harness.state.match, null);
  assert.equal(harness.state.statistics, null);
  assert.equal(harness.requests, 1);

  await harness.startGame();
  assert.equal(harness.requests, 1);
  assert.equal(harness.state.game.session, 'new');
  assert.equal(harness.state.match.matchId, 'new-match');
  assert.deepEqual(harness.state.statistics, { moves:0 });
  assert.equal(harness.resignations, 0);
  assert.equal(harness.results, 0);
});

test('production New Game setup transition discards runtime without resignation or result recording', () => {
  const flowStart = mainSource.indexOf('async function showNewGameSetup');
  const flowEnd = mainSource.indexOf("$('#player1').addEventListener", flowStart);
  const flow = mainSource.slice(flowStart, flowEnd);
  const discardStart = mainSource.indexOf('function discardGameSession');
  const discardEnd = mainSource.indexOf('function applyLanguage', discardStart);
  const discard = mainSource.slice(discardStart, discardEnd);

  assert.match(flow, /beginSessionChange\(\);\s*discardGameSession\(\);/);
  assert.match(discard, /game = null;\s*match = null;\s*statistics = null;/);
  assert.doesNotMatch(flow, /\.resign\(|completeIfNeeded\(|recordHistory\(|finaliseMatch\(/);
});

test('a stale runtime context suppresses an accepted dialog action', async () => {
  let generation = 2;
  let completeRequest;
  let actions = 0;
  const pending = runConfirmedAction({
    request: () => new Promise((resolve) => { completeRequest = resolve; }),
    isCurrent: () => generation === 2,
    action: () => { actions += 1; },
  });
  generation = 3;
  completeRequest(true);
  assert.equal(await pending, false);
  assert.equal(actions, 0);
});

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) files.push(...await javascriptFiles(url));
    else if (entry.name.endsWith('.js')) files.push(url);
  }
  return files;
}

function maskCommentsAndStrings(source) {
  let output = '';
  let state = 'code';
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') { state = 'code'; output += '\n'; } else output += ' ';
    } else if (state === 'block-comment') {
      if (character === '*' && next === '/') { output += '  '; index += 1; state = 'code'; }
      else output += character === '\n' ? '\n' : ' ';
    } else if (state === 'string') {
      if (character === '\\') { output += '  '; index += 1; }
      else if (character === quote) { output += ' '; state = 'code'; }
      else output += character === '\n' ? '\n' : ' ';
    } else if (character === '/' && next === '/') {
      output += '  '; index += 1; state = 'line-comment';
    } else if (character === '/' && next === '*') {
      output += '  '; index += 1; state = 'block-comment';
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character; output += ' '; state = 'string';
    } else output += character;
  }
  return output;
}

test('production JavaScript contains no native browser dialog global calls', async () => {
  const nativeDialogCall = /(^|[^\w$.])(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/m;
  for (const file of await javascriptFiles(new URL('../js/', import.meta.url))) {
    assert.doesNotMatch(maskCommentsAndStrings(await readFile(file, 'utf8')), nativeDialogCall, file.pathname);
  }
});
