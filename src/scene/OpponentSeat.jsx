import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSprings, animated } from '@react-spring/three';
import * as THREE from 'three';
import { PERSONALITIES } from '../game.js';
import { THEME, CARD_D, makePanelTexture, panelGlowTexture, panelPixels } from './textures.js';
import { seatFor, fanAnchor, panelAnchor, panelSizeFor, panelBubbleLive, panelSideLive, FAN_SCALE, PANEL_W, PANEL_H, PANEL_COMPACT } from './layout.js';
import { CARD_GEOMETRY, cardMaterials } from './Card.jsx';
import { Label } from './Labels.jsx';
import Avatar from './Avatar.jsx';
import AvatarAlt from './AvatarAlt.jsx';
import { useStore } from '../store.js';

// One opponent: a character (Classic) or a holographic seat panel (Future), and its fan of face-down
// cards. The fan is the same card box as the hand and the pile (Card.jsx), one spring per card for
// the layout (cards re-fan when the count changes) and a frame loop for the whole-fan pose (breathe,
// rise and sway when active, the gestures) and the lifted lead card. Classic keeps its DOM name
// plate (SeatPlate); Future draws the name, tag and count into the panel and only the speech bubble
// stays in the DOM, anchored over the panel.

// ?avatar=alt swaps in the alternative character design for side-by-side comparison.
const useAlt = () => typeof window !== 'undefined' && !!window.__AVATAR_ALT;
const reduced = () => useStore.getState().reduceMotion;

/* ---------- fans ---------- */

const FAN_MAX = 12; // cards drawn; the plate shows the real count
const FAN_POOL = 16; // drawn cards plus a few still shrinking away
// Cards splay from a pivot FAN_PIVOT below the middle card's centre, FAN_STEP radians apart (wider
// fans for small hands, capped so twelve cards stay about 1.35 wide). Each card sits one card
// thickness nearer the camera than the one before it, so the boxes never cut into each other.
const FAN_PIVOT = 0.75;
const FAN_STEP = { total: 0.95, min: 0.065, max: 0.11 };
const FAN_Z_STEP = CARD_D * FAN_SCALE + 0.0008;
const FAN_LIFT = 0.2; // how far the lead card slides out of the fan while the bot picks a play
const FAN_LIFT_FWD = 0.06; // and how far it comes forward, clear of its neighbours
const GESTURE_MS = { play: 700, call: 900, pass: 700, lose: 1200, win: Infinity }; // matches the avatars
const FAN_SPRING = { tension: 180, friction: 24 };

// Live world poses per bot index so flights can leave from the lifted card and land at the fan centre.
// Entry: { lead: {p, q}, home: {p, q}, depart(count), peek() }; peek() reports how many cards are
// drawn and how many are still shrinking away (a debugging aid: a flight should never leave any).
export const FAN_LIVE = new Map();

const clamp = THREE.MathUtils.clamp;
const pulse = (age, dur) => (age >= 0 && age < dur ? Math.sin(Math.PI * (age / dur)) : 0);

function aliveCount(order) {
  let c = 0;
  for (let i = 0; i < order.length; i++) if (order[i].state === 'alive') c++;
  return c;
}

// The alive card nearest the fan centre: the one that lifts, leaves, or gets replaced.
function leadEntry(order, alive) {
  const target = Math.floor((alive - 1) / 2);
  let seen = 0;
  for (let i = 0; i < order.length; i++) {
    if (order[i].state !== 'alive') continue;
    if (seen === target) return order[i];
    seen++;
  }
  return null;
}

function insertMiddle(order, entry, alive) {
  const half = Math.ceil(alive / 2);
  let seen = 0;
  let pos = order.length;
  for (let i = 0; i < order.length; i++) {
    if (order[i].state !== 'alive') continue;
    if (seen === half) { pos = i; break; }
    seen++;
  }
  order.splice(pos, 0, entry);
}

