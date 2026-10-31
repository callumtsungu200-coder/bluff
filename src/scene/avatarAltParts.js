// Shared geometry, colours and pose tables for the soft low-poly avatar (AvatarAlt.jsx).
// Geometry is created once and shared by every bot; poses are plain number fields that
// the component lerps toward each frame, so nothing here allocates per frame.
import * as THREE from 'three';

const HALF = Math.PI * 0.5;

export const GEO = {
  head: new THREE.SphereGeometry(0.34, 24, 18),
  hair: new THREE.SphereGeometry(0.356, 24, 12, 0, Math.PI * 2, 0, HALF),
  ear: new THREE.SphereGeometry(0.07, 10, 8),
  cheek: new THREE.SphereGeometry(0.055, 10, 8),
  eye: new THREE.SphereGeometry(0.11, 18, 14),
  pupil: new THREE.SphereGeometry(0.056, 14, 10),
  glint: new THREE.SphereGeometry(0.022, 8, 6),
  nose: new THREE.SphereGeometry(0.045, 12, 10),
  brow: new THREE.BoxGeometry(0.16, 0.036, 0.04),
  mouthArc: new THREE.TorusGeometry(0.08, 0.02, 8, 20, Math.PI),
  mouthInner: new THREE.BoxGeometry(0.14, 0.07, 0.02),
  teeth: new THREE.BoxGeometry(0.11, 0.032, 0.02),
  torso: new THREE.CapsuleGeometry(0.38, 0.5, 8, 22),
  neck: new THREE.CylinderGeometry(0.12, 0.14, 0.3, 14),
  collar: new THREE.TorusGeometry(0.19, 0.05, 8, 22),
  shoulder: new THREE.SphereGeometry(0.13, 14, 10),
  upperArm: new THREE.CapsuleGeometry(0.1, 0.32, 6, 14),
  forearm: new THREE.CapsuleGeometry(0.09, 0.3, 6, 14),
  hand: new THREE.SphereGeometry(0.12, 14, 10),
  leg: new THREE.CapsuleGeometry(0.15, 0.3, 6, 14),
  foot: new THREE.SphereGeometry(0.15, 12, 8),
  ring: new THREE.RingGeometry(0.65, 0.8, 48),
  disc: new THREE.CircleGeometry(0.65, 48),
  // accessories
  lens: new THREE.TorusGeometry(0.125, 0.013, 8, 24),
  bridge: new THREE.BoxGeometry(0.08, 0.022, 0.022),
  temple: new THREE.BoxGeometry(0.022, 0.022, 0.3),
  scarf: new THREE.TorusGeometry(0.26, 0.1, 10, 26),
  scarfTail: new THREE.CapsuleGeometry(0.07, 0.3, 4, 10),
  capDome: new THREE.SphereGeometry(0.36, 22, 10, 0, Math.PI * 2, 0, HALF),
  capBrim: new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20, 1, false, 0, Math.PI),
  capButton: new THREE.SphereGeometry(0.04, 8, 6),
  hatBrim: new THREE.CylinderGeometry(0.5, 0.5, 0.035, 28),
  hatCrown: new THREE.CylinderGeometry(0.26, 0.29, 0.24, 24),
  hatBand: new THREE.CylinderGeometry(0.292, 0.298, 0.07, 24),
  bowWing: new THREE.BoxGeometry(0.12, 0.08, 0.03),
  bowKnot: new THREE.SphereGeometry(0.035, 8, 6),
};

// Per-theme extras that the shared THEME table does not carry.
export const EXTRA = {
  classic: {
    hair: ['#3b2a5a', '#4a2a14', '#1a1410'],
    ink: '#1a1410',
    eyeWhite: '#fffaf0',
    pupil: '#1a1410',
    pupilGlow: 0,
    glint: '#ffffff',
    blush: '#ff7a7a',
    frame: '#2a2420',
    cap: '#2b4c7e',
    hat: '#1a1410',
    bow: '#c0392b',
    scarf: '#c0392b',
  },
  future: {
    hair: ['#aab4c8', '#cfd6e2', '#143d40'],
    ink: '#0b0e14',
    eyeWhite: '#0f141e',
    pupil: '#e6eaf2',
    pupilGlow: 0.6,
    glint: '#5ce1e6',
    blush: '#5ce1e6',
    frame: '#e6eaf2',
    cap: '#3d4a66',
    hat: '#1a2233',
    bow: '#5ce1e6',
    scarf: '#5ce1e6',
  },
};

