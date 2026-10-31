import { useMemo } from 'react';
import * as THREE from 'three';
import { THEME, gridTexture, haloTexture, GRID_SIZE } from './textures.js';
import { TABLE_RX, TABLE_RZ } from './layout.js';

// The table. Classic: a felt oval with a wooden rim on a pedestal, standing on a floor.
// Future: a low platform with a glowing cyan edge, floating over a grid in the void.

/* ---------- classic ---------- */

function ClassicTable({ theme }) {
  const T = THEME[theme];
  return (
    <group>
      {/* top */}
      <mesh position={[0, -0.11, 0]} scale={[TABLE_RX, 1, TABLE_RZ]} receiveShadow castShadow>
        <cylinderGeometry args={[1, 1, 0.22, 96]} />
        <meshStandardMaterial color={T.felt} roughness={0.95} />
      </mesh>
      {/* felt inlay, slightly lighter in the middle */}
      <mesh position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} scale={[TABLE_RX - 0.32, TABLE_RZ - 0.32, 1]} receiveShadow>
        <circleGeometry args={[1, 96]} />
        <meshStandardMaterial color={T.felt} roughness={1} />
      </mesh>
      {/* wooden rim */}
      <mesh position={[0, -0.02, 0]} rotation-x={-Math.PI / 2} scale={[TABLE_RX, TABLE_RZ, 1]} castShadow receiveShadow>
        <torusGeometry args={[1, 0.075, 24, 120]} />
        <meshStandardMaterial color={T.wood} roughness={0.45} metalness={0.05} />
      </mesh>
      {/* pedestal */}
      <mesh position={[0, -1.1, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.7, 2.0, 48]} />
        <meshStandardMaterial color={T.wood} roughness={0.7} />
      </mesh>
      {/* floor */}
      <mesh position={[0, -2.1, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={T.floor} roughness={1} />
      </mesh>
    </group>
  );
}

/* ---------- future ---------- */

// An ellipse as a Curve3, so the rim tube keeps one thickness all the way round.
class EllipseCurve3 extends THREE.Curve {
  constructor(rx, rz) { super(); this.rx = rx; this.rz = rz; }
  getPoint(t, out = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return out.set(Math.cos(a) * this.rx, 0, Math.sin(a) * this.rz);
  }
}

const PLATFORM_H = 0.2;
const GRID_Y = -1.5;
const rimGeometry = new THREE.TubeGeometry(new EllipseCurve3(TABLE_RX, TABLE_RZ), 240, 0.014, 8, true);
const seamGeometry = new THREE.RingGeometry(0.992, 1, 160);
const slabGeometry = new THREE.CylinderGeometry(1, 0.96, PLATFORM_H, 128);
const inlayGeometry = new THREE.CircleGeometry(1, 128);
const haloGeometry = new THREE.PlaneGeometry(2, 2);
const gridGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
// Well over 1 so the bloom picks the rim up; without bloom it clamps to a pale cyan line.
export const RIM_COLOR = new THREE.Color(THEME.future.accent).multiplyScalar(1.8);

const slabMaterial = new THREE.MeshStandardMaterial({ color: '#121722', roughness: 0.5, metalness: 0.3 });
const inlayMaterial = new THREE.MeshStandardMaterial({ color: '#161d2b', roughness: 0.62, metalness: 0.18 });
// The rim and its halo are shared with Celebration.jsx, which brightens the rim for a moment when
// the game is won, dips both with the lights when it is lost, and puts RIM_COLOR and HALO_OPACITY
// back when it is done.
export const rimMaterial = new THREE.MeshBasicMaterial({ color: RIM_COLOR, toneMapped: false });
export const HALO_OPACITY = 0.35;
let halo = null;
export function haloMaterial() {
  if (!halo) {
    halo = new THREE.MeshBasicMaterial({
      map: haloTexture(), transparent: true, opacity: HALO_OPACITY, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
  }
  return halo;
}
const seamMaterial = new THREE.MeshBasicMaterial({ color: THEME.future.accent, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });

function Platform() {
  const grid = useMemo(() => gridTexture(), []);
  const haloMat = useMemo(() => haloMaterial(), []);
  const gridMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    map: grid, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false,
  }), [grid]);
  return (
    <group>
      {/* the slab */}
      <mesh geometry={slabGeometry} material={slabMaterial} position={[0, -PLATFORM_H / 2, 0]} scale={[TABLE_RX, 1, TABLE_RZ]} receiveShadow castShadow />
      {/* top inlay */}
      <mesh geometry={inlayGeometry} material={inlayMaterial} position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} scale={[TABLE_RX - 0.24, TABLE_RZ - 0.24, 1]} receiveShadow />
      <mesh geometry={seamGeometry} material={seamMaterial} position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} scale={[TABLE_RX - 0.24, TABLE_RZ - 0.24, 1]} />
      {/* glowing edge line */}
      <mesh geometry={rimGeometry} material={rimMaterial} position={[0, 0.004, 0]} />
      {/* soft halo under the rim */}
      <mesh geometry={haloGeometry} material={haloMat} position={[0, -PLATFORM_H - 0.02, 0]} rotation-x={-Math.PI / 2} scale={[TABLE_RX * 1.25, TABLE_RZ * 1.25, 1]} />
      {/* grid in the void */}
      <mesh geometry={gridGeometry} material={gridMaterial} position={[0, GRID_Y, 0]} rotation-x={-Math.PI / 2} />
    </group>
  );
}

export default function Table({ theme }) {
  return theme === 'future' ? <Platform /> : <ClassicTable theme={theme} />;
}
