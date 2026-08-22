import test from 'node:test';
import assert from 'node:assert/strict';
import { KalahGame } from '../js/core/game.js';
import { createMatchStatistics } from '../js/statistics/statistics.js';
import { createSave, loadSlot, MemoryAdapter, saveSlot } from '../js/storage/storage.js';
import { AiTurnController } from '../js/ui/ai-turn-controller.js';
import { restoreRuntimeSnapshot, RuntimeLifecycle } from '../js/ui/runtime-session.js';

const savedBoard = [6, 6, 7, 7, 7, 7, 0, 7, 0, 6, 6, 6, 6, 1];
function fixture() {
  const game = new KalahGame({ board: savedBoard, currentPlayer: 1, startingPlayer: 1, firstMoveCompleted: true });
  const match = { matchId: 'saved-human-turn', mode: 'ai', humanPlayer: 1, aiPlayer: 2, player1: 'Игрок 1', player2: 'AI (Случайный)', aiDifficulty: 'random' };
  const statistics = createMatchStatistics();
  statistics.players[1].moves = 7; statistics.players[1].captures = 2; statistics.players[1].capturedStones = 5;
  statistics.players[2].moves = 6; statistics.players[2].storeFinishes = 1; statistics.players[2].extraTurns = 1;
  return createSave(match, game, statistics);
}

test('loading the same snapshot five times is strictly idempotent', () => {
  const adapter = new MemoryAdapter(); saveSlot(adapter, 1, fixture());
  const persisted = loadSlot(adapter, 1); const expectedStats = structuredClone(persisted.statistics);
  let runtime;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    runtime = restoreRuntimeSnapshot(persisted);
    assert.deepEqual(runtime.game.board, savedBoard);
    assert.equal(runtime.game.currentPlayer, 1);
    assert.deepEqual([runtime.game.board[6], runtime.game.board[13]], [0, 1]);
    assert.deepEqual(runtime.statistics, expectedStats);
    runtime.game.board[13] += iteration + 1;
    runtime.statistics.players[2].moves += iteration + 1;
  }
  assert.deepEqual(loadSlot(adapter, 1).game.board, savedBoard);
  assert.deepEqual(loadSlot(adapter, 1).statistics, expectedStats);
});

test('runtime objects and board never share references with the save snapshot', () => {
  const snapshot = fixture(); const runtime = restoreRuntimeSnapshot(snapshot);
  assert.notEqual(runtime.game.board, snapshot.game.board);
  assert.notEqual(runtime.match, snapshot.match);
  assert.notEqual(runtime.statistics, snapshot.statistics);
  runtime.game.board[13] = 30; runtime.match.player1 = 'Changed'; runtime.statistics.players[1].moves = 99;
  assert.deepEqual(snapshot.game.board, savedBoard);
  assert.equal(snapshot.match.player1, 'Игрок 1'); assert.equal(snapshot.statistics.players[1].moves, 7);
});

test('references retained from the old game cannot affect a restored runtime', () => {
  const oldRuntime = restoreRuntimeSnapshot(fixture());
  const oldGame = oldRuntime.game; const oldMatch = oldRuntime.match; const oldStatistics = oldRuntime.statistics;
  const current = restoreRuntimeSnapshot(fixture());
  oldGame.board[13] = 55; oldMatch.player1 = 'Old'; oldStatistics.players[2].moves = 55;
  assert.deepEqual(current.game.board, savedBoard);
  assert.equal(current.match.player1, 'Игрок 1'); assert.equal(current.statistics.players[2].moves, 6);
});

test('a callback from an old animation generation cannot render after Load', () => {
  const lifecycle = new RuntimeLifecycle(); const oldGeneration = lifecycle.capture(); let renderedBoard = null;
  const oldAnimationCallback = () => { if (lifecycle.isCurrent(oldGeneration)) renderedBoard = ['old']; };
  lifecycle.beginReplacement(); const current = restoreRuntimeSnapshot(fixture()); lifecycle.finishReplacement();
  oldAnimationCallback();
  assert.equal(renderedBoard, null); assert.deepEqual(current.game.board, savedBoard);
});

test('human-turn snapshot remains 0:1 after every stale scheduler callback is drained', () => {
  const jobs = []; let runtime = restoreRuntimeSnapshot(fixture());
  runtime.game.currentPlayer = 2; runtime.match.matchId = 'old-ai-session';
  let aiMoves = 0;
  const controller = new AiTurnController({
    schedule(callback) { const job = { callback }; jobs.push(job); return job; }, cancel() {},
    getSessionId: () => runtime.match.matchId,
    canRun: () => runtime.match.mode === 'ai' && !runtime.game.gameOver && runtime.game.currentPlayer === runtime.match.aiPlayer,
    runTurn: () => { aiMoves += 1; runtime.game.makeMove(9); },
  });
  controller.schedule();
  controller.invalidate(); runtime = restoreRuntimeSnapshot(fixture());
  assert.equal(controller.schedule(), false);
  while (jobs.length) jobs.shift().callback();
  assert.equal(aiMoves, 0); assert.deepEqual(runtime.game.board, savedBoard); assert.deepEqual([runtime.game.board[6], runtime.game.board[13]], [0, 1]);
});

test('AI-turn snapshot ignores old queue and executes exactly one fresh action', () => {
  const jobs = []; let runtime = restoreRuntimeSnapshot(fixture()); runtime.game.currentPlayer = 2; runtime.match.matchId = 'old';
  let aiMoves = 0;
  const controller = new AiTurnController({
    schedule(callback) { const job = { callback }; jobs.push(job); return job; }, cancel() {},
    getSessionId: () => runtime.match.matchId,
    canRun: () => runtime.match.mode === 'ai' && !runtime.game.gameOver && runtime.game.currentPlayer === 2,
    runTurn: () => { aiMoves += 1; runtime.game.makeMove(9); },
  });
  controller.schedule(); const stale = jobs[0];
  controller.invalidate(); runtime = restoreRuntimeSnapshot(fixture()); runtime.game.currentPlayer = 2; runtime.match.matchId = 'loaded-ai';
  assert.equal(controller.schedule(), true); assert.equal(controller.schedule(), false);
  stale.callback(); jobs[1].callback();
  assert.equal(aiMoves, 1); assert.equal(runtime.game.currentPlayer, 1); assert.equal(runtime.game.board[13], 2);
});
