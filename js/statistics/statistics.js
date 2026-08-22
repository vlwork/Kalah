import { storeFor } from '../core/game.js';

export function createMatchStatistics() {
  return { players: { 1: counters(), 2: counters() }, recorded: false };
}
function counters() { return { moves: 0, captures: 0, capturedStones: 0, storeFinishes: 0, extraTurns: 0, maxCapture: 0, extraTurnStreak: 0, maxExtraTurnStreak: 0, finalStore: 0 }; }

/** Update only from Engine move results, keeping UI and domain statistics decoupled. */
export function recordMove(stats, result) {
  if (!result.success) return stats;
  const entry = stats.players[result.player];
  entry.moves += 1;
  if (result.captureOccurred) { entry.captures += 1; entry.capturedStones += result.capturedStones; entry.maxCapture = Math.max(entry.maxCapture, result.capturedStones); }
  if (result.finishedInOwnStore) entry.storeFinishes += 1;
  if (result.extraTurn) { entry.extraTurns += 1; entry.extraTurnStreak += 1; entry.maxExtraTurnStreak = Math.max(entry.maxExtraTurnStreak, entry.extraTurnStreak); }
  else entry.extraTurnStreak = 0;
  return stats;
}
export function finaliseMatch(stats, game) {
  for (const player of [1, 2]) { stats.players[player].finalStore = game.board[storeFor(player)]; delete stats.players[player].extraTurnStreak; }
  return stats;
}
export function validateStatistics(stats) {
  if (!stats || !stats.players || typeof stats.recorded !== 'boolean') return false;
  return [1, 2].every((player) => Object.values(stats.players[player] || {}).every((value) => Number.isInteger(value) && value >= 0));
}
export function makeHistoryEntry(match, game, stats) {
  return { matchId: match.matchId, completedAt: new Date().toISOString(), mode: match.mode, player1: match.player1, player2: match.player2, player1IsDefault: Boolean(match.player1IsDefault), player2IsDefault: Boolean(match.player2IsDefault), player2IsSystemAI: Boolean(match.player2IsSystemAI), aiDifficulty: match.aiDifficulty || null, startingPlayer: game.startingPlayer, winner: game.winner, draw: game.winner === 0, endReason: game.endReason, stores: [game.board[6], game.board[13]], players: structuredClone(stats.players) };
}
export function aggregateHistory(history) {
  const totals = { games: history.length, wins: 0, losses: 0, draws: 0, averageMoves: 0, averageCaptures: 0, averageCapturedStones: 0, averageStoreFinishes: 0, largestCapture: 0, maxExtraTurnStreak: 0, byDifficulty: {} };
  for (const item of history) {
    if (item.winner === 0) totals.draws += 1; else if (item.winner === 1) totals.wins += 1; else totals.losses += 1;
    for (const player of [1, 2]) { const p = item.players[player]; totals.averageMoves += p.moves; totals.averageCaptures += p.captures; totals.averageCapturedStones += p.capturedStones; totals.averageStoreFinishes += p.storeFinishes; totals.largestCapture = Math.max(totals.largestCapture, p.maxCapture); totals.maxExtraTurnStreak = Math.max(totals.maxExtraTurnStreak, p.maxExtraTurnStreak); }
    if (item.aiDifficulty) { const bucket = totals.byDifficulty[item.aiDifficulty] ||= { games: 0, wins: 0, losses: 0, draws: 0 }; bucket.games += 1; if (item.winner === 0) bucket.draws += 1; else if (item.winner === 1) bucket.wins += 1; else bucket.losses += 1; }
  }
  const divisor = Math.max(1, history.length * 2); for (const key of ['averageMoves', 'averageCaptures', 'averageCapturedStones', 'averageStoreFinishes']) totals[key] = Math.round(totals[key] / divisor * 10) / 10;
  totals.winRate = totals.games ? Math.round(totals.wins / totals.games * 100) : 0;
  return totals;
}
