import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { THEME } from './textures.js';
import { GEO, EXTRA, DIM, KEYS, REST, CHIN, MOODS, GESTURE_MS, makePose, gestureInto } from './avatarAltParts.js';
import { useStore } from '../store.js';

// store.reduceMotion (prefers-reduced-motion, or ?fast=1) stills the idle layer and snaps the poses.
const reduced = () => useStore.getState().reduceMotion;

// Soft low-poly character: capsule body, round head, big mesh eyes, two-jointed arms.
// Expressions are mesh transforms driven by `mood`; `gesture` plays a short animation.
// Vega (0) wears glasses and a scarf, Orin (1) a backwards cap, Juno (2) a hat and bow tie.
// window.__AVATAR_FORCE = { mood, active, gesture } (the ?force= flag) overrides the props.
export default function AvatarAlt({ index, position, yaw, theme, mood = 'smile', active = false, seed = 0, gesture = null }) {
  const T = THEME[theme];
  const X = EXTRA[theme];
  const i = index % 3;

  const body = useRef();
  const torso = useRef();
  const head = useRef();
  const shL = useRef();
  const elL = useRef();
  const shR = useRef();
  const elR = useRef();
  const browL = useRef();
  const browR = useRef();
  const eyeL = useRef();
  const eyeR = useRef();
  const pupilL = useRef();
  const pupilR = useRef();
  const mouthArc = useRef();
  const mouthOpen = useRef();
  const floor = useRef();

  const M = useMemo(() => {
    const std = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
    const shade = (hex, dl) => new THREE.Color(hex).offsetHSL(0, 0, dl);
    const skin = T.skin[i];
    const shirt = T.shirt[i];
    const future = theme === 'future';
    return {
      skin: std(skin, { roughness: 0.6 }),
      skinDark: std(shade(skin, -0.08), { roughness: 0.6 }),
      cheek: future
        ? std(X.blush, { roughness: 0.5, emissive: X.blush, emissiveIntensity: 0.5 })
        : std(new THREE.Color(skin).lerp(new THREE.Color(X.blush), 0.4), { roughness: 0.7 }),
      shirt: std(shirt, { roughness: 0.85 }),
      collar: future
        ? std(T.accent, { roughness: 0.5, emissive: T.accent, emissiveIntensity: 0.35 })
        : std(shade(shirt, -0.12), { roughness: 0.85 }),
      pants: std(T.pants[i], { roughness: 0.9 }),
      shoe: std(X.ink, { roughness: 0.5 }),
      hair: std(X.hair[i], { roughness: 0.75 }),
      eye: std(X.eyeWhite, { roughness: 0.35 }),
      pupil: std(X.pupil, { roughness: 0.3, emissive: T.accent, emissiveIntensity: X.pupilGlow }),
      glint: std(X.glint, { emissive: X.glint, emissiveIntensity: 1.2, roughness: 0.3 }),
      ink: std(X.ink, { roughness: 0.5 }),
      teeth: std('#fffaf0', { roughness: 0.4 }),
      accent: std(T.accent, { roughness: 0.4, metalness: 0.3 }),
      frame: std(X.frame, { roughness: 0.35, metalness: 0.4 }),
      cap: std(X.cap, { roughness: 0.8 }),
      hat: std(X.hat, { roughness: 0.6 }),
      bow: std(X.bow, { roughness: 0.6 }),
      scarf: std(X.scarf, { roughness: 0.95 }),
      ring: new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0, depthWrite: false }),
      disc: new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0, depthWrite: false }),
    };
  }, [theme, i]);

  useEffect(() => () => { for (const k in M) M[k].dispose(); }, [M]);

  // Pose state: `cur` is what the meshes show, `tgt` is rebuilt every frame and lerped into.
  const cur = useRef(makePose(REST));
  const tgt = useRef(makePose(REST));
  const gest = useRef({ type: null, start: -1 });

  const key = gesture ? gesture.key : null;
  useEffect(() => {
    gest.current.type = gesture ? gesture.type : null;
    gest.current.start = -1; // stamped with the clock on the next frame
  }, [key]);

  // Which arm reaches toward the table centre: screen-left bots use their +x arm.
  const side = yaw > 0.01 ? 1 : -1;

  // Debug rig: ?avdebug=1 stands the bots on the table under a close camera (&avcam=side for a
  // profile); &avphase=0.5 freezes any gesture (forced or real) at that progress for screenshots.
  const DBG = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const phase = q.get('avphase');
    if (!q.get('avdebug') && phase == null) return null;
    return { rig: !!q.get('avdebug'), phase: phase == null ? null : Number(phase), cam: q.get('avcam') };
  }, []);
  if (DBG && DBG.rig) {
    position = [[-2.1, 0, 0.4], [0, 0, 0.1], [2.1, 0, 0.4]][i];
    yaw = 0;
  }

  useFrame(({ clock, camera }, dt) => {
    const now = clock.getElapsedTime();
    const t = now + seed * 1.7;
    if (DBG && DBG.rig && i === 0) {
      if (DBG.cam === 'side') { camera.position.set(6, 2.4, 2); camera.lookAt(0, 1.3, 0.3); }
      else { camera.position.set(0, 3.4, 6.2); camera.lookAt(0, 1.35, 0.3); }
    }

    // forced pose for screenshots; a forced gesture loops
    const F = window.__AVATAR_FORCE;
    const md = (F && F.mood) || mood;
    const act = F && F.active != null ? F.active : active;
    const gs = gest.current;
    if (F && F.gesture && gs.type !== F.gesture) { gs.type = F.gesture; gs.start = -1; }

    const c = cur.current;
    const g = tgt.current;
    const face = MOODS[md] || MOODS.smile;

    // idle base: breathing sway in the arms, slow body roll, wandering head and gaze (IDLE is 0
    // with reduced motion: the figure holds still)
    const still = reduced();
    const IDLE = still ? 0 : 1;
    for (let k = 0; k < KEYS.length; k++) g[KEYS[k]] = REST[KEYS[k]];
    const swing = Math.sin(t * 1.6) * 0.04 * IDLE;
    g.shLx += swing; g.shRx -= swing;
    g.lean = act ? 0.12 : 0.02;
    g.roll = Math.sin(t * 0.7) * 0.02 * IDLE;
    g.twist = (act ? Math.sin(t * 1.3) * 0.05 : Math.sin(t * 0.4) * 0.04) * IDLE;
    g.headYaw = (act ? Math.sin(t * 2.0) * 0.1 : Math.sin(t * 0.5) * 0.06) * IDLE;
    g.headRoll = Math.sin(t * 0.9) * 0.04 * IDLE;
    g.headPitch += act ? 0.03 : 0;
    g.browL = face.browL; g.browR = face.browR; g.browY = face.browY;
    g.mouthX = face.mouthX; g.mouthY = face.mouthY; g.mouthOpen = face.mouthOpen;
    g.eyeOpen = face.eyeOpen + (act ? 0.15 : 0);
    g.eyeX = face.eyeX + Math.sin(t * 0.31) * 0.012 * IDLE;
    g.eyeY = face.eyeY + Math.sin(t * 0.23) * 0.008 * IDLE;
    g.ring = act ? 0.75 + Math.sin(t * 3) * 0.15 * IDLE : 0;

    // thinking: the inner hand comes up to the jaw, head cocks toward it
    if (md === 'think') {
      const R = side > 0;
      g[R ? 'shRx' : 'shLx'] = CHIN.shx;
      g[R ? 'shRz' : 'shLz'] = -side * CHIN.shz;
      g[R ? 'elRx' : 'elLx'] = CHIN.elx + Math.sin(t * 2.3) * 0.04;
      g.headRoll -= side * 0.1;
      g.headYaw -= side * 0.08;
      g.headPitch += 0.06;
    }

    // gesture layer
    if (gs.type) {
      if (gs.start < 0) gs.start = now;
      let el = now - gs.start;
      const ms = GESTURE_MS[gs.type];
      if (DBG && DBG.phase != null) el = gs.type === 'win' ? DBG.phase : (DBG.phase * ms) / 1000;
      if (gs.type === 'win') gestureInto(g, 'win', el, side);
      else if (ms && el * 1000 < ms) gestureInto(g, gs.type, (el * 1000) / ms, side);
      else gs.type = null; // finished; a forced gesture restarts next frame
    }

    // ease toward the target (frame-rate independent; a snap with reduced motion)
    const w = still ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 11);
    for (let k = 0; k < KEYS.length; k++) {
      const n = KEYS[k];
      c[n] += (g[n] - c[n]) * w;
    }

    // apply
    const breathe = Math.sin(t * 1.8) * IDLE;
    if (body.current) {
      body.current.rotation.set(c.lean, c.twist, c.roll);
      body.current.position.y = c.bounce + breathe * 0.012;
    }
    if (torso.current) torso.current.scale.set(1, 1 + breathe * 0.012, 0.82);
    if (head.current) {
      head.current.rotation.set(c.headPitch, c.headYaw, c.headRoll);
      head.current.position.z = c.headZ;
    }
    if (shL.current) { shL.current.rotation.set(c.shLx, 0, c.shLz); shL.current.position.y = DIM.shoulderY + c.shLy; }
    if (shR.current) { shR.current.rotation.set(c.shRx, 0, c.shRz); shR.current.position.y = DIM.shoulderY + c.shRy; }
    if (elL.current) elL.current.rotation.x = c.elLx;
    if (elR.current) elR.current.rotation.x = c.elRx;
    if (browL.current) { browL.current.rotation.z = c.browL; browL.current.position.y = DIM.browY + c.browY; }
    if (browR.current) { browR.current.rotation.z = c.browR; browR.current.position.y = DIM.browY + c.browY; }

    // blink: a quick close every few seconds, offset per bot
    const cycle = 3.6 + (seed % 3) * 0.7;
    const ph = (t + seed * 1.3) % cycle;
    const blink = ph < 0.16 && !still ? Math.sin((ph / 0.16) * Math.PI) : 0;
    const open = Math.max(0.08, c.eyeOpen * (1 - blink * 0.94));
    const wide = 1 + (c.eyeOpen - 1) * 0.3;
    if (eyeL.current) eyeL.current.scale.set(wide, open, 1);
    if (eyeR.current) eyeR.current.scale.set(wide, open, 1);
    if (pupilL.current) pupilL.current.position.set(c.eyeX, c.eyeY, 0.078);
    if (pupilR.current) pupilR.current.position.set(c.eyeX, c.eyeY, 0.078);

    if (mouthArc.current) {
      const my = Math.abs(c.mouthY) < 0.08 ? (c.mouthY < 0 ? -0.08 : 0.08) : c.mouthY;
      mouthArc.current.scale.set(c.mouthX, my, 1);
    }
    if (mouthOpen.current) {
      const o = c.mouthOpen;
      mouthOpen.current.visible = o > 0.04;
      mouthOpen.current.scale.set(Math.max(0.04, o) * c.mouthX, Math.max(0.04, o), 1);
    }

    // floor glow while active: fades in and pulses rather than popping
    if (floor.current) {
      const r = c.ring;
      floor.current.visible = r > 0.01;
      M.ring.opacity = r;
      M.disc.opacity = r * 0.2;
      floor.current.scale.setScalar(1 + (1 - Math.min(1, r / 0.6)) * 0.3);
    }
  });

  const ex = DIM.eyeX, ey = DIM.eyeY, ez = DIM.eyeZ;
  const hairTilt = i === 1 ? -0.5 : -0.35;

  return (
    <group position={position} rotation-y={yaw}>
      <group ref={body}>
        {/* legs and feet (mostly hidden by the table) */}
        <mesh geometry={GEO.leg} material={M.pants} position={[-0.19, 0.36, 0]} castShadow />
        <mesh geometry={GEO.leg} material={M.pants} position={[0.19, 0.36, 0]} castShadow />
        <mesh geometry={GEO.foot} material={M.shoe} position={[-0.19, 0.08, 0.06]} scale={[1, 0.55, 1.3]} castShadow />
        <mesh geometry={GEO.foot} material={M.shoe} position={[0.19, 0.08, 0.06]} scale={[1, 0.55, 1.3]} castShadow />

        {/* torso, neck, collar */}
        <mesh ref={torso} geometry={GEO.torso} material={M.shirt} position={[0, 1.02, 0]} scale={[1, 1, 0.82]} castShadow />
        <mesh geometry={GEO.neck} material={M.skin} position={[0, 1.62, 0]} castShadow />
        <mesh geometry={GEO.collar} material={M.collar} position={[0, 1.57, 0]} rotation-x={Math.PI / 2} scale={[1.1, 1, 1]} castShadow />

        {/* arms: shoulder pivot, elbow pivot, mitt hand (thin across x so the palms face the cards) */}
        <group ref={shL} position={[-DIM.shoulderX, DIM.shoulderY, DIM.shoulderZ]}>
          <mesh geometry={GEO.shoulder} material={M.shirt} castShadow />
          <mesh geometry={GEO.upperArm} material={M.shirt} position={[0, -0.26, 0]} castShadow />
          <group ref={elL} position={[0, -DIM.elbow, 0]}>
            <mesh geometry={GEO.forearm} material={M.skin} position={[0, -0.24, 0]} castShadow />
            <mesh geometry={GEO.hand} material={M.skin} position={[0, -DIM.handDrop, 0]} scale={[0.78, 1, 1.12]} rotation-x={0.3} castShadow />
          </group>
        </group>
        <group ref={shR} position={[DIM.shoulderX, DIM.shoulderY, DIM.shoulderZ]}>
          <mesh geometry={GEO.shoulder} material={M.shirt} castShadow />
          <mesh geometry={GEO.upperArm} material={M.shirt} position={[0, -0.26, 0]} castShadow />
          <group ref={elR} position={[0, -DIM.elbow, 0]}>
            <mesh geometry={GEO.forearm} material={M.skin} position={[0, -0.24, 0]} castShadow />
            <mesh geometry={GEO.hand} material={M.skin} position={[0, -DIM.handDrop, 0]} scale={[0.78, 1, 1.12]} rotation-x={0.3} castShadow />
          </group>
        </group>

        {/* head, pivoting at the neck */}
        <group ref={head} position={[0, DIM.headY, 0]}>
          <group position={[0, DIM.headUp, 0]}>
            <mesh geometry={GEO.head} material={M.skin} castShadow />
            <mesh geometry={GEO.hair} material={M.hair} rotation-x={hairTilt} scale={[1.03, 1, 1.03]} castShadow />
            <mesh geometry={GEO.ear} material={M.skin} position={[-0.33, 0, 0]} scale={[0.55, 1, 0.9]} castShadow />
            <mesh geometry={GEO.ear} material={M.skin} position={[0.33, 0, 0]} scale={[0.55, 1, 0.9]} castShadow />
            <mesh geometry={GEO.nose} material={M.skinDark} position={[0, -0.04, 0.335]} castShadow />
            <mesh geometry={GEO.cheek} material={M.cheek} position={[-0.21, -0.09, 0.255]} scale={[1, 0.7, 0.45]} />
            <mesh geometry={GEO.cheek} material={M.cheek} position={[0.21, -0.09, 0.255]} scale={[1, 0.7, 0.45]} />

            {/* eyes: white, pupil, highlight; the group scales for blinks and squints */}
            <group ref={eyeL} position={[-ex, ey, ez]}>
              <mesh geometry={GEO.eye} material={M.eye} castShadow />
              <mesh ref={pupilL} geometry={GEO.pupil} material={M.pupil} position={[0, 0, 0.078]} />
              <mesh geometry={GEO.glint} material={M.glint} position={[-0.028, 0.034, 0.112]} />
            </group>
            <group ref={eyeR} position={[ex, ey, ez]}>
              <mesh geometry={GEO.eye} material={M.eye} castShadow />
              <mesh ref={pupilR} geometry={GEO.pupil} material={M.pupil} position={[0, 0, 0.078]} />
              <mesh geometry={GEO.glint} material={M.glint} position={[-0.028, 0.034, 0.112]} />
            </group>

            {/* brows, turned slightly to follow the curve of the forehead */}
            <mesh ref={browL} geometry={GEO.brow} material={M.ink} position={[-ex - 0.01, DIM.browY, 0.275]} rotation={[-0.25, -0.3, 0]} castShadow />
            <mesh ref={browR} geometry={GEO.brow} material={M.ink} position={[ex + 0.01, DIM.browY, 0.275]} rotation={[-0.25, 0.3, 0]} castShadow />

            {/* mouth: an arc (flipped for frowns, flattened for 'think') with an open-mouth insert */}
            <group position={[0, -0.15, 0.318]} rotation-x={0.3}>
              <mesh ref={mouthArc} geometry={GEO.mouthArc} material={M.ink} rotation-z={Math.PI} />
              <group ref={mouthOpen} position={[0, -0.02, -0.004]}>
                <mesh geometry={GEO.mouthInner} material={M.ink} />
                <mesh geometry={GEO.teeth} material={M.teeth} position={[0, 0.02, 0.004]} />
              </group>
            </group>

            {/* Vega: round glasses */}
            {i === 0 && (
              <group>
                <mesh geometry={GEO.lens} material={M.frame} position={[-ex, ey, 0.375]} castShadow />
                <mesh geometry={GEO.lens} material={M.frame} position={[ex, ey, 0.375]} castShadow />
                <mesh geometry={GEO.bridge} material={M.frame} position={[0, ey + 0.01, 0.37]} />
                <mesh geometry={GEO.temple} material={M.frame} position={[-0.3, ey + 0.02, 0.17]} />
                <mesh geometry={GEO.temple} material={M.frame} position={[0.3, ey + 0.02, 0.17]} />
              </group>
            )}
            {/* Orin: backwards cap */}
            {i === 1 && (
              <group position={[0, 0.05, 0]}>
                <mesh geometry={GEO.capDome} material={M.cap} scale={[1.03, 0.85, 1.03]} castShadow />
                <mesh geometry={GEO.capBrim} material={M.cap} position={[0, 0.0, -0.1]} rotation={[0.25, Math.PI / 2, 0]} castShadow />
                <mesh geometry={GEO.capButton} material={M.accent} position={[0, 0.31, 0]} />
                <mesh geometry={GEO.collar} material={M.cap} position={[0, 0.01, 0]} rotation-x={Math.PI / 2} scale={[1.72, 1.72, 0.5]} />
              </group>
            )}
            {/* Juno: hat */}
            {i === 2 && (
              <group position={[0, 0.27, 0]} rotation={[-0.06, 0, 0.08]}>
                <mesh geometry={GEO.hatBrim} material={M.hat} castShadow />
                <mesh geometry={GEO.hatCrown} material={M.hat} position={[0, 0.13, 0]} castShadow />
                <mesh geometry={GEO.hatBand} material={M.accent} position={[0, 0.045, 0]} />
              </group>
            )}
          </group>
        </group>

        {/* Vega: scarf */}
        {i === 0 && (
          <group>
            <mesh geometry={GEO.scarf} material={M.scarf} position={[0, 1.56, 0.02]} rotation-x={Math.PI / 2} scale={[1, 1, 0.8]} castShadow />
            <mesh geometry={GEO.scarfTail} material={M.scarf} position={[-0.1, 1.28, 0.32]} rotation={[0.12, 0, 0.08]} scale={[1.5, 1, 0.6]} castShadow />
          </group>
        )}
        {/* Juno: bow tie */}
        {i === 2 && (
          <group position={[0, 1.5, 0.3]}>
            <mesh geometry={GEO.bowWing} material={M.bow} position={[-0.07, 0, 0]} rotation-z={0.2} castShadow />
            <mesh geometry={GEO.bowWing} material={M.bow} position={[0.07, 0, 0]} rotation-z={-0.2} castShadow />
            <mesh geometry={GEO.bowKnot} material={M.accent} />
          </group>
        )}
      </group>

      {/* accent glow on the floor while it is this bot's turn */}
      <group ref={floor} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} visible={false}>
        <mesh geometry={GEO.ring} material={M.ring} />
        <mesh geometry={GEO.disc} material={M.disc} position-z={-0.002} />
      </group>
    </group>
  );
}
