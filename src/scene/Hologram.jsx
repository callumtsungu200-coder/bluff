import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Holographic projection treatment for the Future theme's characters.
//
// makeHologramMaterial(opts) builds the shader: a translucent cyan surface, brighter at the rim
// (fresnel) and more see-through face on, with level scanlines drifting slowly up the figure in
// world space (so they run unbroken across every body part), a very small slow flicker, and an
// optional map used as an ink mask so a painted face (eyes, brows, mouth) still reads as darker
// lines on the glowing head. Every material shares one clock: the wrapper's frame loop calls
// updateHolograms(t), which writes uTime into each live material once per frame.
//
// <Hologram> wraps any subtree (an Avatar or AvatarAlt). In a layout effect it walks the subtree
// and swaps every opaque mesh material for a hologram variant (cached per original material, tinted
// from the original colour toward the accent, keeping its map), remembers the originals so disabling
// restores them, and turns the swapped meshes' shadows off. It adds a soft cyan point light near the
// chest, a faint projection beam rising from an emitter ring at table level, and the ring itself.
// Nothing here allocates per frame.
//
// Depth: the hologram materials never write depth. By default (occlude) each swapped mesh gets a
// depth-only twin drawn just before the holograms, so the figure hides its own far side (a cap does
// not show the head inside it, the arms do not glow through the torso). xray mode (occlude={false})
// skips the twins: more see-through, but overlapping parts add up and the figure gets mushy.
//
// Ink: a glowing surface cannot be darker than what it sits on, and the fresnel rim turns any small
// sphere into a ring. So the small, near-black parts of a figure (AvatarAlt's brows, mouth and dark
// eye wells; a pupil) are not given the glow at all: they get an ink variant, a dark, mostly opaque
// surface with normal blending and no rim, which reads as a mark drawn on the glowing figure, the
// way the painted face's ink does under the map mask. Which meshes count as ink is the `ink` prop:
// true (the default) is the size-and-darkness rule in isInkPart, false turns it off, and a function
// (mesh, material) => boolean replaces it.
//
// Brightness: each glowing part is tinted from its original colour (brightnessOf: dark cloth around
// half, pale skin around one), which is what keeps a hat darker than a face. Where two neighbouring
// parts have colours too alike for that to separate them once everything is cyan (AvatarAlt's cap
// over Orin's pale head, the hair hood over Vega's), the `bright` prop overrides the derived value
// per part: an object keyed by material name ({ cap: 1.5 }) or a (mesh, material) => number
// function (a number replaces the derived brightness, anything else keeps it). Variants are shared
// per original material, so the override resolves once per material, on the first mesh that uses it.

export const HOLO = Object.freeze({ color: '#5CE1E6', opacity: 0.55, scan: 1, gain: 1.15 });
export const HOLO_ACTIVE = Object.freeze({ color: '#5CE1E6', opacity: 0.7, scan: 1.7, gain: 1.45 });

const ACCENT = new THREE.Color(HOLO.color);
const BACKDROP = new THREE.Color('#0B0E14');
const ORDER_DEPTH = 20; // the depth twins, after the scene's ordinary transparent objects
const ORDER_HOLO = 21; // then the hologram surfaces, which depth-test against the twins
const SCAN_DENSITY = 18; // scanlines per world unit (about 10 px apart at 1440x900; 10 reads as stacked bands)
const SCAN_SPEED = 4; // lines per second
const INK_LUM = 0.14; // sRGB luminance below which a small part is ink (the avatars' ink and dark eye wells sit at 0.05 to 0.08, their dark cloth at 0.1 to 0.2)
const INK_SIZE = 0.2; // bounding radius below which a dark part is a mark rather than a body part (eyes 0.11, brows 0.08, mouths 0.1; legs and hats are 0.3 and up)
const INK_OPACITY = 0.8;
const NOOP = () => {};

/* ---------- shared clock ---------- */

const LIVE = new Set();
const CLOCK = { t: -1 };

