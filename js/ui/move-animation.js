import { opponentStoreFor, storeFor } from '../core/game.js';

export const SOW_STEP_MS = 220;
export const MAX_SOW_ANIMATION_MS = 2900;
export const LANDING_SETTLE_MS = 80;
export const MIN_SOW_TRAVEL_MS = 90;
export const EXTRA_TURN_MESSAGE_MS = 1000;

const PICKUP_MS = 90;
const CAPTURE_MS = 280;
const COLLECTION_MS = 260;
const POST_MOVE_MS = 320;
const RESULT_MS = 680;

export function getEffectiveAnimationDuration(baseDuration, animationSpeed, minimum = 1) {
  const speed = Number.isFinite(animationSpeed) ? Math.min(2, Math.max(.25, animationSpeed)) : 1;
  return Math.max(minimum, Math.round(baseDuration / speed));
}

export function getSowStepDelay(stoneCount) {
  const steps = Math.max(1, stoneCount);
  const settle = getLandingSettleDelay(steps);
  const tierDelay = steps <= 8 ? SOW_STEP_MS : steps <= 12 ? 190 : steps <= 18 ? 160 : 130;
  return Math.max(1, Math.min(tierDelay, Math.floor(MAX_SOW_ANIMATION_MS / steps) - settle));
}

