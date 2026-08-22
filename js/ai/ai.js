import { opponentOf, storeFor } from '../core/game.js';

export const AI_DIFFICULTIES = ['random', 'easy', 'hard', 'advanced'];
const score = (game, player) => game.board[storeFor(player)] - game.board[storeFor(opponentOf(player))];
function immediateValue(game, move, player) {
  const trial = game.clone(); const result = trial.makeMove(move);
  return { move, result, trial, value: result.gameOver ? (result.winner === player ? 100000 : result.winner === 0 ? 0 : -100000) : score(trial, player) * 10 + (result.extraTurn ? 45 : 0) + result.capturedStones * 8 };
}

export function chooseMove(game, difficulty = 'random', rng = Math.random) {
  if (game.gameOver) return null;
  const moves = game.getLegalMoves();
  if (!moves.length) return null;
  if (difficulty === 'random') return moves[Math.floor(rng() * moves.length)];
  if (difficulty === 'easy') {
    const choices = moves.map((move) => immediateValue(game, move, game.currentPlayer));
    const best = Math.max(...choices.map((choice) => choice.value));
    const tied = choices.filter((choice) => choice.value === best);
    return tied[Math.floor(rng() * tied.length)].move;
  }
  const depth = difficulty === 'advanced' ? 4 : 3;
  return searchBest(game, depth, difficulty === 'advanced').move;
}

/** Alpha-beta works on cloned Engine states; an extra turn retains the same maximizing side. */
function searchBest(game, depth, defensive) {
  const player = game.currentPlayer;
  let best = { move: null, value: -Infinity };
  for (const move of orderedMoves(game)) {
    const trial = game.clone(); trial.makeMove(move);
    const value = minimax(trial, depth - 1, -Infinity, Infinity, player, defensive);
    if (value > best.value) best = { move, value };
  }
  return best;
}
function minimax(game, depth, alpha, beta, root, defensive) {
  if (depth <= 0 || game.gameOver) return evaluate(game, root, defensive);
  const maximizing = game.currentPlayer === root;
  let value = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(game)) {
    const trial = game.clone(); trial.makeMove(move);
    const child = minimax(trial, depth - 1, alpha, beta, root, defensive);
    if (maximizing) { value = Math.max(value, child); alpha = Math.max(alpha, value); } else { value = Math.min(value, child); beta = Math.min(beta, value); }
    if (beta <= alpha) break;
  }
  return value;
}
function orderedMoves(game) { return game.getLegalMoves().sort((a, b) => immediateValue(game, b, game.currentPlayer).value - immediateValue(game, a, game.currentPlayer).value); }
function evaluate(game, player, defensive) {
  if (game.gameOver) return game.winner === player ? 100000 : game.winner === 0 ? 0 : -100000;
  const other = opponentOf(player); const ownPits = game.getLegalMoves(player).reduce((n, pit) => n + game.board[pit], 0);
  const opponentPits = game.getLegalMoves(other).reduce((n, pit) => n + game.board[pit], 0);
  let value = score(game, player) * 20 + (ownPits - opponentPits) * 1.5;
  // Assess each side from its own turn. This is a heuristic only, never a second ruleset.
  const threatsFor = (side) => { const position = game.clone(); position.currentPlayer = side; return position.getLegalMoves().map((move) => immediateValue(position, move, side).result); };
  const ownThreats = threatsFor(player); const otherThreats = threatsFor(other);
  value += ownThreats.reduce((sum, r) => sum + (r.capturedStones || 0) * 4 + (r.extraTurn ? 6 : 0), 0);
  if (defensive) value -= otherThreats.reduce((sum, r) => sum + (r.capturedStones || 0) * 5 + (r.extraTurn ? 10 : 0), 0);
  return value;
}
