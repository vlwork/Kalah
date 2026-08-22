/** Platform-independent Kalah rules for the fixed 6-stone 1.0 variant. */
export const PITS_PER_PLAYER = 6;
export const STONES_PER_PIT = 6;
export const TOTAL_STONES = PITS_PER_PLAYER * STONES_PER_PIT * 2;
export const BOARD_SIZE = 14;
export const PLAYER_ONE_STORE = 6;
export const PLAYER_TWO_STORE = 13;

const ownRange = (player) => player === 1 ? [0, 5] : [7, 12];
export const storeFor = (player) => player === 1 ? PLAYER_ONE_STORE : PLAYER_TWO_STORE;
export const opponentStoreFor = (player) => player === 1 ? PLAYER_TWO_STORE : PLAYER_ONE_STORE;
export const opponentOf = (player) => player === 1 ? 2 : 1;
export const isPitFor = (pit, player) => {
  const [first, last] = ownRange(player);
  return Number.isInteger(pit) && pit >= first && pit <= last;
};
export const oppositePit = (pit) => 12 - pit;
export const createInitialBoard = () => [6, 6, 6, 6, 6, 6, 0, 6, 6, 6, 6, 6, 6, 0];

function validBoard(board) {
  return Array.isArray(board) && board.length === BOARD_SIZE
    && board.every((value) => Number.isInteger(value) && value >= 0)
    && board.reduce((sum, value) => sum + value, 0) === TOTAL_STONES;
}

/** A state object is deliberately plain so it can be persisted and ported easily. */
export class KalahGame {
  constructor(options = {}) {
    const startingPlayer = options.startingPlayer === 2 ? 2 : 1;
    this.board = options.board ? [...options.board] : createInitialBoard();
    this.currentPlayer = options.currentPlayer === 2 ? 2 : startingPlayer;
    this.startingPlayer = startingPlayer;
    this.openingRestriction = Boolean(options.openingRestriction);
    this.firstMoveCompleted = Boolean(options.firstMoveCompleted);
    this.gameOver = Boolean(options.gameOver);
    this.winner = options.winner ?? null;
    this.endReason = options.endReason ?? null;
    if (!validBoard(this.board)) throw new Error('Invalid Kalah board');
  }

  getLegalMoves(player = this.currentPlayer) {
    if (this.gameOver || ![1, 2].includes(player)) return [];
    const [first, last] = ownRange(player);
    return Array.from({ length: PITS_PER_PLAYER }, (_, i) => first + i).filter((pit) => this.board[pit] > 0)
      .filter((pit) => !(this.openingRestriction && !this.firstMoveCompleted && player === this.startingPlayer && pit === (player === 1 ? 0 : 7)));
  }

  makeMove(pit) {
    const player = this.currentPlayer;
    if (this.gameOver) return this.failure('GAME_OVER', pit);
    if (!Number.isInteger(pit) || pit < 0 || pit >= BOARD_SIZE) return this.failure('INVALID_PIT', pit);
    if (!isPitFor(pit, player)) return this.failure('NOT_OWN_PIT', pit);
    if (this.board[pit] === 0) return this.failure('EMPTY_PIT', pit);
    if (this.openingRestriction && !this.firstMoveCompleted && player === this.startingPlayer && pit === (player === 1 ? 0 : 7)) {
      return this.failure('OPENING_MOVE_FORBIDDEN', pit);
    }

    // Sow one stone at a time; an opponent's store is skipped even on later laps.
    let stones = this.board[pit];
    this.board[pit] = 0;
    let cursor = pit;
    while (stones > 0) {
      cursor = (cursor + 1) % BOARD_SIZE;
      if (cursor === opponentStoreFor(player)) continue;
      this.board[cursor] += 1;
      stones -= 1;
    }

    const finishedInOwnStore = cursor === storeFor(player);
    let captureOccurred = false;
    let capturedStones = 0;
    // A landing pit containing exactly one was empty immediately before its final stone.
    if (isPitFor(cursor, player) && this.board[cursor] === 1 && this.board[oppositePit(cursor)] > 0) {
      capturedStones = this.board[cursor] + this.board[oppositePit(cursor)];
      this.board[storeFor(player)] += capturedStones;
      this.board[cursor] = 0;
      this.board[oppositePit(cursor)] = 0;
      captureOccurred = true;
    }
    this.firstMoveCompleted = true;
    const ended = this.finishIfEmptySide();
    const extraTurn = finishedInOwnStore && !ended;
    if (!extraTurn && !ended) this.currentPlayer = opponentOf(player);
    return {
      success: true, player, pit, lastPit: cursor, extraTurn, finishedInOwnStore,
      captureOccurred, capturedStones, gameOver: this.gameOver, winner: this.winner, endReason: this.endReason,
    };
  }

  finishIfEmptySide() {
    const oneEmpty = this.board.slice(0, 6).every((value) => value === 0);
    const twoEmpty = this.board.slice(7, 13).every((value) => value === 0);
    if (!oneEmpty && !twoEmpty) return false;
    if (!oneEmpty) this.collectSide(1);
    if (!twoEmpty) this.collectSide(2);
    this.gameOver = true;
    this.endReason = 'emptySide';
    this.winner = this.board[PLAYER_ONE_STORE] === this.board[PLAYER_TWO_STORE] ? 0
      : this.board[PLAYER_ONE_STORE] > this.board[PLAYER_TWO_STORE] ? 1 : 2;
    return true;
  }

  collectSide(player) {
    const [first, last] = ownRange(player);
    let stones = 0;
    for (let pit = first; pit <= last; pit += 1) { stones += this.board[pit]; this.board[pit] = 0; }
    this.board[storeFor(player)] += stones;
  }

  resign(player = this.currentPlayer) {
    if (this.gameOver) return this.failure('GAME_OVER', null);
    if (![1, 2].includes(player)) return this.failure('INVALID_PLAYER', null);
    this.gameOver = true;
    this.endReason = 'resign';
    this.winner = opponentOf(player);
    return { success: true, player, gameOver: true, winner: this.winner, endReason: 'resign' };
  }

  failure(reason, pit) { return { success: false, reason, player: this.currentPlayer, pit, gameOver: this.gameOver }; }
  clone() { return KalahGame.fromJSON(this.toJSON()); }
  toJSON() { return { schemaVersion: 1, board: [...this.board], currentPlayer: this.currentPlayer, startingPlayer: this.startingPlayer, openingRestriction: this.openingRestriction, firstMoveCompleted: this.firstMoveCompleted, gameOver: this.gameOver, winner: this.winner, endReason: this.endReason }; }
  static fromJSON(value) {
    if (!value || value.schemaVersion !== 1 || !validBoard(value.board) || ![1, 2].includes(value.currentPlayer) || ![1, 2].includes(value.startingPlayer)
      || typeof value.openingRestriction !== 'boolean' || typeof value.firstMoveCompleted !== 'boolean' || typeof value.gameOver !== 'boolean'
      || ![null, 0, 1, 2].includes(value.winner) || ![null, 'emptySide', 'resign'].includes(value.endReason)) throw new Error('Invalid game save');
    if (value.gameOver !== Boolean(value.endReason) || (value.gameOver && value.winner === null)) throw new Error('Invalid finished game');
    return new KalahGame(value);
  }
}