function freeEntry(s, e) {
  e.state = 'free';
  const i = s.order.indexOf(e);
  if (i >= 0) s.order.splice(i, 1);
  if (e.inner) e.inner.visible = false;
}

function takeFree(s) {
  for (let i = 0; i < s.pool.length; i++) if (s.pool[i].state === 'free') return s.pool[i];
  // Pool exhausted: recycle a card that is still shrinking away.
  for (let i = 0; i < s.pool.length; i++) {
    if (s.pool[i].state === 'leaving') { freeEntry(s, s.pool[i]); return s.pool[i]; }
  }
  return null;
}

function Fan({ index, fan, cards, active, tag, gesture, theme, reduceMotion }) {
  const fanRef = useRef();
  const materials = useMemo(() => cardMaterials(null, theme), [theme]);
  // Cards the fan is already waving goodbye to (a flight has left) before the game state catches up:
  // `n` cards pending from a count of `at`. The effective count is derived during render, so the
  // moment `cards` moves on the pending cards are folded in and no effect ever sees a stale count
  // (an effect-based reset ran one commit late and re-fanned two cards in and out of the centre as
  // the bot's flight landed).
  const [pending, setPending] = useState({ n: 0, at: cards });
  const pendingOut = pending.at === cards ? pending.n : 0;

  // All frame-loop state lives in one ref; useFrame only mutates, never allocates.
  const st = useRef(null);
  if (!st.current) {
    st.current = {
      pool: Array.from({ length: FAN_POOL }, () => ({ inner: null, state: 'free', slot: -1, lift: 0 })),
      order: [], // pool entries in fan order (alive or leaving)
      cards, departAt: -1e9, instantOut: false, expiry: null,
      gesture: null, gestureAt: -1e9,
      act: 0, lift: 0, droop: 0,
      lead: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
      home: { p: new THREE.Vector3(), q: new THREE.Quaternion() },
      pos: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), fwd: new THREE.Vector3(),
    };
    // Until the first frame publishes real poses, flights aim at the fan anchor itself.
    const s = st.current;
    s.home.p.copy(fan.pos);
    s.home.q.setFromEuler(s.e.set(-fan.tilt, fan.yaw, 0, 'YXZ'));
    s.lead.p.copy(s.home.p);
    s.lead.q.copy(s.home.q);
  }

  const [springs, api] = useSprings(FAN_POOL, () => ({
    pos: [0, 0, 0], rz: 0, s: 0, config: FAN_SPRING, immediate: true,
  }));

  useEffect(() => {
    const s = st.current;
    const entry = {
      lead: s.lead,
      home: s.home,
      // A flight just left this fan: drop that many cards now rather than when the game state catches up.
      depart(n) {
        s.departAt = performance.now();
        s.instantOut = true;
        setPending((p) => ({ n: (p.at === s.cards ? p.n : 0) + n, at: s.cards }));
        // if the game state never catches up (a cancelled flight), the cards come back
        if (s.expiry) clearTimeout(s.expiry);
        s.expiry = setTimeout(() => { s.expiry = null; setPending({ n: 0, at: -1 }); }, 3000);
      },
      peek() {
        let leaving = 0;
        for (let i = 0; i < s.order.length; i++) if (s.order[i].state === 'leaving') leaving++;
        return { alive: aliveCount(s.order), leaving };
      },
    };
    FAN_LIVE.set(index, entry);
    return () => {
      if (FAN_LIVE.get(index) === entry) FAN_LIVE.delete(index);
      if (s.expiry) clearTimeout(s.expiry);
    };
  }, [index]);

  // The game state caught up with the flight: the pending count is folded into `cards` (derived
  // above), so the fallback timer has nothing left to do.
  useLayoutEffect(() => {
    const s = st.current;
    s.cards = cards;
    if (s.expiry) { clearTimeout(s.expiry); s.expiry = null; }
  }, [cards]);

  const gestureKey = gesture ? gesture.key : null;
  useEffect(() => {
    st.current.gesture = gesture ? gesture.type : null;
    st.current.gestureAt = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureKey]);

  const F = typeof window !== 'undefined' ? window.__AVATAR_FORCE : null;
  const isActive = F && F.active != null ? F.active : active;
  const win = (F && F.gesture ? F.gesture : gesture && gesture.type) === 'win';
  const want = clamp(cards - pendingOut, 0, FAN_MAX);
  const spread = 1 + (isActive ? 0.14 : 0) + (win ? 0.2 : 0);

  // Re-fan: add or retire cards so the fan shows `want`, then spring every card to its slot. New
  // cards appear at the fan centre (where a flight to the seat lands) and fan out; cards that leave
  // for a flight vanish at once (the flying card stands in for them), cards that leave without one
  // shrink into the centre.
  useLayoutEffect(() => {
    const s = st.current;
    const instant = s.instantOut;
    s.instantOut = false;
    const entering = new Set();
    let alive = aliveCount(s.order);
    while (alive < want) {
      const e = takeFree(s);
      if (!e) break;
      e.state = 'alive';
      e.lift = 0;
      insertMiddle(s.order, e, alive);
      entering.add(e);
      alive++;
    }
    while (alive > want) {
      const e = leadEntry(s.order, alive);
      if (!e) break;
      alive--;
      if (instant || reduceMotion) freeEntry(s, e);
      else e.state = 'leaving';
    }
    const n = alive;
    const step = clamp(FAN_STEP.total / Math.max(n, 1), FAN_STEP.min, FAN_STEP.max) * spread;
    const mid = (n - 1) / 2;
    const front = n * FAN_Z_STEP + 0.01;
    let slot = 0;
    const targets = new Map();
    for (let i = 0; i < s.order.length; i++) {
      const e = s.order[i];
      if (e.state === 'alive') {
        const a = (slot - mid) * step;
        e.slot = slot;
        targets.set(e, { pos: [Math.sin(a) * FAN_PIVOT, Math.cos(a) * FAN_PIVOT - FAN_PIVOT, slot * FAN_Z_STEP], rz: -a, s: FAN_SCALE });
        slot++;
      } else {
        e.slot = -1;
        targets.set(e, { pos: [0, -0.04, front], rz: 0, s: 0.001 });
      }
    }
    api.start((i) => {
      const e = s.pool[i];
      const to = targets.get(e);
      if (!to) return undefined;
      const update = { ...to, immediate: reduceMotion };
      if (entering.has(e)) {
        update.from = { pos: [0, 0, front], rz: 0, s: FAN_SCALE };
        if (e.inner) e.inner.visible = true;
      }
      if (e.state === 'leaving') update.onRest = () => { if (e.state === 'leaving') freeEntry(s, e); };
      return update;
    });
  }, [want, spread, reduceMotion, api]);

  useFrame(({ clock }, dt) => {
    const g = fanRef.current;
    const s = st.current;
    if (!g) return;
    const now = performance.now();
    const t = clock.getElapsedTime() + index * 1.7;
    const snap = reduced();
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);

    // ?force=mood,active,gesture poses every bot for screenshots (the store sets window.__AVATAR_FORCE);
    // the forced gesture loops, like the avatars' does.
    const FF = window.__AVATAR_FORCE;
    const act = FF && FF.active != null ? FF.active : active;
    if (FF && FF.gesture && (s.gesture !== FF.gesture || now - s.gestureAt > GESTURE_MS[FF.gesture])) {
      s.gesture = FF.gesture; s.gestureAt = now;
    }

    // Moods. `lift` slides the lead card out of the fan while the bot picks what to play.
    const age = now - s.gestureAt;
    const gs = s.gesture;
    const sinceDepart = now - s.departAt;
    const playLift = gs === 'play' && age < 500 && sinceDepart > 1500;
    const playing = FF ? act : (active && tag === 'Playing');
    const lifting = (playing && sinceDepart > 1500) || playLift;
    s.act += ((act ? 1 : 0) - s.act) * k;
    s.lift += ((lifting ? 1 : 0) - s.lift) * k;
    s.droop += ((gs === 'lose' ? 1 : 0) - s.droop) * k * 0.6;
    const winning = gs === 'win' ? 1 : 0;
    const call = gs === 'call' ? pulse(age, 700) : 0;
    const pass = gs === 'pass' && age < 600 ? Math.sin(age / 45) * (1 - age / 600) : 0;
    const follow = gs === 'play' && !playLift ? pulse(age, 500) : 0;

    // Whole-fan pose: breathe when idle, rise and sway when active, plus gesture offsets.
    const idle = snap ? 0 : 1;
    const y = idle * (Math.sin(t * 1.3) * 0.012 + s.act * (0.07 + Math.sin(t * 2.1) * 0.025))
      + call * 0.18 - s.droop * 0.1 + winning * Math.abs(Math.sin(t * 5)) * 0.12;
    const fwd = call * 0.3 + follow * 0.08;
    const rx = -fan.tilt - call * 0.22 + s.droop * 0.6 + follow * 0.18;
    const rz = idle * (Math.sin(t * 0.7) * 0.012 + s.act * Math.sin(t * 1.7) * 0.035)
      + pass * 0.1 + winning * Math.sin(t * 5) * 0.05 + s.droop * Math.sin(t * 0.9) * 0.05;
    s.e.set(rx, fan.yaw, rz, 'YXZ');
    s.q.setFromEuler(s.e);
    s.pos.set(fan.pos.x + Math.sin(fan.yaw) * fwd, fan.pos.y + y, fan.pos.z + Math.cos(fan.yaw) * fwd);
    g.position.lerp(s.pos, k);
    g.quaternion.slerp(s.q, k);

    // The lead card's lift rides on top of its spring, along the card's own axis.
    const n = aliveCount(s.order);
    const leadSlot = Math.floor((n - 1) / 2);
    let leadObj = null;
    for (let i = 0; i < s.pool.length; i++) {
      const e = s.pool[i];
      const o = e.inner;
      if (!o || e.state === 'free') continue;
      const target = e.state === 'alive' && e.slot === leadSlot ? s.lift : 0;
      e.lift += (target - e.lift) * k;
      if (Math.abs(e.lift) < 0.001) e.lift = 0;
      o.position.set(0, FAN_LIFT * e.lift, FAN_LIFT_FWD * e.lift);
      o.rotation.x = 0.15 * e.lift;
      if (target) leadObj = o;
    }

    // Publish world poses for flights: `home` is the fan centre, `lead` the lifted (or middle) card.
    g.getWorldPosition(s.home.p);
    g.getWorldQuaternion(s.home.q);
    s.fwd.set(0, 0, 1).applyQuaternion(s.home.q);
    s.home.p.addScaledVector(s.fwd, n * FAN_Z_STEP + 0.01);
    if (leadObj) {
      leadObj.getWorldPosition(s.lead.p);
      leadObj.getWorldQuaternion(s.lead.q);
    } else {
      s.lead.p.copy(s.home.p);
      s.lead.q.copy(s.home.q);
    }
  });

  return (
    <group ref={fanRef} position={fan.pos}>
      {springs.map((sp, i) => (
        <animated.group key={i} position={sp.pos} rotation-z={sp.rz} scale={sp.s}>
          <group ref={(o) => { st.current.pool[i].inner = o; if (o && st.current.pool[i].state === 'free') o.visible = false; }}>
            <mesh geometry={CARD_GEOMETRY} material={materials} castShadow />
          </group>
        </animated.group>
      ))}
    </group>
  );
}

