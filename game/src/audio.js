// All sound is synthesized with WebAudio: no audio files, no network. A shared noise
// buffer feeds the percussive sounds; oscillators feed the tones. Created lazily on the
// first user gesture so autoplay policies never block the game.
const SHOT_TONE = { p9: 190, sg12: 120, vk9: 240, ar77: 170, lr90: 110 };

export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = value; },
    shot(weaponId) {
      const f = SHOT_TONE[weaponId] || 170;
      noise(weaponId === 'sg12' ? 0.28 : 0.14, weaponId === 'lr90' ? 900 : 1800, weaponId === 'lr90' ? 0.7 : 0.5);
      tone(f, 0.12, 0.35, 'square', f * 0.5);
    },
    enemyShot(distance) {
      const g = Math.max(0.08, 0.4 - distance * 0.008);
      noise(0.12, 1400, g);
      tone(150, 0.1, g * 0.5, 'square', 70);
    },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() {
      tone(500, 0.05, 0.15, 'square');
      tone(700, 0.05, 0.15, 'square', 0, 0.25);
      tone(900, 0.06, 0.18, 'square', 0, 0.7);
    },
    hit() { tone(1400, 0.06, 0.25, 'sine'); },
    headshot() {
      tone(1800, 0.07, 0.3, 'sine');
      tone(2400, 0.09, 0.25, 'sine', 0, 0.07);
    },
    kill() {
      tone(660, 0.08, 0.25, 'triangle');
      tone(990, 0.12, 0.25, 'triangle', 0, 0.08);
    },
    plantBeep(final) {
      tone(final ? 1600 : 1000, 0.09, 0.3, 'sine');
    },
    explosion() {
      noise(1.1, 300, 0.9);
      tone(60, 0.9, 0.6, 'sine', 28);
      noise(0.5, 1200, 0.4, 'highpass');
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.22, 0.25, 'triangle', 0, i * 0.12));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.25, 0.22, 'triangle', 0, i * 0.13));
    },
    footstep() { noise(0.05, 500, 0.06); },
    buy() {
      tone(880, 0.07, 0.2, 'sine');
      tone(1320, 0.09, 0.2, 'sine', 0, 0.07);
    },
    denied() { tone(180, 0.15, 0.25, 'sawtooth', 120); },
    throwPin() { tone(2000, 0.03, 0.12, 'square'); },
    defuseTick() { tone(1200, 0.05, 0.18, 'sine'); },
  };
}
