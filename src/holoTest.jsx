import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import Lights from './scene/Lights.jsx';
import Table from './scene/Table.jsx';
import Effects from './scene/Effects.jsx';
import Avatar from './scene/Avatar.jsx';
import AvatarAlt from './scene/AvatarAlt.jsx';
import { Hologram } from './scene/Hologram.jsx';
import { EXTRA } from './scene/avatarAltParts.js';
import { THEME, makePanelTexture } from './scene/textures.js';
import { CAMERA, seatFor, fanAnchor, panelAnchor, FAN_SCALE, PANEL_W, PANEL_H } from './scene/layout.js';
import { CARD_GEOMETRY, cardMaterials } from './scene/Card.jsx';

// Test bench for the hologram treatment (public/holo.html, dev only; nothing in src/main.jsx imports
// it). The game's Future platform, lights and camera, the three characters at their seats wrapped in
// <Hologram>, a fan of face-down cards in front of each (the cards must stay readable), and a seat
// panel floating over each head.
//
// The character is Avatar.jsx: its painted face survives the projection as ink on the glowing head,
// and the three read apart by face and hat. That is the Future default and what the game should
// wrap. AvatarAlt (alt=1) is a comparison only: its mesh eyes and brows go through the wrapper's
// ink rule, which keeps them from glowing into rings, but its silhouettes are still the weaker set.
// Its cap and hair are tinted brighter than the heads under them (ALT_BRIGHT, the wrapper's `bright`
// prop), without which Orin's cap reads as a plain dome and Vega's head as a bare sphere.
//
// Query flags:
//   alt=1        the AvatarAlt characters (comparison only, see above)
//   bright=0     with alt=1: no per-part brightness overrides (every part tinted from its own colour)
//   active=1     every seat active (the brighter, faster preset)
//   plain=1      the characters unwrapped, for comparison
//   blend=normal normal blending instead of additive
//   xray=1       no depth twins (overlapping parts add up)
//   ink=0        no ink rule: every opaque part glows, small dark ones included
//   bloom=0      no post-processing
//   beam=0 ring=0 light=0   drop an emitter piece
//   op=0.55 scan=18          opacity multiplier and scanline density (scan unset: the component's default, 18)
//   panel=0.55   how far above the layout's panel position the panels float (0 = where the game has them)
//   force=mood,active,gesture   window.__AVATAR_FORCE, as in the game (?force=think,1,call)

const q = new URLSearchParams(window.location.search);
const flag = (k, d = false) => (q.has(k) ? q.get(k) !== '0' : d);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const ALT = flag('alt');
const BRIGHT = flag('bright', true);
const ACTIVE = flag('active');
const PLAIN = flag('plain');
const BLEND = q.get('blend') === 'normal' ? 'normal' : 'additive';
const OCCLUDE = !flag('xray');
const INK = flag('ink', true);
const BLOOM = flag('bloom', true);
const BEAM = flag('beam', true);
const RING = flag('ring', true);
const LIGHT = flag('light', true);
const OP = num('op', 1);
const SCAN = num('scan', undefined); // unset: <Hologram> falls back to its own SCAN_DENSITY, so bench and game match
const PANEL_LIFT = num('panel', 0.55);
if (q.get('force')) {
  const [mood, active, gesture] = q.get('force').split(',');
  window.__AVATAR_FORCE = { mood: mood || null, active: active ? active === '1' : null, gesture: gesture || null };
}

const NAMES = [
  { name: 'Vega', tag: 'Cautious' },
  { name: 'Orin', tag: 'Reckless' },
  { name: 'Juno', tag: 'Sly' },
];
const COUNTS = [7, 5, 9];
const T = THEME.future;

// Per-part brightness for the AvatarAlt set. Its cap (dome, brim and band share one material) and
// its hair hood sit over heads of nearly the same tone, so tinted from their own colours they merge
// with the head once everything is cyan; brighter, they read as a cap and a bob again. AvatarAlt's
// materials carry no names, so the parts are matched by their Future colours (EXTRA.future); were
// they named, the equivalent is bright={{ cap: 1.5, hair: 1.4 }}. One stable function, resolved
// once per material by the wrapper.
const ALT_BRIGHT = (() => {
  const X = EXTRA.future;
  const hex = (c) => new THREE.Color(c).getHex();
  const table = new Map([[hex(X.cap), 1.5], ...X.hair.map((h) => [hex(h), 1.4])]);
  return (mesh, m) => (m.color ? table.get(m.color.getHex()) : undefined);
})();

