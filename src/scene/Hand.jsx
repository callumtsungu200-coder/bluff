import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { useSpring, animated } from '@react-spring/three';
import * as THREE from 'three';
import { THEME, CARD_W, CARD_H, CARD_D, GLOW_SPAN, cardGlowTexture, tabTexture, handShadowTexture } from './textures.js';
import { handLayout, handSpacing, setHandFraming, setHandLive, HAND_CENTER, HAND_TILT, HAND_SCALE } from './handLayout.js';
import Card3D from './Card.jsx';
import { useStore } from '../store.js';

// The player's hand: a fan of real cards standing up near the camera. Every card is a spring: hover
// lifts and tips it a little, a pick lifts it higher with a lit edge and a soft halo behind it, and
// a refused pick (four already chosen) shakes it. Layout numbers live in handLayout.js so flights
// can start from the same positions.

const LIFT_HOVER = 0.11;
const LIFT_SELECTED = 0.34;
const FORWARD_HOVER = 0.03;
const FORWARD_SELECTED = 0.14;
const TILT_HOVER = 0.1; // top of the card tips toward the camera
const TILT_SELECTED = 0.05;
const ENTER_DROP = 0.18; // a card that appears rises in from this far below its slot
const SHADOW_BACK = 2.2; // the shadow sits this far into the table from the hand centre

// Springs. A card settles in about 300 ms with a touch of overshoot; the fan as a whole is calmer.
// store.reduceMotion makes every spring immediate.
const SPRING = { tension: 300, friction: 26 };
const SPRING_SOFT = { tension: 180, friction: 26 };
const SHAKE = { duration: 380 };

/* ---------- shared geometry and materials ---------- */

const matCache = new Map();
function cachedMaterial(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
const glowMaterial = (accent) => cachedMaterial(`glow:${accent}`, () => new THREE.MeshBasicMaterial({
  map: cardGlowTexture(accent), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false,
}));
const tabMaterial = (accent) => cachedMaterial(`tab:${accent}`, () => new THREE.MeshBasicMaterial({
  map: tabTexture(accent), transparent: true, depthWrite: false, toneMapped: false,
}));
const shadowMaterial = () => cachedMaterial('shadow', () => new THREE.MeshBasicMaterial({
  map: handShadowTexture(), transparent: true, depthWrite: false,
}));

const unitPlane = new THREE.PlaneGeometry(1, 1);
const glowGeometry = new THREE.PlaneGeometry(CARD_W * GLOW_SPAN.x, CARD_H * GLOW_SPAN.y);
const tabGeometry = new THREE.PlaneGeometry(0.2, 0.066);
// Hit area: a card-wide strip anchored at its bottom edge, scaled per card to the card's height plus
// the headroom its lifted pose needs. It never moves with the spring, so hovering cannot flicker.
const hitGeometry = new THREE.PlaneGeometry(CARD_W * HAND_SCALE, 1).translate(0, 0.5, 0);
const HIT_HEADROOM = 0.05;

// ?hand=sel:0,3;hover:5;off poses the hand for screenshots (indices into the hand; off = not your
// turn), and ?select=N is shorthand for picking the first N cards. Picks go through the store.
const PREVIEW = (() => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const q = params.get('hand');
  const count = Number(params.get('select')) || 0;
  if (!q && !count) return null;
  const out = { sel: Array.from({ length: Math.max(0, count) }, (_, i) => i), hover: -1, off: false };
  for (const part of (q || '').split(';')) {
    const [k, v = ''] = part.split(':');
    if (k === 'sel') out.sel = v.split(',').map(Number).filter((x) => !Number.isNaN(x));
    else if (k === 'hover') out.hover = Number(v);
    else if (k === 'off') out.off = true;
  }
  return out;
})();

/* ---------- one card ---------- */

function HandCard({ card, slot, theme, selected, hovered, active, match, hidden, reduceMotion, onToggle, onHover, onUnhover }) {
  const T = THEME[theme];
  const glowMat = useMemo(() => glowMaterial(T.accent), [T.accent]);
  const tabMat = useMemo(() => tabMaterial(T.accent), [T.accent]);

  const hover = hovered && active && !selected;
  const lift = selected ? LIFT_SELECTED : hover ? LIFT_HOVER : 0;
  const forward = selected ? FORWARD_SELECTED : hover ? FORWARD_HOVER : 0;
  const tilt = selected ? TILT_SELECTED : hover ? TILT_HOVER : 0;

  // Pose and halo. A card that mounts (picked up from the pile) rises in from just below its slot.
  // A hidden card (still being dealt, or away on a flight) waits snapped at its slot: the deal
  // flight ends exactly there (Flights 'handCard'), so the card simply takes over when it shows.
  // Rotation is Euler XYZ, as handCardWorld builds it.
  const { pos, rot, glow } = useSpring({
    from: { pos: [slot.x, slot.y - ENTER_DROP, slot.z], rot: [0, 0, slot.rot], glow: 0 },
    pos: hidden ? [slot.x, slot.y, slot.z] : [slot.x, slot.y + lift, slot.z + forward],
    rot: [tilt, 0, slot.rot],
    glow: selected ? 1 : 0,
    config: SPRING,
    immediate: hidden || reduceMotion,
  });
  const glowVisible = useMemo(() => glow.to((v) => v > 0.02), [glow]);

  // A refused pick: two quick, fading side-to-side wiggles.
  const [{ shake }, shakeApi] = useSpring(() => ({ shake: 0, config: SHAKE }));
  const shakeX = useMemo(() => shake.to((v) => Math.sin(v * Math.PI * 4) * (1 - v) * 0.045), [shake]);
  const shakeR = useMemo(() => shake.to((v) => Math.sin(v * Math.PI * 4) * (1 - v) * 0.07), [shake]);

  const click = (e) => {
    e.stopPropagation();
    if (!active) return;
    if (onToggle(card.id) === false && !reduceMotion) shakeApi.start({ from: { shake: 0 }, to: { shake: 1 } });
  };
  const over = (e) => {
    e.stopPropagation();
    onHover(card.id);
    if (active) document.body.style.cursor = 'pointer';
  };
  const out = () => {
    onUnhover(card.id);
    document.body.style.cursor = '';
  };

  const hitHeight = CARD_H * HAND_SCALE + (selected ? LIFT_SELECTED : LIFT_HOVER) + HIT_HEADROOM;

  return (
    <group visible={!hidden}>
      {!hidden && (
        <group position={[slot.x, slot.y, slot.z]} rotation-z={slot.rot}>
          <mesh
            geometry={hitGeometry}
            position-y={-CARD_H * HAND_SCALE * 0.5}
            scale-y={hitHeight}
            visible={false}
            onClick={click}
            onPointerOver={over}
            onPointerOut={out}
          />
        </group>
      )}
      <animated.group position={pos} rotation={rot}>
        <animated.group position-x={shakeX} rotation-z={shakeR} scale={HAND_SCALE}>
          <animated.mesh geometry={glowGeometry} material={glowMat} position-z={-0.03} scale={glow} visible={glowVisible} />
          <Card3D card={card} theme={theme} glow={selected} />
          <mesh geometry={tabGeometry} material={tabMat} position={[-CARD_W / 2 + 0.15, CARD_H / 2 + 0.018, CARD_D / 2 + 0.002]} visible={match} />
        </animated.group>
      </animated.group>
    </group>
  );
}

