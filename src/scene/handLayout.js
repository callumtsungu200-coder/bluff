// World-space layout of the player's hand. The table top is y = 0; the camera is at (0, 6.6, 8.4)
// (layout.js CAMERA) looking down at about 36 degrees, so the hand floats high over the near edge,
// about 10 degrees below the camera's centre line.
import * as THREE from 'three';

// Your hand: a fan standing up at the near edge, facing the camera. The group leans back a little
// less than square to the camera so the tops of the cards foreshorten slightly, which reads as held.
// HAND_CENTER is mutated in place by setHandFraming (portrait screens pull the hand closer), so read
// it at call time rather than copying it once.
const HAND_BASE = new THREE.Vector3(0, 2.1, 4.1);
export const HAND_CENTER = HAND_BASE.clone();
export const HAND_TILT = -0.68; // radians about x, negative leans the tops away from the camera
export const HAND_SCALE = 1.15; // cards in the hand are a little bigger than table cards
export const HAND_INACTIVE_DROP = 0.08; // the whole fan settles this much lower when it is not your turn

// Fan shape. Cards sit on a shallow arc around a pivot below the hand, so outer cards drop and rotate
// like real cards held in one hand. Spacing stays wide enough to read every rank index up to about 20
// cards, then compresses; the arc flattens as the fan widens so the drop stays bounded.
const SPACING_MAX = 0.3;
const SPACING_MIN = 0.165;
const SPAN = 4.6; // horizontal room (centre to centre) before spacing starts to compress
const PIVOT_R = 5.5; // arc radius for a normal-sized hand
const DROP_MAX = 0.32; // outer cards never sit lower than this below the centre card
const Z_STEP = 0.007; // later cards sit closer to the camera: the right neighbour overlaps the left

export function handSpacing(n) {
  if (n <= 1) return SPACING_MAX;
  return THREE.MathUtils.clamp(SPAN / (n - 1), SPACING_MIN, SPACING_MAX);
}

export function handLayout(n) {
  const spacing = handSpacing(n);
  const mid = (n - 1) / 2;
  const xMax = mid * spacing;
  // widen the arc when the fan is so wide that the normal radius would drop the ends too far
  const r = Math.max(PIVOT_R, (xMax * xMax) / (2 * DROP_MAX));
  return Array.from({ length: n }, (_, i) => {
    const k = i - mid;
    const x = k * spacing;
    return {
      x,
      y: -(r - Math.sqrt(Math.max(r * r - x * x, 0))),
      z: i * Z_STEP,
      rot: -Math.atan2(x, r),
    };
  });
}

// Hand.jsx reports how the hand is framed; HAND_CENTER and HAND_SLOT follow so flights stay exact.
// Portrait screens widen the camera (Scene's Rig), which would leave the hand small and high, so the
// hand comes closer to the camera and a little lower, using the same `portrait` measure the Rig does.
// When it is not your turn the whole fan settles by HAND_INACTIVE_DROP.
const framing = { aspect: 1.68, active: true };
// Where the hand's centre sits for a stage aspect (pure; the camera's portrait fit reads it too).
export function handCenterFor(aspect, active = true) {
  const portrait = Math.max(1, 1.45 / Math.max(aspect, 0.01));
  const t = THREE.MathUtils.clamp((portrait - 1) / 0.45, 0, 1);
  return new THREE.Vector3(HAND_BASE.x, HAND_BASE.y - 0.22 * t - (active ? 0 : HAND_INACTIVE_DROP), HAND_BASE.z + 0.75 * t);
}
export function setHandFraming({ aspect = framing.aspect, active = framing.active } = {}) {
  framing.aspect = aspect;
  framing.active = active;
  HAND_CENTER.copy(handCenterFor(aspect, active));
  const slot = handCardWorld(0, 1);
  HAND_SLOT.position.copy(slot.position);
  HAND_SLOT.quaternion.copy(slot.quaternion);
  return HAND_CENTER;
}

// Scratch objects for handCardWorld (called from flights, outside the render loop).
const _g = new THREE.Object3D();
const _c = new THREE.Object3D();
_g.add(_c);

// Offsets of cards Hand.jsx is currently showing lifted (selected), by index, so a flight that leaves
// the hand starts from where the card is drawn rather than from its resting slot.
const live = { n: 0, dy: null, dz: null, tilt: null };
export function setHandLive(n, dy, dz, tilt) {
  live.n = n; live.dy = dy; live.dz = dz; live.tilt = tilt;
}

// World pose of card i of n in the fan. Pass `lift` to force an offset along the card's own up axis;
// leave it out to get the pose as rendered (resting, or lifted if the card is selected).
// Flights start here, so it must stay in step with what Hand.jsx renders.
export function handCardWorld(i, n, lift) {
  const l = handLayout(n)[i] || { x: 0, y: 0, z: 0, rot: 0 };
  let dy = lift || 0, dz = 0, tilt = 0;
  if (lift === undefined && live.n === n && live.dy && live.dy[i]) {
    dy = live.dy[i]; dz = live.dz[i]; tilt = live.tilt[i];
  }
  _g.position.copy(HAND_CENTER);
  _g.rotation.set(HAND_TILT, 0, 0);
  _c.position.set(l.x, l.y + dy, l.z + dz);
  _c.rotation.set(tilt, 0, l.rot);
  _g.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  _c.getWorldPosition(position);
  _c.getWorldQuaternion(quaternion);
  return { position, quaternion, scale: HAND_SCALE };
}

// Where cards land when they fly "to the hand" (a single centred card); kept in step by setHandFraming.
export const HAND_SLOT = handCardWorld(0, 1);