// Writes the clock into every live hologram material. Several wrappers call it each frame; only the
// first call per frame does any work. Also re-syncs the face map, which Avatar.jsx swaps per frame
// (blinks, moods) on the original material.
export function updateHolograms(t) {
  if (t === CLOCK.t) return;
  CLOCK.t = t;
  for (const m of LIVE) {
    const u = m.uniforms;
    u.uTime.value = t;
    const src = m.userData.holoSource;
    if (src && u.map && u.map.value !== src.map) u.map.value = src.map;
  }
}

/* ---------- the surface shader ---------- */

const VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vWy;
  void main() {
    vUv = uv;
    // the same expression three's own shaders use, so the depth twins and these surfaces land on
    // identical depths (a different operation order z-fights)
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vWy = (modelMatrix * vec4(position, 1.0)).y;
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGain;
  uniform float uCore;
  uniform float uRim;
  uniform float uRimPow;
  uniform float uScanDensity;
  uniform float uScanSpeed;
  uniform float uScanAmt;
  uniform float uFlicker;
  uniform float uTime;
  #ifdef HOLO_MAP
  uniform sampler2D map;
  uniform float uInk;
  #endif
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  varying float vWy;

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float rim = pow(1.0 - ndv, uRimPow);

    // level scanlines drifting up the figure; soft-edged so they shimmer rather than crawl
    float s = 0.5 + 0.5 * sin((vWy * uScanDensity - uTime * uScanSpeed) * 6.28318);
    float line = 1.0 - uScanAmt * smoothstep(0.2, 0.9, s);

    // flicker: two slow sines at a few percent, and a soft brightness band rising through the body
    float fl = 1.0 + uFlicker * (0.6 * sin(uTime * 9.7) * sin(uTime * 2.3 + 1.7) + 0.4 * sin(vWy * 1.6 - uTime * 0.9));

    // a little form shading from above and the camera's side so hats, noses and hands keep their shape
    float form = 0.6 + 0.4 * max(dot(N, normalize(vec3(0.3, 0.75, 0.6))), 0.0);

    float mask = 1.0;
    #ifdef HOLO_MAP
      vec4 tex = texture2D(map, vUv);
      float lum = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
      // painted ink is near black: it stays dark; the lighter paint (skin, sclera) glows
      mask = mix(uInk, 1.0, smoothstep(0.02, 0.28, lum)) * (0.8 + 0.5 * smoothstep(0.3, 0.9, lum));
    #endif

    #ifdef HOLO_INK
      // ink: dark and mostly opaque (normal blending), no rim, the same scanlines and flicker
      // running through it so it still belongs to the projection
      float alpha = uOpacity * mix(0.7, 1.0, line) * fl;
      vec3 col = uColor * (0.8 + 0.4 * form);
    #else
      float alpha = uOpacity * mix(uCore, 1.0, rim * uRim) * mask * line * fl;
      vec3 col = uColor * uGain * form * (1.0 + 0.9 * rim) * mask * line * fl;
    #endif
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BLENDING = { additive: THREE.AdditiveBlending, normal: THREE.NormalBlending };

// The ink colour: the backdrop with a tenth of the tint (mixed in sRGB, where a tenth looks like a
// tenth), so a mark reads as a gap in the projection rather than a painted-on black.
const BACKDROP_SRGB = BACKDROP.clone().convertLinearToSRGB();
function inkColor(color) {
  return new THREE.Color(color).convertLinearToSRGB().lerp(BACKDROP_SRGB, 0.9).convertSRGBToLinear();
}

// A hologram surface. `map` is optional (the painted face); `bright` scales the colour per part so
// the darker parts of the original (hats, ink) stay darker than skin; `scan` scales the scanline
// drift and the flicker (0 freezes both, for reduced motion). `ink` makes the dark ink variant
// instead (normal blending, no rim, no map; `color` only tints it).
export function makeHologramMaterial({
  color = HOLO.color, map = null, opacity = HOLO.opacity, scan = HOLO.scan,
  blending = 'additive', bright = 1, gain = 1, scanDensity = SCAN_DENSITY, ink = false,
} = {}) {
  const defines = {};
  if (ink) defines.HOLO_INK = '';
  else if (map) defines.HOLO_MAP = '';
  if (ink) { blending = 'normal'; opacity = INK_OPACITY; map = null; }
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      uColor: { value: ink ? inkColor(color) : new THREE.Color(color).multiplyScalar(bright) },
      uOpacity: { value: opacity },
      uGain: { value: gain },
      uCore: { value: 0.3 },
      uRim: { value: 1 },
      uRimPow: { value: 1.8 },
      uScanDensity: { value: scanDensity },
      uScanSpeed: { value: SCAN_SPEED * scan },
      uScanAmt: { value: 0.24 },
      uFlicker: { value: 0.035 * Math.min(1, scan) },
      uTime: { value: 0 },
      map: { value: map },
      uInk: { value: 0.12 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    blending: BLENDING[blending] || THREE.AdditiveBlending,
    // like the platform's other holographic parts: no per-fragment tone mapping, so the cyan stays
    // cyan whether or not the bloom composer (which tone-maps the whole frame) is on
    toneMapped: false,
  });
  mat.name = ink ? 'HologramInk' : 'Hologram';
  mat.userData.isHologram = true;
  mat.userData.holoInk = ink;
  mat.userData.holoSource = null;
  mat.userData.holoBright = bright;
  LIVE.add(mat);
  mat.addEventListener('dispose', () => LIVE.delete(mat));
  return mat;
}

