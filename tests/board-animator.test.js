import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardAnimator, DomBoardAnimationView, EXTRA_TURN_MESSAGE_MS, getSowPath } from '../js/ui/move-animation.js';

class FakeView {
  constructor() {
    this.events = [];
    this.transients = 0;
    this.resize = null;
  }

  cleanup() { this.events.push(['cleanup']); this.transients = 0; }
  setTimingScale(value) { this.events.push(['timing', value]); }
  setBusy(value) { this.events.push(['busy', value]); }
  subscribeResize(callback) { this.resize = callback; return () => { this.resize = null; }; }
  render(board, orientation, transition) { this.events.push(['render', [...board], orientation, transition]); }
  pickup(index) { this.events.push(['pickup', index]); }
  pulse(index, kind) { this.events.push(['pulse', index, kind]); }
  transfer(from, to, orientation, duration) { this.transients = 1; this.events.push(['transfer', from, to, duration]); }
  highlightCapture(landing, opposite) { this.events.push(['highlight', landing, opposite]); }
  transferGroup(sources, destination, orientation, duration, count, kind) {
    this.transients = count;
    this.events.push(['group', [...sources], destination, count, kind, duration]);
  }
  collect(sources, orientation, duration, count) { this.transients = count; this.events.push(['collect', [...sources], count, duration]); }
  clearTransient() { this.transients = 0; this.events.push(['clear']); }
  showMessage(label, type, duration) { this.events.push(['message', label, type, duration]); }
  clearMessage() { this.events.push(['clear-message']); }
  clearTurnTransition() { this.events.push(['clear-transition']); }
  transitionTurn(type) { this.events.push(['transition', type]); }
  showResult(kind) { this.events.push(['result', kind]); }
}

const immediate = async () => {};
const baseBefore = [0, 3, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1];

function createAnimator(options = {}) {
  const view = options.view ?? new FakeView();
  const animator = new BoardAnimator({
    view,
    delay: options.delay ?? immediate,
    reducedMotion: options.reducedMotion ?? (() => false),
    getAnimationSettings: options.getAnimationSettings ?? (() => ({ animationEnabled: true, animationSpeed: 1 })),
    isGenerationCurrent: options.isGenerationCurrent ?? (() => true),
  });
  return { animator, view };
}

function movePlan(overrides = {}) {
  return {
    generation: 1,
    before: baseBefore,
    source: 1,
    path: [2, 3, 4],
    orientation: 1,
    result: {
      player: 1,
      lastPit: 4,
      finishedInOwnStore: false,
      captureOccurred: false,
      capturedStones: 0,
      extraTurn: false,
      gameOver: false,
    },
    finalBoard: [0, 0, 1, 1, 1, 0, 2, 4, 0, 0, 0, 0, 0, 1],
    ...overrides,
  };
}

