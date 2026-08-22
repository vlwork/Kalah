import test from 'node:test';
import assert from 'node:assert/strict';
import { KalahGame } from '../js/core/game.js';
import { getBoardOrientation, getBoardView } from '../js/ui/board-view.js';

test('Player 1 board mapping follows the sowing path around a vertical board', () => {
  assert.deepEqual(getBoardView(1), { topStore: 6, left: [5, 4, 3, 2, 1, 0], right: [7, 8, 9, 10, 11, 12], bottomStore: 13 });
});

test('Player 2 board mapping is the logical 180-degree view', () => {
  assert.deepEqual(getBoardView(2), { topStore: 13, left: [12, 11, 10, 9, 8, 7], right: [0, 1, 2, 3, 4, 5], bottomStore: 6 });
});

test('PvP starts oriented to startingPlayer and follows an ordinary turn transfer', () => {
  const game = new KalahGame({ startingPlayer: 1 });
  assert.equal(getBoardOrientation({ mode: 'pvp', currentPlayer: game.currentPlayer }), 1);
  game.makeMove(1);
  assert.equal(game.currentPlayer, 2);
  assert.equal(getBoardOrientation({ mode: 'pvp', currentPlayer: game.currentPlayer }), 2);
});

test('PvP also starts and rotates correctly when Player 2 is the selected first player', () => {
  const game = new KalahGame({ startingPlayer: 2 });
  assert.equal(getBoardOrientation({ mode: 'pvp', currentPlayer: game.currentPlayer }), 2);
  game.makeMove(8);
  assert.equal(game.currentPlayer, 1);
  assert.equal(getBoardOrientation({ mode: 'pvp', currentPlayer: game.currentPlayer }), 1);
});

test('PvP extra turn retains orientation', () => {
  const game = new KalahGame({ startingPlayer: 1 });
  const result = game.makeMove(0);
  assert.equal(result.extraTurn, true);
  assert.equal(getBoardOrientation({ mode: 'pvp', currentPlayer: game.currentPlayer }), 1);
});

test('PvAI stays human-oriented during AI turns including an AI extra turn', () => {
  const game = new KalahGame({ startingPlayer: 2, currentPlayer: 2 });
  assert.equal(getBoardOrientation({ mode: 'ai', currentPlayer: game.currentPlayer, humanPlayer: 1 }), 1);
  const result = game.makeMove(7);
  assert.equal(result.extraTurn, true);
  assert.equal(game.currentPlayer, 2);
  assert.equal(getBoardOrientation({ mode: 'ai', currentPlayer: game.currentPlayer, humanPlayer: 1 }), 1);
});
