import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CAMERA, CAMERA_ORBIT, framePoints } from './layout.js';
import { useStore } from '../store.js';

// The camera at your seat. Landscape stages use the hand-tuned pose (CAMERA). Portrait stages widen
// the view and back off a little, then fit: the camera pitches so the table, the hand and the seat
// panels sit centred, and narrows its field until the widest hand and the outer seat panels just
// fill the width (FIT margins, layout.js framePoints), so a phone shows the table as large as its
// width allows instead of a desktop framing shrunk into a tall screen. The fit blends in between
// aspects 1.29 and 1.15, so desktop windows (1280x1000 and wider) keep their framing. In the
// immersive layout the guide HUD and the control cluster float over the top of the stage and the
// action bar over the bottom, so the landscape pose opens its field a little (IMMERSIVE_ZOOM) and
// pitches down a touch (IMMERSIVE_DROP): the seats, their plates and their bubbles come down from
// the top edge, clear of the HUD, while the hand stays clear of the action bar. Portrait stages
// use FIT.centreImmersive once the fit is on. OrbitControls add a gentle parallax: a drag (or a
// touch) swings the view a few degrees around the default pose and no further, so you can never
// lose the table.
//
// The reveal nudges the camera in: while store.cameraNudge is 1 the rig eases the camera NUDGE_IN
// closer to its look point (the middle of the table, where the pile is) over NUDGE_MS, and eases
// back when it drops to 0. It is a dolly along the orbit radius, so the orbit's angle clamps are
// untouched and a drag during the reveal still works. Reduced motion leaves the camera alone.

const IMMERSIVE_DROP = 0.05;
const IMMERSIVE_ZOOM = 1.1; // the landscape field of view opens by this much in the immersive layout
const NUDGE_IN = 0.08;
const NUDGE_MS = 400;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const FIT = {
  from: 1.12, span: 0.14, // blend in over portrait = 1.45 / aspect from 1.12 to 1.26
  mx: 0.05, mTop: 0.08, mBottom: 0.08, // margins as a fraction of the half-width and half-height
  centre: 0, centreImmersive: -0.03, // where the content's vertical centre lands (NDC y)
  minFov: 28, maxFov: 74,
};
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

// Tangents of the frame points' angles off the view axis for a camera at `pos` looking at `look`:
// the widest |x| and the lowest and highest y.
function measure(pts, pos, look) {
  _m.lookAt(pos, look, THREE.Object3D.DEFAULT_UP).invert();
  let tx = 0, ymin = Infinity, ymax = -Infinity;
  for (const p of pts) {
    _v.copy(p).sub(pos).applyMatrix4(_m);
    const d = Math.max(1e-6, -_v.z);
    tx = Math.max(tx, Math.abs(_v.x) / d);
    const ty = _v.y / d;
    if (ty < ymin) ymin = ty;
    if (ty > ymax) ymax = ty;
  }
  return { tx, ymin, ymax };
}

export function framingFor(width, height, immersive = false) {
  const aspect = width / Math.max(height, 1);
  const portrait = Math.max(1, 1.45 / aspect);
  let fov = Math.min(74, CAMERA.fov * Math.pow(portrait, 0.85) * (immersive ? IMMERSIVE_ZOOM : 1));
  const back = portrait > 1 ? 1 + (portrait - 1) * 0.25 : 1;
  const pos = new THREE.Vector3(CAMERA.pos[0], CAMERA.pos[1] * back, CAMERA.pos[2] * back);
  const look = new THREE.Vector3(CAMERA.look[0], CAMERA.look[1] + (portrait - 1) * 0.5 - (immersive ? IMMERSIVE_DROP : 0), CAMERA.look[2]);
  const blend = THREE.MathUtils.clamp((portrait - FIT.from) / FIT.span, 0, 1);
  if (blend > 0) {
    const pts = framePoints(aspect);
    // Pitch so the content's centre sits where we want it, then open the field just enough.
    let r = measure(pts, pos, look);
    const want = (immersive ? FIT.centreImmersive : FIT.centre) * (r.ymax - r.ymin) / 2;
    const delta = Math.atan((r.ymin + r.ymax) / 2) - Math.atan(want);
    const lookFit = look.clone().sub(pos).applyAxisAngle(X_AXIS, delta).add(pos);
    r = measure(pts, pos, lookFit);
    const tanHalf = Math.max(r.tx / ((1 - FIT.mx) * aspect), r.ymax / (1 - FIT.mTop), -r.ymin / (1 - FIT.mBottom));
    const fovFit = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(tanHalf)), FIT.minFov, FIT.maxFov);
    fov = THREE.MathUtils.lerp(fov, fovFit, blend);
    look.lerp(lookFit, blend);
  }
  const off = pos.clone().sub(look);
  const polar = Math.atan2(Math.hypot(off.x, off.z), off.y);
  const azimuth = Math.atan2(off.x, off.z);
  return { fov, pos, look, polar, azimuth };
}