function deferredScheduler() {
  const gates = [];
  return {
    delay: () => new Promise((resolve) => gates.push(resolve)),
    async advance() {
      assert.ok(gates.length, 'an animation delay should be pending');
      gates.shift()();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test('sow animation follows the exact engine path with one transfer, pulse, and audio callback per landing', async () => {
  const { animator, view } = createAnimator();
  const landings = [];
  const plan = movePlan({ onLanding: (step, details) => landings.push([step, details]) });
  const outcome = await animator.animateMove(plan);

  assert.equal(outcome.completed, true);
  assert.deepEqual(view.events.filter(([type]) => type === 'transfer').map(([, from, to]) => [from, to]), [[1, 2], [2, 3], [3, 4]]);
  assert.ok(view.events.filter(([type]) => type === 'transfer').every((event) => event[3] === 220));
  assert.deepEqual(view.events.filter(([type, , kind]) => type === 'pulse' && kind === 'landing').map(([, pit]) => pit), [2, 3, 4]);
  assert.deepEqual(landings.map(([step]) => step), [0, 1, 2]);
  assert.ok(landings.every(([, details]) => details.aggregate === false));
  assert.equal(view.transients, 0);
});

test('presentation counters advance one destination at a time only after each injected arrival', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  const order = view.events;
  const plan = movePlan({
    onLanding: (step) => order.push(['audio', step]),
    onCanonicalRender: () => order.push(['canonical']),
  });
  const move = animator.animateMove(plan);

  const frames = () => order.filter(([type]) => type === 'render').map((event) => event[1]);
  assert.deepEqual(frames(), [[0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1]]);

  await scheduler.advance();
  assert.equal(frames().length, 1, 'the first destination must not change while its stone travels');
  assert.equal(frames()[0][2], 0);
  assert.equal(frames()[0][3], 0);

  await scheduler.advance();
  assert.equal(frames().length, 2);
  assert.equal(frames()[1][2], 1);
  assert.equal(frames()[1][3], 0, 'the second destination must retain its old count');
  assert.equal(frames()[1].filter((value, index) => value !== frames()[0][index]).length, 1);
  const firstRenderIndex = order.findIndex((event) => event[0] === 'render' && event[1][2] === 1);
  const firstPulseIndex = order.findIndex((event) => event[0] === 'pulse' && event[1] === 2);
  const firstAudioIndex = order.findIndex((event) => event[0] === 'audio' && event[1] === 0);
  assert.ok(firstRenderIndex < firstPulseIndex && firstPulseIndex < firstAudioIndex);

  await scheduler.advance();
  assert.equal(frames().length, 2, 'landing settle must finish before the next travel starts');
  await scheduler.advance();
  assert.equal(frames().length, 3);
  assert.equal(frames()[2][2], 1);
  assert.equal(frames()[2][3], 1);
  assert.equal(frames()[2][4], 0);

  await scheduler.advance();
  assert.equal(frames().length, 3);
  await scheduler.advance();
  assert.equal(frames().length, 4);
  await scheduler.advance();
  await move;
  assert.deepEqual(frames().at(-1), plan.finalBoard);
  assert.equal(order.filter(([type]) => type === 'audio').length, 3);
  assert.deepEqual(order.filter(([type]) => type === 'canonical'), [['canonical']]);
  assert.ok(order.findLastIndex(([type]) => type === 'render') < order.findLastIndex(([type]) => type === 'canonical'));
});

test('cancellation between landings prevents later presentation counts, audio, and canonical render', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  const audio = [];
  let canonicalRenders = 0;
  const move = animator.animateMove(movePlan({
    onLanding: (step) => audio.push(step),
    onCanonicalRender: () => { canonicalRenders += 1; },
  }));

  await scheduler.advance();
  await scheduler.advance();
  const framesAtCancel = view.events.filter(([type]) => type === 'render').map((event) => event[1]);
  assert.equal(framesAtCancel.at(-1)[2], 1);
  assert.equal(framesAtCancel.at(-1)[3], 0);
  animator.cancel();
  await scheduler.advance();
  await move;

  const finalFrames = view.events.filter(([type]) => type === 'render').map((event) => event[1]);
  assert.equal(finalFrames.length, framesAtCancel.length);
  assert.deepEqual(audio, [0]);
  assert.equal(canonicalRenders, 0);
  assert.equal(view.transients, 0);
});

test('visual sow paths skip the opponent Kalah for either player', () => {
  assert.deepEqual(getSowPath(5, 9, 1), [6, 7, 8, 9, 10, 11, 12, 0, 1]);
  assert.deepEqual(getSowPath(12, 9, 2), [13, 0, 1, 2, 3, 4, 5, 7, 8]);
});

test('own Kalah landing gets the store visual and exactly one ownStore-routed callback', async () => {
  const { animator, view } = createAnimator();
  const landings = [];
  await animator.animateMove(movePlan({
    path: [2, 3, 4, 5, 6],
    result: { ...movePlan().result, lastPit: 6, finishedInOwnStore: true, extraTurn: true },
    finalBoard: [0, 0, 1, 1, 1, 1, 3, 4, 0, 0, 0, 0, 0, 1],
    onLanding: (step, details) => landings.push([step, details]),
  }));

  assert.ok(view.events.some((event) => event[0] === 'pulse' && event[1] === 6 && event[2] === 'store'));
  assert.equal(landings.filter(([, details]) => details.ownStore).length, 1);
  assert.equal(landings.at(-1)[1].ownStore, true);
});

test('capture highlights both pits, moves a compact group, and emits capture once after arrival', async () => {
  const { animator, view } = createAnimator();
  const order = [];
  const originalTransferGroup = view.transferGroup.bind(view);
  view.transferGroup = (...parameters) => { order.push('transfer'); originalTransferGroup(...parameters); };
  const result = { ...movePlan().result, lastPit: 2, captureOccurred: true, capturedStones: 5 };
  await animator.animateMove(movePlan({
    path: [2],
    result,
    finalBoard: [0, 0, 0, 0, 0, 0, 7, 4, 0, 0, 0, 0, 0, 1],
    onCapture: () => order.push('capture'),
  }));

  assert.ok(view.events.some((event) => event[0] === 'highlight' && event[1] === 2 && event[2] === 10));
  assert.ok(view.events.some((event) => event[0] === 'group' && event[2] === 6 && event[3] === 3 && event[4] === 'capture'));
  assert.deepEqual(order, ['transfer', 'capture']);
});

test('extra turn keeps the board mapping and uses a localized non-modal phase', async () => {
  const { animator, view } = createAnimator();
  let orientation = 1;
  await animator.animatePostMove({ generation: 1, type: 'extra-turn', label: 'Extra turn', onTransition: () => { orientation = 1; } });
  assert.equal(orientation, 1);
  assert.ok(view.events.some((event) => event[0] === 'message' && event[1] === 'Extra turn'));
  assert.ok(view.events.some((event) => event[0] === 'transition' && event[1] === 'extra-turn'));
});

test('extra-turn notice stays fixed at 1000ms for every speed and never blocks Animation Off', async () => {
  for (const speed of [.25, 1, 2]) {
    const waits = [];
    const { animator, view } = createAnimator({
      delay: async (milliseconds) => { waits.push(milliseconds); },
      getAnimationSettings: () => ({ animationEnabled:true, animationSpeed:speed }),
    });
    await animator.animatePostMove({ generation:1, type:'extra-turn', label:'Extra turn' });
    assert.deepEqual(view.events.find(([type]) => type === 'message'), ['message', 'Extra turn', 'extra-turn', EXTRA_TURN_MESSAGE_MS]);
    assert.deepEqual(waits, [Math.round(500 / speed)]);
  }

  let waits = 0;
  const { animator, view } = createAnimator({
    delay: async () => { waits += 1; },
    getAnimationSettings: () => ({ animationEnabled:false, animationSpeed:1 }),
  });
  await animator.animatePostMove({ generation:1, type:'extra-turn', label:'Extra turn' });
  assert.equal(waits, 0);
  assert.deepEqual(view.events.find(([type]) => type === 'message'), ['message', 'Extra turn', 'extra-turn', EXTRA_TURN_MESSAGE_MS]);
});

test('PvP orientation transition starts only after sow animation completion', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  let orientation = 1;
  const move = animator.animateMove(movePlan({ path: [2], finalBoard: [0, 0, 1, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1] }));
  await scheduler.advance();
  await scheduler.advance();
  await scheduler.advance();
  await move;
  assert.equal(orientation, 1);
  const transition = animator.animatePostMove({ generation: 1, type: 'turn', onTransition: () => { orientation = 2; } });
  await scheduler.advance();
  await transition;
  assert.equal(orientation, 2);
  assert.ok(view.events.some((event) => event[0] === 'transition' && event[1] === 'turn'));
});

