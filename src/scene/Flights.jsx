import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DECK_POS, PILE_POS, pileSlot, pileTop, deckTop, fanAnchor, FAN_SCALE, PANEL_TILT } from './layout.js';
import { CARD_D } from './textures.js';
import { handCardWorld, HAND_SLOT } from './handLayout.js';
import { makeCardObject, cardMaterials } from './Card.jsx';
import { FAN_LIVE } from './OpponentSeat.jsx';
import { PILE_LIVE, PILE_DROP } from './Pile.jsx';
import { useStore, shownHand, deckSize } from '../store.js';

// The imperative card animator. Registers fly(opts) with the store (store.setFlyer); the store's
// actions await it for the deal, your plays, bot plays, the reveal and the pile pickup.
//
//   fly({ from, to, count, faces, duration, stagger, arc, vanish }) -> Promise
//     from / to   { type: 'deck' } | { type: 'pile', base } | { type: 'seat', index, count }
//                 | { type: 'hand' } | { type: 'handCard', indices }
//     faces       cards to show face up (otherwise backs)
//     vanish      with a pile `from`: that many more pile cards (the rest of a swept pile, under
//                 the flying ones) disappear as the last flying card lifts off, so a deep pile
//                 leaves with the sweep instead of popping when the game state catches up
//
//   fly({ kind: 'reveal', cards, base, duration, stagger }) -> Promise
//     The bluff reveal: the real cards at pile slots base.. (cards[i] at base+i, the last on top)
//     lift off the pile, turn face up and fan out just above it, staggered, facing the camera, and
//     stay there (held) once the promise resolves. The next flight from the pile (the pickup
//     sweep) carries them off from where they hover, so the sweep is one motion; they also go
//     when the game leaves the reveal phase without one (reduced motion, a new game).
//     With reduceMotion they snap into place.
//
// Anchors resolve to the pose the card has (or will have) at rest, so hand-offs are seamless:
//   deck      the top of the deck as drawn
//   pile      slot base+i of the stack (base defaults to 0). A card leaving the pile starts at the
//             top (slot base+count-1-i); a card arriving stops PILE_DROP above its slot and the pile
//             settles it the rest of the way. Leaving tells the pile to hide those cards at once.
//   seat      a bot's fan: leaves from the lifted lead card, lands at the fan centre, and tells the
//             fan to drop the departing cards at once (OpponentSeat FAN_LIVE)
//   handCard  card indices[i] of your hand, where it is drawn (lifted if it is selected)
//   hand      the centre of your hand (for cards that will be sorted in afterwards)
//
// Tweens are plain objects advanced in useFrame; nothing allocates per frame. Flying cards are the
// same box and materials as the cards in the hand and on the pile (Card.jsx makeCardObject), and
// they are visible from the moment fly() is called, holding their start pose until their stagger
// comes round, so the fan or pile can hide its own copy immediately.

const FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // face down
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();

// The reveal fan: the cards hover REVEAL_RISE above the top of the pile, a touch toward the camera,
// square to it (PANEL_TILT, the camera's own pitch), REVEAL_GAP apart (a little closer when there
// are four, still clear of each other's corner index) and splayed REVEAL_SPLAY radians per step.
const REVEAL_RISE = 0.82;
const REVEAL_FWD = 0.12;
const REVEAL_GAP = { 1: 0, 2: 0.74, 3: 0.62, 4: 0.56 };
const REVEAL_SPLAY = 0.06;
const REVEAL_DROP = 0.035;
const REVEAL_HOP = 0.1;
const REVEAL_TURN_FROM = 0.18; // the card lifts a little before it starts to turn
const _euler = new THREE.Euler();
const _up = new THREE.Vector3(0, Math.cos(PANEL_TILT), Math.sin(PANEL_TILT)); // the tilted fan's up axis

function revealPose(i, k, pileCount) {
  const mid = (k - 1) / 2;
  const gap = REVEAL_GAP[Math.min(4, Math.max(1, k))] || 0.56;
  const dx = (i - mid) * gap;
  const dy = -Math.abs(i - mid) * REVEAL_DROP;
  const p = new THREE.Vector3(PILE_POS.x + dx, pileTop(pileCount) + REVEAL_RISE, PILE_POS.z + REVEAL_FWD).addScaledVector(_up, dy);
  const q = new THREE.Quaternion().setFromEuler(_euler.set(PANEL_TILT, 0, -(i - mid) * REVEAL_SPLAY, 'XYZ'));
  return { p, q };
}
// A card played from your hand turns over away from you on its way down: the shortest turn from the
// hand pose to face down would keep the face toward the camera for most of the flight. Instead the
// flight passes through a waypoint pitched back by TUMBLE about the card's own width axis (face to
// the sky, then away), so the back shows from about a third of the way and the card lands face down.
const TUMBLE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.6);
const angleBetween = (p, q) => 2 * Math.acos(Math.min(1, Math.abs(p.dot(q))));