// Retune a live material: colour (tint), opacity, scan (drift and flicker), gain, scanDensity.
// An ink variant keeps its own opacity and gain; it takes the tint, the scan and the density.
export function setHologramLook(mat, { color, opacity, scan, gain, scanDensity } = {}) {
  const u = mat.uniforms;
  const ink = mat.userData.holoInk;
  if (color != null) {
    if (ink) u.uColor.value.copy(inkColor(color));
    else u.uColor.value.set(color).multiplyScalar(mat.userData.holoBright || 1);
  }
  if (opacity != null && !ink) u.uOpacity.value = opacity;
  if (gain != null && !ink) u.uGain.value = gain;
  if (scanDensity != null) u.uScanDensity.value = scanDensity;
  if (scan != null) {
    u.uScanSpeed.value = SCAN_SPEED * scan;
    u.uFlicker.value = 0.035 * Math.min(1, scan);
  }
}

/* ---------- variants of the originals ---------- */

const _c = new THREE.Color();

// The original's surface colour plus its emissive, linear, into _c.
function sourceColor(src) {
  _c.set(0, 0, 0);
  if (src.color) _c.copy(src.color);
  if (src.emissive && src.emissiveIntensity) {
    const e = src.emissive, k = src.emissiveIntensity;
    _c.r += e.r * k; _c.g += e.g * k; _c.b += e.b * k;
  }
  return _c;
}