test('PvAI post-move phase changes status without changing human-facing orientation', async () => {
  const { animator, view } = createAnimator();
  let orientation = 1;
  await animator.animatePostMove({ generation: 1, type: 'status', onTransition: () => { orientation = 1; } });
  assert.equal(orientation, 1);
  assert.ok(view.events.some((event) => event[0] === 'transition' && event[1] === 'status'));
});

test('the next AI action is not scheduled before the complete presentation pipeline resolves', async () => {
  const scheduler = deferredScheduler();
  const { animator } = createAnimator({ delay: scheduler.delay });
  const order = [];
  const pipeline = (async () => {
    await animator.animateMove(movePlan({ path: [2], finalBoard: [0, 0, 1, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1] }));
    await animator.animatePostMove({ generation: 1, type: 'status' });
    order.push('schedule-ai');
  })();
  assert.deepEqual(order, []);
  await scheduler.advance();
  assert.deepEqual(order, []);
  await scheduler.advance();
  assert.deepEqual(order, []);
  await scheduler.advance();
  assert.deepEqual(order, []);
  await scheduler.advance();
  await pipeline;
  assert.deepEqual(order, ['schedule-ai']);
});

test('Load cancellation removes a stale sow transient and prevents later render and audio', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  let sounds = 0;
  const move = animator.animateMove(movePlan({ onLanding: () => { sounds += 1; } }));
  const eventCount = view.events.length;
  animator.cancel();
  assert.equal(view.transients, 0);
  await scheduler.advance();
  await move;
  assert.equal(sounds, 0);
  assert.equal(view.events.filter(([type]) => type === 'render').length, 1);
  assert.ok(view.events.length > eventCount);
});

