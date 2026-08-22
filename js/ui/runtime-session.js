import { KalahGame } from '../core/game.js';
import { validateSave } from '../storage/storage.js';

/**
 * Builds every runtime object before the controller swaps any live reference.
 * Validation also returns a deep clone, so the stored snapshot can never become
 * the mutable board, match, or statistics object used by a running game.
 */
export function restoreRuntimeSnapshot(save) {
  const snapshot = validateSave(save);
  if (!snapshot) throw new Error('Invalid save snapshot');
  return {
    game: KalahGame.fromJSON(snapshot.game),
    match: structuredClone(snapshot.match),
    statistics: structuredClone(snapshot.statistics),
  };
}

/** Shared generation guard for asynchronous animation and atomic replacement. */
export class RuntimeLifecycle {
  constructor() { this.generation = 0; this.loading = false; }
  capture() { return this.generation; }
  isCurrent(generation) { return !this.loading && generation === this.generation; }
  beginReplacement() { this.generation += 1; this.loading = true; return this.generation; }
  finishReplacement() { this.loading = false; }
}
