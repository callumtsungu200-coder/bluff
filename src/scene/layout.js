// World-space layout of the table. Units are metres-ish; the table top is y = 0.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D } from './textures.js';
import { handLayout, handCenterFor, HAND_TILT, HAND_SCALE } from './handLayout.js';

export const TABLE_RX = 4.2; // ellipse radii of the table top
export const TABLE_RZ = 2.9;
export const TABLE_TOP = 0;

// The camera sits at your seat and looks down at the table at about 36 degrees. OrbitControls lets
// the view drift a few degrees around this pose (CAMERA_ORBIT, radians) and no further.
export const CAMERA = { pos: [0, 6.6, 8.4], look: [0, 0.2, -0.4], fov: 40 };
export const CAMERA_ORBIT = { azimuth: THREE.MathUtils.degToRad(6), polar: THREE.MathUtils.degToRad(4) };

export const DECK_POS = new THREE.Vector3(-1.05, TABLE_TOP, -0.55);
export const PILE_POS = new THREE.Vector3(0.75, TABLE_TOP, -0.55);
export const MARKER_POS = new THREE.Vector3(-2.75, TABLE_TOP + 0.005, -0.1);

// Future: the rank hologram floats low over the felt left of the pile (where Classic paints its
// marker), a HOLO_SIZE square leaning back by HOLO_TILT, its bottom edge a hair above the table.
// Projected, it stays below and inside every seat's fan whatever the seat count (1 to 3), clear of
// the pile, the deck and the revealed cards' hover, so it never covers a panel, a fan or a bubble;
// on narrow stages the camera backs off and everything shrinks together, so it stays put.
export const HOLO_POS = new THREE.Vector3(-1.8, 0.58, 0.0);
export const HOLO_SIZE = 1.1;
export const HOLO_TILT = -0.32;

// Bots sit around the far edge. Returns { pos (feet on the floor), yaw (facing the table centre) }.
export function seatFor(index, count) {
  const angles = { 1: [90], 2: [60, 120], 3: [38, 90, 142] }[count] || [90];
  const a = THREE.MathUtils.degToRad(angles[index]);
  const x = Math.cos(a) * (TABLE_RX + 0.9);
  const z = -Math.sin(a) * (TABLE_RZ + 0.9);
  // Face the player (who sits at the near edge), not the exact centre.
  const yaw = Math.atan2(0 - x, 4.5 - z);
  return { pos: new THREE.Vector3(x, -0.7, z), yaw, angle: a };
}

// Shared contract between the avatars (hands) and the fan: the fan centre (the middle card's centre)
// sits FAN_FORWARD ahead of the feet along the facing direction, at world height FAN_HEIGHT (feet are
// at y -0.7, so local y 1.25), leaned back by FAN_TILT radians. Cards are drawn at FAN_SCALE of a full
// card and splay from a pivot below the fan, so a full fan is about 1.35 wide at the top and 0.8 at
// the bottom. Avatars reach for its lower corners, FAN_GRIP in avatar space (feet at the origin,
// +z toward the fan): fingers just behind the cards, thumbs on them.
export const FAN_FORWARD = 1.0;
export const FAN_HEIGHT = 0.55;
export const FAN_TILT = 0.3;
export const FAN_SCALE = 0.74;
export const FAN_GRIP = { x: 0.5, y: 1.1, z: 0.85 };

// Where a bot's fan of cards hovers: FAN_FORWARD ahead of its feet along the way it faces (over the
// felt, just inside the rim) at chest height, so it reads as held in front of the body without hiding
// the face. yaw turns the fan square to the camera; tilt (radians) leans it back so the backs face
// the camera.
export function fanAnchor(index, count) {
  const s = seatFor(index, count);
  const x = s.pos.x + Math.sin(s.yaw) * FAN_FORWARD;
  const z = s.pos.z + Math.cos(s.yaw) * FAN_FORWARD;
  const yaw = Math.atan2(CAMERA.pos[0] - x, CAMERA.pos[2] - z);
  return { pos: new THREE.Vector3(x, FAN_HEIGHT, z), yaw, tilt: FAN_TILT };
}

