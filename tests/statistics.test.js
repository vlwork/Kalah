import test from 'node:test';
import assert from 'node:assert/strict';
import { KalahGame } from '../js/core/game.js';
import { aggregateHistory, createMatchStatistics, finaliseMatch, makeHistoryEntry, recordMove } from '../js/statistics/statistics.js';

test('statistics count sowing, capture, store finish and extra turn', () => {
  const stats = createMatchStatistics();
  recordMove(stats, { success:true, player:1, captureOccurred:true, capturedStones:5, finishedInOwnStore:true, extraTurn:true });
  recordMove(stats, { success:true, player:1, captureOccurred:false, capturedStones:0, finishedInOwnStore:false, extraTurn:false });
  assert.deepEqual(stats.players[1], { moves:2, captures:1, capturedStones:5, storeFinishes:1, extraTurns:1, maxCapture:5, extraTurnStreak:0, maxExtraTurnStreak:1, finalStore:0 });
});

test('completed PvP/PvAI entries retain reason, difficulty and name provenance', () => {
  const game = new KalahGame(); game.resign(1);
  const stats = finaliseMatch(createMatchStatistics(), game);
  const entry = makeHistoryEntry({ matchId:'a', mode:'ai', player1:'Игрок 1', player2:'AI', player1IsDefault:true, player2IsSystemAI:true, aiDifficulty:'hard' }, game, stats);
  assert.equal(entry.endReason, 'resign'); assert.equal(entry.aiDifficulty, 'hard'); assert.equal(entry.player1IsDefault, true); assert.equal(entry.player2IsSystemAI, true);
  const total = aggregateHistory([entry]); assert.equal(total.games, 1); assert.equal(total.losses, 1); assert.equal(total.byDifficulty.hard.games, 1);
});

test('history retains custom player names verbatim', () => {
  const game = new KalahGame(); game.resign(2);
  const entry = makeHistoryEntry({ matchId:'custom-names', mode:'pvp', player1:'Иван', player2:'Anna', player1IsDefault:false, player2IsDefault:false, aiDifficulty:null }, game, finaliseMatch(createMatchStatistics(), game));
  assert.deepEqual([entry.player1, entry.player2, entry.player1IsDefault, entry.player2IsDefault], ['Иван', 'Anna', false, false]);
});

test('extended statistics count independent moves, capture maxima, and extra-turn streaks', () => {
  const stats = createMatchStatistics();
  recordMove(stats, { success:true, player:1, captureOccurred:true, capturedStones:4, finishedInOwnStore:true, extraTurn:true });
  recordMove(stats, { success:true, player:1, captureOccurred:false, capturedStones:0, finishedInOwnStore:true, extraTurn:true });
  recordMove(stats, { success:true, player:1, captureOccurred:true, capturedStones:7, finishedInOwnStore:false, extraTurn:false });
  recordMove(stats, { success:true, player:2, captureOccurred:true, capturedStones:3, finishedInOwnStore:false, extraTurn:false });
  const game = new KalahGame(); game.resign(2); finaliseMatch(stats, game);
  assert.deepEqual(stats.players[1], { moves:3, captures:2, capturedStones:11, storeFinishes:2, extraTurns:2, maxCapture:7, maxExtraTurnStreak:2, finalStore:0 });
  assert.deepEqual(stats.players[2], { moves:1, captures:1, capturedStones:3, storeFinishes:0, extraTurns:0, maxCapture:3, maxExtraTurnStreak:0, finalStore:0 });
});

test('aggregate history has stable zero values and separates every PvAI difficulty', () => {
  assert.deepEqual(aggregateHistory([]), { games:0, wins:0, losses:0, draws:0, averageMoves:0, averageCaptures:0, averageCapturedStones:0, averageStoreFinishes:0, largestCapture:0, maxExtraTurnStreak:0, byDifficulty:{}, winRate:0 });
  const stats = finaliseMatch(createMatchStatistics(), new KalahGame());
  const history = [
    { ...makeHistoryEntry({ matchId:'hard', mode:'ai', player1:'John', player2:'AI', aiDifficulty:'hard' }, new KalahGame(), stats), winner:1 },
    { ...makeHistoryEntry({ matchId:'easy', mode:'ai', player1:'Anna', player2:'AI', aiDifficulty:'easy' }, new KalahGame(), stats), winner:2 },
    { ...makeHistoryEntry({ matchId:'advanced', mode:'ai', player1:'Иван', player2:'AI', aiDifficulty:'advanced' }, new KalahGame(), stats), winner:0 },
  ];
  const totals = aggregateHistory(history);
  assert.deepEqual([totals.games, totals.wins, totals.losses, totals.draws, totals.winRate], [3, 1, 1, 1, 33]);
  assert.deepEqual(Object.keys(totals.byDifficulty).sort(), ['advanced', 'easy', 'hard']);
  assert.ok(Object.values(totals).filter((value) => typeof value === 'number').every(Number.isFinite));
});
