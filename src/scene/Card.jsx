import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, THEME, faceTexture, backTexture } from './textures.js';

// A card is one thin box with three material slots: the four thin edges in a plain stock colour
// (cream for Classic, dark glass for Future), the face on +z and the back on -z. Everything is
// shared: one geometry for every card in the scene, one material per theme and card id, one edge
// material per theme, and one 3-slot material array per (theme, card, glow) so meshes can swap
// arrays by reference. Three slots rather than the box's six keep a card at three draw calls (and
// three more in the shadow pass) instead of six: with fifty cards on the table that is the
// difference between about 300 and 600 calls a frame.

// Merges a box geometry's six face groups (+x, -x, +y, -y, +z, -z, in that order and contiguous)
// into three: the four sides as slot 0, +z as slot 1, -z as slot 2.
export function threeSided(geometry) {
  const g = geometry.groups.map((x) => ({ ...x }));
  if (g.length !== 6) return geometry;
  geometry.clearGroups();
  geometry.addGroup(g[0].start, g[0].count + g[1].count + g[2].count + g[3].count, 0);
  geometry.addGroup(g[4].start, g[4].count, 1);
  geometry.addGroup(g[5].start, g[5].count, 2);
  return geometry;
}

export const CARD_GEOMETRY = threeSided(new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D));

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Face textures have rounded corners cut out; alphaTest keeps them opaque (no sorting) and still
// clips the corners.
const SURFACE = {
  classic: { roughness: 0.6, metalness: 0.02 },
  future: { roughness: 0.42, metalness: 0.08 },
};

export function faceMaterial(card, theme) {
  return cached(`face:${theme}:${card.id}`, () => new THREE.MeshStandardMaterial({
    map: faceTexture(card, theme), alphaTest: 0.5, ...SURFACE[theme],
  }));
}

// Future backs are dark glass over a dark platform and the void, so they carry a faint self-light
// (the back's own cyan grid and ring) to stay readable; well under the bloom threshold.
export function backMaterial(theme) {
  return cached(`back:${theme}`, () => {
    const map = backTexture(theme);
    const lift = theme === 'future' ? { emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4 } : {};
    return new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, ...SURFACE[theme], ...lift });
  });
}

// The thin edge of the stock.
export function edgeMaterial(theme) {
  return cached(`edge:${theme}`, () => (theme === 'future'
    ? new THREE.MeshStandardMaterial({ color: THEME.future.edge, roughness: 0.2, metalness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: THEME.classic.edge, roughness: 0.7, metalness: 0 })));
}

// The edge of a selected card: self-lit in the theme accent. Over 1 in Future so the bloom catches
// the rim; Classic has no bloom, so it is simply a bright gold line.
export function glowEdgeMaterial(theme) {
  return cached(`edgeglow:${theme}`, () => {
    const color = new THREE.Color(THEME[theme].accent);
    if (theme === 'future') color.multiplyScalar(1.7);
    return new THREE.MeshBasicMaterial({ color, toneMapped: false });
  });
}

// CARD_GEOMETRY slots: the edges, +z (face), -z (back).
export function cardMaterials(card, theme, glow = false) {
  return cached(`set:${theme}:${card ? card.id : 'back'}:${glow ? 1 : 0}`, () => {
    const edge = glow ? glowEdgeMaterial(theme) : edgeMaterial(theme);
    const face = card ? faceMaterial(card, theme) : backMaterial(theme);
    return [edge, face, backMaterial(theme)];
  });
}

// Builds a plain THREE.Mesh for a card (used for imperative flights). Same box, same materials.
export function makeCardObject(card, theme) {
  const m = new THREE.Mesh(CARD_GEOMETRY, cardMaterials(card, theme));
  m.castShadow = true;
  return m;
}

// Declarative card. `card` null shows the back on both sides; `glow` swaps in the lit edge.
export default function Card3D({ card = null, theme, glow = false, ...props }) {
  return <mesh geometry={CARD_GEOMETRY} material={cardMaterials(card, theme, glow)} castShadow receiveShadow {...props} />;
}
