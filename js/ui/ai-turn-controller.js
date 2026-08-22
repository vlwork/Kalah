export const AI_THINK_DELAY_MS = 420;

/**
 * Owns the asynchronous AI lifecycle. Cancellation is backed by a generation
 * token, so even a callback already queued by the event loop cannot mutate a
 * restored or replaced match.
 */
export class AiTurnController {
  constructor({
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (handle) => clearTimeout(handle),
    delay = AI_THINK_DELAY_MS,
    getSessionId,
    canRun,
    runTurn,
  }) {
    this.scheduleCallback = schedule;
    this.cancelCallback = cancel;
    this.delay = delay;
    this.getSessionId = getSessionId;
    this.canRun = canRun;
    this.runTurn = runTurn;
    this.generation = 0;
    this.pending = null;
  }

  schedule() {
    if (this.pending !== null || !this.canRun()) return false;
    const generation = this.generation;
    const sessionId = this.getSessionId();
    this.pending = this.scheduleCallback(() => {
      if (generation !== this.generation || sessionId !== this.getSessionId()) return;
      this.pending = null;
      if (!this.canRun()) return;
      this.runTurn({ generation, sessionId });
    }, this.delay);
    return true;
  }

  invalidate() {
    this.generation += 1;
    if (this.pending !== null) this.cancelCallback(this.pending);
    this.pending = null;
  }
}