// World pose for a named anchor. `side` is 'from' or 'to'; `i` the card's index of `count`.
function poseOf(a, i, count, side) {
  switch (a.type) {
    case 'deck': {
      const top = deckTop(deckSize(useStore.getState()));
      return { p: new THREE.Vector3(DECK_POS.x, top + CARD_D / 2, DECK_POS.z), q: FLAT_DOWN.clone() };
    }
    case 'pile': {
      const base = a.base || 0;
      const s = pileSlot(side === 'from' ? base + count - 1 - i : base + i);
      const lift = side === 'to' ? PILE_DROP : 0;
      return { p: s.position.clone().add(new THREE.Vector3(0, lift, 0)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, s.rotY)) };
    }
    case 'seat': {
      // Live fan if the seat is mounted: leave from the lifted card, land at the fan centre.
      const live = FAN_LIVE.get(a.index);
      if (live) {
        const src = side === 'from' ? live.lead : live.home;
        return { p: src.p.clone(), q: src.q.clone(), s: FAN_SCALE };
      }
      const f = fanAnchor(a.index, a.count);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-f.tilt, f.yaw, 0, 'YXZ'));
      return { p: f.pos.clone(), q, s: FAN_SCALE };
    }
    case 'handCard': {
      // At the hand's card size, where the card is drawn (lifted if it is selected).
      const n = shownHand(useStore.getState()).length;
      const idx = a.indices[Math.min(i, a.indices.length - 1)];
      const w = handCardWorld(idx, n);
      return { p: w.position, q: w.quaternion, s: w.scale };
    }
    case 'hand':
    default: return { p: HAND_SLOT.position.clone(), q: HAND_SLOT.quaternion.clone(), s: HAND_SLOT.scale };
  }
}