/* ---------- the hand ---------- */

export default function Hand({ hand, selected, ghost, visibleCount, active, matchRank, onToggle, theme }) {
  const [hoveredId, setHovered] = useState(null);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const { size } = useThree();
  const n = hand.length;
  const layout = useMemo(() => handLayout(n), [n]);
  const shadowMat = useMemo(() => shadowMaterial(), []);

  const isActive = PREVIEW ? !PREVIEW.off : active;
  const hovered = PREVIEW && PREVIEW.hover >= 0 && hand[PREVIEW.hover] ? hand[PREVIEW.hover].id : hoveredId;

  const unhover = useCallback((id) => setHovered((h) => (h === id ? null : h)), []);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  // Preview picks go through the store once, so the action bar and the play flight see them too.
  const previewed = useRef(false);
  useEffect(() => {
    if (!PREVIEW || previewed.current || !n) return;
    previewed.current = true;
    for (const i of PREVIEW.sel) if (hand[i] && !selected.includes(hand[i].id)) onToggle(hand[i].id);
  }, [hand, selected, onToggle, n]);

  // The fan's home follows the framing (portrait screens pull it closer; it settles lower when it is
  // not your turn) and the shadow's footprint follows the fan's width. setHandFraming moves
  // HAND_CENTER at once so flights stay exact; the visual springs after it.
  const [{ center, shadowW }, api] = useSpring(() => ({ center: HAND_CENTER.toArray(), shadowW: 4, config: SPRING_SOFT }));
  useLayoutEffect(() => {
    const c = setHandFraming({ aspect: size.width / Math.max(size.height, 1), active: isActive });
    api.start({ center: [c.x, c.y, c.z], immediate: reduceMotion });
  }, [size.width, size.height, isActive, reduceMotion, api]);
  const half = ((n - 1) / 2) * handSpacing(n) + CARD_W * HAND_SCALE * 0.5;
  useLayoutEffect(() => {
    api.start({ shadowW: half * 2 + 1.6, immediate: reduceMotion });
  }, [half, reduceMotion, api]);
  const shadowPos = useMemo(() => center.to((x, y, z) => [x, 0.008, z - SHADOW_BACK]), [center]);
  const shadowScale = useMemo(() => shadowW.to((w) => [w, 2, 1]), [shadowW]);

  // Tell the shared layout which cards are shown lifted, so a play flight leaves from the raised card.
  useEffect(() => {
    const dy = new Array(n).fill(0), dz = new Array(n).fill(0), tilt = new Array(n).fill(0);
    hand.forEach((card, i) => {
      if (selected.includes(card.id)) { dy[i] = LIFT_SELECTED; dz[i] = FORWARD_SELECTED; tilt[i] = TILT_SELECTED; }
      else if (isActive && hovered === card.id) { dy[i] = LIFT_HOVER; dz[i] = FORWARD_HOVER; tilt[i] = TILT_HOVER; }
    });
    setHandLive(n, dy, dz, tilt);
  }, [hand, selected, hovered, isActive, n]);

  return (
    <>
      <animated.mesh geometry={unitPlane} material={shadowMat} rotation-x={-Math.PI / 2} position={shadowPos} scale={shadowScale} renderOrder={-1} />
      <animated.group position={center} rotation-x={HAND_TILT}>
        {hand.map((card, i) => (
          <HandCard
            key={card.id}
            card={card}
            slot={layout[i]}
            theme={theme}
            selected={selected.includes(card.id)}
            hovered={hovered === card.id}
            active={isActive}
            match={card.rank === matchRank}
            hidden={ghost.includes(card.id) || i >= visibleCount}
            reduceMotion={reduceMotion}
            onToggle={onToggle}
            onHover={setHovered}
            onUnhover={unhover}
          />
        ))}
      </animated.group>
    </>
  );
}