export default function CameraRig() {
  const { camera, size, gl } = useThree();
  const connected = useThree((s) => s.events.connected);
  const immersive = useStore((s) => s.immersive);
  const controls = useRef(null);
  const f = useMemo(() => framingFor(size.width, size.height, immersive), [size.width, size.height, immersive]);
  // the nudge tween: `cur` is where it is, `applied` what the camera's radius currently carries
  const nudge = useRef({ cur: 0, from: 0, to: 0, at: 0, applied: 0 });

  useLayoutEffect(() => {
    camera.fov = f.fov;
    camera.position.copy(f.pos);
    camera.lookAt(f.look);
    camera.updateProjectionMatrix();
    nudge.current.applied = 0; // the base pose again; the frame loop re-applies the nudge
    const c = controls.current;
    if (c) {
      c.target.copy(f.look);
      c.minPolarAngle = f.polar - CAMERA_ORBIT.polar;
      c.maxPolarAngle = f.polar + CAMERA_ORBIT.polar;
      c.minAzimuthAngle = f.azimuth - CAMERA_ORBIT.azimuth;
      c.maxAzimuthAngle = f.azimuth + CAMERA_ORBIT.azimuth;
      c.update();
    }
  }, [camera, f]);

  // Ease toward the store's nudge and scale the camera's offset from its target to match. The
  // scale is applied as a ratio against what is already applied, so OrbitControls (which keeps
  // the radius it finds) and this loop never fight.
  useFrame(() => {
    const st = nudge.current;
    const s = useStore.getState();
    const target = s.reduceMotion ? 0 : s.cameraNudge;
    const now = performance.now();
    if (target !== st.to) { st.from = st.cur; st.to = target; st.at = now; }
    const t = Math.min(1, (now - st.at) / NUDGE_MS);
    st.cur = st.from + (st.to - st.from) * easeInOut(t);
    if (st.cur === st.applied) return;
    const look = controls.current ? controls.current.target : f.look;
    const k = (1 - NUDGE_IN * st.cur) / (1 - NUDGE_IN * st.applied);
    camera.position.sub(look).multiplyScalar(k).add(look);
    st.applied = st.cur;
  });

  // OrbitControls put touch-action: none on the element they listen to, which would stop the page
  // scrolling past the table on phones. They are pinned to the canvas below (left alone, drei
  // re-binds them to the fiber wrapper div once fiber connects its events there, and that re-bind
  // resets the canvas to auto and sets none on the wrapper). This effect runs after the controls'
  // connect effect (a parent's effects run after its children's) and re-runs if the connected
  // element ever changes, so vertical swipes stay with the page and sideways drags still turn the
  // view. styles.css repeats the value with !important as a safety net.
  useEffect(() => {
    const els = [gl.domElement];
    if (connected instanceof HTMLElement && connected !== gl.domElement) els.push(connected);
    for (const el of els) el.style.touchAction = 'pan-y';
    return () => { for (const el of els) el.style.touchAction = ''; };
  }, [gl, connected]);

  return (
    <OrbitControls
      ref={controls}
      domElement={gl.domElement}
      makeDefault
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.3}
      target={f.look}
      minPolarAngle={f.polar - CAMERA_ORBIT.polar}
      maxPolarAngle={f.polar + CAMERA_ORBIT.polar}
      minAzimuthAngle={f.azimuth - CAMERA_ORBIT.azimuth}
      maxAzimuthAngle={f.azimuth + CAMERA_ORBIT.azimuth}
    />
  );
}
