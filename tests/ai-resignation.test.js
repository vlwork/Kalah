import test from 'node:test';
import assert from 'node:assert/strict';
import { KalahGame } from '../js/core/game.js';
import { createMatchStatistics } from '../js/statistics/statistics.js';
import { createSave, validateSave } from '../js/storage/storage.js';
import { AiResignationController, chooseResignationCountdown, createAiResignationState, getAiMaximumPossible, isAiMathematicallyHopeless } from '../js/ui/ai-resignation.js';
import { restoreRuntimeSnapshot } from '../js/ui/runtime-session.js';

function board({ humanStore, aiStore, remaining }) {
  const value = Array(14).fill(0);
  value[6] = humanStore; value[13] = aiStore; value[0] = remaining;
  return value;
}

function match(overrides = {}) {
  return {
    matchId:'ai-resignation', mode:'ai', humanPlayer:1, aiPlayer:2,
    player1:'Human', player2:'AI', player1IsDefault:false, player2IsDefault:false,
    player2IsSystemAI:true, aiDifficulty:'easy', aiResignation:createAiResignationState(),
    ...overrides,
  };
}

test('mathematical hopelessness uses the strict humanStore > aiStore + remaining proof', () => {
  const hopeless = board({ humanStore:40, aiStore:5, remaining:34 });
  const equal = board({ humanStore:40, aiStore:5, remaining:35 });
  const recoverable = board({ humanStore:40, aiStore:5, remaining:36 });
  assert.equal(getAiMaximumPossible(hopeless, 2), 39);
  assert.equal(isAiMathematicallyHopeless(hopeless, 1, 2), true);
  assert.equal(isAiMathematicallyHopeless(equal, 1, 2), false);
  assert.equal(isAiMathematicallyHopeless(recoverable, 1, 2), false);
});

test('injectable RNG deterministically selects both countdown endpoints', () => {
  assert.equal(chooseResignationCountdown(() => 0), 1);
  assert.equal(chooseResignationCountdown(() => .999999), 4);
});

test('hopeless countdown is selected only once', () => {
  let randomCalls = 0;
  const controller = new AiResignationController({ random:() => { randomCalls += 1; return .4; } });
  const currentMatch = match();
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:false, currentPlayer:2 };
  assert.equal(controller.observe(currentMatch, game), true);
  assert.equal(controller.observe(currentMatch, game), false);
  assert.equal(randomCalls, 1);
  assert.deepEqual(currentMatch.aiResignation, { hopelessDetected:true, movesUntilResign:2 });
});

test('countdown 1 replaces the next AI move attempt with resignation', () => {
  const controller = new AiResignationController({ random:() => 0 });
  const currentMatch = match();
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:false, currentPlayer:2 };
  controller.observe(currentMatch, game);
  assert.equal(controller.shouldResignBeforeMove(currentMatch, game), true);
});

test('countdown 4 permits three AI moves and replaces the fourth attempt', () => {
  const controller = new AiResignationController({ random:() => .999999 });
  const currentMatch = match();
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:false, currentPlayer:2 };
  controller.observe(currentMatch, game);
  assert.deepEqual([1, 2, 3, 4].map(() => controller.shouldResignBeforeMove(currentMatch, game)), [false, false, false, true]);
});

test('an AI extra turn is another countdown attempt', () => {
  const controller = new AiResignationController();
  const currentMatch = match({ aiResignation:{ hopelessDetected:true, movesUntilResign:2 } });
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:false, currentPlayer:2 };
  assert.equal(controller.shouldResignBeforeMove(currentMatch, game), false);
  assert.equal(controller.shouldResignBeforeMove(currentMatch, game), true);
});

test('New Game receives a fresh resignation state', () => {
  const previous = { hopelessDetected:true, movesUntilResign:2 };
  const next = createAiResignationState();
  assert.deepEqual(next, { hopelessDetected:false, movesUntilResign:null });
  assert.notEqual(next, previous);
});

test('PvP never observes or consumes AI resignation state', () => {
  const controller = new AiResignationController({ random:() => 0 });
  const currentMatch = { ...match(), mode:'pvp', aiResignation:null };
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:false, currentPlayer:2 };
  assert.equal(controller.observe(currentMatch, game), false);
  assert.equal(controller.shouldResignBeforeMove(currentMatch, game), false);
});

test('a game that ended first cannot trigger AI resignation', () => {
  const controller = new AiResignationController({ random:() => 0 });
  const currentMatch = match({ aiResignation:{ hopelessDetected:true, movesUntilResign:1 } });
  const game = { board:board({ humanStore:40, aiStore:5, remaining:20 }), gameOver:true, currentPlayer:2 };
  assert.equal(controller.shouldResignBeforeMove(currentMatch, game), false);
  assert.equal(currentMatch.aiResignation.movesUntilResign, 1);
});

test('AI resignation uses Engine resignation semantics without a fictitious sow', () => {
  const controller = new AiResignationController();
  const currentMatch = match({ aiResignation:{ hopelessDetected:true, movesUntilResign:1 } });
  const currentGame = new KalahGame({ currentPlayer:2, startingPlayer:1, firstMoveCompleted:true });
  const boardBefore = [...currentGame.board];
  assert.equal(controller.shouldResignBeforeMove(currentMatch, currentGame), true);
  const result = controller.resign(currentMatch, currentGame);
  assert.equal(result.success, true);
  assert.equal(currentGame.winner, currentMatch.humanPlayer);
  assert.equal(currentGame.endReason, 'resign');
  assert.deepEqual(currentGame.board, boardBefore);
});

test('Save and repeated Load preserve the selected countdown exactly', () => {
  const game = new KalahGame({
    board:[1,1,1,1,1,1,40,4,4,4,3,3,3,5], currentPlayer:2, startingPlayer:1, firstMoveCompleted:true,
  });
  const snapshot = createSave(match({ aiResignation:{ hopelessDetected:true, movesUntilResign:3 } }), game, createMatchStatistics());
  for (let iteration = 0; iteration < 5; iteration += 1) {
    assert.deepEqual(restoreRuntimeSnapshot(snapshot).match.aiResignation, { hopelessDetected:true, movesUntilResign:3 });
  }
});

test('old saves without resignation state migrate to an uninitialized countdown', () => {
  const game = new KalahGame();
  const snapshot = createSave(match(), game, createMatchStatistics());
  delete snapshot.match.aiResignation;
  assert.deepEqual(validateSave(snapshot).match.aiResignation, { hopelessDetected:false, movesUntilResign:null });
});
