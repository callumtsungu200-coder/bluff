import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rankTexture, holoFrameTexture } from './textures.js';
import { MARKER_POS, HOLO_POS, HOLO_SIZE, HOLO_TILT } from './layout.js';
import { useStore } from '../store.js';

// The rank in play. Classic paints it flat on the felt beside the pile. Future floats a thin
// holographic panel low behind the pile (layout.js HOLO_POS) that bobs slowly; both fade in when
// the rank changes.

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function FlatMarker({ rankIndex, theme }) {
  const tex = useMemo(() => rankTexture(rankIndex, theme), [rankIndex, theme]);
  const ref = useRef();
  const t0 = useRef(0);
  useEffect(() => { t0.current = performance.now(); }, [rankIndex]);
  useFrame(() => {
    if (!ref.current) return;
    const t = Math.min(1, (performance.now() - t0.current) / 500);
    const e = easeOut(t);
    ref.current.scale.setScalar(0.85 + 0.15 * e);
    ref.current.material.opacity = e;
  });
  return (
    <mesh ref={ref} position={MARKER_POS} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[1.7, 1.7]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

const frameGeometry = new THREE.PlaneGeometry(HOLO_SIZE, HOLO_SIZE);
const textGeometry = new THREE.PlaneGeometry(HOLO_SIZE * 0.9, HOLO_SIZE * 0.9);

function Hologram({ rankIndex }) {
  const tex = useMemo(() => rankTexture(rankIndex, 'future'), [rankIndex]);
  const frame = useMemo(() => holoFrameTexture(), []);
  const group = useRef();
  const text = useRef();
  const frameRef = useRef();
  const t0 = useRef(0);
  useEffect(() => { t0.current = performance.now(); }, [rankIndex]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const still = useStore.getState().reduceMotion;
    const t = clock.getElapsedTime();
    g.position.y = HOLO_POS.y + (still ? 0 : Math.sin(t * 0.9) * 0.03);
    g.rotation.y = still ? 0 : Math.sin(t * 0.45) * 0.035;
    const a = Math.min(1, (performance.now() - t0.current) / 600);
    const e = easeOut(a);
    g.scale.setScalar(0.92 + 0.08 * e);
    text.current.material.opacity = e;
    frameRef.current.material.opacity = 0.5 + 0.5 * e;
  });
  return (
    <group ref={group} position={HOLO_POS} rotation-x={HOLO_TILT}>
      <mesh ref={frameRef} geometry={frameGeometry}>
        <meshBasicMaterial map={frame} transparent opacity={1} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={text} geometry={textGeometry} position-z={0.004}>
        <meshBasicMaterial map={tex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function RankHologram({ rankIndex, theme }) {
  return theme === 'future' ? <Hologram rankIndex={rankIndex} /> : <FlatMarker rankIndex={rankIndex} theme={theme} />;
}
