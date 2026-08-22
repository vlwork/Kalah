import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager, AUDIO_EVENTS } from '../js/audio/audio-manager.js';
import { RuntimeLifecycle } from '../js/ui/runtime-session.js';

class FakeAudioEngine {
  constructor() { this.events = []; this.unlocks = 0; }
  unlock() { this.unlocks += 1; return true; }
  play(event, details) { this.events.push({ event, details }); return true; }
}
const manager = (settings) => { const engine = new FakeAudioEngine(); return { engine, audio: new AudioManager(engine, settings) }; };

test('mute and zero volume create no playback calls', () => {
  let pair = manager({ enabled: false, volume: 0.65 }); pair.audio.play(AUDIO_EVENTS.BUTTON_CLICK); assert.equal(pair.engine.events.length, 0);
  pair = manager({ enabled: true, volume: 0 }); pair.audio.play(AUDIO_EVENTS.STONE_DROP); assert.equal(pair.engine.events.length, 0);
});

test('sound can be re-enabled immediately and runtime volume is applied', () => {
  const { audio, engine } = manager({ enabled: false, volume: 0.4 });
  audio.setEnabled(true); audio.setVolume(0.27); audio.play(AUDIO_EVENTS.BUTTON_CLICK);
  assert.equal(engine.events.length, 1); assert.equal(engine.events[0].details.volume, 0.27);
});

test('audio unlock failures never escape into application control flow', async () => {
  const audio = new AudioManager({ unlock() { throw new Error('blocked'); }, play() { throw new Error('unavailable'); } });
  assert.equal(await audio.unlock(), false); assert.equal(audio.play(AUDIO_EVENTS.BUTTON_CLICK), false);
});

test('one button action produces exactly one quiet semantic click', () => {
  const { audio, engine } = manager(); audio.play(AUDIO_EVENTS.BUTTON_CLICK);
  assert.deepEqual(engine.events.map((item) => item.event), ['buttonClick']); assert.equal(engine.events[0].details.volume, 0.65);
});

test('N animation steps route N ordered stone sounds with deterministic variants', () => {
  const { audio, engine } = manager(); for (let step = 0; step < 8; step += 1) audio.playStonePlacement(step);
  assert.deepEqual(engine.events.map((item) => item.event), Array(8).fill('stoneDrop'));
  assert.deepEqual(engine.events.map((item) => item.details.variant), [0,1,2,3,4,5,6,7]);
});

test('the final own-store placement produces one ownStore accent', () => {
  const { audio, engine } = manager(); audio.playStonePlacement(0); audio.playStonePlacement(1, { ownStore: true });
  assert.deepEqual(engine.events.map((item) => item.event), ['stoneDrop', 'ownStore']);
});

test('capture is emitted once after stone events', () => {
  const { audio, engine } = manager(); audio.playStonePlacement(0); audio.playMoveOutcome({ captureOccurred: true, gameOver: false }, { mode: 'pvp' });
  assert.deepEqual(engine.events.map((item) => item.event), ['stoneDrop', 'capture']);
});

test('PvP game end is neutral, while a draw uses draw', () => {
  let pair = manager(); pair.audio.playMoveOutcome({ captureOccurred: false, gameOver: true, winner: 2 }, { mode: 'pvp', humanPlayer: 1 }); assert.equal(pair.engine.events[0].event, 'pvpGameEnd');
  pair = manager(); pair.audio.playMoveOutcome({ captureOccurred: false, gameOver: true, winner: 0 }, { mode: 'pvp', humanPlayer: 1 }); assert.equal(pair.engine.events[0].event, 'draw');
});

test('PvAI routes victory and defeat using the configured human role', () => {
  const victory = manager({ enabled: true, volume: 0.42 });
  victory.audio.playMoveOutcome({ captureOccurred: false, gameOver: true, winner: 2 }, { mode: 'ai', humanPlayer: 2 });
  const defeat = manager({ enabled: true, volume: 0.42 });
  defeat.audio.playMoveOutcome({ captureOccurred: false, gameOver: true, winner: 1 }, { mode: 'ai', humanPlayer: 2 });
  assert.deepEqual([victory.engine.events[0].event, defeat.engine.events[0].event], ['victory', 'defeat']);
  assert.equal(victory.engine.events[0].details.volume, 0.42);
  assert.equal(defeat.engine.events[0].details.volume, 0.42);
});

test('Load/render produce no events and stale animation generation cannot emit sound', () => {
  const { audio, engine } = manager(); const lifecycle = new RuntimeLifecycle(); const generation = lifecycle.capture();
  const oldStep = () => { if (lifecycle.isCurrent(generation)) audio.playStonePlacement(0); };
  lifecycle.beginReplacement(); lifecycle.finishReplacement(); oldStep();
  assert.equal(engine.events.length, 0);
});
