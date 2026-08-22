import test from 'node:test';
import assert from 'node:assert/strict';
import { KalahGame } from '../js/core/game.js';
import { translations } from '../js/i18n/translations.js';
import { DEFAULT_SETTINGS, MemoryAdapter, clearSlot, createSave, getHistory, getSettings, getSlots, loadSlot, recordHistory, saveSettings, saveSlot, validateSave } from '../js/storage/storage.js';
import { createMatchStatistics } from '../js/statistics/statistics.js';
import { restoreRuntimeSnapshot } from '../js/ui/runtime-session.js';

const match = { matchId:'id', mode:'ai', humanPlayer:1, aiPlayer:2, player1:'A', player2:'AI', player1IsDefault:false, player2IsDefault:false, player2IsSystemAI:true, aiDifficulty:'easy' };

test('storage provides exactly five independent slots, overwrites, clears, and returns clones', () => {
  const adapter = new MemoryAdapter();
  assert.deepEqual(getSlots(adapter).map(({ slot, save }) => [slot, save]), [[1,null],[2,null],[3,null],[4,null],[5,null]]);
  for (let slot = 1; slot <= 5; slot += 1) saveSlot(adapter, slot, createSave({ ...match, matchId:`id-${slot}`, player1:`P${slot}` }, new KalahGame(), createMatchStatistics()));
  assert.deepEqual(getSlots(adapter).map(({ save }) => save.match.player1), ['P1','P2','P3','P4','P5']);
  const loaded = loadSlot(adapter, 1); loaded.match.player1 = 'changed'; assert.equal(loadSlot(adapter, 1).match.player1, 'P1');
  saveSlot(adapter, 1, createSave({ ...match, matchId:'id-1', player1:'B' }, new KalahGame(), createMatchStatistics()));
  assert.equal(loadSlot(adapter, 1).match.player1, 'B'); assert.equal(loadSlot(adapter, 2).match.player1, 'P2');
  clearSlot(adapter, 1); assert.equal(loadSlot(adapter, 1), null); assert.equal(validateSave({}), null);
});

test('RU and EN have matching translation keys', () => {
  assert.ok(translations.ru && translations.en);
  assert.deepEqual(Object.keys(translations.ru).sort(), Object.keys(translations.en).sort());
  assert.ok(Object.values(translations.ru).every(Boolean) && Object.values(translations.en).every(Boolean));
});

test('audio settings have backward-compatible defaults and persist globally', () => {
  const adapter = new MemoryAdapter(); assert.deepEqual(getSettings(adapter), DEFAULT_SETTINGS);
  saveSettings(adapter, { soundEnabled:false, volume:27 }); assert.deepEqual(getSettings(adapter), { soundEnabled:false, volume:27 });
  adapter.set('kalah:v1:settings', JSON.stringify({ unrelated:true })); assert.deepEqual(getSettings(adapter), DEFAULT_SETTINGS);
  saveSettings(adapter, { soundEnabled:true, volume:400 }); assert.deepEqual(getSettings(adapter), { soundEnabled:true, volume:100 });
});

test('Save and Load preserve complete match and unfinished-statistics state without restoring application settings', () => {
  const adapter = new MemoryAdapter();
  const game = new KalahGame({ startingPlayer:2, currentPlayer:2, openingRestriction:true });
  const statistics = createMatchStatistics(); statistics.players[1].moves = 3; statistics.players[1].extraTurns = 1; statistics.players[1].extraTurnStreak = 1;
  const saved = createSave({ ...match, matchId:'full-state', player1:'Иван', player2:'AI (Easy)' }, game, statistics);
  saveSettings(adapter, { soundEnabled:false, volume:18 }); saveSlot(adapter, 3, saved);
  const restored = restoreRuntimeSnapshot(loadSlot(adapter, 3));
  assert.deepEqual(restored.game.toJSON(), game.toJSON()); assert.deepEqual(restored.match, saved.match); assert.deepEqual(restored.statistics, statistics);
  assert.deepEqual(getSettings(adapter), { soundEnabled:false, volume:18 });
});

test('the actual first player and opening restriction survive Save and Load without reselection', () => {
  const adapter = new MemoryAdapter();
  const game = new KalahGame({ startingPlayer:2, currentPlayer:2, openingRestriction:true });
  saveSlot(adapter, 4, createSave({ ...match, matchId:'selected-first-player' }, game, createMatchStatistics()));
  const restored = restoreRuntimeSnapshot(loadSlot(adapter, 4));
  assert.equal(restored.game.startingPlayer, 2); assert.equal(restored.game.currentPlayer, 2); assert.equal(restored.game.firstMoveCompleted, false);
  assert.equal(restored.game.openingRestriction, true); assert.equal(restored.game.makeMove(7).reason, 'OPENING_MOVE_FORBIDDEN');
});

test('corrupt saves are rejected before they reach runtime restoration', () => {
  const valid = createSave(match, new KalahGame(), createMatchStatistics());
  for (const mutate of [
    (save) => save.game.board.pop(), (save) => { save.game.board[0] = -1; }, (save) => { save.game.board[0] = 1.5; },
    (save) => { save.game.board[0] = 5; }, (save) => { save.game.currentPlayer = 3; }, (save) => { save.schemaVersion = 2; },
    (save) => { save.game.winner = 1; }, (save) => { delete save.statistics.players[1].moves; },
  ]) { const damaged = structuredClone(valid); mutate(damaged); assert.equal(validateSave(damaged), null); }
  const adapter = new MemoryAdapter(); adapter.set('kalah:v1:saves', '{bad json'); assert.equal(getSlots(adapter).length, 5);
});

test('history recording is idempotent by matchId and discards corrupt entries', () => {
  const adapter = new MemoryAdapter();
  const historyEntry = { matchId:'only-once', completedAt:new Date().toISOString(), mode:'ai', player1:'A', player2:'AI', winner:1, draw:false, endReason:'resign', stores:[0,0], players:{ 1:{ moves:0, captures:0, capturedStones:0, storeFinishes:0, extraTurns:0, maxCapture:0, maxExtraTurnStreak:0, finalStore:0 }, 2:{ moves:0, captures:0, capturedStones:0, storeFinishes:0, extraTurns:0, maxCapture:0, maxExtraTurnStreak:0, finalStore:0 } } };
  assert.equal(recordHistory(adapter, historyEntry).length, 1); assert.equal(recordHistory(adapter, { ...historyEntry, completedAt:'later' }).length, 1);
  adapter.set('kalah:v1:statistics', JSON.stringify([{ matchId:'corrupt' }, historyEntry])); assert.deepEqual(getHistory(adapter), [historyEntry]);
});

test('rules text explicitly covers the fixed Kalah rules in both languages', () => {
  for (const language of ['ru', 'en']) {
    const help = translations[language].helpText;
    const phrases = language === 'ru'
      ? ['12', 'два калаха', '6 камней', '72', 'соперника', 'дополнительный ход', 'противоположной', 'пусты', 'оставшиеся камни', 'сдаться', 'ничью', 'первого игрока', '37']
      : ['12', 'two Kalah', '6 stones', '72', 'opponent', 'extra turn', 'opposite', 'empty', 'remaining stones', 'resign', 'draw', 'starting player', '37'];
    for (const phrase of phrases) assert.match(help, new RegExp(phrase, 'i'));
  }
});
