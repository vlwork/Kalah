import { opponentStoreFor } from '../core/game.js';

export const SOW_STEP_MS = 150;
export const MAX_SOW_ANIMATION_MS = 1800;

export function getSowStepDelay(stoneCount) {
  return Math.min(SOW_STEP_MS, Math.floor(MAX_SOW_ANIMATION_MS / Math.max(1, stoneCount)));
}

/** Returns only the visual sow path; the Game Engine remains authoritative. */
export function getSowPath(pit, stoneCount, player) {
  const path = [];
  let cursor = pit;
  while (path.length < stoneCount) {
    cursor = (cursor + 1) % 14;
    if (cursor === opponentStoreFor(player)) continue;
    path.push(cursor);
  }
  return path;
}