export default function Flights() {
  const group = useRef();
  const tweens = useRef([]);
  // The revealed cards hovering over the pile, bottom to top: { obj, card }. They outlive their
  // flight (see the reveal kind above) until the pickup sweep or the end of the reveal takes them.
  const held = useRef([]);
  const theme = useStore((s) => s.theme);
  const setFlyer = useStore((s) => s.setFlyer);

  useFrame(() => {
    const now = performance.now();
    const list = tweens.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      const t = Math.min(1, Math.max(0, (now - tw.start) / tw.duration));
      tw.update(easeOut(t), t);
      if (t >= 1) { tw.done(); list.splice(i, 1); }
    }
  });

  // The reveal is over without a sweep (reduced motion skips flights; a new game; back to setup):
  // drop the held cards. A theme change re-skins them in place.
  useEffect(() => useStore.subscribe(
    (s) => (s.game && s.game.phase === 'reveal' ? `${s.game.turn}` : null),
    (key) => {
      if (key !== null) return;
      const g = group.current;
      for (const h of held.current) if (g) g.remove(h.obj);
      held.current = [];
    },
  ), []);
  useEffect(() => {
    for (const h of held.current) h.obj.material = cardMaterials(h.card, theme);
  }, [theme]);

  useEffect(() => {
    const quick = () => useStore.getState().reduceMotion;

    // The reveal: cards[i] from pile slot base+i up to its place in the fan, turning face up.
    const reveal = ({ cards, base = 0, duration = 450, stagger = 120 }) => new Promise((resolve) => {
      const g = group.current;
      const k = cards.length;
      if (!g || !k) return resolve();
      const snap = quick();
      let left = k;
      for (const h of held.current) g.remove(h.obj); // a reveal on top of a stale one (should not happen)
      held.current = [];
      for (let i = 0; i < k; i++) {
        const obj = makeCardObject(cards[i], theme);
        const s = pileSlot(base + i);
        const a = { p: s.position.clone(), q: new THREE.Quaternion().setFromEuler(_euler.set(Math.PI / 2, 0, s.rotY)) };
        const b = revealPose(i, k, base + k);
        g.add(obj);
        held.current.push({ obj, card: cards[i] });
        if (snap) {
          // straight into place, and no frame needed to settle (a paused loop must not stall the game)
          obj.position.copy(b.p);
          obj.quaternion.copy(b.q);
          if (--left === 0) resolve();
          continue;
        }
        obj.position.copy(a.p);
        obj.quaternion.copy(a.q);
        tweens.current.push({
          start: performance.now() + i * stagger,
          duration: Math.max(1, duration),
          update: (e) => {
            obj.position.lerpVectors(a.p, b.p, e);
            obj.position.y += Math.sin(Math.PI * e) * REVEAL_HOP;
            const r = THREE.MathUtils.clamp((e - REVEAL_TURN_FROM) / (1 - REVEAL_TURN_FROM), 0, 1);
            obj.quaternion.slerpQuaternions(a.q, b.q, r);
          },
          done: () => { if (--left === 0) resolve(); },
        });
      }
      if (PILE_LIVE.depart) PILE_LIVE.depart(k);
    });

    const fly = (opts) => {
      if (opts.kind === 'reveal') return reveal(opts);
      const { from, to, count = 1, faces = null, duration = 560, stagger = 80, arc = 0.9, vanish = 0 } = opts;
      return new Promise((resolve) => {
        const g = group.current;
        if (!g || count <= 0) return resolve();
        let left = count;
        // the rest of a swept pile goes once the last flying card is clear of it (or when the flight ends)
        let rest = from.type === 'pile' && vanish > 0 ? vanish : 0;
        const dropRest = () => { if (rest && PILE_LIVE.depart) PILE_LIVE.depart(rest); rest = 0; };
        const tumble = (from.type === 'handCard' || from.type === 'hand') && to.type === 'pile';
        // Leaving the pile with revealed cards hovering over it: the top cards of the flight are
        // those (card i of the flight is the i-th from the top), carried off from where they hover.
        const carry = from.type === 'pile' ? held.current.splice(0, Math.min(count, held.current.length)) : [];
        for (let i = 0; i < count; i++) {
          const h = i < carry.length ? carry[carry.length - 1 - i] : null;
          const obj = h ? h.obj : makeCardObject(faces ? faces[i] : null, theme);
          const a = h ? { p: obj.position.clone(), q: obj.quaternion.clone() } : poseOf(from, i, count, 'from');
          const b = poseOf(to, i, count, 'to');
          // the tumble waypoint, and where it falls in the turn so the angular speed stays even
          const m = tumble ? a.q.clone().multiply(TUMBLE) : null;
          const split = m ? angleBetween(a.q, m) / Math.max(1e-6, angleBetween(a.q, m) + angleBetween(m, b.q)) : 0;
          obj.position.copy(a.p);
          obj.quaternion.copy(a.q);
          obj.scale.setScalar(a.s || 1);
          if (!h) g.add(obj);
          const start = performance.now() + i * stagger;
          const spin = new THREE.Quaternion().setFromAxisAngle(UP, (Math.random() - 0.5) * 0.6);
          const twist = new THREE.Quaternion();
          const last = i === count - 1;
          tweens.current.push({
            start,
            duration,
            update: (e) => {
              if (last && rest && e > 0.2) dropRest();
              obj.position.lerpVectors(a.p, b.p, e);
              obj.position.y += Math.sin(Math.PI * e) * arc;
              if (m) {
                if (e < split) obj.quaternion.slerpQuaternions(a.q, m, e / split);
                else obj.quaternion.slerpQuaternions(m, b.q, (e - split) / (1 - split));
              } else {
                obj.quaternion.slerpQuaternions(a.q, b.q, e);
              }
              if (e > 0 && e < 1) obj.quaternion.multiply(twist.copy(spin).slerp(IDENTITY, 1 - Math.sin(Math.PI * e)));
              obj.scale.setScalar(THREE.MathUtils.lerp(a.s || 1, b.s || 1, e));
            },
            done: () => { g.remove(obj); if (--left === 0) { dropRest(); resolve(); } },
          });
        }
        // The fan or the pile drops the departing cards straight away instead of waiting for the
        // game state (the pile already dropped the carried cards when they rose).
        if (from.type === 'seat') { const live = FAN_LIVE.get(from.index); if (live) live.depart(count); }
        if (from.type === 'pile' && PILE_LIVE.depart && count > carry.length) PILE_LIVE.depart(count - carry.length);
      });
    };
    setFlyer(fly);
    return () => setFlyer(null);
  }, [theme, setFlyer]);

  return <group ref={group} />;
}