// The game's fan: FAN_PIVOT below the middle card, FAN_STEP apart, one card thickness nearer each.
const FAN_PIVOT = 0.75;
const Z_STEP = 0.012 * FAN_SCALE + 0.0008;
function Fan({ index }) {
  const fan = useMemo(() => fanAnchor(index, 3), [index]);
  const n = COUNTS[index];
  const mats = useMemo(() => cardMaterials(null, 'future'), []);
  const step = THREE.MathUtils.clamp(0.95 / n, 0.065, 0.11) * (ACTIVE ? 1.14 : 1);
  const mid = (n - 1) / 2;
  return (
    <group position={fan.pos} rotation={[-fan.tilt, fan.yaw, 0, 'YXZ']}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i - mid) * step;
        return (
          <mesh
            key={i}
            geometry={CARD_GEOMETRY}
            material={mats}
            position={[Math.sin(a) * FAN_PIVOT, Math.cos(a) * FAN_PIVOT - FAN_PIVOT, i * Z_STEP]}
            rotation-z={-a}
            scale={FAN_SCALE}
            castShadow
          />
        );
      })}
    </group>
  );
}

const panelGeometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
function Panel({ index }) {
  const anchor = useMemo(() => panelAnchor(index, 3), [index]);
  const tex = useMemo(() => {
    const p = makePanelTexture(false);
    p.draw({ name: NAMES[index].name, tag: NAMES[index].tag, count: COUNTS[index], low: COUNTS[index] <= 3 });
    return p.texture;
  }, [index]);
  const pos = [anchor.pos.x, anchor.pos.y + PANEL_LIFT, anchor.pos.z];
  return (
    <mesh geometry={panelGeometry} position={pos} rotation={[anchor.tilt, anchor.yaw, 0, 'YXZ']}>
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function Seat({ index }) {
  const seat = useMemo(() => seatFor(index, 3), [index]);
  const pos = useMemo(() => seat.pos.toArray(), [seat]);
  const AvatarC = ALT ? AvatarAlt : Avatar;
  const figure = (
    <AvatarC index={index} position={pos} yaw={seat.yaw} theme="future" mood="smile" active={ACTIVE} seed={index} gesture={null} />
  );
  return (
    <group>
      {PLAIN ? figure : (
        <Hologram active={ACTIVE} intensity={OP} blending={BLEND} occlude={OCCLUDE} scanDensity={SCAN} ink={INK}
          bright={ALT && BRIGHT ? ALT_BRIGHT : null} position={pos} yaw={seat.yaw} beam={BEAM} ring={RING} light={LIGHT}>
          {figure}
        </Hologram>
      )}
      <Fan index={index} />
      <Panel index={index} />
    </group>
  );
}

function App() {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: CAMERA.fov, near: 0.1, far: 60, position: CAMERA.pos }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onCreated={({ camera }) => camera.lookAt(CAMERA.look[0], CAMERA.look[1], CAMERA.look[2])}
    >
      <color attach="background" args={[T.fog]} />
      <fog attach="fog" args={[T.fog, 13, 30]} />
      <Lights theme="future" />
      <Table theme="future" />
      {[0, 1, 2].map((i) => <Seat key={i} index={i} />)}
      <Effects enabled={BLOOM} />
    </Canvas>
  );
}

// The panels draw text in the web fonts: wait for them (briefly) before the first texture.
const FONTS = ['600 54px Sora', '400 28px "Space Mono"'];
function fontsReady() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
  const loads = Promise.allSettled(FONTS.map((f) => document.fonts.load(f)));
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
  return Promise.race([loads, timeout]);
}
const mount = () => {
  // one root per page, so an HMR re-evaluation re-renders instead of mounting twice
  if (!window.__holoRoot) window.__holoRoot = createRoot(document.getElementById('root'));
  window.__holoRoot.render(<App />);
};
fontsReady().then(mount, mount);
