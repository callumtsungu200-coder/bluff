// Synthesised sound effects. Web Audio only, no audio files to load.
//
//   play(name, { volume = 1, delay = 0 })   name is one of SOUNDS. Returns true if scheduled.
//                                           A no-op until the first user gesture, while muted,
//                                           or when the browser has no AudioContext.
//   setMuted(bool) / isMuted()              silence the master bus (settings.js keeps this in sync)
//   unlock()                                create or resume the AudioContext. Attached once to the
//                                           first pointerdown / keydown / touchend / click on import,
//                                           so you rarely need to call it yourself.
//   isSupported()                           false when there is no AudioContext at all
//
// Nothing here throws. Every entry point swallows failures so a missing or broken
// AudioContext can never take the game down with it.

const MASTER = 0.25; // gentle by design, the game is mostly quiet; every effect peaks well under 1 before this
const MIN_GAP = 0.02; // seconds between two plays of the same sound (StrictMode, double taps)

const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

let ctx = null;
let master = null;
let noise = null;
let muted = false;
let unlocked = false;
let failed = false;
const lastAt = {};

function ensureContext() {
  if (ctx || failed || !AC) return ctx;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    failed = true;
  }
  return ctx;
}

// one second of white noise, shared by every whoosh and tick
function noiseBuffer(c) {
  if (!noise) {
    const n = c.sampleRate;
    noise = c.createBuffer(1, n, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

// quick attack, exponential decay to silence at t0 + dur
function envelope(c, out, t0, peak, attack, dur) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(out);
  return g;
}

function tone(c, out, t0, { type = 'sine', freq, to = 0, peak = 0.4, attack = 0.004, dur = 0.2, lp = 0 }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = envelope(c, out, t0, peak, attack, dur);
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    o.connect(f);
    f.connect(g);
  } else {
    o.connect(g);
  }
  o.onended = () => g.disconnect();
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function hiss(c, out, t0, { from = 1000, to = 0, q = 0.8, peak = 0.3, attack = 0.004, dur = 0.15, type = 'bandpass' }) {
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = envelope(c, out, t0, peak, attack, dur);
  s.connect(f);
  f.connect(g);
  s.onended = () => g.disconnect();
  s.start(t0, Math.random() * 0.5); // random offset so repeats never sound identical
  s.stop(t0 + dur + 0.05);
}

const jitter = (n) => n * (1 + (Math.random() - 0.5) * 0.12);

// Each effect schedules its nodes at time t on output bus `out`.
const FX = {
  // UI
  click: (c, out, t) => tone(c, out, t, { type: 'square', freq: 1600, to: 800, peak: 0.12, dur: 0.03 }),
  select: (c, out, t) => tone(c, out, t, { freq: jitter(740), to: 1100, peak: 0.1, dur: 0.06 }),

  // cards
  deal: (c, out, t) => {
    hiss(c, out, t, { from: 3500, to: 6000, q: 2, peak: 0.3, dur: 0.04 });
    tone(c, out, t, { type: 'triangle', freq: jitter(2400), to: 1200, peak: 0.06, dur: 0.035 });
  },
  slide: (c, out, t) => hiss(c, out, t, { from: 400, to: 2800, q: 0.6, peak: 0.3, attack: 0.05, dur: 0.3 }),
  flip: (c, out, t) => {
    hiss(c, out, t, { from: 1500, to: 5000, q: 1.2, peak: 0.3, attack: 0.008, dur: 0.08 });
    tone(c, out, t + 0.03, { type: 'triangle', freq: 700, to: 1400, peak: 0.07, dur: 0.05 });
  },
  pickup: (c, out, t) => {
    for (let i = 0; i < 3; i++) hiss(c, out, t + i * 0.07, { from: 600, to: 1600, peak: 0.18, dur: 0.1 });
  },

  // verdicts: a soft thud as the label lands, then a low two-note alarm (bluff) or a chime (honest)
  stamp: (c, out, t) => {
    tone(c, out, t, { freq: 150, to: 40, peak: 0.55, attack: 0.003, dur: 0.22 });
    hiss(c, out, t, { type: 'lowpass', from: 360, to: 100, peak: 0.35, attack: 0.002, dur: 0.06 });
  },
  bluff: (c, out, t) => {
    tone(c, out, t, { type: 'sawtooth', freq: 440, to: 110, peak: 0.16, attack: 0.015, dur: 0.42, lp: 1400 });
    tone(c, out, t + 0.03, { type: 'square', freq: 220, to: 55, peak: 0.06, attack: 0.02, dur: 0.4, lp: 700 });
    tone(c, out, t + 0.26, { type: 'triangle', freq: 98, to: 82, peak: 0.14, attack: 0.02, dur: 0.5, lp: 600 });
  },
  honest: (c, out, t) => {
    tone(c, out, t, { freq: 659.25, peak: 0.28, dur: 0.4 });
    tone(c, out, t + 0.15, { freq: 987.77, peak: 0.28, dur: 0.55 });
    tone(c, out, t + 0.15, { freq: 1318.5, peak: 0.06, dur: 0.5 });
  },

  // turn flow
  turn: (c, out, t) => {
    tone(c, out, t, { freq: 784, peak: 0.16, dur: 0.12 });
    tone(c, out, t + 0.1, { freq: 1046.5, peak: 0.16, dur: 0.28 });
  },
  pass: (c, out, t) => tone(c, out, t, { type: 'triangle', freq: 440, to: 392, peak: 0.14, attack: 0.02, dur: 0.2 }),

  // game end
  win: (c, out, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(c, out, t + i * 0.11, { type: 'triangle', freq: f, peak: 0.3, dur: i === 3 ? 0.7 : 0.18 });
    });
    tone(c, out, t + 0.33, { freq: 1318.5, peak: 0.1, dur: 0.7 });
    tone(c, out, t + 0.33, { freq: 1567.98, peak: 0.06, dur: 0.6 });
  },
  lose: (c, out, t) => {
    tone(c, out, t, { type: 'triangle', freq: 220, to: 185, peak: 0.3, attack: 0.02, dur: 0.7 });
    tone(c, out, t + 0.06, { freq: 110, to: 88, peak: 0.3, attack: 0.03, dur: 1.0 });
  },
};

export const SOUNDS = Object.keys(FX);

export function isSupported() {
  return !!AC;
}

export function unlock() {
  try {
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  } catch {
    /* no audio, carry on silently */
  }
}

export function setMuted(on) {
  muted = !!on;
  try {
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.02);
  } catch {
    /* ignore */
  }
}

export function isMuted() {
  return muted;
}

export function play(name, { volume = 1, delay = 0 } = {}) {
  try {
    const fx = FX[name];
    if (!fx || muted || !unlocked) return false;
    const c = ensureContext();
    if (!c || c.state === 'closed') return false;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const t = c.currentTime + Math.max(0, delay);
    if (lastAt[name] != null && t - lastAt[name] < MIN_GAP) return false;
    lastAt[name] = t;
    let out = master;
    if (volume !== 1) {
      out = c.createGain();
      out.gain.value = Math.max(0, volume);
      out.connect(master);
    }
    fx(c, out, t);
    return true;
  } catch {
    return false;
  }
}

// Browsers only start audio inside a user gesture. Listen once for the first one.
if (typeof window !== 'undefined' && AC) {
  for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) {
    window.addEventListener(ev, unlock, { once: true, passive: true });
  }
}

export default { play, setMuted, isMuted, unlock, isSupported, SOUNDS };