/* ---------- holographic seat (Future) ---------- */

const SEAT_RING_IN = 0.5; // the seat ring sits this far inside the fan, over the platform
const ringGeometry = new THREE.RingGeometry(0.44, 0.47, 64);
const discGeometry = new THREE.CircleGeometry(0.44, 64);
const panelGeometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
const compactPanelGeometry = new THREE.PlaneGeometry(PANEL_COMPACT.w, PANEL_COMPACT.h);
const ACCENT = new THREE.Color(THEME.future.accent);
const MARK_HOT = ACCENT.clone().multiplyScalar(1.9); // over 1: the bloom catches the mark
const MARK_COLD = ACCENT.clone().multiplyScalar(0.8);
const THINK_PERIOD = 1.2; // seconds per breath while the bot is deciding
const WIN_LIFT = 0.18; // the winner's panel rises this much (world units) at the end of the game

// A small abstract mark per personality, floating in the panel's well.
const MARK_GEOMETRY = {
  cautious: new THREE.TorusGeometry(0.1, 0.011, 8, 40),
  reckless: new THREE.OctahedronGeometry(0.125, 0),
  sly: new THREE.IcosahedronGeometry(0.11, 0),
};
const markGeometry = (p) => MARK_GEOMETRY[p] || MARK_GEOMETRY.sly;
// Where the well sits in panel space (the texture's pixels mapped onto the unit panel plane).
function markPosFor(compact) {
  const { px, well } = panelPixels(compact);
  const base = compact ? PANEL_COMPACT : { w: PANEL_W, h: PANEL_H };
  return [((well.x / px.w) - 0.5) * base.w, (0.5 - well.y / px.h) * base.h, 0.1];
}
const MARK_POS = markPosFor(false);
const MARK_POS_COMPACT = markPosFor(true);

