import test from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../js/i18n/translations.js';
import { createResultPresentation, ResultDialogController } from '../js/ui/result-dialog.js';

const messages = {
  draw:'Draw', resultVictory:'Victory!', resultDefeat:'Defeat', playerWins:'{name} wins',
  computerResigned:'Computer resigned.', youResigned:'You resigned.', playerResigned:'{name} resigned.', ok:'OK',
};
const text = (key, parameters = {}) => Object.entries(parameters)
  .reduce((value, [name, replacement]) => value.replace(`{${name}}`, replacement), messages[key]);
const baseMatch = { mode:'ai', humanPlayer:1, aiPlayer:2, player1:'Alice', player2:'AI (Easy)' };
const game = (overrides = {}) => ({ winner:1, endReason:'emptySide', board:[0,0,0,0,0,0,45,0,0,0,0,0,0,27], gameOver:true, ...overrides });

test('PvAI victory, defeat, and draw use the requested result titles', () => {
  assert.equal(createResultPresentation({ game:game(), match:baseMatch, text }).title, 'Victory!');
  assert.equal(createResultPresentation({ game:game({ winner:2 }), match:baseMatch, text }).title, 'Defeat');
  assert.equal(createResultPresentation({ game:game({ winner:0 }), match:baseMatch, text }).title, 'Draw');
});

test('RU and EN result copy includes localized titles, details, and OK', () => {
  assert.deepEqual(
    [translations.ru.resultVictory, translations.ru.resultDefeat, translations.ru.computerResigned, translations.ru.youResigned, translations.ru.ok],
    ['Победа!', 'Поражение', 'Компьютер сдался.', 'Вы сдались.', 'OK'],
  );
  assert.deepEqual(
    [translations.en.resultVictory, translations.en.resultDefeat, translations.en.computerResigned, translations.en.youResigned, translations.en.ok],
    ['Victory!', 'Defeat', 'Computer resigned.', 'You resigned.', 'OK'],
  );
});

test('AI and human resignation have distinct PvAI details', () => {
  const aiResigned = createResultPresentation({ game:game({ endReason:'resign', winner:1 }), match:baseMatch, text });
  const humanResigned = createResultPresentation({ game:game({ endReason:'resign', winner:2 }), match:baseMatch, text });
  assert.equal(aiResigned.detail, 'Computer resigned.');
  assert.equal(humanResigned.detail, 'You resigned.');
});

test('PvP uses the custom winner name and resignation name', () => {
  const match = { ...baseMatch, mode:'pvp', player1:'Custom One', player2:'Custom Two' };
  const result = createResultPresentation({ game:game({ endReason:'resign', winner:2 }), match, text });
  assert.equal(result.title, 'Custom Two wins');
  assert.equal(result.detail, 'Custom One resigned.');
});

test('result presentation reads both final Kalah scores from the Engine board', () => {
  const result = createResultPresentation({ game:game(), match:baseMatch, text });
  assert.deepEqual(result.scores, [{ name:'Alice', score:45 }, { name:'AI (Easy)', score:27 }]);
});

function element(documentRoot) {
  const listeners = new Map();
  return {
    children: [], textContent:'', className:'', isConnected:true, attributes:new Map(),
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    focus() { documentRoot.activeElement = this; },
  };
}

function dialogHarness({ current = true, matchId = 'current' } = {}) {
  const documentRoot = { activeElement:null, createElement:null };
  documentRoot.createElement = () => element(documentRoot);
  const trigger = element(documentRoot); trigger.focus();
  const dialog = element(documentRoot); dialog.open = false; dialog.opens = 0; dialog.closes = 0;
  dialog.showModal = () => { dialog.open = true; dialog.opens += 1; };
  dialog.close = () => { dialog.open = false; dialog.closes += 1; };
  const content = element(documentRoot);
  const action = element(documentRoot);
  let newGames = 0;
  const fallback = element(documentRoot); fallback.focus = () => { newGames += 0; documentRoot.activeElement = fallback; };
  const controller = new ResultDialogController({
    dialog, content, actionButton:action, documentRoot,
    isCurrent:() => current, getMatchId:() => matchId, fallbackFocus:() => fallback,
  });
  return { controller, dialog, content, action, documentRoot, trigger, get newGames() { return newGames; } };
}

const presentation = () => createResultPresentation({ game:game(), match:baseMatch, text });

test('result dialog stays open until its keyboard-accessible OK button is activated', () => {
  const harness = dialogHarness();
  assert.equal(harness.controller.show({ generation:1, matchId:'current', presentation:presentation() }), true);
  assert.equal(harness.dialog.open, true);
  assert.equal(harness.action.textContent, 'OK');
  assert.equal(harness.documentRoot.activeElement, harness.action);
  assert.equal(harness.dialog.closes, 0, 'there is no auto-dismiss');
  let escapePrevented = false;
  harness.dialog.dispatch('cancel', { preventDefault:() => { escapePrevented = true; } });
  assert.equal(escapePrevented, true);
  assert.equal(harness.dialog.open, true);
  harness.action.dispatch('click');
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.documentRoot.activeElement, harness.trigger);
});

test('OK only closes the dialog and never starts a New Game', () => {
  const harness = dialogHarness();
  harness.controller.show({ generation:1, matchId:'current', presentation:presentation() });
  harness.action.dispatch('click');
  assert.equal(harness.dialog.closes, 1);
  assert.equal(harness.newGames, 0);
});

test('stale generation or stale matchId cannot open a result dialog', () => {
  let harness = dialogHarness({ current:false });
  assert.equal(harness.controller.show({ generation:1, matchId:'current', presentation:presentation() }), false);
  assert.equal(harness.dialog.opens, 0);
  harness = dialogHarness({ matchId:'new' });
  assert.equal(harness.controller.show({ generation:1, matchId:'old', presentation:presentation() }), false);
  assert.equal(harness.dialog.opens, 0);
});

test('the same completed runtime cannot open a duplicate result dialog', () => {
  const harness = dialogHarness();
  assert.equal(harness.controller.show({ generation:1, matchId:'current', presentation:presentation() }), true);
  assert.equal(harness.controller.show({ generation:1, matchId:'current', presentation:presentation() }), false);
  assert.equal(harness.dialog.opens, 1);
});

test('session invalidation closes an already visible result dialog', () => {
  const harness = dialogHarness();
  harness.controller.show({ generation:1, matchId:'current', presentation:presentation() });
  harness.controller.invalidate();
  assert.equal(harness.dialog.open, false);
  assert.equal(harness.controller.active, null);
});
