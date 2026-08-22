/**
 * Maps engine indices to screen positions without changing game state or rules.
 * The viewed player's Kalah is above their descending/ascending pit path.
 */
export function getBoardView(player) {
  if (player === 1) {
    return { topStore: 6, left: [5, 4, 3, 2, 1, 0], right: [7, 8, 9, 10, 11, 12], bottomStore: 13 };
  }
  if (player === 2) {
    return { topStore: 13, left: [12, 11, 10, 9, 8, 7], right: [0, 1, 2, 3, 4, 5], bottomStore: 6 };
  }
  throw new Error('Board orientation player must be 1 or 2');
}

/** PvP follows the player who can act; PvAI is fixed to the human role. */
export function getBoardOrientation({ mode, currentPlayer, humanPlayer = 1 }) {
  if (mode === 'ai') return humanPlayer;
  if (mode === 'pvp' && [1, 2].includes(currentPlayer)) return currentPlayer;
  throw new Error('Invalid match orientation state');
}