// Body landmarks in local space (feet at the origin, +z toward the player). With the seat at
// world y -0.7 the table top is local 0.7 and the card fan centre local (0, 1.25, 1.0).
export const DIM = {
  headY: 1.64,      // head group pivot (base of the neck)
  headUp: 0.24,     // head centre above the pivot
  shoulderY: 1.46,
  shoulderX: 0.36,
  shoulderZ: 0.04,
  elbow: 0.5,       // distance shoulder to elbow
  handDrop: 0.5,    // distance elbow to hand
  browY: 0.17,
  eyeX: 0.135,
  eyeY: 0.04,
  eyeZ: 0.265,
};

// Every pose field. L = local -x arm (screen left), R = local +x arm.
export const KEYS = [
  'lean', 'bounce', 'roll', 'twist',
  'headPitch', 'headYaw', 'headRoll', 'headZ',
  'shLx', 'shLz', 'shLy', 'elLx',
  'shRx', 'shRz', 'shRy', 'elRx',
  'browL', 'browR', 'browY',
  'mouthX', 'mouthY', 'mouthOpen',
  'eyeOpen', 'eyeX', 'eyeY',
  'ring',
];

export function makePose(from) {
  const p = {};
  for (const k of KEYS) p[k] = from ? from[k] : 0;
  return p;
}

// Holding the cards: shoulder (x, z) and elbow angles that put each hand on a lower corner of
// the fan, local (±0.53, 1.16, 0.89). Shoulder Euler order is XYZ, so z (swing out) applies first.
export const HOLD = { shx: -0.82, shz: 0.2, elx: -0.8 };
// One hand up to the cheek while thinking (the arm nearer the table centre). Solved so the hand
// sits beside the jaw at local (±0.33, 1.72, 0.41), above the fan from the camera's angle.
export const CHIN = { shx: -1.39, shz: 0.3, elx: -2.45 };

export const REST = Object.assign(makePose(), {
  headPitch: 0.04,
  shLx: HOLD.shx, shLz: -HOLD.shz, elLx: HOLD.elx,
  shRx: HOLD.shx, shRz: HOLD.shz, elRx: HOLD.elx,
  browY: 0, mouthX: 1, mouthY: 1, mouthOpen: 0, eyeOpen: 1,
});

// Face per mood. Brow angles: positive lifts the +x end of the brow.
export const MOODS = {
  smile: { browL: 0.12, browR: -0.12, browY: 0, mouthX: 1, mouthY: 1, mouthOpen: 0, eyeOpen: 1, eyeX: 0, eyeY: 0 },
  grin: { browL: 0.22, browR: -0.22, browY: 0.035, mouthX: 1.45, mouthY: 1.3, mouthOpen: 0.75, eyeOpen: 0.82, eyeX: 0, eyeY: 0.01 },
  think: { browL: 0.3, browR: 0.08, browY: 0.02, mouthX: 0.75, mouthY: 0.12, mouthOpen: 0, eyeOpen: 0.62, eyeX: 0.025, eyeY: 0.03 },
};

export const GESTURE_MS = { play: 700, call: 900, pass: 700, lose: 1200, win: Infinity };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// 0 -> 1 over [0, a], hold, then 1 -> 0 over [b, 1]
const envelope = (p, a, b) => (p < a ? smooth(p / a) : p < b ? 1 : smooth((1 - p) / (1 - b)));

function mix(t, k, goal, w) { t[k] += (goal - t[k]) * w; }

