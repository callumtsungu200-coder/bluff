import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { THEME } from './textures.js';
import { TABLE_RX, TABLE_RZ } from './layout.js';
import { rimMaterial, RIM_COLOR, haloMaterial, HALO_OPACITY } from './Table.jsx';
import { LIGHT_DIM } from './Lights.jsx';
import { useStore, FLAGS } from '../store.js';

// The end of a game, in the scene. Scene mounts it while game.phase is 'over'.
//
// A win: a soft band of light in the theme's accent (cyan on the platform, warm gold on the felt)
// sweeps across the table twice in about 1.5 s, the second pass fainter, while the whole top
// brightens a touch and settles back over 1.8 s; in the Futuristic look the platform's rim
// brightens with it. One table-sized plane carries both, drawn additively with a small shader (an
// elliptical mask, two moving bands and a glow term), so the sweep follows the table's shape and
// nothing allocates per frame.
//
// A loss: the lights go down for a moment. LIGHT_DIM (Lights.jsx) eases to 1 over 300 ms, holds,
// and eases back by 1.3 s, which takes every scene light, and the environment light, down to 60 %
// at the deepest; in the Futuristic look the rim and its halo dip by half with them, so the neon
// drops under the bloom's threshold and its glow goes with the lights. The lights are driven, not
// the renderer's exposure, because the bloom composer renders the scene to a target where three.js
// applies no exposure; this way the dim reads the same with the composer and without it.
//
// Reduced motion (prefers-reduced-motion or &fast=1) skips both, the sweep, the glow, the rim boost
// and the dim alike; the Game over sheet simply comes up. The &end=win|lose:hold debug flag freezes
// the clock at HOLD_AT so the sweep (first band mid-table) or the dim (at its deepest) can be looked
// at, which means it wants a run without &fast=1.

const HOLD_AT = 420;
const HOLD = !!(FLAGS.end && FLAGS.end.hold);
const SWEEP_MS = 1500;
const GLOW_MS = 1800;
const DIM_MS = 1300;
const GLOW = 0.1; // peak brightening of the top
const BAND_1 = 0.4; // the first pass's peak strength, the second is fainter
const BAND_2 = 0.22;
const RIM_BOOST = 0.45; // the rim colour scales up by this much at the peak of a win
const RIM_DIP = 0.5; // the rim colour and the halo scale down by this much at the deepest of a loss

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

const planeGeometry = new THREE.PlaneGeometry(TABLE_RX * 2, TABLE_RZ * 2);

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPos1, uBand1, uPos2, uBand2, uGlow;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float mask = 1.0 - smoothstep(0.84, 1.0, r);
    float d1 = (vUv.x - uPos1) / 0.11;
    float d2 = (vUv.x - uPos2) / 0.14;
    float band = exp(-d1 * d1) * uBand1 + exp(-d2 * d2) * uBand2;
    float glow = uGlow * (0.55 + 0.45 * (1.0 - r));
    float a = mask * (band + glow);
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const materials = new Map();
function sweepMaterial(theme) {
  if (!materials.has(theme)) {
    materials.set(theme, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(THEME[theme].accent) },
        uPos1: { value: -1 }, uBand1: { value: 0 }, uPos2: { value: -1 }, uBand2: { value: 0 }, uGlow: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
  }
  return materials.get(theme);
}

// Everything back where the scene left it: the lights, the sweep and, on the platform, the rim and
// the halo (the halo is only ever made for the Futuristic look, so it is left alone in Classic).
function restore(material, future) {
  LIGHT_DIM.value = 0;
  rimMaterial.color.copy(RIM_COLOR);
  if (future) haloMaterial().opacity = HALO_OPACITY;
  const u = material.uniforms;
  u.uBand1.value = 0; u.uBand2.value = 0; u.uGlow.value = 0;
}

export default function Celebration({ won, theme }) {
  const reduceMotion = useStore((s) => s.reduceMotion);
  const mesh = useRef();
  const material = useMemo(() => sweepMaterial(theme), [theme]);
  const st = useRef({ start: 0, done: false });
  const future = theme === 'future';

  useEffect(() => {
    const s = st.current;
    s.start = performance.now();
    s.done = false;
    return () => restore(material, future);
  }, [material, future]);

  useFrame(() => {
    const s = st.current;
    if (s.done) return;
    if (reduceMotion) {
      // nothing moves: leave the lights and the rim where they were (restored once in case the
      // setting was switched on part-way through) and let the sheet come up on its own
      s.done = true;
      restore(material, future);
      return;
    }
    const t = HOLD ? HOLD_AT : performance.now() - s.start;
    const u = material.uniforms;
    if (won) {
      // two passes left to right, each fading in and out along its way, then the glow settles
      const p1 = clamp01(t / 750);
      const p2 = clamp01((t - 650) / 850);
      u.uPos1.value = -0.2 + 1.4 * easeInOut(p1);
      u.uBand1.value = Math.sin(Math.PI * p1) * BAND_1;
      u.uPos2.value = -0.2 + 1.4 * easeInOut(p2);
      u.uBand2.value = Math.sin(Math.PI * p2) * BAND_2;
      const g = t < 500 ? easeOut(t / 500) : 1 - easeInOut(clamp01((t - 700) / (GLOW_MS - 700)));
      u.uGlow.value = GLOW * g;
      if (future) rimMaterial.color.copy(RIM_COLOR).multiplyScalar(1 + RIM_BOOST * g);
      if (mesh.current) mesh.current.visible = true;
      if (t >= Math.max(SWEEP_MS, GLOW_MS)) {
        s.done = true;
        u.uBand1.value = 0; u.uBand2.value = 0; u.uGlow.value = 0;
        if (mesh.current) mesh.current.visible = false;
        rimMaterial.color.copy(RIM_COLOR);
      }
    } else {
      // down in 300 ms, held to 800 ms, back up by DIM_MS
      const d = t < 300 ? easeOut(t / 300) : t < 800 ? 1 : 1 - easeInOut(clamp01((t - 800) / (DIM_MS - 800)));
      LIGHT_DIM.value = d;
      if (future) {
        rimMaterial.color.copy(RIM_COLOR).multiplyScalar(1 - RIM_DIP * d);
        haloMaterial().opacity = HALO_OPACITY * (1 - RIM_DIP * d);
      }
      if (t >= DIM_MS) { s.done = true; restore(material, future); }
    }
  });

  if (reduceMotion || !won) return null;
  return (
    <mesh ref={mesh} geometry={planeGeometry} material={material} position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} renderOrder={5} visible={false} />
  );
}