test('Load cancellation during capture suppresses stale capture audio and final render', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  let captures = 0;
  const move = animator.animateMove(movePlan({
    path: [2],
    result: { ...movePlan().result, lastPit: 2, captureOccurred: true, capturedStones: 5 },
    finalBoard: [0, 0, 0, 0, 0, 0, 7, 4, 0, 0, 0, 0, 0, 1],
    onCapture: () => { captures += 1; },
  }));
  await scheduler.advance();
  await scheduler.advance();
  await scheduler.advance();
  assert.ok(view.events.some(([type]) => type === 'group'));
  const rendersBeforeCancel = view.events.filter(([type]) => type === 'render').length;
  animator.cancel();
  await scheduler.advance();
  await move;
  assert.equal(captures, 0);
  assert.equal(view.events.filter(([type]) => type === 'render').length, rendersBeforeCancel);
});

for (const action of ['New Game', 'resignation']) {
  test(`${action} uses the same cancellation boundary and leaves no active animation`, async () => {
    const scheduler = deferredScheduler();
    const { animator, view } = createAnimator({ delay: scheduler.delay });
    const move = animator.animateMove(movePlan());
    assert.equal(animator.isActive(), true);
    animator.cancel();
    await scheduler.advance();
    await move;
    assert.equal(animator.isActive(), false);
    assert.equal(view.transients, 0);
  });
}

test('a stale generation emits neither render nor semantic audio', async () => {
  const { animator, view } = createAnimator({ isGenerationCurrent: () => false });
  let audio = 0;
  const outcome = await animator.animateMove(movePlan({ onLanding: () => { audio += 1; }, onCapture: () => { audio += 1; } }));
  assert.equal(outcome.completed, false);
  assert.equal(audio, 0);
  assert.equal(view.events.filter(([type]) => type === 'render').length, 0);
});

test('reduced motion renders the authoritative final state and keeps one aggregate sound', async () => {
  const { animator, view } = createAnimator({ reducedMotion: () => true });
  const landings = [];
  let captures = 0;
  const plan = movePlan({
    result: { ...movePlan().result, lastPit: 4, captureOccurred: true, capturedStones: 2 },
    onLanding: (step, details) => landings.push([step, details]),
    onCapture: () => { captures += 1; },
  });
  await animator.animateMove(plan);
  const renders = view.events.filter(([type]) => type === 'render');
  assert.deepEqual(renders.at(-1)[1], plan.finalBoard);
  assert.equal(view.events.filter(([type]) => type === 'transfer').length, 0);
  assert.deepEqual(landings, [[2, { ownStore: false, aggregate: true }]]);
  assert.equal(captures, 1);
});

test('Animation Off uses the immediate canonical path without physical effects or delays', async () => {
  let waits = 0;
  let canonicalRenders = 0;
  const landings = [];
  const { animator, view } = createAnimator({
    delay: async () => { waits += 1; },
    getAnimationSettings: () => ({ animationEnabled: false, animationSpeed: .25 }),
  });
  const outcome = await animator.animateMove(movePlan({
    result: { ...movePlan().result, captureOccurred: true, capturedStones: 2 },
    onLanding: (step, details) => landings.push([step, details]),
    onCanonicalRender: () => { canonicalRenders += 1; },
  }));
  assert.equal(outcome.completed, true); assert.equal(outcome.shortened, true);
  assert.equal(waits, 0); assert.equal(canonicalRenders, 1);
  assert.equal(view.events.some(([type]) => ['pickup', 'transfer', 'group', 'highlight', 'pulse'].includes(type)), false);
  assert.deepEqual(landings, [[2, { ownStore:false, aggregate:true }]]);

  let transitioned = false;
  assert.equal(await animator.animatePostMove({ generation:1, type:'turn', timing:outcome.timing, onTransition:() => { transitioned = true; } }), true);
  assert.equal(transitioned, true);
  assert.equal(view.events.some(([type]) => type === 'transition'), false);
  assert.equal(await animator.animateResult({ generation:1, kind:'victory', timing:outcome.timing }), true);
  assert.equal(view.events.some(([type]) => type === 'result'), false);
  assert.equal(waits, 0);
});

