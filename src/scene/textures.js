// Canvas-drawn textures for cards, the table marker, the seat panels and avatar faces.
// Everything is cached per theme so meshes can share materials.

import * as THREE from 'three';
import { RANKS, rankName } from '../game.js';

export const CARD_W = 0.64;
export const CARD_H = 0.9;
export const CARD_D = 0.012; // thickness of the card box (Card.jsx)
const PX = 512; // texture width; height follows the card ratio
const PY = Math.round(PX * (CARD_H / CARD_W));

export const THEME = {
  classic: {
    face: '#fbf8f0', faceEdge: '#d8d0bc', edge: '#e4dcc8', black: '#1c1c1c', red: '#c0392b',
    back: '#8c2f2f', back2: '#5a1c1c', backInk: 'rgba(255,255,255,0.55)',
    felt: '#1f6b47', feltDark: '#123f2b', wood: '#4a3120', floor: '#141010',
    accent: '#d9b45a', ink: '#f4ecdc', fog: '#120e0b', light: '#ffe6c4',
    skin: ['#8d7bd9', '#e07a3f', '#3fb8a8'],
    shirt: ['#5d4bb0', '#b85a26', '#2a8a7d'],
    pants: ['#2f2a4a', '#3e2a1e', '#1f3a38'],
    font: '"Inter", "Segoe UI", system-ui, sans-serif',
    // display face (the key is historical, Classic no longer uses a serif)
    serif: '"Outfit", "Inter", "Segoe UI", system-ui, sans-serif',
  },
  future: {
    // card faces are dark glass: face toward faceDark, with a hairline of light at the rim
    face: '#121722', faceDark: '#0b0e14', faceEdge: 'rgba(230,234,242,0.14)', edge: '#1b2333',
    black: '#e6eaf2', red: '#ff4d5e',
    back: '#0f141e', back2: '#0b0e14', backInk: 'rgba(92,225,230,0.5)',
    felt: '#141a26', feltDark: '#0b0e14', wood: '#1a2030', floor: '#07090d',
    accent: '#5ce1e6', ink: '#e6eaf2', fog: '#0b0e14', light: '#cfe9ff',
    skin: ['#9aa3b5', '#e6eaf2', '#5ce1e6'],
    shirt: ['#2b3447', '#3a4257', '#1f3a3c'],
    pants: ['#141a26', '#1a2030', '#101820'],
    font: '"Sora", "Inter", system-ui, sans-serif',
    serif: '"Space Mono", monospace',
  },
};

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Frees the GPU copies of one theme's card faces, backs, rank markers and avatar faces (the keys
// carry the theme after the first colon). The materials keep their references, so a texture that is
// needed again (the look is switched back) is simply uploaded again from its canvas. Scene calls
// this for the look that was just left.
export function disposeThemeTextures(themeId) {
  for (const [key, t] of cache) {
    const parts = key.split(':');
    if (parts[1] === themeId && t && typeof t.dispose === 'function') { t.dispose(); cache.delete(key); }
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgbOf(hex) {
  const c = new THREE.Color(hex);
  return `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
}

const RED = new Set(['♥', '♦']);
const CORNER_R = PX * 0.07;

// Pip layouts for number cards (fractions of the inner area).
const PIPS = {
  2: [[0.5, 0.2], [0.5, 0.8, 1]],
  3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8, 1]],
  4: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  5: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.5], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  6: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  7: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  8: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65, 1], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  9: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.4], [0.7, 0.4], [0.5, 0.5], [0.3, 0.6, 1], [0.7, 0.6, 1], [0.3, 0.8, 1], [0.7, 0.8, 1]],
  10: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.3], [0.3, 0.4], [0.7, 0.4], [0.3, 0.6, 1], [0.7, 0.6, 1], [0.5, 0.7, 1], [0.3, 0.8, 1], [0.7, 0.8, 1]],
};

/* ---------- card faces ---------- */

// Classic: cream stock, bold corner indices, the traditional pip layouts.
function classicFace(ctx, card, T) {
  roundRect(ctx, 0, 0, PX, PY, CORNER_R);
  ctx.fillStyle = T.face;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = T.faceEdge;
  ctx.stroke();

  const color = RED.has(card.suit) ? T.red : T.black;
  const rank = RANKS[card.rank];
  ctx.fillStyle = color;

  // corner indices
  const drawCorner = (flip) => {
    ctx.save();
    if (flip) { ctx.translate(PX, PY); ctx.rotate(Math.PI); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${PX * 0.17}px ${T.font}`;
    ctx.fillText(rank, PX * 0.13, PY * 0.14);
    ctx.font = `${PX * 0.15}px ${T.font}`;
    ctx.fillText(card.suit, PX * 0.13, PY * 0.235);
    ctx.restore();
  };
  drawCorner(false);
  drawCorner(true);

  const n = card.rank + 1; // 1..13
  const inner = { x: PX * 0.24, y: PY * 0.14, w: PX * 0.52, h: PY * 0.72 };
  if (n >= 2 && n <= 10) {
    ctx.font = `${PX * 0.19}px ${T.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [fx, fy, flipped] of PIPS[n]) {
      ctx.save();
      ctx.translate(inner.x + fx * inner.w, inner.y + fy * inner.h);
      if (flipped) ctx.rotate(Math.PI);
      ctx.fillText(card.suit, 0, 0);
      ctx.restore();
    }
  } else {
    // Ace and court cards: one big centre mark with a thin frame
    ctx.save();
    roundRect(ctx, inner.x, inner.y + inner.h * 0.12, inner.w, inner.h * 0.76, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = n === 1 ? 'transparent' : color;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (n === 1) {
      ctx.font = `${PX * 0.5}px ${T.font}`;
      ctx.fillText(card.suit, PX / 2, PY / 2 + PX * 0.02);
    } else {
      ctx.font = `600 ${PX * 0.42}px ${T.serif}`;
      ctx.fillText(rank, PX / 2, PY / 2 - PX * 0.02);
      ctx.font = `${PX * 0.16}px ${T.font}`;
      ctx.fillText(card.suit, PX / 2, PY / 2 + PX * 0.3);
    }
  }
}

// Future: dark glass. A gradient from face to faceDark with a soft diagonal sheen and a hairline of
// light at the rim; thin monospace indices in the corners and one quiet mark in the centre.
function futureFace(ctx, card, T) {
  roundRect(ctx, 0, 0, PX, PY, CORNER_R);
  const base = ctx.createLinearGradient(0, 0, PX, PY);
  base.addColorStop(0, T.face);
  base.addColorStop(1, T.faceDark);
  ctx.fillStyle = base;
  ctx.fill();

  ctx.save();
  ctx.clip();
  // sheen: a soft band of light falling across the upper left
  const sheen = ctx.createLinearGradient(0, 0, PX * 0.85, PY * 0.85);
  sheen.addColorStop(0, 'rgba(230,234,242,0.075)');
  sheen.addColorStop(0.4, 'rgba(230,234,242,0)');
  sheen.addColorStop(0.68, 'rgba(230,234,242,0.025)');
  sheen.addColorStop(1, 'rgba(230,234,242,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, PX, PY);
  ctx.restore();

  // rim: a hairline of light just inside the edge, and a fainter cyan line further in
  ctx.lineWidth = 3;
  ctx.strokeStyle = T.faceEdge;
  roundRect(ctx, 1.5, 1.5, PX - 3, PY - 3, CORNER_R - 1.5);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${rgbOf(T.accent)},0.10)`;
  roundRect(ctx, 16, 16, PX - 32, PY - 32, CORNER_R * 0.7);
  ctx.stroke();

  const color = RED.has(card.suit) ? T.red : T.black;
  const rank = RANKS[card.rank];
  ctx.fillStyle = color;

  // corner indices: thin monospace rank over the suit
  const drawCorner = (flip) => {
    ctx.save();
    if (flip) { ctx.translate(PX, PY); ctx.rotate(Math.PI); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 ${PX * 0.165}px ${T.serif}`;
    ctx.fillText(rank, PX * 0.135, PY * 0.14);
    ctx.font = `${PX * 0.125}px ${T.font}`;
    ctx.fillText(card.suit, PX * 0.135, PY * 0.232);
    ctx.restore();
  };
  drawCorner(false);
  drawCorner(true);

  // centre mark: the suit for number cards, bigger for the ace, a thin letter for the court
  const n = card.rank + 1; // 1..13
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.88;
  if (n === 1) {
    ctx.font = `${PX * 0.4}px ${T.font}`;
    ctx.fillText(card.suit, PX / 2, PY / 2 + PX * 0.015);
  } else if (n <= 10) {
    ctx.font = `${PX * 0.26}px ${T.font}`;
    ctx.fillText(card.suit, PX / 2, PY / 2 + PX * 0.01);
  } else {
    ctx.font = `400 ${PX * 0.4}px ${T.serif}`;
    ctx.fillText(rank, PX / 2, PY / 2 - PX * 0.03);
    ctx.font = `${PX * 0.13}px ${T.font}`;
    ctx.fillText(card.suit, PX / 2, PY / 2 + PX * 0.25);
  }
  ctx.globalAlpha = 1;
}

export function faceTexture(card, themeId) {
  return cached(`face:${themeId}:${card.id}`, () => {
    const T = THEME[themeId];
    const c = canvas(PX, PY);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, PX, PY);
    if (themeId === 'future') futureFace(ctx, card, T);
    else classicFace(ctx, card, T);
    return finish(c);
  });
}

export function backTexture(themeId) {
  return cached(`back:${themeId}`, () => {
    const T = THEME[themeId];
    const c = canvas(PX, PY);
    const ctx = c.getContext('2d');
    roundRect(ctx, 0, 0, PX, PY, CORNER_R);
    const g = ctx.createLinearGradient(0, 0, PX, PY);
    g.addColorStop(0, T.back);
    g.addColorStop(1, T.back2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = themeId === 'future' ? 'rgba(230,234,242,0.10)' : 'rgba(0,0,0,0.5)';
    ctx.stroke();

    // inner frame
    const m = PX * 0.07;
    roundRect(ctx, m, m, PX - 2 * m, PY - 2 * m, CORNER_R * 0.6);
    ctx.lineWidth = themeId === 'future' ? 2 : 4;
    ctx.strokeStyle = themeId === 'future' ? `rgba(${rgbOf(T.accent)},0.28)` : T.backInk;
    ctx.stroke();

    ctx.save();
    ctx.clip();
    if (themeId === 'future') {
      // a quiet cyan grid, and a small ring at the centre
      const cyan = rgbOf(T.accent);
      ctx.strokeStyle = `rgba(${cyan},0.09)`;
      ctx.lineWidth = 2;
      const step = 24;
      const x0 = PX / 2 - Math.floor((PX / 2 - m) / step) * step;
      const y0 = PY / 2 - Math.floor((PY / 2 - m) / step) * step;
      for (let x = x0; x < PX - m; x += step) { ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, PY - m); ctx.stroke(); }
      for (let y = y0; y < PY - m; y += step) { ctx.beginPath(); ctx.moveTo(m, y); ctx.lineTo(PX - m, y); ctx.stroke(); }
      ctx.strokeStyle = `rgba(${cyan},0.5)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(PX / 2, PY / 2, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(${cyan},0.9)`;
      ctx.beginPath(); ctx.arc(PX / 2, PY / 2, 7, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 3;
      const step = 34;
      for (let d = -PY; d < PX + PY; d += step) {
        ctx.beginPath(); ctx.moveTo(d, m); ctx.lineTo(d + PY, PY - m); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(d, PY - m); ctx.lineTo(d + PY, m); ctx.stroke();
      }
      ctx.fillStyle = T.back2;
      ctx.beginPath(); ctx.ellipse(PX / 2, PY / 2, PX * 0.18, PX * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = T.backInk;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = T.backInk;
      ctx.font = `${PX * 0.22}px ${T.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♠', PX / 2, PY / 2 + 6);
    }
    ctx.restore();
    return finish(c);
  });
}

/* ---------- the hand's helpers (Hand.jsx) ---------- */

// Soft halo behind a selected card: a rounded rectangle the size of the card, feathered well past
// its edge. Drawn for a plane GLOW_SPAN times the card, so the card hides the solid middle and only
// the feathered outer band shows. shadowBlur does the feathering (canvas filters are not everywhere).
export const GLOW_SPAN = { x: 1.7, y: 1.5 };
export function cardGlowTexture(accent) {
  return cached(`glow:${accent}`, () => {
    const W = 256, H = Math.round(W * (CARD_H * GLOW_SPAN.y) / (CARD_W * GLOW_SPAN.x));
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const w = W / GLOW_SPAN.x, h = H / GLOW_SPAN.y;
    const x = (W - w) / 2, y = (H - h) / 2;
    const OFF = 1000; // the shape itself is drawn off-canvas; only its shadow lands on it
    ctx.shadowColor = accent;
    ctx.shadowOffsetX = OFF;
    ctx.fillStyle = accent;
    for (const blur of [40, 22]) {
      ctx.shadowBlur = blur;
      roundRect(ctx, x - OFF, y, w, h, w * 0.08);
      ctx.fill();
    }
    const t = finish(c);
    t.anisotropy = 1;
    return t;
  });
}

// A small rounded tab that marks cards of the rank in play.
export function tabTexture(accent) {
  return cached(`tab:${accent}`, () => {
    const c = canvas(96, 32);
    const ctx = c.getContext('2d');
    roundRect(ctx, 2, 2, 92, 28, 12);
    ctx.fillStyle = accent;
    ctx.fill();
    return finish(c);
  });
}

// Soft dark ellipse that darkens the felt where the hand hovers over the table.
export function handShadowTexture() {
  return cached('handshadow', () => {
    const c = canvas(256, 128);
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.26)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.restore();
    const t = finish(c);
    t.anisotropy = 1;
    return t;
  });
}

// Flat label painted on the felt: "RANK IN PLAY / A / Aces / then Twos"
export function rankTexture(rankIndex, themeId) {
  return cached(`rank:${themeId}:${rankIndex}`, () => {
    const T = THEME[themeId];
    const W = 512, H = 512;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // eyebrow: small caps, tracked out (the extra x offset re-centres the tracked run)
    const track = 5;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `700 30px ${T.font}`;
    ctx.letterSpacing = `${track}px`;
    ctx.fillText('RANK IN PLAY', W / 2 + track / 2, 64);
    ctx.letterSpacing = '0px';

    // the big rank: bold and tight, measured so it fills the band between the labels
    const label = RANKS[rankIndex];
    const band = { top: 88, bottom: 400 };
    const setRank = (px) => {
      ctx.font = `700 ${px}px ${T.serif}`;
      ctx.letterSpacing = label.length > 1 ? `${-px * 0.05}px` : '0px';
      return ctx.measureText(label);
    };
    let m = setRank(320);
    const fit = Math.min(1.2, (band.bottom - band.top) / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent), (W - 56) / m.width);
    m = setRank(Math.floor(320 * fit));
    ctx.fillStyle = T.ink;
    const mid = (band.top + band.bottom) / 2;
    ctx.fillText(label, W / 2, mid + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    ctx.letterSpacing = '0px';

    // name, then what comes next
    ctx.fillStyle = T.accent;
    ctx.font = `700 50px ${T.font}`;
    ctx.letterSpacing = '-1px';
    ctx.fillText(rankName(rankIndex), W / 2, 446);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `500 30px ${T.font}`;
    ctx.fillText(`then ${rankName((rankIndex + 1) % 13)}`, W / 2, 492);
    return finish(c);
  });
}

// A simple friendly face for the blocky avatars.
export function faceSkin(mood, themeId, skin) {
  return cached(`avatar:${themeId}:${mood}:${skin}`, () => {
    const W = 256, H = 256;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, W, H);
    // a little shading so the face reads as a surface
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const ink = themeId === 'future' ? '#0b0e14' : '#1a1410';
    ctx.fillStyle = ink;
    // eyes
    const ey = 118;
    const eh = mood === 'think' ? 10 : 26;
    roundRect(ctx, 76, ey - eh / 2, 20, eh, 8); ctx.fill();
    roundRect(ctx, 160, ey - eh / 2, 20, eh, 8); ctx.fill();
    // mouth
    ctx.lineWidth = 8;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'grin') ctx.arc(128, 150, 30, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (mood === 'think') { ctx.moveTo(110, 172); ctx.lineTo(146, 168); }
    else ctx.arc(128, 158, 22, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    return finish(c);
  });
}

/* ---------- futuristic platform ---------- */

const CYAN = '92,225,230';

// Grid for the void under the platform: one line per world unit over GRID_SIZE units, brighter every
// fourth line, fading out toward the edges so it never shows a hard border.
export const GRID_SIZE = 48;
export function gridTexture() {
  return cached('grid', () => {
    const S = 2048;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const px = S / GRID_SIZE;
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'butt';
    for (let i = 0; i <= GRID_SIZE; i++) {
      const major = i % 4 === 0;
      ctx.strokeStyle = `rgba(${CYAN},${major ? 0.42 : 0.22})`;
      ctx.lineWidth = major ? 3 : 2;
      const p = Math.round(i * px) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
    }
    // radial fade, strongest near the platform and gone before the edge
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.46);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.3, 'rgba(0,0,0,0.6)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const t = finish(c);
    t.anisotropy = 16;
    return t;
  });
}

// Soft elliptical halo that sits under the platform rim so the edge reads as lit even without bloom.
// Drawn for a 2x2 plane whose rim is at radius HALO_RIM of the half size.
export const HALO_RIM = 0.8;
export function haloTexture() {
  return cached('halo', () => {
    const S = 512;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, `rgba(${CYAN},0)`);
    g.addColorStop(HALO_RIM - 0.1, `rgba(${CYAN},0)`);
    g.addColorStop(HALO_RIM, `rgba(${CYAN},0.9)`);
    g.addColorStop(HALO_RIM + 0.08, `rgba(${CYAN},0.25)`);
    g.addColorStop(1, `rgba(${CYAN},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return finish(c);
  });
}

// Frame for the rank hologram: a thin rounded border, corner ticks, faint scanlines.
export function holoFrameTexture() {
  return cached('holoframe', () => {
    const S = 512;
    const c = canvas(S, S);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    // panel fill
    roundRect(ctx, 10, 10, S - 20, S - 20, 18);
    ctx.fillStyle = `rgba(${CYAN},0.06)`;
    ctx.fill();
    // scanlines
    ctx.save();
    ctx.clip();
    ctx.fillStyle = `rgba(${CYAN},0.05)`;
    for (let y = 14; y < S - 10; y += 6) ctx.fillRect(10, y, S - 20, 1);
    ctx.restore();
    // border
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${CYAN},0.35)`;
    roundRect(ctx, 10, 10, S - 20, S - 20, 18);
    ctx.stroke();
    // corner ticks
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(${CYAN},0.8)`;
    const L = 34;
    const corners = [[10, 10, 1, 1], [S - 10, 10, -1, 1], [10, S - 10, 1, -1], [S - 10, S - 10, -1, -1]];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
    }
    return finish(c);
  });
}

/* ---------- holographic seat panels (OpponentSeat.jsx, Future) ---------- */

// One panel per bot: dark glass with a hairline cyan frame, a round well at the left where the 3D
// personality mark floats, the name in Sora, the personality tag and the card count in Space Mono.
// The panel changes with the count, so each seat owns a canvas and redraws it in place (draw());
// the frame glow that lights up on the active seat is one shared texture layered over it.
// Two layouts (layout.js panelSizeFor): the wide panel has the count at the right of the name; the
// compact one (narrow, portrait stages) stacks the count under the name so it can be drawn large.
export const PANEL_PX = { w: 482, h: 208 };
export const PANEL_WELL = { x: 60, y: 104, r: 40 }; // where the mark floats, in panel pixels
export const PANEL_PX_COMPACT = { w: 320, h: 300 };
export const PANEL_WELL_COMPACT = { x: 54, y: 58, r: 34 };
export const panelPixels = (compact) => (compact ? { px: PANEL_PX_COMPACT, well: PANEL_WELL_COMPACT } : { px: PANEL_PX, well: PANEL_WELL });

function panelFrame(ctx, inset, r, px = PANEL_PX) {
  roundRect(ctx, inset, inset, px.w - inset * 2, px.h - inset * 2, r);
}

export function makePanelTexture(compact = false) {
  const { px, well } = panelPixels(compact);
  const { w, h } = px;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const texture = finish(c);
  texture.anisotropy = 4;
  const T = THEME.future;
  let last = '';
  const draw = ({ name, tag, count, low }) => {
    const key = `${name}|${tag}|${count}|${low ? 1 : 0}`;
    if (key === last) return;
    last = key;
    ctx.clearRect(0, 0, w, h);
    // glass
    panelFrame(ctx, 1.5, 16, px);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(22,28,42,0.88)');
    g.addColorStop(1, 'rgba(18,23,34,0.82)');
    ctx.fillStyle = g;
    ctx.fill();
    // a sheen along the top edge
    ctx.save();
    ctx.clip();
    const sheen = ctx.createLinearGradient(0, 0, 0, 44);
    sheen.addColorStop(0, 'rgba(230,234,242,0.07)');
    sheen.addColorStop(1, 'rgba(230,234,242,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, 44);
    ctx.restore();
    // hairline frame
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${CYAN},0.34)`;
    panelFrame(ctx, 1.5, 16, px);
    ctx.stroke();
    // the well the mark floats in
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${CYAN},0.16)`;
    ctx.beginPath(); ctx.arc(well.x, well.y, well.r, 0, Math.PI * 2); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    if (compact) {
      // name and tag beside the well, a hairline, then the count large beneath
      ctx.textAlign = 'left';
      ctx.fillStyle = T.ink;
      ctx.font = `600 40px ${T.font}`;
      ctx.fillText(name, 100, 70);
      ctx.fillStyle = '#7a8499';
      ctx.font = `400 20px ${T.serif}`;
      ctx.letterSpacing = '3px';
      ctx.fillText(String(tag).toUpperCase(), 101, 104);
      ctx.letterSpacing = '0px';
      ctx.strokeStyle = `rgba(${CYAN},0.14)`;
      ctx.beginPath(); ctx.moveTo(24, 128); ctx.lineTo(w - 24, 128); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = low ? T.accent : T.ink;
      ctx.font = `400 150px ${T.serif}`;
      ctx.fillText(String(count), w / 2, 262);
    } else {
      // name and tag
      ctx.textAlign = 'left';
      ctx.fillStyle = T.ink;
      ctx.font = `600 54px ${T.font}`;
      ctx.fillText(name, 112, 96);
      ctx.fillStyle = '#7a8499';
      ctx.font = `400 28px ${T.serif}`;
      ctx.letterSpacing = '4px';
      ctx.fillText(String(tag).toUpperCase(), 114, 148);
      ctx.letterSpacing = '0px';
      // count
      ctx.textAlign = 'right';
      ctx.fillStyle = low ? T.accent : T.ink;
      ctx.font = `400 116px ${T.serif}`;
      ctx.fillText(String(count), w - 28, 146);
    }
    texture.needsUpdate = true;
  };
  const dispose = () => texture.dispose();
  return { texture, draw, dispose };
}

// The frame alone, bright, with a soft glow and corner ticks: layered over the panel (additive) and
// faded in on the active seat.
export function panelGlowTexture(compact = false) {
  return cached(compact ? 'panelglow-compact' : 'panelglow', () => {
    const { px } = panelPixels(compact);
    const { w, h } = px;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = `rgba(${CYAN},0.9)`;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(${CYAN},0.9)`;
    panelFrame(ctx, 2, 16, px);
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(${CYAN},1)`;
    const L = 26;
    const corners = [[3, 3, 1, 1], [w - 3, 3, -1, 1], [3, h - 3, 1, -1], [w - 3, h - 3, -1, -1]];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
    }
    return finish(c);
  });
}
