export const AUDIO_EVENTS = Object.freeze({
  BUTTON_CLICK: 'buttonClick', STONE_DROP: 'stoneDrop', OWN_STORE: 'ownStore', CAPTURE: 'capture',
  PVP_GAME_END: 'pvpGameEnd', VICTORY: 'victory', DEFEAT: 'defeat', DRAW: 'draw',
});

/** Routes semantic game/UI events without depending on Web Audio or the DOM. */
export class AudioManager {
  constructor(engine, settings = {}) {
    this.engine = engine;
    this.enabled = settings.enabled ?? true;
    this.volume = clampVolume(settings.volume ?? 0.65);
  }

  unlock() { try { return Promise.resolve(this.engine?.unlock?.()).catch(() => false); } catch { return Promise.resolve(false); } }
  setEnabled(enabled) { this.enabled = Boolean(enabled); }
  setVolume(volume) { this.volume = clampVolume(volume); }
  getSettings() { return { enabled: this.enabled, volume: this.volume }; }

  play(event, details = {}) {
    if (!this.enabled || this.volume <= 0 || !this.engine) return false;
    try { return this.engine.play(event, { ...details, volume: this.volume }) !== false; } catch { return false; }
  }

  playStonePlacement(step, { ownStore = false } = {}) {
    return this.play(ownStore ? AUDIO_EVENTS.OWN_STORE : AUDIO_EVENTS.STONE_DROP, { variant: step });
  }

  playMoveOutcome(result, match) {
    if (result.captureOccurred) this.play(AUDIO_EVENTS.CAPTURE);
    if (!result.gameOver) return;
    if (result.winner === 0) { this.play(AUDIO_EVENTS.DRAW); return; }
    if (match.mode === 'pvp') { this.play(AUDIO_EVENTS.PVP_GAME_END); return; }
    this.play(result.winner === match.humanPlayer ? AUDIO_EVENTS.VICTORY : AUDIO_EVENTS.DEFEAT);
  }

  playResignOutcome(game, match) {
    this.playMoveOutcome({ captureOccurred: false, gameOver: true, winner: game.winner }, match);
  }
}

function clampVolume(volume) {
  const numeric = Number(volume);
  if (!Number.isFinite(numeric)) return 0.65;
  return Math.min(1, Math.max(0, numeric));
}