// How bright a part should glow, from the original colour (plus any emissive): ink and dark cloth
// sit around half, light skin and the accent around one.
function brightnessOf(src) {
  const c = sourceColor(src);
  const lum = Math.min(1, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return 0.35 + 0.85 * Math.pow(lum, 0.4);
}

// Perceptual (sRGB) luminance of the original, where the painted palette's steps are even.
function srgbLuminance(src) {
  const c = sourceColor(src).convertLinearToSRGB();
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

// The default ink rule: a near-black part that is small for a figure is a mark (brow, mouth, eye
// well, pupil), not a body part. Dark cloth and hats are large and keep the glow, dimmer.
export function isInkPart(mesh, material) {
  if (!material || material.map) return false;
  if (srgbLuminance(material) >= INK_LUM) return false;
  const g = mesh.geometry;
  if (!g) return false;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const s = mesh.scale;
  const k = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
  return g.boundingSphere.radius * k < INK_SIZE;
}

function inkRule(ink) {
  if (typeof ink === 'function') return ink;
  return ink ? isInkPart : null;
}

// The brightness override as a function: a name map looks the material's name up, a function is
// used as it is, anything else means no overrides.
function brightRule(bright) {
  if (typeof bright === 'function') return bright;
  if (bright && typeof bright === 'object') return (mesh, m) => bright[m.name];
  return null;
}

// A part's brightness: the override when the rule gives a number, else derived from its colour.
function brightFor(mesh, src, rule) {
  const b = rule ? rule(mesh, src) : undefined;
  return typeof b === 'number' && Number.isFinite(b) ? b : brightnessOf(src);
}

// Only opaque materials are swapped; the avatars' glass lenses and their turn rings (transparent,
// opacity-driven) are left as they are.
function swappable(m) {
  return !!m && !m.userData.isHologram && !m.transparent;
}

function variantFor(src, look, ink, bright) {
  const mat = makeHologramMaterial({
    color: look.color, map: src.map || null, opacity: look.opacity, scan: look.scan,
    blending: look.blending, bright, gain: look.gain, scanDensity: look.scanDensity, ink,
  });
  mat.userData.holoSource = src;
  return mat;
}

/* ---------- emitter: ring, beam, light ---------- */

const RING_R = 0.42;
const ringGeometry = new THREE.RingGeometry(RING_R - 0.035, RING_R, 72);
const discGeometry = new THREE.CircleGeometry(RING_R - 0.035, 72);
const BEAM_H = 1.75;
const beamGeometry = new THREE.CylinderGeometry(0.7, RING_R - 0.02, BEAM_H, 48, 1, true);

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    // CylinderGeometry: v is 1 at the top, 0 at the bottom. Bright at the emitter, gone at the top.
    float fade = pow(1.0 - vUv.y, 1.7);
    float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    float bands = 0.85 + 0.15 * sin((vUv.y * 9.0 - uTime * 0.5) * 6.28318);
    float fl = 0.92 + 0.08 * sin(uTime * 6.1) * sin(uTime * 1.7 + 0.4);
    float a = uOpacity * fade * (0.25 + 0.75 * edge) * bands * fl;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeBeamMaterial(color, opacity) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  mat.name = 'HologramBeam';
  mat.userData.holoSource = null;
  LIVE.add(mat);
  mat.addEventListener('dispose', () => LIVE.delete(mat));
  return mat;
}

/* ---------- depth twins ---------- */

// Nudged a hair back so the surface drawn over its own twin always passes the depth test.
const depthMaterial = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: true, transparent: true,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
});
depthMaterial.name = 'HologramDepth';

function collectMeshes(o, out) {
  if (o.userData.holoExtra) return;
  if (o.isMesh && !o.userData.holoDepth) out.push(o);
  const ch = o.children;
  for (let i = 0; i < ch.length; i++) collectMeshes(ch[i], out);
}

/* ---------- swapping ---------- */

// Per wrapper: variants and inks (original material -> glow or ink hologram material; one original
// can need both when it paints a mark and a body part), records (mesh -> what was swapped and what
// to put back), and scratch collections reused between runs.
function makeState() {
  return { variants: new Map(), inks: new Map(), records: new Map(), meshes: [], seen: new Set(), used: new Set() };
}

function* allVariants(s) {
  yield* s.variants.values();
  yield* s.inks.values();
}

function restoreRecord(r) {
  if (r.mesh.material === r.applied) r.mesh.material = r.material;
  r.mesh.castShadow = r.castShadow;
  r.mesh.renderOrder = r.renderOrder;
  if (r.depth) r.mesh.remove(r.depth);
}

function restoreAll(s) {
  for (const r of s.records.values()) restoreRecord(r);
  s.records.clear();
}

function disposeAll(s) {
  restoreAll(s);
  for (const v of allVariants(s)) v.dispose();
  s.variants.clear();
  s.inks.clear();
}

