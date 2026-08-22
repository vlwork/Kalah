import test from 'node:test';
import assert from 'node:assert/strict';
import { AiTurnController } from '../js/ui/ai-turn-controller.js';

function harness() {
  const jobs = [];
  const state = { session: 'old', mode: 'ai', currentPlayer: 2, aiPlayer: 2, gameOver: false, board: [6], score: 1, stats: { moves: 0, storeFinishes: 0, captures: 0, capturedStones: 0, extraTurns: 0 } };
  let controller;
  controller = new AiTurnController({
    schedule(callback) { const job = { callback, cancelled: false }; jobs.push(job); return job; },
    cancel(job) { job.cancelled = true; },
    getSessionId: () => state.session,
    canRun: () => state.mode === 'ai' && !state.gameOver && state.currentPlayer === state.aiPlayer,
    runTurn: () => { state.board[0] += 1; state.score += 1; state.stats.moves += 1; },
  });
  return { controller, jobs, state };
}

test('Load to a human turn invalidates stale AI callback without board, score, or stats mutation', () => {
  const { controller, jobs, state } = harness();
  controller.schedule(); const stale = jobs[0];
  controller.invalidate(); state.session = 'loaded-human'; state.currentPlayer = 1; state.board = [10]; state.score = 4; state.stats = { moves: 7, storeFinishes: 2, captures: 3, capturedStones: 8, extraTurns: 4 };
  stale.callback();
  assert.deepEqual(state.board, [10]); assert.equal(state.score, 4); assert.deepEqual(state.stats, { moves: 7, storeFinishes: 2, captures: 3, capturedStones: 8, extraTurns: 4 }); assert.equal(jobs.length, 1);
});

test('Load to an AI turn ignores stale callback and schedules exactly one fresh turn', () => {
  const { controller, jobs, state } = harness();
  controller.schedule(); const stale = jobs[0];
  controller.invalidate(); state.session = 'loaded-ai'; state.board = [20]; state.score = 8; state.stats.moves = 5;
  assert.equal(controller.schedule(), true); assert.equal(controller.schedule(), false);
  stale.callback(); jobs[1].callback();
  assert.deepEqual(state.board, [21]); assert.equal(state.score, 9); assert.equal(state.stats.moves, 6);
});

test('New Game invalidates a pending AI callback', () => {
  const { controller, jobs, state } = harness();
  controller.schedule(); controller.invalidate(); state.session = 'new-game'; state.currentPlayer = 1; jobs[0].callback();
  assert.deepEqual(state.board, [6]); assert.equal(state.stats.moves, 0);
});

test('Resign and gameOver invalidate a pending AI callback', () => {
  const { controller, jobs, state } = harness();
  controller.schedule(); controller.invalidate(); state.gameOver = true; jobs[0].callback();
  assert.equal(state.score, 1); assert.equal(state.stats.moves, 0);
});

test('an active AI session can schedule its normal extra turn after the first callback', () => {
  const jobs = []; const state = { session: 'active', currentPlayer: 2, moves: 0 };
  let controller;
  controller = new AiTurnController({
    schedule(callback) { const job = { callback }; jobs.push(job); return job; }, cancel() {},
    getSessionId: () => state.session, canRun: () => state.currentPlayer === 2,
    runTurn: () => { state.moves += 1; if (state.moves === 1) controller.schedule(); },
  });
  controller.schedule(); jobs[0].callback(); assert.equal(jobs.length, 2); jobs[1].callback(); assert.equal(state.moves, 2);
});