// Future: the holographic seat panel floats PANEL_BACK behind the fan (away from the camera) with its
// bottom edge at PANEL_BOTTOM (a wide panel's centre sits at PANEL_Y). It lies parallel to the
// camera's image plane (pitched back by the camera's own pitch, PANEL_TILT, no yaw), so every panel
// projects as an upright rectangle wherever it sits; the seat's fan and ring below it are what tie
// it to the seat. The speech bubble (a DOM label) hangs from panelAnchor(...).bubble, just over the
// panel's top edge.
//
// Wide stages get the wide panel (name and tag beside the mark, the count at the right). Narrow
// (portrait) stages get the compact one, PANEL_COMPACT, with the count under the name, drawn up to
// half as large again (panelSizeFor), so the count stays readable on a phone where the whole table
// is a few hundred pixels wide.
export const PANEL_W = 1.9;
export const PANEL_H = 0.82;
export const PANEL_COMPACT = { w: 1.28, h: 1.2 };
export const PANEL_BACK = 0.65;
export const PANEL_Y = 1.95;
export const PANEL_BOTTOM = PANEL_Y - PANEL_H / 2;
export const PANEL_TILT = -Math.atan2(CAMERA.pos[1] - CAMERA.look[1], CAMERA.pos[2] - CAMERA.look[2]);
const PANEL_UP = new THREE.Vector3(0, Math.cos(PANEL_TILT), Math.sin(PANEL_TILT)); // the panel's up axis in world space
const PANEL_WIDE_SIZE = Object.freeze({ w: PANEL_W, h: PANEL_H, scale: 1, compact: false });

// The panel variant and scale for a stage aspect: { w, h } in world units (already scaled), `scale`
// (what to draw the unit panel at) and `compact`. Grows from aspect 1.45 down; compact below 1.19.
export function panelSizeFor(aspect) {
  const t = THREE.MathUtils.clamp((1.45 / Math.max(aspect, 0.01) - 1) / 0.45, 0, 1);
  if (t <= 0) return PANEL_WIDE_SIZE;
  const scale = 1 + 0.5 * t;
  const compact = t > 0.5;
  const base = compact ? PANEL_COMPACT : { w: PANEL_W, h: PANEL_H };
  return { w: base.w * scale, h: base.h * scale, scale, compact };
}

export function panelAnchor(index, count, size = PANEL_WIDE_SIZE) {
  const f = fanAnchor(index, count);
  const x = f.pos.x - Math.sin(f.yaw) * PANEL_BACK;
  const z = f.pos.z - Math.cos(f.yaw) * PANEL_BACK;
  // the bottom edge stays put whatever the size; the centre and the bubble climb the panel's up axis
  const bottom = new THREE.Vector3(x, PANEL_Y, z).addScaledVector(PANEL_UP, -PANEL_H / 2);
  const pos = bottom.clone().addScaledVector(PANEL_UP, size.h / 2);
  const bubble = bottom.clone().addScaledVector(PANEL_UP, size.h);
  bubble.y += 0.1;
  // the middle of the panel's right edge (no yaw, so the edge is +x): the DOM bubble measures the
  // panel's half-size on screen from it when it has to sit beside the panel (Labels.jsx `edge`)
  const side = pos.clone();
  side.x += size.w / 2;
  return { pos, yaw: 0, tilt: PANEL_TILT, bubble, side, size };
}

// The bubble anchor and the panel's side point as shared, live vectors per seat: the DOM bubble
// (SeatPlate, outside the Canvas) projects them every frame and the HoloSeat (inside, which knows
// the stage aspect) moves them to its panel's top edge and right edge, so both agree whatever the
// panel's size.
const BUBBLE_LIVE = new Map();
const SIDE_LIVE = new Map();
export function panelBubbleLive(index, count) {
  const key = `${index}/${count}`;
  let v = BUBBLE_LIVE.get(key);
  if (!v) { v = panelAnchor(index, count).bubble; BUBBLE_LIVE.set(key, v); }
  return v;
}
export function panelSideLive(index, count) {
  const key = `${index}/${count}`;
  let v = SIDE_LIVE.get(key);
  if (!v) { v = panelAnchor(index, count).side; SIDE_LIVE.set(key, v); }
  return v;
}