function dropUnused(map, used) {
  for (const [orig, v] of map) {
    if (!used.has(v)) { map.delete(orig); v.dispose(); }
  }
}

// Bring the subtree in line: swap meshes that are new or whose material was replaced (a theme change
// gives the avatar new materials), leave meshes already swapped alone, put back meshes that left the
// tree, drop variants nothing uses any more. Cheap when nothing changed, which is most renders.
function reconcile(root, s, opts) {
  const { meshes, seen, used } = s;
  meshes.length = 0;
  seen.clear();
  used.clear();
  collectMeshes(root, meshes);
  const rule = inkRule(opts.ink);
  const brights = brightRule(opts.bright);
  const swapOne = (m, mesh) => {
    if (!swappable(m)) return m;
    const ink = !!(rule && rule(mesh, m));
    const pool = ink ? s.inks : s.variants;
    let v = pool.get(m);
    if (!v) { v = variantFor(m, opts.look, ink, ink ? 1 : brightFor(mesh, m, brights)); pool.set(m, v); }
    used.add(v);
    return v;
  };
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    seen.add(mesh);
    const r = s.records.get(mesh);
    if (r) {
      if (mesh.material === r.applied) {
        // still ours: keep its variants alive
        if (Array.isArray(r.applied)) {
          for (let k = 0; k < r.applied.length; k++) if (r.applied[k].userData.isHologram) used.add(r.applied[k]);
        } else {
          used.add(r.applied);
        }
        continue;
      }
      // something else set a new material: start over for this mesh
      restoreRecord(r);
      s.records.delete(mesh);
    }
    const orig = mesh.material;
    if (!orig) continue;
    let applied;
    if (Array.isArray(orig)) {
      applied = orig.map((m) => swapOne(m, mesh));
      if (applied.every((m, k) => m === orig[k])) continue;
    } else {
      applied = swapOne(orig, mesh);
      if (applied === orig) continue;
    }
    const rec = { mesh, material: orig, applied, castShadow: mesh.castShadow, renderOrder: mesh.renderOrder, depth: null };
    mesh.material = applied;
    mesh.castShadow = false;
    mesh.renderOrder = ORDER_HOLO;
    if (opts.occlude) {
      const d = new THREE.Mesh(mesh.geometry, depthMaterial);
      d.renderOrder = ORDER_DEPTH;
      d.frustumCulled = mesh.frustumCulled;
      d.userData.holoDepth = true;
      d.raycast = NOOP;
      mesh.add(d);
      rec.depth = d;
    }
    s.records.set(mesh, rec);
  }
  for (const [mesh, r] of s.records) {
    if (!seen.has(mesh)) { restoreRecord(r); s.records.delete(mesh); }
  }
  dropUnused(s.variants, used);
  dropUnused(s.inks, used);
}

/* ---------- the wrapper ---------- */