test('system reduced motion overrides enabled animation and ignores its speed', async () => {
  let waits = 0;
  const { animator, view } = createAnimator({
    delay: async () => { waits += 1; },
    reducedMotion: () => true,
    getAnimationSettings: () => ({ animationEnabled:true, animationSpeed:.25 }),
  });
  const outcome = await animator.animateMove(movePlan());
  assert.equal(outcome.timing.systemReducedMotion, true);
  assert.equal(outcome.timing.immediate, true);
  assert.equal(waits, 0);
  assert.equal(view.events.some(([type]) => type === 'transfer'), false);
});

test('a move keeps its starting speed while a changed speed applies to the next move', async () => {
  let speed = 1;
  const waits = [];
  const { animator, view } = createAnimator({
    delay: async (milliseconds) => { waits.push(milliseconds); speed = 2; },
    getAnimationSettings: () => ({ animationEnabled:true, animationSpeed:speed }),
  });
  const oneStone = movePlan({ path:[2], finalBoard:[0, 0, 1, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1] });
  const first = await animator.animateMove(oneStone);
  assert.equal(view.events.find(([type]) => type === 'transfer')[3], 220);
  assert.deepEqual(waits.slice(0, 3), [90, 220, 80]);

  const waitStart = waits.length;
  view.events.length = 0;
  await animator.animateMove(oneStone);
  assert.equal(view.events.find(([type]) => type === 'transfer')[3], 110);
  assert.deepEqual(waits.slice(waitStart, waitStart + 3), [45, 110, 40]);

  speed = .5;
  waits.length = 0;
  await animator.animatePostMove({ generation:1, type:'turn', timing:first.timing });
  assert.deepEqual(waits, [320], 'post-move keeps the timing captured by the completed move');
});

test('resize safely shortens an active move to the final frame without a hanging stone', async () => {
  const scheduler = deferredScheduler();
  const { animator, view } = createAnimator({ delay: scheduler.delay });
  const plan = movePlan();
  const move = animator.animateMove(plan);
  view.resize();
  await scheduler.advance();
  const outcome = await move;
  assert.equal(outcome.shortened, true);
  assert.equal(view.transients, 0);
  assert.deepEqual(view.events.filter(([type]) => type === 'render').at(-1)[1], plan.finalBoard);
});

test('game end presents bounded collection before the authoritative final board', async () => {
  const { animator, view } = createAnimator();
  const finalBoard = [0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 52];
  await animator.animateMove(movePlan({
    before: [0, 1, 0, 0, 0, 0, 19, 8, 8, 8, 8, 8, 8, 4],
    path: [2],
    result: { ...movePlan().result, lastPit: 2, gameOver: true },
    finalBoard,
  }));
  const collection = view.events.find(([type]) => type === 'collect');
  assert.ok(collection);
  assert.ok(collection[2] <= 4);
  assert.deepEqual(view.events.filter(([type]) => type === 'render').at(-1)[1], finalBoard);
});

test('game-end semantic callback and visual result are each emitted once', async () => {
  const { animator, view } = createAnimator();
  let sounds = 0;
  await animator.animateResult({ generation: 1, kind: 'victory', onStart: () => { sounds += 1; } });
  assert.equal(sounds, 1);
  assert.deepEqual(view.events.filter(([type]) => type === 'result'), [['result', 'victory']]);
  assert.equal(view.transients, 0);
});

