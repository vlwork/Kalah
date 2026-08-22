const FINAL_EVENTS = new Set(['pvpGameEnd', 'victory', 'defeat', 'draw']);

/** Small synthesized effects; AudioContext is created only after a gesture. */
export class WebAudioEngine {
  constructor(AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext) {
    this.AudioContextClass = AudioContextClass;
    this.context = null;
    this.voices = new Set();
  }

  async unlock() {
    if (!this.AudioContextClass) return false;
    if (!this.context) this.context = new this.AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context.state === 'running';
  }

  play(event, { volume, variant = 0 } = {}) {
    if (!this.context || volume <= 0) return false;
    if (FINAL_EVENTS.has(event)) this.stopPrioritiesBelow(2);
    const tones = effectTones(event, variant);
    if (!tones) return false;
    for (const tone of tones) this.createTone(tone, volume, eventPriority(event));
    return true;
  }

  createTone(tone, volume, priority) {
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + (tone.offset || 0);
    const end = start + tone.duration;
    oscillator.type = tone.type || 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * tone.gain), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain); gain.connect(context.destination);
    const voice = { oscillator, gain, priority };
    this.voices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
    oscillator.start(start); oscillator.stop(end + 0.01);
  }

  stopPrioritiesBelow(priority) {
    for (const voice of [...this.voices]) {
      if (voice.priority >= priority) continue;
      try { voice.oscillator.stop(); } catch { /* already stopped */ }
    }
  }
}

function eventPriority(event) { return FINAL_EVENTS.has(event) ? 3 : event === 'capture' || event === 'ownStore' ? 2 : event === 'stoneDrop' ? 1 : 0; }
function effectTones(event, variant) {
  const pitch = (Math.abs(Number(variant)) % 5) * 16;
  const effects = {
    buttonClick: [{ frequency: 360, duration: 0.035, gain: 0.025, type: 'sine' }],
    stoneDrop: [{ frequency: 500 + pitch, endFrequency: 450 + pitch, duration: 0.055, gain: 0.035, type: 'sine' }],
    ownStore: [{ frequency: 210, endFrequency: 165, duration: 0.18, gain: 0.07 }, { frequency: 420, endFrequency: 330, duration: 0.13, gain: 0.025, offset: 0.028 }],
    capture: [{ frequency: 380, endFrequency: 520, duration: 0.07, gain: 0.052 }, { frequency: 300, endFrequency: 215, duration: 0.14, gain: 0.065, offset: 0.06 }],
    pvpGameEnd: [{ frequency: 330, duration: 0.18, gain: 0.06 }, { frequency: 440, duration: 0.2, gain: 0.048, offset: 0.08 }],
    victory: [{ frequency: 440, duration: 0.14, gain: 0.085 }, { frequency: 554, duration: 0.15, gain: 0.085, offset: 0.09 }, { frequency: 659, duration: 0.22, gain: 0.095, offset: 0.18 }],
    defeat: [{ frequency: 370, duration: 0.15, gain: 0.08 }, { frequency: 294, duration: 0.18, gain: 0.082, offset: 0.1 }, { frequency: 220, duration: 0.23, gain: 0.085, offset: 0.22 }],
    draw: [{ frequency: 350, duration: 0.18, gain: 0.054 }, { frequency: 350, duration: 0.18, gain: 0.048, offset: 0.14 }],
  };
  return effects[event] || null;
}
