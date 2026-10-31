import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { THEME } from './textures.js';

// Lighting per theme. Classic: a warm spot over the table with fills. Future: soft environment
// light from a few virtual panels (no HDR download) plus one cool shadow-casting spot. Each theme
// has exactly one shadow-casting light; its map is 2048 px on a desktop stage and 1024 px on a
// narrow one (a phone), where the saving shows and the difference does not.
//
// The dim at the end of a lost game is driven from here too. Celebration.jsx eases LIGHT_DIM.value
// from 0 (the lighting as set up below) to 1 (the deepest) and back, and Dimmer scales every light
// of the mounted look, and the environment light in the Futuristic one, down by DIM_DEPTH at 1.
// The lights are dimmed rather than the renderer's exposure because the bloom composer renders the
// scene to a target, where three.js applies no tone mapping or exposure, so an exposure change
// never reached the screen in the Futuristic look; the lights read the same with and without it.

const SMALL_STAGE = 900; // canvas width (CSS px) under which the shadow map halves

export const LIGHT_DIM = { value: 0 };
const DIM_DEPTH = 0.4; // the lights fall to 60 % at the deepest

function useTarget(x, y, z) {
  return useMemo(() => { const o = new THREE.Object3D(); o.position.set(x, y, z); return o; }, [x, y, z]);
}

function useShadowSize() {
  const width = useThree((s) => s.size.width);
  return width < SMALL_STAGE ? 1024 : 2048;
}

// Applies LIGHT_DIM to the lights under `group` whenever it changes (nothing runs while it holds
// still). A light's base intensity is noted the first time it is seen, so a light that remounts
// (the shadow light does when its map size changes) starts from its own prop value.
function Dimmer({ group }) {
  const scene = useThree((s) => s.scene);
  const applied = useRef(-1);
  useFrame(() => {
    const v = LIGHT_DIM.value;
    if (v === applied.current) return;
    applied.current = v;
    const k = 1 - DIM_DEPTH * v;
    scene.environmentIntensity = k;
    if (!group.current) return;
    group.current.traverse((o) => {
      if (!o.isLight) return;
      if (o.userData.base === undefined) o.userData.base = o.intensity;
      o.intensity = o.userData.base * k;
    });
  });
  return null;
}

function ClassicLights({ theme }) {
  const T = THEME[theme];
  const target = useTarget(0, 0, -0.3);
  const mapSize = useShadowSize();
  const group = useRef();
  return (
    <group ref={group}>
      <Dimmer group={group} />
      <primitive object={target} />
      <hemisphereLight args={[T.light, T.floor, 0.55]} />
      <ambientLight intensity={0.25} />
      <spotLight
        key={mapSize}
        position={[0.5, 8.5, 1.5]}
        target={target}
        angle={0.62}
        penumbra={0.6}
        intensity={260}
        color={T.light}
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[0, 4, 9]} intensity={0.9} color={T.light} />
      <directionalLight position={[-6, 3, -4]} intensity={0.35} color={T.accent} />
    </group>
  );
}

function FutureLights() {
  const T = THEME.future;
  const target = useTarget(0, 0, -0.3);
  const mapSize = useShadowSize();
  const group = useRef();
  return (
    <group ref={group}>
      <Dimmer group={group} />
      <primitive object={target} />
      <ambientLight intensity={0.16} color={T.light} />
      {/* the one shadow light */}
      <spotLight
        key={mapSize}
        position={[0.8, 8.5, 2.2]}
        target={target}
        angle={0.6}
        penumbra={0.7}
        intensity={190}
        color="#e4f0ff"
        castShadow
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <Environment resolution={64} frames={1}>
        {/* a broad soft panel overhead */}
        <Lightformer form="rect" intensity={1.5} color="#dfe9ff" scale={[12, 7]} position={[0, 9, 0]} target={[0, 0, 0]} />
        {/* cool key from the player's side */}
        <Lightformer form="rect" intensity={0.8} color="#cfe9ff" scale={[9, 3]} position={[0, 4, 11]} target={[0, 0, 0]} />
        {/* a cyan rim from behind the far seats */}
        <Lightformer form="ring" intensity={1.1} color={T.accent} scale={7} position={[0, 2.5, -11]} target={[0, 0, 0]} />
        {/* faint side fills */}
        <Lightformer form="rect" intensity={0.45} color="#7a8499" scale={[3, 7]} position={[-11, 3, 0]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.45} color="#7a8499" scale={[3, 7]} position={[11, 3, 0]} target={[0, 0, 0]} />
      </Environment>
    </group>
  );
}

export default function Lights({ theme }) {
  return theme === 'future' ? <FutureLights /> : <ClassicLights theme={theme} />;
}