// Blend a gesture into the target pose. `p` is progress 0..1 (or seconds for 'win'),
// `side` is +1 for the right arm (local +x) or -1 for the left. Arm angles were solved so the
// hands clear the fan: 'call' points high over the card tops, 'play' pushes under the bottom edge.
export function gestureInto(t, type, p, side) {
  const R = side > 0;
  const shx = R ? 'shRx' : 'shLx', shz = R ? 'shRz' : 'shLz', elx = R ? 'elRx' : 'elLx';
  if (type === 'play') {
    const w = envelope(p, 0.35, 0.6);
    mix(t, 'lean', 0.1, w);
    mix(t, 'headPitch', 0.2, w);
    mix(t, shx, -1.05, w);
    mix(t, shz, -side * 0.05, w);
    mix(t, elx, -0.15, w);
    mix(t, 'mouthOpen', 0.2, w);
    return;
  }
  if (type === 'call') {
    const w = envelope(p, 0.25, 0.78);
    mix(t, 'lean', 0.1, w);
    mix(t, 'headZ', 0.1, w);
    mix(t, 'headPitch', -0.1, w);
    t.bounce += Math.abs(Math.sin(p * Math.PI * 4)) * 0.05 * w;
    mix(t, shx, -2.4, w);
    mix(t, shz, -side * 0.1, w);
    mix(t, elx, -0.5, w);
    mix(t, 'browL', -0.35, w);
    mix(t, 'browR', 0.35, w);
    mix(t, 'browY', -0.03, w);
    mix(t, 'eyeOpen', 1.15, w);
    mix(t, 'mouthX', 1.2, w);
    mix(t, 'mouthY', 1, w);
    mix(t, 'mouthOpen', 0.5, w);
    return;
  }
  if (type === 'pass') {
    const w = envelope(p, 0.3, 0.6);
    mix(t, 'shLx', -0.35, w); mix(t, 'shLz', -0.8, w); mix(t, 'shLy', 0.08, w); mix(t, 'elLx', -1.95, w);
    mix(t, 'shRx', -0.35, w); mix(t, 'shRz', 0.8, w); mix(t, 'shRy', 0.08, w); mix(t, 'elRx', -1.95, w);
    mix(t, 'headRoll', 0.25, w);
    mix(t, 'lean', -0.03, w);
    mix(t, 'browL', 0.3, w);
    mix(t, 'browR', -0.05, w);
    mix(t, 'browY', 0.03, w);
    mix(t, 'mouthX', 0.8, w);
    mix(t, 'mouthY', 0.12, w);
    mix(t, 'mouthOpen', 0, w);
    mix(t, 'eyeOpen', 0.9, w);
    return;
  }
  if (type === 'lose') {
    const w = envelope(p, 0.25, 0.85);
    mix(t, 'headPitch', 0.5, w);
    t.headYaw += Math.sin(p * Math.PI * 4) * 0.22 * w;
    mix(t, 'lean', 0.15, w);
    mix(t, 'bounce', -0.05, w);
    mix(t, 'shLx', -0.7, w); mix(t, 'shLz', -0.22, w); mix(t, 'shLy', -0.06, w); mix(t, 'elLx', -0.75, w);
    mix(t, 'shRx', -0.7, w); mix(t, 'shRz', 0.22, w); mix(t, 'shRy', -0.06, w); mix(t, 'elRx', -0.75, w);
    mix(t, 'browL', 0.38, w);
    mix(t, 'browR', -0.38, w);
    mix(t, 'browY', 0.02, w);
    mix(t, 'mouthX', 0.8, w);
    mix(t, 'mouthY', -1, w);
    mix(t, 'mouthOpen', 0, w);
    mix(t, 'eyeOpen', 0.7, w);
    mix(t, 'eyeY', -0.03, w);
    return;
  }
  if (type === 'win') {
    const s = p; // seconds since the win started
    const w = smooth(s / 0.35);
    const wave = Math.sin(s * 7) * 0.3;
    t.bounce += Math.abs(Math.sin(s * 7)) * 0.12 * w;
    mix(t, 'lean', -0.05, w);
    mix(t, 'headRoll', Math.sin(s * 3.5) * 0.15, w);
    mix(t, 'shLx', -2.3, w); mix(t, 'shLz', -0.36, w); mix(t, 'elLx', -0.92 + wave, w);
    mix(t, 'shRx', -2.3, w); mix(t, 'shRz', 0.36, w); mix(t, 'elRx', -0.92 - wave, w);
    mix(t, 'browL', 0.22, w);
    mix(t, 'browR', -0.22, w);
    mix(t, 'browY', 0.04, w);
    mix(t, 'mouthX', 1.45, w);
    mix(t, 'mouthY', 1.3, w);
    mix(t, 'mouthOpen', 0.85, w);
    mix(t, 'eyeOpen', 0.85, w);
  }
}