export function getLandingSettleDelay(stoneCount) {
  const steps = Math.max(1, stoneCount);
  if (steps <= 8) return LANDING_SETTLE_MS;
  if (steps <= 12) return 70;
  if (steps <= 18) return 55;
  return Math.max(8, Math.min(25, Math.floor(700 / steps)));
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

const defaultDelay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const noOp = () => {};

function safeCall(callback, ...parameters) {
  if (typeof callback === 'function') callback(...parameters);
}

/**
 * Presentation-only move sequencer. It receives snapshots from the Game Engine,
 * works exclusively on copies and never decides the result of a move.
 */
export class BoardAnimator {
  constructor({
    view,
    isGenerationCurrent = () => true,
    delay = defaultDelay,
    reducedMotion = () => false,
    getAnimationSettings = () => ({ animationEnabled: true, animationSpeed: 1 }),
  }) {
    this.view = view;
    this.isGenerationCurrent = isGenerationCurrent;
    this.delay = delay;
    this.reducedMotion = reducedMotion;
    this.getAnimationSettings = getAnimationSettings;
    this.runId = 0;
    this.active = false;
  }

  isActive() { return this.active; }

  cancel() {
    this.runId += 1;
    this.active = false;
    this.view.cleanup();
  }

  current(runId, generation) {
    return runId === this.runId && this.isGenerationCurrent(generation);
  }

  async wait(milliseconds, runId, generation) {
    await this.delay(milliseconds);
    return this.current(runId, generation);
  }

  captureTiming() {
    const settings = this.getAnimationSettings() ?? {};
    const enabled = typeof settings.animationEnabled === 'boolean' ? settings.animationEnabled : true;
    const speed = Number.isFinite(settings.animationSpeed) ? Math.min(2, Math.max(.25, settings.animationSpeed)) : 1;
    const systemReducedMotion = Boolean(this.reducedMotion());
    return Object.freeze({
      enabled,
      speed,
      systemReducedMotion,
      immediate: !enabled || systemReducedMotion,
      durationScale: 1 / speed,
    });
  }

  resolveTiming(timing) {
    return timing && typeof timing.immediate === 'boolean' ? timing : this.captureTiming();
  }

  duration(baseDuration, timing, minimum = 1) {
    return getEffectiveAnimationDuration(baseDuration, timing.speed, minimum);
  }

  async animateMove(plan) {
    const runId = ++this.runId;
    const { generation, before, source, path, orientation, result, finalBoard } = plan;
    const timing = this.captureTiming();
    // UI-only snapshot: the Engine has already produced finalBoard and is never
    // mutated while these intermediate landing states are presented.
    const presentationBoard = [...before];
    const finalFrame = [...finalBoard];
    let shortened = false;
    let finalLandingEmitted = false;
    let captureEmitted = false;
    let canonicalRendered = false;
    this.active = true;
    this.view.cleanup({ preserveMessage: true });
    safeCall(this.view.setTimingScale?.bind(this.view), timing.durationScale);
    this.view.setBusy(true);
    const unsubscribe = this.view.subscribeResize(() => {
      if (!this.current(runId, generation)) return;
      shortened = true;
      this.view.clearTransient();
    });

    const emitFinalLanding = () => {
      if (finalLandingEmitted || path.length === 0) return;
      finalLandingEmitted = true;
      safeCall(plan.onLanding, path.length - 1, {
        ownStore: Boolean(result.finishedInOwnStore),
        aggregate: true,
      });
    };
    const emitCapture = () => {
      if (captureEmitted || !result.captureOccurred) return;
      captureEmitted = true;
      safeCall(plan.onCapture);
    };
    const renderCanonical = () => {
      if (canonicalRendered) return;
      canonicalRendered = true;
      safeCall(plan.onCanonicalRender);
    };
    const finishEarly = () => {
      if (!this.current(runId, generation)) return false;
      this.view.render(finalFrame, orientation, false);
      emitFinalLanding();
      emitCapture();
      renderCanonical();
      return true;
    };

    try {
      if (!this.current(runId, generation)) return { completed: false, shortened: false, timing };
      if (timing.immediate) {
        this.view.render(finalFrame, orientation, false);
        if (timing.systemReducedMotion && timing.enabled && path.length) {
          this.view.pulse(path[path.length - 1], result.finishedInOwnStore ? 'store' : 'landing', orientation);
        }
        emitFinalLanding();
        emitCapture();
        renderCanonical();
        return { completed: true, shortened: true, timing };
      }

      presentationBoard[source] = 0;
      this.view.render(presentationBoard, orientation, false);
      this.view.pickup(source, orientation);
      if (!await this.wait(this.duration(PICKUP_MS, timing), runId, generation)) return { completed: false, shortened, timing };
      if (shortened) return { completed: finishEarly(), shortened: true, timing };

      const stepDelay = this.duration(getSowStepDelay(path.length), timing, MIN_SOW_TRAVEL_MS);
      const settleDelay = this.duration(getLandingSettleDelay(path.length), timing);
      let previous = source;
      for (const [step, destination] of path.entries()) {
        const visualTravel = this.view.transfer(previous, destination, orientation, stepDelay, step);
        if (visualTravel && typeof visualTravel.then === 'function') {
          await visualTravel;
          if (!this.current(runId, generation)) return { completed: false, shortened, timing };
        } else if (!await this.wait(stepDelay, runId, generation)) return { completed: false, shortened, timing };
        if (shortened) return { completed: finishEarly(), shortened: true, timing };
        presentationBoard[destination] += 1;
        this.view.render(presentationBoard, orientation, false);
        const ownStoreLanding = destination === storeFor(result.player);
        this.view.pulse(destination, ownStoreLanding ? 'store' : 'landing', orientation, true);
        const finalStep = step === path.length - 1;
        if (finalStep) finalLandingEmitted = true;
        safeCall(plan.onLanding, step, {
          ownStore: Boolean(result.finishedInOwnStore && finalStep),
          aggregate: false,
        });
        if (!await this.wait(settleDelay, runId, generation)) return { completed: false, shortened, timing };
        if (shortened) return { completed: finishEarly(), shortened: true, timing };
        previous = destination;
      }

      if (result.captureOccurred) {
        const opposite = 12 - result.lastPit;
        this.view.highlightCapture(result.lastPit, opposite, orientation);
        const representatives = Math.min(3, Math.max(1, result.capturedStones));
        const captureDuration = this.duration(CAPTURE_MS, timing);
        this.view.transferGroup([result.lastPit, opposite], storeFor(result.player), orientation, captureDuration, representatives, 'capture');
        if (!await this.wait(captureDuration, runId, generation)) return { completed: false, shortened, timing };
        if (shortened) return { completed: finishEarly(), shortened: true, timing };
        const capturedFrame = [...presentationBoard];
        capturedFrame[result.lastPit] = 0;
        capturedFrame[opposite] = 0;
        capturedFrame[storeFor(result.player)] += result.capturedStones;
        presentationBoard.splice(0, presentationBoard.length, ...capturedFrame);
        this.view.render(presentationBoard, orientation, false);
        this.view.pulse(storeFor(result.player), 'capture-store', orientation);
        emitCapture();
      }

      if (result.gameOver) {
        const sources = [];
        for (let pit = 0; pit < 14; pit += 1) {
          if (pit === 6 || pit === 13) continue;
          if (presentationBoard[pit] > 0 && finalFrame[pit] === 0) sources.push(pit);
        }
        if (sources.length) {
          const collectionDuration = this.duration(COLLECTION_MS, timing);
          this.view.collect(sources, orientation, collectionDuration, Math.min(4, sources.length));
          if (!await this.wait(collectionDuration, runId, generation)) return { completed: false, shortened, timing };
          if (shortened) return { completed: finishEarly(), shortened: true, timing };
        }
      }

      this.view.render(finalFrame, orientation, false);
      renderCanonical();
      return { completed: true, shortened: false, timing };
    } finally {
      unsubscribe();
      if (runId === this.runId) {
        this.active = false;
        this.view.setBusy(false);
        this.view.clearTransient();
      }
    }
  }

  async animatePostMove({ generation, type, label = '', onTransition = noOp, timing: capturedTiming }) {
    const runId = ++this.runId;
    const timing = this.resolveTiming(capturedTiming);
    this.active = true;
    safeCall(this.view.setTimingScale?.bind(this.view), timing.durationScale);
    this.view.setBusy(true);
    try {
      if (!this.current(runId, generation)) return false;
      onTransition();
      if (!this.current(runId, generation)) return false;
      if (type === 'extra-turn') this.view.showMessage(label, type, EXTRA_TURN_MESSAGE_MS);
      if (timing.immediate) return true;
      this.view.transitionTurn(type);
      const duration = type === 'extra-turn' ? POST_MOVE_MS + 180 : POST_MOVE_MS;
      return await this.wait(this.duration(duration, timing), runId, generation);
    } finally {
      if (runId === this.runId) {
        this.active = false;
        this.view.setBusy(false);
        this.view.clearTurnTransition();
      }
    }
  }

  async animateResult({ generation, kind, onStart = noOp, timing: capturedTiming }) {
    const runId = ++this.runId;
    const timing = this.resolveTiming(capturedTiming);
    this.active = true;
    safeCall(this.view.setTimingScale?.bind(this.view), timing.durationScale);
    this.view.setBusy(true);
    try {
      if (!this.current(runId, generation)) return false;
      onStart();
      if (!this.current(runId, generation)) return false;
      if (timing.immediate) return true;
      this.view.showResult(kind);
      return await this.wait(this.duration(RESULT_MS, timing), runId, generation);
    } finally {
      if (runId === this.runId) {
        this.active = false;
        this.view.setBusy(false);
        this.view.clearTransient();
      }
    }
  }
}

/** DOM implementation kept separate so orchestration can be tested without a browser. */
export class DomBoardAnimationView {
  constructor({
    boardElement,
    statusElement,
    resolveTarget,
    renderFrame,
    documentRoot = document,
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
  }) {
    this.boardElement = boardElement;
    this.statusElement = statusElement;
    this.resolveTarget = resolveTarget;
    this.renderFrame = renderFrame;
    this.documentRoot = documentRoot;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.overlay = null;
    this.resultOverlay = null;
    this.message = null;
    this.messageTimer = null;
    this.activeFlights = new Set();
    this.timingScale = 1;
  }

  render(board, orientation, allowOrientationTransition) {
    this.renderFrame(board, orientation, allowOrientationTransition);
  }

  setBusy(busy) {
    this.boardElement.classList.toggle('is-animating', busy);
    this.boardElement.setAttribute('aria-busy', String(busy));
  }

  setTimingScale(scale) {
    const value = Number.isFinite(scale) ? scale : 1;
    this.timingScale = value;
    const durationVariables = {
      '--orientation-duration': 180,
      '--pickup-duration': 180,
      '--landing-duration': 150,
      '--store-duration': 280,
      '--capture-source-duration': 280,
      '--capture-store-duration': 340,
      '--stone-entrance-duration': 130,
      '--status-extra-duration': 450,
      '--status-turn-duration': 280,
      '--result-duration': 680,
      '--result-particle-duration': 620,
      '--particle-delay-20': 20,
      '--particle-delay-40': 40,
      '--particle-delay-60': 60,
      '--particle-delay-80': 80,
      '--particle-delay-100': 100,
      '--particle-delay-120': 120,
    };
    for (const target of [this.boardElement, this.statusElement]) {
      for (const [property, milliseconds] of Object.entries(durationVariables)) {
        target.style.setProperty(property, `${Math.max(1, Math.round(milliseconds * value))}ms`);
      }
    }
  }

  subscribeResize(callback) {
    window.addEventListener('resize', callback, { passive: true });
    return () => window.removeEventListener('resize', callback);
  }

  pickup(index, orientation) { this.addPulse(index, 'pickup-pulse', orientation); }
  pulse(index, kind, orientation, markNewStone = false) {
    this.addPulse(index, `${kind}-pulse`, orientation);
    if (markNewStone) this.markLandedStone(index, orientation);
  }

  highlightCapture(landing, opposite, orientation) {
    this.addPulse(landing, 'capture-source', orientation);
    this.addPulse(opposite, 'capture-source', orientation);
  }

  transfer(from, to, orientation, duration, tone) {
    this.clearMovingStones();
    return this.createMovingStone(from, to, orientation, duration, tone, 'sow');
  }

  transferGroup(sources, destination, orientation, duration, count, kind) {
    this.clearEffectStones();
    for (let index = 0; index < count; index += 1) {
      const delay = Math.round(index * 24 * this.timingScale);
      this.createMovingStone(sources[index % sources.length], destination, orientation, duration, index, kind, delay);
    }
  }

  collect(sources, orientation, duration, count) {
    this.clearEffectStones();
    for (let index = 0; index < count; index += 1) {
      const source = sources[index % sources.length];
      const destination = source < 6 ? 6 : 13;
      const delay = Math.round(index * 22 * this.timingScale);
      this.createMovingStone(source, destination, orientation, duration, index, 'collection', delay);
    }
  }

  transitionTurn(type) {
    const className = type === 'extra-turn' ? 'extra-turn-pulse' : 'turn-transition-pulse';
    this.statusElement.classList.remove(className);
    void this.statusElement.offsetWidth;
    this.statusElement.classList.add(className);
  }

  showMessage(label, type, duration = EXTRA_TURN_MESSAGE_MS) {
    this.clearMessage();
    const message = this.documentRoot.createElement('div');
    message.className = `animation-message ${type}`;
    message.textContent = label;
    message.setAttribute('aria-hidden', 'true');
    this.boardElement.append(message);
    this.message = message;
    this.messageTimer = this.setTimer(() => {
      if (this.message !== message) return;
      message.remove();
      this.message = null;
      this.messageTimer = null;
    }, duration);
  }

  clearMessage() {
    if (this.messageTimer !== null) this.clearTimer(this.messageTimer);
    this.messageTimer = null;
    this.message?.remove();
    this.message = null;
    this.clearTurnTransition();
  }

  clearTurnTransition() {
    this.statusElement.classList.remove('extra-turn-pulse', 'turn-transition-pulse');
  }

  showResult(kind) {
    this.clearTransient();
    this.boardElement.classList.remove('result-victory', 'result-defeat', 'result-draw', 'result-neutral');
    this.boardElement.classList.add(`result-${kind}`);
    if (kind !== 'victory') return;
    const overlay = this.ensureResultOverlay();
    for (let index = 0; index < 6; index += 1) {
      const particle = this.documentRoot.createElement('span');
      particle.className = `result-particle tone-${index}`;
      overlay.append(particle);
    }
  }

  addPulse(index, className, orientation) {
    const target = this.resolveTarget(index, orientation);
    if (!target) return;
    target.classList.remove(className);
    void target.offsetWidth;
    target.classList.add(className);
    target.addEventListener('animationend', () => target.classList.remove(className), { once: true });
  }

  markLandedStone(index, orientation) {
    const target = this.resolveTarget(index, orientation);
    const stones = target?.querySelectorAll?.('.seed');
    const stone = stones?.[stones.length - 1];
    if (!stone) return;
    stone.classList.add('stone--just-landed');
    stone.addEventListener('animationend', () => stone.classList.remove('stone--just-landed'), { once: true });
  }

  ensureOverlay() {
    if (this.overlay?.isConnected) return this.overlay;
    const overlay = this.documentRoot.createElement('div');
    overlay.className = 'board-animation-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    this.documentRoot.body.append(overlay);
    this.overlay = overlay;
    return overlay;
  }

  ensureResultOverlay() {
    if (this.resultOverlay?.isConnected) return this.resultOverlay;
    const overlay = this.documentRoot.createElement('div');
    overlay.className = 'animation-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    this.boardElement.append(overlay);
    this.resultOverlay = overlay;
    return overlay;
  }

  createMovingStone(from, to, orientation, duration, tone, kind, delay = 0) {
    const source = this.resolveTarget(from, orientation);
    const destination = this.resolveTarget(to, orientation);
    if (!source || !destination) return kind === 'sow' ? Promise.resolve(false) : undefined;
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    const boardRect = kind === 'sow' ? null : this.boardElement.getBoundingClientRect();
    const offsetX = boardRect?.left ?? 0;
    const offsetY = boardRect?.top ?? 0;
    const startX = sourceRect.left + sourceRect.width / 2 - offsetX;
    const startY = sourceRect.top + sourceRect.height / 2 - offsetY;
    const endX = destinationRect.left + destinationRect.width / 2 - offsetX;
    const endY = destinationRect.top + destinationRect.height / 2 - offsetY;
    const validGeometry = sourceRect.width > 0 && sourceRect.height > 0
      && destinationRect.width > 0 && destinationRect.height > 0
      && [startX, startY, endX, endY].every(Number.isFinite);
    if (!validGeometry) return kind === 'sow' ? Promise.resolve(false) : undefined;
    const stone = this.documentRoot.createElement('span');
    stone.className = `moving-stone moving-${kind} tone-${tone % 6}`;
    stone.style.left = `${startX}px`;
    stone.style.top = `${startY}px`;
    stone.style.setProperty('--move-x', `${endX - startX}px`);
    stone.style.setProperty('--move-y', `${endY - startY}px`);
    stone.style.setProperty('--move-duration', `${duration}ms`);
    stone.style.setProperty('--move-delay', `${delay}ms`);
    const overlay = kind === 'sow' ? this.ensureOverlay() : this.ensureResultOverlay();
    overlay.append(stone);
    if (!overlay.isConnected || !stone.isConnected) return kind === 'sow' ? Promise.resolve(false) : undefined;
    if (kind !== 'sow') {
      this.requestFrame(() => stone.classList.add('in-flight'));
      return undefined;
    }
    return this.startSowFlight(stone, duration);
  }

  startSowFlight(stone, duration) {
    return new Promise((resolve) => {
      let firstFrame = null;
      let secondFrame = null;
      let fallback = null;
      let complete = false;
      const finish = (arrived) => {
        if (complete) return;
        complete = true;
        if (firstFrame !== null) this.cancelFrame(firstFrame);
        if (secondFrame !== null) this.cancelFrame(secondFrame);
        if (fallback !== null) this.clearTimer(fallback);
        stone.removeEventListener('transitionend', onTransitionEnd);
        stone.remove();
        this.activeFlights.delete(cancel);
        resolve(arrived);
      };
      const cancel = () => finish(false);
      const onTransitionEnd = (event) => {
        if (event.target === stone && event.propertyName === 'transform') finish(true);
      };
      stone.addEventListener('transitionend', onTransitionEnd);
      this.activeFlights.add(cancel);
      firstFrame = this.requestFrame(() => {
        firstFrame = null;
        secondFrame = this.requestFrame(() => {
          secondFrame = null;
          if (!stone.isConnected) { finish(false); return; }
          stone.classList.add('in-flight');
          fallback = this.setTimer(() => finish(true), duration + 120);
        });
      });
    });
  }

  clearMovingStones() {
    [...this.activeFlights].forEach((cancel) => cancel());
    this.overlay?.replaceChildren();
  }

  clearEffectStones() {
    this.resultOverlay?.replaceChildren();
  }

  clearTransient() {
    this.clearMovingStones();
    this.overlay?.remove();
    this.overlay = null;
    this.resultOverlay?.remove();
    this.resultOverlay = null;
  }

  cleanup({ preserveMessage = false } = {}) {
    this.clearTransient();
    if (!preserveMessage) this.clearMessage();
    else this.clearTurnTransition();
    this.boardElement.classList.remove('is-animating', 'result-victory', 'result-defeat', 'result-draw', 'result-neutral');
    this.boardElement.setAttribute('aria-busy', 'false');
    this.boardElement.querySelectorAll('.pickup-pulse, .landing-pulse, .store-pulse, .capture-source, .capture-store-pulse, .stone--just-landed')
      .forEach((element) => element.classList.remove('pickup-pulse', 'landing-pulse', 'store-pulse', 'capture-source', 'capture-store-pulse', 'stone--just-landed'));
  }
}