// Props:
//   enabled   swap on (true) or render the children untouched (false)
//   color     tint, default the accent
//   intensity multiplies the opacity (1 = HOLO.opacity)
//   active    the brighter, faster preset (HOLO_ACTIVE)
//   still     freezes the scan drift and the flicker (reduced motion)
//   blending  'additive' (default) or 'normal'
//   occlude   depth twins so the figure hides its own far side (default true); false is xray
//   ink       which meshes are drawn as dark ink marks instead of glow: true (default) is the
//             small-and-near-black rule (isInkPart), false none, or a stable (mesh, material) => boolean
//   bright    per-part brightness overrides for parts the glow would otherwise merge with their
//             neighbours: a stable object keyed by material name ({ cap: 1.5, hair: 1.4 }) or a
//             stable (mesh, material) => number; the derived scale runs about 0.5 (dark cloth) to
//             1.2 (pale skin). Default none. A new value rebuilds the variants.
//   position, yaw  where the figure stands (what the avatar got); if omitted, read from the first
//             child object (the avatar's root group)
//   ring, beam, light  the emitter pieces (all default true); ringY is the ring's height above the
//             feet (default 0.72, table level: a ring at the feet hides behind the far rim)
export function Hologram({
  children, enabled = true, color = HOLO.color, intensity = 1, active = false, still = false,
  blending = 'additive', occlude = true, scanDensity = SCAN_DENSITY, ink = true, bright = null,
  position = null, yaw = null, ring = true, beam = true, light = true, ringY = 0.72,
}) {
  const group = useRef();
  const extras = useRef();
  const ringRef = useRef();
  const st = useRef(null);
  if (!st.current) st.current = makeState();

  const preset = active ? HOLO_ACTIVE : HOLO;
  const look = useMemo(() => ({
    color, blending, scanDensity,
    opacity: preset.opacity * intensity,
    scan: still ? 0 : preset.scan,
    gain: preset.gain || 1,
  }), [color, blending, scanDensity, preset, intensity, still]);
  const lookRef = useRef(look);
  lookRef.current = look;

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  }), []);
  const discMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  }), []);
  const beamMat = useMemo(() => makeBeamMaterial(ACCENT, 0.05), []);
  // StrictMode mounts twice: dispose on the way out, put the beam back on the clock on the way in.
  useEffect(() => {
    LIVE.add(beamMat);
    return () => { ringMat.dispose(); discMat.dispose(); beamMat.dispose(); };
  }, [ringMat, discMat, beamMat]);

  // After every render, bring the subtree in line (a no-op when nothing changed).
  useLayoutEffect(() => {
    const g = group.current;
    if (!g || !enabled) return;
    reconcile(g, st.current, { occlude, ink, bright, look: lookRef.current });
    const ex = extras.current;
    if (ex) {
      const first = g.children.find((o) => !o.userData.holoExtra);
      if (position) ex.position.set(position[0], position[1], position[2]);
      else if (first) ex.position.copy(first.position);
      ex.rotation.y = yaw != null ? yaw : first ? first.rotation.y : 0;
    }
  });

  // A mode change puts everything back first (the next reconcile swaps afresh); so does unmount.
  useLayoutEffect(() => {
    const s = st.current;
    return () => { if (enabled) restoreAll(s); };
  }, [enabled, occlude, blending, scanDensity, ink]);
  // A brightness rule change also drops the variants, since each bakes its part's brightness in.
  useLayoutEffect(() => {
    const s = st.current;
    return () => disposeAll(s);
  }, [bright]);
  useEffect(() => {
    const s = st.current;
    return () => disposeAll(s);
  }, []);

  // Look changes (active, colour, intensity, still) retune the live variants in place.
  useEffect(() => {
    for (const v of allVariants(st.current)) setHologramLook(v, look);
    beamMat.uniforms.uOpacity.value = active ? 0.075 : 0.05;
  }, [look, active, beamMat]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    updateHolograms(t);
    const r = ringRef.current;
    if (r) {
      const pulse = still ? 0 : Math.sin(t * (active ? 2.6 : 1.1)) * 0.05;
      r.material.opacity = (active ? 0.42 : 0.24) + pulse;
    }
  });

  if (!enabled) return <group ref={group}>{children}</group>;
  return (
    <group ref={group}>
      {children}
      <group ref={extras} userData={{ holoExtra: true }}>
        {light && <pointLight position={[0, 1.5, 0.3]} color={color} intensity={active ? 2.2 : 1} distance={2.8} decay={2} />}
        {ring && (
          <group position={[0, ringY, 0]}>
            <mesh ref={ringRef} geometry={ringGeometry} material={ringMat} rotation-x={-Math.PI / 2} position-y={0.003} />
            <mesh geometry={discGeometry} material={discMat} rotation-x={-Math.PI / 2} />
          </group>
        )}
        {beam && <mesh geometry={beamGeometry} material={beamMat} position={[0, ringY + BEAM_H / 2, 0]} />}
      </group>
    </group>
  );
}

export default Hologram;
