import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { THEME } from './textures.js';
import { avatarFace, FACE } from './avatarFaces.js';
import { threeSided } from './Card.jsx';
import { useStore } from '../store.js';

// A rounded-voxel character. Feet at the origin, +y up, +z toward the player.
// Seats put the feet 0.7 below the table top, so the table is at local y 0.7 and
// the bot's card fan (layout.js FAN_* contract) hangs 1.0 ahead at local y 1.25,
// leaned back 0.3 rad. The rest pose grips the fan's lower corners from behind,
// roughly local (+-0.5, 1.13, 0.96), so the character reads as holding its cards.

const rbox = (w, h, d, r, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
const GEO = {
  head: threeSided(rbox(0.72, 0.66, 0.72, 0.13, 4)), // three slots: sides, the painted face (+z), the back
  torso: rbox(0.84, 0.88, 0.5, 0.1),
  belt: rbox(0.86, 0.1, 0.52, 0.04, 2),
  shoulder: rbox(0.24, 0.2, 0.34, 0.08),
  upperArm: rbox(0.22, 0.46, 0.22, 0.08),
  foreArm: rbox(0.19, 0.42, 0.19, 0.07),
  hand: rbox(0.14, 0.23, 0.2, 0.055), // thin along x so the palms face each other
  thumb: rbox(0.065, 0.13, 0.07, 0.03, 2),
  leg: rbox(0.32, 0.6, 0.36, 0.07),
  shoe: rbox(0.34, 0.14, 0.44, 0.05),
  neck: new THREE.CylinderGeometry(0.11, 0.13, 0.14, 20),
  elbow: new THREE.SphereGeometry(0.105, 16, 12),
  // accessories
  hair: rbox(0.8, 0.34, 0.76, 0.15), // a bob that wraps the top of the head, open at the face
  fringe: rbox(0.3, 0.09, 0.1, 0.04, 2),
  ring: new THREE.TorusGeometry(0.1, 0.016, 8, 28),
  lens: new THREE.CircleGeometry(0.095, 28),
  bridge: rbox(0.07, 0.03, 0.03, 0.01, 1),
  temple: rbox(0.03, 0.03, 0.32, 0.01, 1),
  scarf: new THREE.TorusGeometry(0.2, 0.085, 10, 32),
  scarfTail: rbox(0.17, 0.46, 0.07, 0.03),
  scarfTip: rbox(0.17, 0.08, 0.075, 0.02, 2),
  capDome: new THREE.SphereGeometry(0.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
  capBand: new THREE.CylinderGeometry(0.405, 0.405, 0.07, 28, 1, true),
  capBrim: rbox(0.34, 0.03, 0.26, 0.012, 2),
  capButton: new THREE.SphereGeometry(0.04, 12, 8),
  hatCrown: new THREE.CylinderGeometry(0.29, 0.34, 0.18, 28),
  hatBand: new THREE.CylinderGeometry(0.345, 0.35, 0.07, 28),
  hatBrim: new THREE.CylinderGeometry(0.52, 0.52, 0.03, 36),
  bowWing: rbox(0.15, 0.1, 0.05, 0.025, 2),
  bowKnot: rbox(0.07, 0.07, 0.06, 0.02, 2),
  turnRing: new THREE.RingGeometry(0.66, 0.76, 48),
  turnDisc: new THREE.CircleGeometry(0.66, 48),
};

const ACC = {
  classic: {
    hat: '#2a2320', cap: '#b8402f', capTrim: '#f1e6c8', scarf: '#b8402f', scarfTrim: '#f1e6c8',
    bow: '#b8402f', frame: '#1c1c1c', lens: '#d7ecff', hair: '#2b2118', shoe: '#1c1714',
  },
  future: {
    hat: '#1a2030', cap: '#223044', capTrim: '#5ce1e6', scarf: '#5ce1e6', scarfTrim: '#e6eaf2',
    bow: '#5ce1e6', frame: '#e6eaf2', lens: '#9feef2', hair: '#2b3447', shoe: '#0b0e14',
  },
};

const HIP_Y = 0.62;
const SHOULDER = { x: 0.56, y: 0.82, z: 0.04 }; // relative to the spine pivot (hips)
const HEAD_Y = 0.92; // head pivot above the hips
const LEAN = 0.1; // idle forward lean the rest pose was solved for
const TURN_RING_Y = 0.72; // table-top level: a ring at the feet is hidden behind the far rim

// Arm poses are (ax, ay, az, fx, wx): shoulder pitch, twist and swing, elbow bend, wrist bend.
// Values are for the right arm (+x); the left arm mirrors ay and az. Solved against the
// hierarchy below with the fan contract above, with the lean compensated out.
const HOLD = { ax: -0.95, ay: 0, az: -0.07, fx: -0.70, wx: 1.15 }; // hand at the fan's lower corner
const CHEEK = { ax: -1.07, ay: -0.3, az: 0.02, fx: -2.24, wx: 0 }; // fist against the jaw: a chin fist hides behind the fan
const POINT = { ax: -2.2, ay: 0, az: 0.15, fx: 0, wx: 0 }; // at the player, hand raised beside the head so it reads from the camera
const REACH = { ax: -1.19, ay: 0, az: -0.24, fx: 0, wx: 0.5 }; // palm down over the felt
const SHRUG = { ax: -0.35, ay: 0, az: 0.95, fx: -1.7, wx: -0.4 };
const HANG = { ax: -0.2, ay: 0, az: 0.05, fx: -0.15, wx: 0 };
const RAISE = { ax: -2.65, ay: 0, az: 0.5, fx: -0.35, wx: 0 };

const GESTURE_MS = { play: 700, call: 900, pass: 700, lose: 1200, win: Infinity };
// Progress a forced gesture is frozen at (?force=...), so screenshots catch the pose.
const FORCE_P = 0.55;
const FORCE_WIN_S = 0.75;

// store.reduceMotion (prefers-reduced-motion, or ?fast=1) stills the idle layer and snaps the poses.
const reduced = () => useStore.getState().reduceMotion;

const smooth = (x) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// Ease in over `a`, hold, ease out over the last `b` of a 0..1 progress value.
const envelope = (p, a, b) => Math.min(smooth(p / a), smooth((1 - p) / b));
const mix = (a, b, k) => a + (b - a) * k;

function makePose() {
  return {
    bodyY: 0, spineX: LEAN, spineY: 0, spineZ: 0,
    headX: 0, headY: 0, headZ: 0, headFwd: 0,
    lY: 0, lAx: HOLD.ax, lAy: -HOLD.ay, lAz: -HOLD.az, lFx: HOLD.fx, lWx: HOLD.wx,
    rY: 0, rAx: HOLD.ax, rAy: HOLD.ay, rAz: HOLD.az, rFx: HOLD.fx, rWx: HOLD.wx,
    ring: 0,
  };
}
const POSE_KEYS = Object.keys(makePose());

// Blend one arm of the target pose toward an arm pose. side is 1 for the right arm, -1 for the left.
function blendArm(P, side, A, e) {
  if (side > 0) {
    P.rAx = mix(P.rAx, A.ax, e); P.rAy = mix(P.rAy, A.ay, e); P.rAz = mix(P.rAz, A.az, e);
    P.rFx = mix(P.rFx, A.fx, e); P.rWx = mix(P.rWx, A.wx, e);
  } else {
    P.lAx = mix(P.lAx, A.ax, e); P.lAy = mix(P.lAy, -A.ay, e); P.lAz = mix(P.lAz, -A.az, e);
    P.lFx = mix(P.lFx, A.fx, e); P.lWx = mix(P.lWx, A.wx, e);
  }
}

const GLASS_X = (FACE.eyeX[1] - 128) / 256 * 0.72; // lens centres over the painted eyes
const GLASS_Y = 0.66 - 0.66 * FACE.eyeY / 256;

export default function Avatar({ index, position, yaw, theme, mood = 'smile', active = false, seed = 0, gesture = null }) {
  const T = THEME[theme] || THEME.classic;
  const A = ACC[theme] || ACC.classic;
  const skin = T.skin[index % 3];
  const shirt = T.shirt[index % 3];
  const pants = T.pants[index % 3];
  const who = index % 3; // 0 Vega (glasses, scarf), 1 Orin (backwards cap), 2 Juno (fedora, bow tie)

  const root = useRef();
  const spine = useRef();
  const head = useRef();
  const armL = useRef();
  const armR = useRef();
  const foreL = useRef();
  const foreR = useRef();
  const wristL = useRef();
  const wristR = useRef();
  const ringRef = useRef();
  const discRef = useRef();

  const mats = useMemo(() => {
    const std = (color, roughness, extra) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const skinM = std(skin, 0.55);
    const faceM = new THREE.MeshStandardMaterial({ roughness: 0.55, map: avatarFace(mood, theme, skin, 'open') });
    return {
      skinM, faceM,
      head: [skinM, faceM, skinM],
      shirtM: std(shirt, 0.85),
      pantsM: std(pants, 0.9),
      shoeM: std(A.shoe, 0.6),
      hairM: std(A.hair, 0.7),
      accentM: std(T.accent, 0.35, { metalness: 0.3 }),
      hatM: std(A.hat, 0.6),
      capM: std(A.cap, 0.85),
      capTrimM: std(A.capTrim, 0.8),
      scarfM: std(A.scarf, 0.85),
      scarfTrimM: std(A.scarfTrim, 0.8),
      bowM: std(A.bow, 0.6),
      frameM: std(A.frame, 0.3, { metalness: 0.6 }),
      lensM: std(A.lens, 0.1, { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
      ringM: new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      discM: new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    };
    // mood is applied per frame by swapping faceM.map; it must not rebuild materials
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin, shirt, pants, theme, A, T.accent]);

  useEffect(() => () => {
    for (const m of Object.values(mats)) if (m && m.dispose) m.dispose();
  }, [mats]);

  // gesture playback: restart whenever the key changes
  const gest = useRef({ type: null, start: 0 });
  const gKey = gesture ? gesture.key : null;
  const gType = gesture ? gesture.type : null;
  useEffect(() => {
    gest.current = gType ? { type: gType, start: performance.now() } : { type: null, start: 0 };
  }, [gKey, gType]);

  const cur = useRef(makePose());
  const tgt = useRef(makePose());
  const blink = useRef({ next: 1.5 + (seed % 3) * 0.7, until: 0 });
  // the three eye variants of the current face, so the frame loop never builds cache keys
  const faces = useRef({ mood: null, theme: null, skin: null, open: null, wide: null, closed: null });

  useFrame((state, dt) => {
    if (!root.current) return;
    // window.__AVATAR_FORCE = { mood, active, gesture } poses every bot, for screenshots.
    const F = window.__AVATAR_FORCE;
    const md = (F && F.mood) || mood;
    const act = F && F.active != null ? F.active : active;
    const forced = !!(F && F.gesture);
    if (forced && gest.current.type !== F.gesture) gest.current = { type: F.gesture, start: performance.now() };

    const now = state.clock.elapsedTime;
    const t = now + seed * 1.7;
    const P = tgt.current;
    const still = reduced();
    const IDLE = still ? 0 : 1;

    // idle layer: breathing, a slow sway, a wandering gaze
    const breath = Math.sin(t * 1.7) * IDLE;
    P.bodyY = breath * 0.012;
    P.spineX = (act ? 0.16 : LEAN) + breath * 0.012;
    P.spineY = Math.sin(t * 0.37) * 0.04 * IDLE;
    P.spineZ = Math.sin(t * 0.61) * 0.02 * IDLE;
    P.headX = breath * 0.015;
    P.headY = (act ? Math.sin(t * 1.9) * 0.1 : Math.sin(t * 0.5) * 0.08) * IDLE;
    P.headZ = Math.sin(t * 0.8) * 0.035 * IDLE;
    P.headFwd = act ? 0.03 : 0;
    const swing = Math.sin(t * 1.7) * 0.03 * IDLE;
    // leaning in would drop the hands below the fan: pitch the arms back by the extra lean
    const comp = P.spineX - LEAN;
    P.lY = 0; P.lAx = HOLD.ax + swing - comp; P.lAy = -HOLD.ay; P.lAz = -HOLD.az; P.lFx = HOLD.fx - swing; P.lWx = HOLD.wx;
    P.rY = 0; P.rAx = HOLD.ax - swing - comp; P.rAy = HOLD.ay; P.rAz = HOLD.az; P.rFx = HOLD.fx + swing; P.rWx = HOLD.wx;
    P.ring = act ? 0.75 + Math.sin(t * 3) * 0.15 * IDLE : 0;

    // thinking: fist to the cheek, head leaning onto it, the other hand slides to the middle of the fan
    if (md === 'think') {
      blendArm(P, 1, CHEEK, 1);
      P.rFx += Math.sin(t * 2.3) * 0.03 * IDLE;
      P.lAz += 0.22;
      P.headX -= 0.04;
      P.headZ -= 0.12;
      P.headY -= 0.12;
    }

    // gesture layer
    const g = gest.current;
    if (g.type) {
      const dur = GESTURE_MS[g.type] / 1000;
      const el = forced ? (g.type === 'win' ? FORCE_WIN_S : FORCE_P * dur) : (performance.now() - g.start) / 1000;
      const p = el / dur;
      if (p >= 1 && g.type !== 'win') {
        g.type = null;
      } else if (g.type === 'play') {
        // reach forward and down, as if laying cards on the pile
        const e = Math.sin(Math.PI * p);
        P.spineX += 0.08 * e;
        blendArm(P, 1, REACH, e);
        P.headX += 0.1 * e;
      } else if (g.type === 'call') {
        // lean in, chin up, point at the player
        const e = envelope(p, 0.18, 0.3);
        P.spineX += 0.1 * e;
        P.headFwd += 0.12 * e;
        P.headX -= 0.14 * e;
        blendArm(P, 1, POINT, e);
        P.bodyY += Math.max(0, Math.sin(p * Math.PI * 3)) * 0.07 * (1 - p) * IDLE;
      } else if (g.type === 'pass') {
        const e = envelope(p, 0.3, 0.35);
        P.lY = 0.08 * e; P.rY = 0.08 * e;
        blendArm(P, 1, SHRUG, e);
        blendArm(P, -1, SHRUG, e);
        P.headZ += 0.28 * e;
        P.spineX -= 0.04 * e;
      } else if (g.type === 'lose') {
        const e = envelope(p, 0.22, 0.3);
        P.spineX += 0.1 * e;
        P.bodyY -= 0.07 * e;
        P.headX += 0.2 * e;
        P.headY += Math.sin(el * 7.5) * 0.2 * e;
        P.lY = -0.05 * e; P.rY = -0.05 * e;
        blendArm(P, 1, HANG, e);
        blendArm(P, -1, HANG, e);
      } else if (g.type === 'win') {
        const e = smooth(el / 0.35);
        const hop = Math.abs(Math.sin(el * 5.5)) * IDLE;
        P.bodyY += hop * 0.15 * e;
        P.spineX -= 0.06 * e;
        P.headZ += Math.sin(el * 2.7) * 0.14 * e * IDLE;
        const wave = Math.sin(el * 5.5) * 0.18 * IDLE;
        blendArm(P, 1, RAISE, e);
        blendArm(P, -1, RAISE, e);
        P.lAx += wave * e; P.rAx -= wave * e;
      }
    }

    // ease the live pose toward the target (snap with reduced motion)
    const C = cur.current;
    const k = still ? 1 : 1 - Math.exp(-dt * 11);
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const key = POSE_KEYS[i];
      C[key] += (P[key] - C[key]) * k;
    }

    root.current.position.y = position[1] + C.bodyY;
    spine.current.rotation.set(C.spineX, C.spineY, C.spineZ);
    const h = head.current;
    h.rotation.set(C.headX, C.headY, C.headZ);
    h.position.z = C.headFwd;
    armL.current.position.y = SHOULDER.y + C.lY;
    armR.current.position.y = SHOULDER.y + C.rY;
    armL.current.rotation.set(C.lAx, C.lAy, C.lAz);
    armR.current.rotation.set(C.rAx, C.rAy, C.rAz);
    foreL.current.rotation.x = C.lFx;
    foreR.current.rotation.x = C.rFx;
    wristL.current.rotation.x = C.lWx;
    wristR.current.rotation.x = C.rWx;

    // turn marker at table level while active
    if (ringRef.current) {
      ringRef.current.material.opacity = C.ring;
      discRef.current.material.opacity = C.ring * 0.14;
      const sc = 1 + (1 - Math.min(1, C.ring / 0.6)) * 0.3;
      ringRef.current.scale.setScalar(sc);
      ringRef.current.visible = discRef.current.visible = C.ring > 0.01;
    }

    // blink: a quick shut every few seconds; eyes wide while active.
    // A big dt means the clock jumped (hidden tab, headless capture): reschedule without shutting.
    const b = blink.current;
    if (now >= b.next) {
      if (dt < 0.2 && !still) b.until = now + 0.13;
      b.next = now + 2.4 + (Math.sin(now * 12.9 + seed * 3.1) + 1) * 1.6;
    }
    const fc = faces.current;
    if (fc.mood !== md || fc.theme !== theme || fc.skin !== skin) {
      fc.mood = md; fc.theme = theme; fc.skin = skin;
      fc.open = avatarFace(md, theme, skin, 'open');
      fc.wide = avatarFace(md, theme, skin, 'wide');
      fc.closed = avatarFace(md, theme, skin, 'closed');
    }
    const want = now < b.until ? fc.closed : act ? fc.wide : fc.open;
    if (mats.faceM.map !== want) mats.faceM.map = want;
  });

  return (
    <group ref={root} position={position} rotation-y={yaw}>
      {/* legs and shoes */}
      {[-0.2, 0.2].map((x) => (
        <group key={x}>
          <mesh geometry={GEO.leg} material={mats.pantsM} position={[x, 0.36, 0]} castShadow />
          <mesh geometry={GEO.shoe} material={mats.shoeM} position={[x, 0.07, 0.04]} castShadow />
        </group>
      ))}

      <group ref={spine} position={[0, HIP_Y, 0]}>
        {/* torso */}
        <mesh geometry={GEO.torso} material={mats.shirtM} position={[0, 0.44, 0]} castShadow />
        <mesh geometry={GEO.belt} material={mats.pantsM} position={[0, 0.03, 0]} castShadow />
        <mesh geometry={GEO.shoulder} material={mats.shirtM} position={[-0.5, 0.84, 0]} castShadow />
        <mesh geometry={GEO.shoulder} material={mats.shirtM} position={[0.5, 0.84, 0]} castShadow />
        <mesh geometry={GEO.neck} material={mats.skinM} position={[0, 0.9, 0]} castShadow />

        {/* arms: shoulder pivot, elbow pivot, wrist pivot */}
        <group ref={armL} position={[-SHOULDER.x, SHOULDER.y, SHOULDER.z]}>
          <mesh geometry={GEO.upperArm} material={mats.shirtM} position={[0, -0.23, 0]} castShadow />
          <group ref={foreL} position={[0, -0.45, 0]}>
            <mesh geometry={GEO.elbow} material={mats.shirtM} castShadow />
            <mesh geometry={GEO.foreArm} material={mats.skinM} position={[0, -0.22, 0]} castShadow />
            <group ref={wristL} position={[0, -0.5, 0]}>
              <mesh geometry={GEO.hand} material={mats.skinM} castShadow />
              <mesh geometry={GEO.thumb} material={mats.skinM} position={[0.06, 0.08, 0.03]} rotation-z={-0.5} castShadow />
            </group>
          </group>
        </group>
        <group ref={armR} position={[SHOULDER.x, SHOULDER.y, SHOULDER.z]}>
          <mesh geometry={GEO.upperArm} material={mats.shirtM} position={[0, -0.23, 0]} castShadow />
          <group ref={foreR} position={[0, -0.45, 0]}>
            <mesh geometry={GEO.elbow} material={mats.shirtM} castShadow />
            <mesh geometry={GEO.foreArm} material={mats.skinM} position={[0, -0.22, 0]} castShadow />
            <group ref={wristR} position={[0, -0.5, 0]}>
              <mesh geometry={GEO.hand} material={mats.skinM} castShadow />
              <mesh geometry={GEO.thumb} material={mats.skinM} position={[-0.06, 0.08, 0.03]} rotation-z={0.5} castShadow />
            </group>
          </group>
        </group>

        {/* neckwear stays with the torso so it does not swing with head nods */}
        {who === 0 && (
          <>
            <mesh geometry={GEO.scarf} material={mats.scarfM} position={[0, 0.91, 0.02]} rotation-x={Math.PI / 2} castShadow />
            <group position={[0.16, 0.84, 0.27]} rotation-z={0.08}>
              <mesh geometry={GEO.scarfTail} material={mats.scarfM} position={[0, -0.2, 0]} castShadow />
              <mesh geometry={GEO.scarfTip} material={mats.scarfTrimM} position={[0, -0.43, 0]} castShadow />
            </group>
          </>
        )}
        {who === 2 && (
          <group position={[0, 0.88, 0.26]}>
            <mesh geometry={GEO.bowWing} material={mats.bowM} position={[-0.09, 0, 0]} rotation-z={0.2} castShadow />
            <mesh geometry={GEO.bowWing} material={mats.bowM} position={[0.09, 0, 0]} rotation-z={-0.2} castShadow />
            <mesh geometry={GEO.bowKnot} material={mats.accentM} position={[0, 0, 0.015]} />
          </group>
        )}

        {/* head pivots at the top of the neck */}
        <group ref={head} position={[0, HEAD_Y, 0]}>
          <mesh geometry={GEO.head} material={mats.head} position={[0, 0.33, 0]} castShadow />

          {who === 0 && (
            <>
              {/* Vega: neat hair and round glasses */}
              <mesh geometry={GEO.hair} material={mats.hairM} position={[0, 0.51, -0.06]} castShadow />
              <mesh geometry={GEO.fringe} material={mats.hairM} position={[0.17, 0.5, 0.35]} rotation-z={-0.15} castShadow />
              <group position={[0, GLASS_Y, 0.37]}>
                {[-GLASS_X, GLASS_X].map((x) => (
                  <group key={x} position={[x, 0, 0]}>
                    <mesh geometry={GEO.ring} material={mats.frameM} castShadow />
                    <mesh geometry={GEO.lens} material={mats.lensM} position={[0, 0, 0.004]} />
                  </group>
                ))}
                <mesh geometry={GEO.bridge} material={mats.frameM} position={[0, 0.02, 0]} />
                {/* temples angle back from the lens rims to the sides of the head */}
                <mesh geometry={GEO.temple} material={mats.frameM} position={[-0.3, 0.02, -0.13]} rotation-y={0.49} />
                <mesh geometry={GEO.temple} material={mats.frameM} position={[0.3, 0.02, -0.13]} rotation-y={-0.49} />
              </group>
            </>
          )}

          {who === 1 && (
            <>
              {/* Orin: backwards cap with a tuft of hair at the front */}
              <mesh geometry={GEO.fringe} material={mats.hairM} position={[-0.13, 0.53, 0.35]} rotation-z={0.25} castShadow />
              <group position={[0, 0.57, 0]} rotation-x={-0.06}>
                <mesh geometry={GEO.capDome} material={mats.capM} scale={[1, 0.52, 1]} castShadow />
                <mesh geometry={GEO.capBand} material={mats.capTrimM} position={[0, 0.02, 0]} />
                <mesh geometry={GEO.capBrim} material={mats.capM} position={[0, 0.03, -0.5]} rotation-x={0.25} castShadow />
                <mesh geometry={GEO.capButton} material={mats.capTrimM} position={[0, 0.21, 0]} />
              </group>
            </>
          )}

          {who === 2 && (
            /* Juno: a tilted fedora, brim resting on the head */
            <group position={[0, 0.63, 0]} rotation={[-0.08, 0, 0.12]}>
              <mesh geometry={GEO.hatBrim} material={mats.hatM} position={[0, 0, 0.02]} castShadow />
              <mesh geometry={GEO.hatCrown} material={mats.hatM} position={[0, 0.1, 0]} castShadow />
              <mesh geometry={GEO.hatBand} material={mats.accentM} position={[0, 0.045, 0]} />
            </group>
          )}
        </group>
      </group>

      {/* turn marker: an accent ring at table level when it is this bot's move */}
      <group position={[0, TURN_RING_Y, 0]}>
        <mesh ref={ringRef} geometry={GEO.turnRing} material={mats.ringM} position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} />
        <mesh ref={discRef} geometry={GEO.turnDisc} material={mats.discM} rotation-x={-Math.PI / 2} />
      </group>
    </group>
  );
}
