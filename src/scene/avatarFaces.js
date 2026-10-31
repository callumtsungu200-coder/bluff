// Canvas-painted faces for the blocky avatars. One texture per
// (theme, mood, skin, eyes) combination, cached so bots share them.
// eyes: 'open' (normal), 'wide' (alert, used while the bot is active), 'closed' (blink).

import * as THREE from 'three';
import { THEME } from './textures.js';

// Painted in a 256 unit space, rasterised at 512 so the eyes stay crisp on dense screens.
const U = 256;
const S = 512;
const cache = new Map();

// Where the face paint lands on the rounded head: features stay inside the
// flat middle of the front face (roughly 12% to 88% of the texture).
// Avatar.jsx places the glasses on these rows, so keep them in sync.
export const FACE = { eyeY: 112, eyeX: [84, 172], mouthY: 164 };

function palette(themeId) {
  const T = THEME[themeId] || THEME.classic;
  if (themeId === 'future') {
    return {
      ink: '#0b0e14', sclera: '#eef5ff', iris: T.accent, pupil: '#0b0e14',
      blush: 'rgba(92,225,230,0.16)', teeth: '#eef5ff', lid: 'rgba(0,0,0,0.18)',
    };
  }
  return {
    ink: '#1a1410', sclera: '#fff8ee', iris: '#3a2418', pupil: '#120c08',
    blush: 'rgba(255,96,110,0.22)', teeth: '#fff8ee', lid: 'rgba(0,0,0,0.14)',
  };
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

function stroke(ctx, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function brows(ctx, mood, wide, ink) {
  const y = (wide ? 70 : 76);
  const [l, r] = FACE.eyeX;
  ctx.beginPath();
  if (mood === 'think') {
    // one brow flat and low, the other raised: quizzical
    ctx.moveTo(l - 22, y + 8); ctx.lineTo(l + 20, y + 5);
    ctx.moveTo(r - 20, y - 4); ctx.quadraticCurveTo(r, y - 20, r + 22, y - 10);
  } else if (mood === 'grin') {
    // inner ends dipped: mischief
    ctx.moveTo(l - 22, y - 4); ctx.lineTo(l + 20, y + 8);
    ctx.moveTo(r - 20, y + 8); ctx.lineTo(r + 22, y - 4);
  } else {
    ctx.moveTo(l - 22, y + 4); ctx.quadraticCurveTo(l, y - 9, l + 20, y + 1);
    ctx.moveTo(r - 20, y + 1); ctx.quadraticCurveTo(r, y - 9, r + 22, y + 4);
  }
  stroke(ctx, ink, 9);
}

function eye(ctx, x, mood, eyes, P, skin) {
  const wide = eyes === 'wide';
  const rx = wide ? 24 : 22;
  const ry = wide ? 28 : 25;
  const y = FACE.eyeY;

  if (eyes === 'closed') {
    ctx.beginPath();
    if (mood === 'grin') ctx.arc(x, y + 11, 18, 1.15 * Math.PI, 1.85 * Math.PI); // happy arc
    else ctx.arc(x, y - 9, 18, 0.15 * Math.PI, 0.85 * Math.PI); // relaxed lid
    stroke(ctx, P.ink, 6);
    return;
  }

  // sclera
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = P.sclera;
  ctx.fill();

  // iris + pupil, looking up and away while thinking
  const look = mood === 'think' ? [x > U / 2 ? 7 : 6, -7] : [0, wide ? -1 : 1];
  ellipse(ctx, x + look[0], y + look[1], wide ? 13 : 13.5, wide ? 14 : 14.5);
  ctx.fillStyle = P.iris;
  ctx.fill();
  ellipse(ctx, x + look[0], y + look[1] + 0.5, wide ? 8 : 8.5, wide ? 9 : 9.5);
  ctx.fillStyle = P.pupil;
  ctx.fill();
  // highlights
  ctx.fillStyle = '#ffffff';
  ellipse(ctx, x + look[0] - 5, y + look[1] - 6, 4.5, 4.5); ctx.fill();
  ellipse(ctx, x + look[0] + 5, y + look[1] + 5, 2.2, 2.2); ctx.fill();

  // lids: half-closed for think, happy squint for grin
  ctx.save();
  ellipse(ctx, x, y, rx + 0.5, ry + 0.5);
  ctx.clip();
  if (mood === 'think') {
    const h = wide ? 0.5 : 0.85; // fraction of ry hidden from the top
    const lid = y - ry + ry * h;
    ctx.fillStyle = skin;
    ctx.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, lid - (y - ry - 2));
    ctx.fillStyle = P.lid;
    ctx.fillRect(x - rx - 2, lid - 4, rx * 2 + 4, 4);
    ctx.beginPath(); ctx.moveTo(x - rx - 1, lid); ctx.lineTo(x + rx + 1, lid);
    stroke(ctx, P.ink, 3.5);
  } else if (mood === 'grin' && !wide) {
    const lid = y + ry * 0.45;
    ctx.fillStyle = skin;
    ctx.fillRect(x - rx - 2, lid, rx * 2 + 4, ry);
    ctx.beginPath(); ctx.moveTo(x - rx - 1, lid); ctx.lineTo(x + rx + 1, lid);
    stroke(ctx, P.ink, 3.5);
  }
  ctx.restore();

  // outline
  ellipse(ctx, x, y, rx, ry);
  stroke(ctx, P.ink, 3.5);
}

function nose(ctx, P) {
  ctx.beginPath();
  ctx.arc(U / 2, FACE.eyeY + 24, 7, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.globalAlpha = 0.45;
  stroke(ctx, P.ink, 3.5);
  ctx.globalAlpha = 1;
}

function mouth(ctx, mood, eyes, P) {
  const y = FACE.mouthY;
  const c = U / 2;
  if (mood === 'grin') {
    ctx.beginPath();
    ctx.moveTo(c - 40, y - 4);
    ctx.quadraticCurveTo(c, y - 12, c + 40, y - 4);
    ctx.bezierCurveTo(c + 40, y + 42, c - 40, y + 42, c - 40, y - 4);
    ctx.closePath();
    ctx.fillStyle = P.ink;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = P.teeth;
    ctx.fillRect(c - 44, y - 14, 88, 14);
    ctx.restore();
    stroke(ctx, P.ink, 5);
    return;
  }
  ctx.beginPath();
  if (mood === 'think') {
    ctx.moveTo(c - 18, y + 12);
    ctx.lineTo(c + 22, y + 7);
  } else {
    const r = eyes === 'wide' ? 28 : 26;
    ctx.arc(c, y - 6, r, 0.18 * Math.PI, 0.82 * Math.PI);
  }
  stroke(ctx, P.ink, 9);
}

function paint(ctx, mood, themeId, skin, eyes) {
  const P = palette(themeId);
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, U, U);
  // gentle top light and a forehead sheen so the face reads as a surface
  let g = ctx.createLinearGradient(0, 0, 0, U);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, U, U);
  g = ctx.createRadialGradient(104, 56, 4, 104, 56, 70);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, U, U);

  ctx.fillStyle = P.blush;
  ellipse(ctx, 60, 150, 20, 10); ctx.fill();
  ellipse(ctx, 196, 150, 20, 10); ctx.fill();

  brows(ctx, mood, eyes === 'wide', P.ink);
  eye(ctx, FACE.eyeX[0], mood, eyes, P, skin);
  eye(ctx, FACE.eyeX[1], mood, eyes, P, skin);
  nose(ctx, P);
  mouth(ctx, mood, eyes, P);
}

// Frees one theme's painted faces (textures.js disposeThemeTextures does the same for the cards).
export function disposeAvatarFaces(themeId) {
  for (const [key, t] of cache) {
    if (key.startsWith(`${themeId}:`)) { t.dispose(); cache.delete(key); }
  }
}

export function avatarFace(mood = 'smile', themeId = 'classic', skin = '#e07a3f', eyes = 'open') {
  const key = `${themeId}:${mood}:${skin}:${eyes}`;
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  ctx.scale(S / U, S / U);
  paint(ctx, mood, themeId, skin, eyes);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}
