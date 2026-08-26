import { storeFor } from '../core/game.js';

export function createAiResignationState() {
  return { hopelessDetected: false, movesUntilResign: null };
}

export function isValidAiResignationState(value) {
  return Boolean(value && typeof value.hopelessDetected === 'boolean'
    && (value.hopelessDetected
      ? Number.isInteger(value.movesUntilResign) && value.movesUntilResign >= 1 && value.movesUntilResign <= 4
      : value.movesUntilResign === null));
}

export function getAiMaximumPossible(board, aiPlayer) {
  const remaining = board.reduce((total, stones, index) => index === 6 || index === 13 ? total : total + stones, 0);
  return board[storeFor(aiPlayer)] + remaining;
}

export function isAiMathematicallyHopeless(board, humanPlayer, aiPlayer) {
  return getAiMaximumPossible(board, aiPlayer) < board[storeFor(humanPlayer)];
}

export function chooseResignationCountdown(random = Math.random) {
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
  return Math.floor(normalized * 4) + 1;
}

export class AiResignationController {
  constructor({ random = Math.random } = {}) {
    this.random = random;
  }

  observe(match, game) {
    if (!match || match.mode !== 'ai' || !game || game.gameOver) return false;
    match.aiResignation ??= createAiResignationState();
    if (match.aiResignation.hopelessDetected) return false;
    if (!isAiMathematicallyHopeless(game.board, match.humanPlayer, match.aiPlayer)) return false;
    match.aiResignation.hopelessDetected = true;
    match.aiResignation.movesUntilResign = chooseResignationCountdown(this.random);
    return true;
  }

  shouldResignBeforeMove(match, game) {
    if (!match || match.mode !== 'ai' || !game || game.gameOver || game.currentPlayer !== match.aiPlayer) return false;
    this.observe(match, game);
    const state = match.aiResignation;
    if (!state?.hopelessDetected) return false;
    state.movesUntilResign -= 1;
    return state.movesUntilResign === 0;
  }

  resign(match, game) {
    if (!match || match.mode !== 'ai' || !game || game.gameOver) return null;
    return game.resign(match.aiPlayer);
  }
}