function HoloSeat({ index, bot, fan, cards, active, mood, gesture, reduceMotion }) {
  const count = fan.count;
  // Narrow stages get the compact panel, drawn larger (layout.js panelSizeFor).
  const { size } = useThree();
  const psize = useMemo(() => panelSizeFor(size.width / Math.max(size.height, 1)), [size.width, size.height]);
  const compact = psize.compact;
  const panel = useMemo(() => panelAnchor(index, count, psize), [index, count, psize]);
  const tex = useMemo(() => makePanelTexture(compact), [compact]);
  useEffect(() => () => tex.dispose(), [tex]);
  const glow = useMemo(() => panelGlowTexture(compact), [compact]);
  const geometry = compact ? compactPanelGeometry : panelGeometry;
  const markPos = compact ? MARK_POS_COMPACT : MARK_POS;
  // The DOM speech bubble hangs from the panel's top edge, wherever this size puts it, and measures
  // the panel from its side point when it has to sit beside it.
  useLayoutEffect(() => {
    panelBubbleLive(index, count).copy(panel.bubble);
    panelSideLive(index, count).copy(panel.side);
  }, [index, count, panel]);
  const ring = useRef();
  const disc = useRef();
  const body = useRef();
  const frame = useRef();
  const group = useRef();
  const mark = useRef();
  const light = useRef();
  // The seat's point light is only in the scene while it has something to light (the seat is
  // active or has won, or its glow is still fading): an idle light still costs every lit surface
  // a term per fragment. The frame loop flips `lit` once at each end of the fade.
  const [lit, setLit] = useState(false);
  const st = useRef({ act: 0, think: 0, win: 0, blipAt: -1e9, lastCount: cards, c: new THREE.Color() }).current;
  const ringPos = useMemo(() => [fan.pos.x + Math.sin(fan.yaw) * SEAT_RING_IN, 0.006, fan.pos.z + Math.cos(fan.yaw) * SEAT_RING_IN], [fan]);
  const lightPos = useMemo(() => [fan.pos.x, 1.1, fan.pos.z], [fan]);
  const tag = PERSONALITIES[bot.personality] ? PERSONALITIES[bot.personality].label : bot.personality;

  // Redraw the panel when its text changes; the count change also blips the panel.
  useLayoutEffect(() => {
    tex.draw({ name: bot.name, tag, count: cards, low: cards <= 3 });
    if (cards !== st.lastCount) { st.lastCount = cards; st.blipAt = performance.now(); }
  }, [tex, bot.name, tag, cards, st]);

  useFrame(({ clock }, dt) => {
    const snap = reduceMotion;
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    const F = window.__AVATAR_FORCE;
    const isActive = F && F.active != null ? F.active : active;
    const thinking = F && F.mood ? F.mood === 'think' : mood === 'think';
    const winning = (F && F.gesture ? F.gesture : gesture && gesture.type) === 'win';
    st.act += ((isActive || winning ? 1 : 0) - st.act) * k;
    st.think += ((thinking && !snap ? 1 : 0) - st.think) * k;
    st.win += ((winning ? 1 : 0) - st.win) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    const t = clock.getElapsedTime();
    const now = performance.now();
    const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / THINK_PERIOD);
    const glowAmt = st.act;
    if (!lit && (isActive || winning)) setLit(true);
    else if (lit && !(isActive || winning) && glowAmt < 0.02) setLit(false);
    if (ring.current) ring.current.material.opacity = 0.14 + glowAmt * (0.42 + (snap ? 0 : Math.sin(t * 2.4) * 0.08));
    if (disc.current) disc.current.material.opacity = 0.025 + glowAmt * 0.07;
    if (body.current) body.current.material.opacity = 1 - st.think * 0.26 * breath;
    if (frame.current) frame.current.material.opacity = glowAmt * 0.75 + st.think * breath * 0.12;
    if (group.current) {
      const blip = snap ? 0 : pulse(now - st.blipAt, 320) * 0.05;
      group.current.scale.setScalar(psize.scale * (1 + blip + st.think * breath * 0.014));
      // the winner's panel lifts a little (WIN_LIFT) and stays up
      group.current.position.y = panel.pos.y + st.win * WIN_LIFT + (snap ? 0 : Math.sin(t * 0.8 + index * 1.7) * 0.02);
    }
    if (mark.current) {
      mark.current.rotation.y = snap ? 0.6 : t * 0.7 + index;
      mark.current.rotation.x = snap ? 0.3 : 0.3 + Math.sin(t * 0.5 + index) * 0.25;
      st.c.copy(MARK_COLD).lerp(MARK_HOT, glowAmt);
      mark.current.material.color.copy(st.c);
    }
    if (light.current) light.current.intensity = glowAmt * 3.5;
  });

  return (
    <group>
      {/* seat marker on the platform, under the fan */}
      <group position={ringPos}>
        <mesh ref={ring} geometry={ringGeometry} rotation-x={-Math.PI / 2} position-y={0.001}>
          <meshBasicMaterial color={ACCENT} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={disc} geometry={discGeometry} rotation-x={-Math.PI / 2}>
          <meshBasicMaterial color={ACCENT} transparent opacity={0.025} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      {/* a soft cyan light over the active seat, so its cards catch the colour (only while lit, see above) */}
      {lit && <pointLight ref={light} position={lightPos} color={ACCENT} intensity={0} distance={3.2} decay={2} />}
      {/* the panel: glass body, frame glow, and the personality mark in its well */}
      <group ref={group} position={panel.pos} rotation={[panel.tilt, panel.yaw, 0, 'YXZ']}>
        <mesh ref={body} geometry={geometry}>
          <meshBasicMaterial map={tex.texture} transparent opacity={1} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={frame} geometry={geometry} position-z={0.002}>
          <meshBasicMaterial map={glow} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={mark} geometry={markGeometry(bot.personality)} position={markPos}>
          <meshBasicMaterial color={MARK_COLD} wireframe transparent opacity={0.85} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ---------- the seat ---------- */

export default function OpponentSeat({ index, count, bot, cards, active, tag, theme, mood, gesture }) {
  const AvatarC = useAlt() ? AvatarAlt : Avatar;
  const reduceMotion = useStore((s) => s.reduceMotion);
  const seat = useMemo(() => seatFor(index, count), [index, count]);
  const seatPos = useMemo(() => seat.pos.toArray(), [seat]);
  const glowPos = useMemo(() => [seat.pos.x, seat.pos.y + 3.2, seat.pos.z + 0.6], [seat]);
  const fan = useMemo(() => ({ ...fanAnchor(index, count), count }), [index, count]);
  const T = THEME[theme];
  const future = theme === 'future';

  return (
    <group>
      {future
        ? <HoloSeat index={index} bot={bot} fan={fan} cards={cards} active={active} mood={mood} gesture={gesture} reduceMotion={reduceMotion} />
        : <AvatarC index={index} position={seatPos} yaw={seat.yaw} theme={theme} mood={mood} active={active} seed={index} gesture={gesture} />}
      <Fan index={index} fan={fan} cards={cards} active={active} tag={tag} gesture={gesture} theme={theme} reduceMotion={reduceMotion} />
      {active && !future && (
        <pointLight position={glowPos} color={T.accent} intensity={6} distance={4} />
      )}
    </group>
  );
}

/* ---------- name plate and speech bubble (DOM, over the canvas) ---------- */

const PLATE_RISE = 3.1; // Classic: above the feet, clear of the tallest hat
// Classic: the bubble over the plate is about 40 px tall over a 10 px gap, and the reveal's camera
// nudge lifts the far seats' plates another 20 px or so. With less headroom than this the bubble
// goes beside the plate (Labels.jsx data-tight, styles.css), as the far seats' do in the desktop
// layout, where the plates sit right under the stage's top edge.
const BUBBLE_ROOM = 70;
// Future: the bubble is smaller (about 38 px over a 10 px gap) and its anchor already floats a few
// pixels over the panel's top edge, so the panel needs a little less.
const PANEL_BUBBLE_ROOM = 60;

// Classic: the name plate (name, tag, count, state) with the bubble over it, or beside it when the
// plate has no headroom. Future: the panel in the scene carries the name and count; only the bubble
// is DOM, over the panel (its anchor is the live vector the HoloSeat keeps at the panel's top edge),
// or beside it, level with its middle, when the panel has no headroom (the side point gives the
// panel's half-size on screen). Both are clamped inside the stage, so the side seats' plates stay
// whole on narrow screens. A seat with a bubble up moves to the layer above the others, so a bubble
// beside it never slips under a nearer seat's plate.
export function SeatPlate({ registry, index, count, bot, cards, active, tag, bubble, theme }) {
  const future = theme === 'future';
  const anchor = useMemo(() => {
    if (future) return panelBubbleLive(index, count);
    const s = seatFor(index, count);
    return new THREE.Vector3(s.pos.x, s.pos.y + PLATE_RISE, s.pos.z);
  }, [index, count, future]);
  if (future) {
    return (
      <Label registry={registry} anchor={anchor} edge={panelSideLive(index, count)} layer={bubble ? 3 : 2} clamp room={PANEL_BUBBLE_ROOM}>
        <div className="bubble-anchor">
          {bubble && <div key={bubble.key} className={`bubble bubble--${bubble.tone}`}>{bubble.text}</div>}
        </div>
      </Label>
    );
  }
  return (
    <Label registry={registry} anchor={anchor} layer={bubble ? 3 : 2} clamp room={BUBBLE_ROOM}>
      <div className={`plate ${active ? 'is-active' : ''} ${cards <= 3 ? 'is-low' : ''}`}>
        {bubble && <div key={bubble.key} className={`bubble bubble--${bubble.tone}`}>{bubble.text}</div>}
        <span className="plate__name">{bot.name}</span>
        <span className="plate__meta">{PERSONALITIES[bot.personality].label}</span>
        <span key={cards} className="plate__count">{cards}</span>
        {tag && <span className="plate__tag">{tag}</span>}
      </div>
    </Label>
  );
}