test('DOM view cleanup removes the transient overlay reference', () => {
  let removals = 0;
  const view = new DomBoardAnimationView({
    boardElement: {}, statusElement: {}, resolveTarget: () => null, renderFrame: () => {}, documentRoot: {},
  });
  view.overlay = { replaceChildren() {}, remove: () => { removals += 1; } };
  view.clearTransient();
  assert.equal(removals, 1);
  assert.equal(view.overlay, null);
});

function createClassList(element) {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force) => { if (force) values.add(name); else values.delete(name); },
  };
}

function createDomElement(rect = { left: 0, top: 0, width: 10, height: 10 }) {
  const listeners = new Map();
  const element = {
    children: [], parent: null, isConnected: false, className: '', rect,
    style: { values: new Map(), setProperty(name, value) { this.values.set(name, value); } },
    setAttribute() {},
    append(child) { child.parent = this; child.isConnected = this.isConnected; this.children.push(child); },
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parent = null; child.isConnected = false; });
      this.children = [];
      children.forEach((child) => this.append(child));
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null; this.isConnected = false;
      this.children.forEach((child) => { child.isConnected = false; });
    },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
    dispatch(type, event = {}) { listeners.get(type)?.({ target: this, ...event }); },
    getBoundingClientRect() { return { ...this.rect }; },
    querySelectorAll() { return []; },
  };
  element.classList = createClassList(element);
  return element;
}

function createDomHarness(rectangles = {}) {
  const body = createDomElement(); body.isConnected = true;
  const board = createDomElement(); board.isConnected = true; board.querySelectorAll = () => [];
  const targets = new Map(Object.entries(rectangles).map(([key, rect]) => [Number(key), createDomElement(rect)]));
  targets.forEach((target) => { target.isConnected = true; });
  const frames = [];
  const timers = [];
  const renderedBoards = [];
  const documentRoot = { body, createElement: () => createDomElement() };
  const view = new DomBoardAnimationView({
    boardElement: board,
    statusElement: createDomElement(),
    resolveTarget: (index) => targets.get(index),
    renderFrame: (boardState) => renderedBoards.push([...boardState]),
    documentRoot,
    requestFrame: (callback) => { frames.push(callback); return callback; },
    cancelFrame: (callback) => { const index = frames.indexOf(callback); if (index >= 0) frames.splice(index, 1); },
    setTimer: (callback, delay) => { callback.delay = delay; timers.push(callback); return callback; },
    clearTimer: (callback) => { const index = timers.indexOf(callback); if (index >= 0) timers.splice(index, 1); },
  });
  return {
    body, board, targets, view, timers, renderedBoards,
    runFrame() { const callbacks = frames.splice(0); callbacks.forEach((callback) => callback()); },
  };
}

test('normal transport uses one body-level viewport overlay and waits for a painted start state', async () => {
  const harness = createDomHarness({
    1: { left: 100, top: 40, width: 60, height: 40 },
    2: { left: 300, top: 180, width: 80, height: 60 },
  });
  let settled = false;
  const travel = harness.view.transfer(1, 2, 1, 220, 0).then((arrived) => { settled = true; return arrived; });
  assert.equal(harness.body.children.length, 1);
  const overlay = harness.body.children[0];
  const stone = overlay.children[0];
  assert.equal(overlay.className, 'board-animation-overlay');
  assert.equal(stone.style.left, '130px');
  assert.equal(stone.style.top, '60px');
  assert.equal(stone.style.values.get('--move-x'), '210px');
  assert.equal(stone.style.values.get('--move-y'), '150px');
  assert.equal(stone.classList.contains('in-flight'), false);

  harness.runFrame();
  assert.equal(stone.classList.contains('in-flight'), false, 'first frame preserves the visible start state');
  assert.equal(settled, false);
  harness.runFrame();
  assert.equal(stone.classList.contains('in-flight'), true, 'travel begins only on the second frame boundary');
  assert.equal(settled, false);
  assert.equal(harness.timers.length, 1, 'transitionend has a timeout fallback');

  stone.dispatch('transitionend', { propertyName: 'transform' });
  assert.equal(await travel, true);
  assert.equal(stone.isConnected, false);
  assert.equal(overlay.children.length, 0);
  harness.view.clearTransient();
  assert.equal(harness.body.children.length, 0);
});