export * from './handLayout.js';

// World points the camera must keep in frame on portrait stages (CameraRig's fit): the hand at its
// widest (17 cards or more spread to the full span) with its outer cards' corners and the centre
// card's top and bottom, and the outer top and bottom corners of the side panels in the three-bot
// layout, at the panel size that aspect gets. Called on resize only.
const FRAME_HAND_CARDS = 26;
const _hand = new THREE.Object3D();
export function framePoints(aspect) {
  const pts = [];
  _hand.position.copy(handCenterFor(aspect, true));
  _hand.rotation.set(HAND_TILT, 0, 0);
  _hand.updateMatrixWorld(true);
  const lay = handLayout(FRAME_HAND_CARDS);
  const o = lay[lay.length - 1];
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const local = (cx, cy) => new THREE.Vector3((o.x + cx * c - cy * s) * HAND_SCALE, (o.y + cx * s + cy * c) * HAND_SCALE, o.z);
  for (const [cx, cy] of [[CARD_W / 2, CARD_H / 2], [CARD_W / 2, -CARD_H / 2], [-CARD_W / 2, -CARD_H / 2]]) {
    const p = local(cx, cy);
    pts.push(_hand.localToWorld(p.clone()));
    p.x = -p.x;
    pts.push(_hand.localToWorld(p));
  }
  pts.push(_hand.localToWorld(new THREE.Vector3(0, -CARD_H / 2 * HAND_SCALE, 0)));
  pts.push(_hand.localToWorld(new THREE.Vector3(0, CARD_H / 2 * HAND_SCALE, 0)));
  const size = panelSizeFor(aspect);
  for (const i of [0, 2]) {
    const a = panelAnchor(i, 3, size);
    const sx = Math.sign(a.pos.x) || 1;
    for (const dir of [1, -1]) {
      const p = a.pos.clone().addScaledVector(PANEL_UP, dir * size.h / 2);
      p.x += sx * size.w / 2;
      pts.push(p);
    }
  }
  return pts;
}

// Cards on the pile stack at the real card thickness (CARD_D, the box depth in Card.jsx) with a
// hair of air between them, each with its own small, fixed scatter and twist, so the stack reads as
// tossed down and never changes shape between renders. pileSlot(i) is the pose of the i-th card from
// the bottom (its box centre); pileTop(n) is the height of the top of an n-card stack.
export const PILE_GAP = 0.0006;
export const PILE_STEP = CARD_D + PILE_GAP;
const SCATTER = (() => {
  // a tiny deterministic generator so the scatter is the same in every session
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 64 }, () => ({
    dx: (rnd() - 0.5) * 0.11, dz: (rnd() - 0.5) * 0.09, ry: (rnd() - 0.5) * 0.46,
  }));
})();
export function pileSlot(i) {
  const k = SCATTER[Math.max(0, i) % SCATTER.length];
  return {
    position: new THREE.Vector3(PILE_POS.x + k.dx, TABLE_TOP + CARD_D / 2 + i * PILE_STEP, PILE_POS.z + k.dz),
    rotY: k.ry,
  };
}
export const pileTop = (n) => TABLE_TOP + Math.max(0, n) * PILE_STEP;

// The deck during the deal: a tidy stack beside the pile. deckDrawn(size) is how many boxes stand
// for `size` cards; flights leave from the top of what is drawn.
export const DECK_PER_BOX = 4;
export const deckDrawn = (size) => Math.min(Math.ceil(size / DECK_PER_BOX), 13);
export const deckTop = (size) => TABLE_TOP + deckDrawn(size) * PILE_STEP;

export const CARD_THICKNESS = CARD_D;
export { CARD_W, CARD_D };