test('transport cancellation removes the viewport overlay and resolves an active flight as cancelled', async () => {
  const harness = createDomHarness({
    1: { left: 10, top: 20, width: 40, height: 40 },
    2: { left: 80, top: 100, width: 40, height: 40 },
  });
  const travel = harness.view.transfer(1, 2, 1, 220, 0);
  harness.runFrame();
  harness.runFrame();
  harness.view.clearTransient();
  assert.equal(await travel, false);
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.view.overlay, null);
});

test('DOM-backed destination presentation waits for transport transition completion', async () => {
  const harness = createDomHarness({
    1: { left: 10, top: 20, width: 40, height: 40 },
    2: { left: 80, top: 100, width: 40, height: 40 },
  });
  harness.view.subscribeResize = () => () => {};
  const animator = new BoardAnimator({ view: harness.view, delay: immediate });
  const move = animator.animateMove(movePlan({
    path: [2],
    finalBoard: [0, 0, 1, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1],
  }));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.renderedBoards.length, 1);
  assert.equal(harness.renderedBoards[0][2], 0);
  harness.runFrame();
  harness.runFrame();
  assert.equal(harness.renderedBoards.length, 1);
  const stone = harness.body.children[0].children[0];
  stone.dispatch('transitionend', { propertyName: 'transform' });
  await move;
  assert.equal(harness.renderedBoards[1][2], 1);
  assert.deepEqual(harness.renderedBoards.at(-1), [0, 0, 1, 0, 0, 0, 2, 4, 0, 0, 0, 0, 0, 1]);
  assert.equal(harness.body.children.length, 0);
});

test('transport timeout fallback completes and removes a stone when transitionend is absent', async () => {
  const harness = createDomHarness({
    1: { left: 10, top: 20, width: 40, height: 40 },
    2: { left: 80, top: 100, width: 40, height: 40 },
  });
  const travel = harness.view.transfer(1, 2, 1, 220, 0);
  harness.runFrame();
  harness.runFrame();
  assert.equal(harness.timers.length, 1);
  harness.timers.shift()();
  assert.equal(await travel, true);
  assert.equal(harness.body.children[0].children.length, 0);
});

test('invalid viewport geometry falls back immediately without creating an overlay', async () => {
  const harness = createDomHarness({
    1: { left: 10, top: 20, width: 0, height: 40 },
    2: { left: 80, top: 100, width: 40, height: 40 },
  });
  assert.equal(await harness.view.transfer(1, 2, 1, 220, 0), false);
  assert.equal(harness.body.children.length, 0);
});

test('landing entrance marks only the newest decorative stone', () => {
  const harness = createDomHarness({ 2: { left: 80, top: 100, width: 40, height: 40 } });
  const older = createDomElement();
  const newest = createDomElement();
  harness.targets.get(2).querySelectorAll = () => [older, newest];
  harness.view.pulse(2, 'landing', 1, true);
  assert.equal(older.classList.contains('stone--just-landed'), false);
  assert.equal(newest.classList.contains('stone--just-landed'), true);
  newest.dispatch('animationend');
  assert.equal(newest.classList.contains('stone--just-landed'), false);
});

test('DOM extra-turn notice owns a non-blocking fixed removal timer', () => {
  const harness = createDomHarness();
  harness.view.showMessage('Extra turn', 'extra-turn', EXTRA_TURN_MESSAGE_MS);
  assert.equal(harness.board.children.at(-1).textContent, 'Extra turn');
  assert.equal(harness.timers.length, 1);
  assert.equal(harness.timers[0].delay, EXTRA_TURN_MESSAGE_MS);
  harness.view.cleanup({ preserveMessage:true });
  assert.equal(harness.view.message?.textContent, 'Extra turn', 'the next move must not shorten the notice lifetime');
  harness.timers.shift()();
  assert.equal(harness.view.message, null);
});

test('the animator never mutates engine-owned before or final snapshots', async () => {
  const { animator } = createAnimator();
  const plan = movePlan();
  const beforeCopy = [...plan.before];
  const finalCopy = [...plan.finalBoard];
  await animator.animateMove(plan);
  assert.deepEqual(plan.before, beforeCopy);
  assert.deepEqual(plan.finalBoard, finalCopy);
});
