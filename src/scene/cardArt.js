// Card artwork for Bluff: a 52-card deck plus a back, for the Classic and Future themes, drawn with
// the Canvas 2D API only. Pure functions, no three import, no image assets. Everything is laid out
// in reference pixels (CARD_PX) and scaled to the canvas handed in, so the same code draws a texture,
// a thumbnail or a print sheet.
//
// Legibility rules the layout follows (the 3D hand shows a card about 120 px tall, overlapped so
// only the left 35 to 38 percent of the face shows; the pile shows it at 60 px, at an angle):
//  - the top-left index is big (rank cap height 17 percent of the card) and lives entirely inside
//    the left 28 percent of the face, so it survives the overlap;
//  - suits are vector paths, not font glyphs, so pips look the same in every browser;
//  - court cards are bold mirrored busts with a distinct silhouette each (crown, tiara, cap).

export const CARD_PX = { w: 768, h: 1080 };
export const CORNER = 0.07; // corner radius as a fraction of the width (the 3D geometry matches it)

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (suit) => suit === '♥' || suit === '♦';

export const PALETTE = {
  classic: {
    face: '#F7F2E6', face2: '#EFE8D8', ink: '#1A1A1A', red: '#C8252C',
    frame: '#D6C7A8', edge: '#C9BB9C', gold: '#D9B45A',
    royal: '#2F4F8F', skin: '#F2D7B6', hair: '#3E2A1C', steel: '#DADAD4',
    panel: 'rgba(217,180,90,0.13)',
    back: '#7E1F27', back2: '#5C161C', backLine: 'rgba(247,242,230,0.42)', backBorder: '#F7F2E6',
    indexFont: '"Outfit", "Inter", "Segoe UI", system-ui, sans-serif',
    indexWeight: 700,
    // two-character labels ("10"): size relative to the single-character cap, and letter spacing
    // in em, chosen per font so the condensed pair still reads as two digits
    indexTwo: { scale: 0.9, spacing: -0.1 },
  },
  future: {
    face: '#F2F5F9', face2: '#E7ECF3', ink: '#141821', red: '#FF4D5E',
    frame: '#5CE1E6', edge: '#AEB9C8', gold: '#D4C96B',
    royal: '#2CA4B2', skin: '#EBD7C2', hair: '#262E3F', steel: '#C6D2E0',
    panel: 'rgba(92,225,230,0.09)',
    // the back field sits a step above the Future felt (#141a26) and the rim another step above it,
    // so a face-down card still reads as a card, not a hole in the table
    back: '#1C2434', back2: '#161D2A', backRim: '#2A3447', backLine: 'rgba(92,225,230,0.10)', backBorder: '#5CE1E6',
    indexFont: '"Space Mono", "Courier New", monospace',
    indexWeight: 700,
    indexStroke: 5,
    // Space Mono's "1" has a flag and a foot serif, so its "10" is 1.05 em of ink with the digits
    // already touching at -0.1 em; a smaller pair with a little daylight condenses less harshly
    indexTwo: { scale: 0.82, spacing: -0.05 },
  },
};

// Pip layouts for 2 to 10: [column, row, flipped]. Columns are -1 (left), 0 (centre), 1 (right);
// rows are fractions of the pip area, 0 at the top and 1 at the bottom. Pips in the lower half are
// drawn upside down, like a real deck.
export const PIP_LAYOUT = {
  2: [[0, 0], [0, 1, 1]],
  3: [[0, 0], [0, 0.5], [0, 1, 1]],
  4: [[-1, 0], [1, 0], [-1, 1, 1], [1, 1, 1]],
  5: [[-1, 0], [1, 0], [0, 0.5], [-1, 1, 1], [1, 1, 1]],
  6: [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1, 1], [1, 1, 1]],
  7: [[-1, 0], [1, 0], [0, 0.25], [-1, 0.5], [1, 0.5], [-1, 1, 1], [1, 1, 1]],
  8: [[-1, 0], [1, 0], [0, 0.25], [-1, 0.5], [1, 0.5], [0, 0.75, 1], [-1, 1, 1], [1, 1, 1]],
  9: [[-1, 0], [1, 0], [-1, 1 / 3], [1, 1 / 3], [0, 0.5], [-1, 2 / 3, 1], [1, 2 / 3, 1], [-1, 1, 1], [1, 1, 1]],
  10: [[-1, 0], [1, 0], [0, 1 / 6], [-1, 1 / 3], [1, 1 / 3], [-1, 2 / 3, 1], [1, 2 / 3, 1], [0, 5 / 6, 1], [-1, 1, 1], [1, 1, 1]],
};

// Where things sit, in reference pixels (W x H = 768 x 1080).
const W = CARD_PX.w;
const H = CARD_PX.h;
export const LAYOUT = {
  index: { cx: W * 0.15, capTop: H * 0.034, cap: H * 0.17, maxW: W * 0.235, suit: H * 0.14, gap: H * 0.02 },
  // pips the size of a real deck's (about a sixth of the width, columns at plus or minus 0.135 W).
  // The top row sits beside the index: with the widest suit (the heart, 0.52 of its height each
  // side) the left column's edge is at x 216, and the rank ink ends at x 204 in both fonts
  // (the index condenses "10" to maxW), so the two never touch
  pips: { col: W * 0.135, top: H * 0.205, bottom: H * 0.795, size: W * 0.16 },
  // the ace of spades sits in an oval cartouche: a rectangle wide enough for the spade would run
  // into the index columns, an oval is narrow where they are and wide where the lobes are
  ace: { size: W * 0.5, spade: W * 0.48, oval: { a: W * 0.3, b: H * 0.27 } },
  court: { x: W * 0.30, y: H * 0.14, w: W * 0.40, h: H * 0.72 },
};

/* ---------- small helpers ---------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

// Deterministic noise so a texture is identical every time it is drawn.
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- suits as vector paths ---------- */

// Each suit is traced in a unit box: height 1, centred on (0, 0). drawSuit scales it to `size`.
function heartPath(ctx) {
  const cy = -0.2, r = 0.27, cx = 0.25;
  const dy = Math.sqrt(r * r - cx * cx); // the lobes cross at x = 0, this far above their centres
  const a = Math.atan2(-dy, cx); // angle of the cleft on the left lobe
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.bezierCurveTo(-0.17, 0.30, -0.52, 0.10, -0.52, cy);
  ctx.arc(-cx, cy, r, Math.PI, a + Math.PI * 2, false);
  ctx.arc(cx, cy, r, Math.PI - a, Math.PI * 2, false);
  ctx.bezierCurveTo(0.52, 0.10, 0.17, 0.30, 0, 0.5);
  ctx.closePath();
}

function stemPath(ctx, top) {
  // the little flared foot under a spade or a club
  ctx.moveTo(-0.055, top);
  ctx.bezierCurveTo(-0.055, top + 0.2, -0.13, 0.44, -0.23, 0.5);
  ctx.lineTo(0.23, 0.5);
  ctx.bezierCurveTo(0.13, 0.44, 0.055, top + 0.2, 0.055, top);
  ctx.closePath();
}

function spadePath(ctx) {
  const cy = 0.07, r = 0.255, cx = 0.235;
  const dy = Math.sqrt(r * r - cx * cx);
  const a = Math.atan2(dy, cx); // angle of the cleft on the left lobe (below the centres)
  ctx.beginPath();
  ctx.moveTo(0, -0.5);
  ctx.bezierCurveTo(0.17, -0.32, 0.49, -0.12, 0.49, cy);
  ctx.arc(cx, cy, r, 0, Math.PI - a, false);
  ctx.arc(-cx, cy, r, a, Math.PI, false);
  ctx.bezierCurveTo(-0.49, -0.12, -0.17, -0.32, 0, -0.5);
  ctx.closePath();
  stemPath(ctx, 0.12);
}

function clubPath(ctx) {
  const r = 0.2;
  ctx.beginPath();
  ctx.arc(0, -0.29, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.arc(-0.235, 0.085, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.arc(0.235, 0.085, r, 0, Math.PI * 2);
  ctx.closePath();
  // fill the hollow between the three leaves
  ctx.moveTo(0, -0.3);
  ctx.lineTo(-0.24, 0.1);
  ctx.lineTo(0.24, 0.1);
  ctx.closePath();
  stemPath(ctx, 0.1);
}

function diamondPath(ctx) {
  const hw = 0.38;
  ctx.beginPath();
  ctx.moveTo(0, -0.5);
  ctx.quadraticCurveTo(hw * 0.58, -0.27, hw, 0);
  ctx.quadraticCurveTo(hw * 0.58, 0.27, 0, 0.5);
  ctx.quadraticCurveTo(-hw * 0.58, 0.27, -hw, 0);
  ctx.quadraticCurveTo(-hw * 0.58, -0.27, 0, -0.5);
  ctx.closePath();
}

const SUIT_PATH = { '♥': heartPath, '♠': spadePath, '♣': clubPath, '♦': diamondPath };
// How far each suit reaches to either side of its centre, as a fraction of its height (the widest
// point of the paths above). Layout code uses it to keep pips clear of the indices.
export const SUIT_HALF_WIDTH = { '♥': 0.52, '♠': 0.49, '♣': 0.435, '♦': 0.38 };

// Draws a suit `size` px tall, centred on the current origin.
export function drawSuit(ctx, suit, size, color, mode = 'fill') {
  const path = SUIT_PATH[suit];
  if (!path) return;
  ctx.save();
  ctx.scale(size, size);
  path(ctx);
  if (mode === 'stroke') {
    ctx.lineWidth = ctx.lineWidth / size;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- the stock ---------- */

// Fills the face colour with a hint of paper, then the edge line and the inner frame. The caller
// has already clipped to the rounded rectangle.
function paintStock(ctx, T, themeId) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, T.face);
  g.addColorStop(1, T.face2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (themeId === 'classic') {
    // paper: faint fibres, invisible at game size, warm up close
    const rnd = lcg(7);
    ctx.fillStyle = 'rgba(120,90,40,0.055)';
    for (let i = 0; i < 900; i++) {
      const x = rnd() * W, y = rnd() * H, len = 2 + rnd() * 6;
      ctx.fillRect(x, y, len, 1.2);
    }
  }

  // edge line: drawn inside the clip, so only the inner half shows. It is what separates two
  // overlapped ivory cards in the hand, so it is a touch heavier than a print line.
  const r = W * CORNER;
  ctx.lineWidth = 8;
  ctx.strokeStyle = T.edge;
  roundRect(ctx, 0, 0, W, H, r);
  ctx.stroke();

  // inner frame
  const m = themeId === 'future' ? 20 : 18;
  roundRect(ctx, m, m, W - 2 * m, H - 2 * m, r * 0.62);
  if (themeId === 'future') {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(92,225,230,0.75)';
  } else {
    ctx.lineWidth = 3;
    ctx.strokeStyle = T.frame;
  }
  ctx.stroke();
}

/* ---------- indices ---------- */

// Big rank over the suit, top-left; the caller rotates for the bottom-right copy. The font size is
// found from the measured cap height so Outfit and Space Mono land on the same visual size. The
// label's ink (not its advance: Chrome counts letterSpacing after the last character too, so the
// advance is not where the ink is) is centred on the column and, when wider than the column, is
// condensed to it rather than allowed to spill right. That is what keeps "10" inside the strip of
// the face that shows in an overlapped hand.
function drawIndex(ctx, label, suit, color, T) {
  const L = LAYOUT.index;
  const family = T.indexFont;
  const weight = T.indexWeight;
  const two = label.length > 1;
  const stroke = T.indexStroke || 0;
  const baseline = L.capTop + L.cap;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${weight} 100px ${family}`;
  const probe = ctx.measureText(two ? '1' : label);
  const asc = probe.actualBoundingBoxAscent || 72;
  let size = (100 * L.cap) / asc;
  const pair = T.indexTwo || { scale: 0.9, spacing: -0.1 };
  if (two) size *= pair.scale;
  ctx.font = `${weight} ${size}px ${family}`;
  if (two && 'letterSpacing' in ctx) ctx.letterSpacing = `${size * pair.spacing}px`;
  const metrics = ctx.measureText(label);
  // ink extents, measured from the anchor (the middle of the advance, since textAlign is centre)
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  const measured = Number.isFinite(left) && Number.isFinite(right) && left + right > 0;
  const inkW = (measured ? left + right : metrics.width) + stroke;
  const inkMid = measured ? (right - left) / 2 : 0; // where the ink is centred, relative to the anchor
  const sx = Math.min(1, L.maxW / inkW);

  ctx.fillStyle = color;
  ctx.translate(L.cx - inkMid * sx, baseline);
  ctx.scale(sx, 1);
  ctx.fillText(label, 0, 0);
  if (stroke) {
    // Space Mono 700 is lighter than Outfit 700; a hairline stroke brings it to the same weight
    ctx.lineWidth = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.strokeText(label, 0, 0);
  }
  ctx.restore();

  const descent = metrics.actualBoundingBoxDescent || 0;
  const gap = Math.max(L.gap, descent + 14);
  ctx.save();
  ctx.translate(L.cx, baseline + gap + L.suit / 2);
  drawSuit(ctx, suit, L.suit, color);
  ctx.restore();
}

/* ---------- pips, ace, court ---------- */

function drawPips(ctx, n, suit, color) {
  const P = LAYOUT.pips;
  const cx = W / 2;
  const span = P.bottom - P.top;
  for (const [col, row, flipped] of PIP_LAYOUT[n]) {
    ctx.save();
    ctx.translate(cx + col * P.col, P.top + row * span);
    if (flipped) ctx.rotate(Math.PI);
    drawSuit(ctx, suit, P.size, color);
    ctx.restore();
  }
}

function drawAce(ctx, suit, color, T, themeId) {
  const cx = W / 2, cy = H / 2;
  if (suit === '♠') {
    // the ace of spades: a double-lined oval cartouche with a gold dot at each cardinal point, and
    // the spade inside it with a gold (Future: cyan) outline. The spade is sized so the outline
    // clears the inner line by about 25 px at the lobes; the oval clears the index suits by 35 px.
    const { a, b } = LAYOUT.ace.oval;
    const size = LAYOUT.ace.spade;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, a, b, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, a - 10, b - 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = T.gold;
    for (const [x, y] of [[cx, cy - b], [cx + a, cy], [cx, cy + b], [cx - a, cy]]) {
      circle(ctx, x, y, 7);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 10;
    drawSuit(ctx, suit, size * 1.05, themeId === 'future' ? T.frame : T.gold, 'stroke');
    drawSuit(ctx, suit, size, color);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy);
  drawSuit(ctx, suit, LAYOUT.ace.size, color);
  ctx.restore();
}

// One half of a court figure, in local coordinates: (0, 0) is the panel's top-left, the half is
// pw by hh. The caller clips to that half and rotates the second copy. n is 11 (J), 12 (Q), 13 (K).
function drawFigure(ctx, n, color, T, pw, hh) {
  const cx = pw / 2;
  const primary = color;
  const secondary = T.royal;
  const { gold, skin, hair, ink, steel } = T;
  const head = { x: cx, y: 206, r: 70 };
  const hy = head.y;

  const fillShape = (fn, fill) => { ctx.beginPath(); fn(); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  const outline = (lw = 3, c = ink) => { ctx.lineWidth = lw; ctx.strokeStyle = c; ctx.lineJoin = 'round'; ctx.stroke(); };

  // The face is heraldic and flat, the way a printed court card is: a tapered oval (narrower at the
  // chin than at the brow), almond eyes glancing toward the nose, a long nose line and a short mouth.
  const facePath = () => {
    ctx.moveTo(cx, hy - 76);
    ctx.bezierCurveTo(cx + 66, hy - 76, cx + 70, hy - 12, cx + 60, hy + 26);
    ctx.bezierCurveTo(cx + 52, hy + 60, cx + 24, hy + 82, cx, hy + 82);
    ctx.bezierCurveTo(cx - 24, hy + 82, cx - 52, hy + 60, cx - 60, hy + 26);
    ctx.bezierCurveTo(cx - 70, hy - 12, cx - 66, hy - 76, cx, hy - 76);
  };

  // hair behind the head
  circle(ctx, cx, hy - 4, head.r + (n === 12 ? 14 : 8));
  ctx.fillStyle = hair;
  ctx.fill();

  // tunic: rounded shoulders, two tones, a gold seam and collar
  const top = hy + 80;
  const tunic = () => {
    ctx.moveTo(cx - 62, top);
    ctx.quadraticCurveTo(cx - 136, top + 16, cx - 144, top + 84);
    ctx.lineTo(cx - 144, hh + 20);
    ctx.lineTo(cx + 144, hh + 20);
    ctx.lineTo(cx + 144, top + 84);
    ctx.quadraticCurveTo(cx + 136, top + 16, cx + 62, top);
  };
  ctx.save();
  ctx.beginPath(); tunic(); ctx.closePath();
  ctx.clip();
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, cx, hh + 20);
  ctx.fillStyle = secondary;
  ctx.fillRect(cx, 0, pw, hh + 20);
  // brocade on the royal half: a gold lozenge lattice with a dot at every crossing
  ctx.save();
  ctx.beginPath(); ctx.rect(cx + 7, 0, pw, hh + 20); ctx.clip();
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.85;
  const run = hh + 40 - (top - 10);
  for (let x0 = -150; x0 <= 170; x0 += 30) {
    ctx.beginPath(); ctx.moveTo(cx + x0, top - 10); ctx.lineTo(cx + x0 + run * 0.75, hh + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + x0, top - 10); ctx.lineTo(cx + x0 - run * 0.75, hh + 30); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = gold;
  for (let x0 = -150; x0 <= 170; x0 += 30) {
    for (let k = 0; k <= 8; k++) {
      // crossings of the two families lie on the midline between neighbouring lines
      const y = top - 10 + k * 20;
      const x = cx + x0 + (k % 2 ? 15 : 0);
      circle(ctx, x, y, 3.2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.fillStyle = gold;
  ctx.fillRect(cx - 7, 0, 14, hh + 20);
  ctx.restore();
  ctx.beginPath(); tunic(); ctx.closePath();
  outline(3);
  // collar: a chemise shows in the V, a gold band around it, a brooch at the point
  fillShape(() => {
    ctx.moveTo(cx - 62, top);
    ctx.lineTo(cx, top + 54);
    ctx.lineTo(cx + 62, top);
  }, steel);
  ctx.beginPath();
  ctx.moveTo(cx - 62, top);
  ctx.lineTo(cx, top + 54);
  ctx.lineTo(cx + 62, top);
  ctx.lineWidth = 12;
  ctx.strokeStyle = gold;
  ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ink;
  ctx.stroke();

  // hair falling at the sides, drawn behind the face: each lock starts narrow at the temple, swells
  // past the jaw and tapers to a tip. A page's bob curling in under the ear for the Jack, to the
  // shoulders with a turn outward for the King, long with a flick over the shoulder for the Queen.
  const lockPath = (s) => {
    ctx.moveTo(cx + s * 40, hy - 56);
    if (n === 12) {
      ctx.bezierCurveTo(cx + s * 86, hy - 50, cx + s * 100, hy + 10, cx + s * 92, hy + 70);
      ctx.bezierCurveTo(cx + s * 87, hy + 108, cx + s * 80, hy + 136, cx + s * 108, hy + 160);
      ctx.bezierCurveTo(cx + s * 78, hy + 160, cx + s * 58, hy + 136, cx + s * 60, hy + 92);
      ctx.bezierCurveTo(cx + s * 62, hy + 54, cx + s * 60, hy + 6, cx + s * 40, hy - 56);
    } else if (n === 13) {
      ctx.bezierCurveTo(cx + s * 86, hy - 48, cx + s * 96, hy + 6, cx + s * 90, hy + 50);
      ctx.bezierCurveTo(cx + s * 86, hy + 82, cx + s * 90, hy + 100, cx + s * 102, hy + 114);
      ctx.bezierCurveTo(cx + s * 78, hy + 116, cx + s * 58, hy + 104, cx + s * 58, hy + 74);
      ctx.bezierCurveTo(cx + s * 58, hy + 44, cx + s * 60, hy + 2, cx + s * 40, hy - 56);
    } else {
      ctx.bezierCurveTo(cx + s * 88, hy - 50, cx + s * 98, hy + 6, cx + s * 90, hy + 46);
      ctx.bezierCurveTo(cx + s * 85, hy + 72, cx + s * 74, hy + 90, cx + s * 52, hy + 92);
      ctx.bezierCurveTo(cx + s * 64, hy + 80, cx + s * 62, hy + 50, cx + s * 60, hy + 22);
      ctx.bezierCurveTo(cx + s * 59, hy - 6, cx + s * 58, hy - 34, cx + s * 40, hy - 56);
    }
  };
  for (const s of [-1, 1]) {
    fillShape(() => lockPath(s), hair);
    outline(2);
    // one pale strand along the outer curve, so the lock reads as hair against a dark tunic
    ctx.beginPath();
    ctx.moveTo(cx + s * 72, hy - 30);
    ctx.quadraticCurveTo(cx + s * 86, hy + 20, cx + s * 78, hy + (n === 12 ? 100 : n === 13 ? 74 : 54));
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.stroke();
  }

  // neck and face
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 26, hy + 40, 52, top + 14 - (hy + 40));
  fillShape(facePath, skin);
  outline(3);

  // brows: a slight arch, heavier at the inner end
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 46, hy - 18);
    ctx.quadraticCurveTo(cx + s * 30, hy - 38, cx + s * 10, hy - 24);
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  // eyes: almond outlines with a light lid line, the iris set toward the nose so the figure glances
  // rather than stares, and a glint of the face colour in each
  for (const s of [-1, 1]) {
    const ex = cx + s * 27, ey = hy - 4;
    ctx.beginPath();
    ctx.moveTo(ex - 17, ey);
    ctx.quadraticCurveTo(ex, ey - 15, ex + 17, ey);
    ctx.quadraticCurveTo(ex, ey + 10, ex - 17, ey);
    ctx.closePath();
    ctx.fillStyle = T.face;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = ink;
    ctx.stroke();
    const ix = ex - s * 3;
    circle(ctx, ix, ey - 1, 5.5);
    ctx.fillStyle = ink;
    ctx.fill();
    circle(ctx, ix - 2, ey - 3.5, 1.8);
    ctx.fillStyle = T.face;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex - 18, ey);
    ctx.quadraticCurveTo(ex, ey - 16, ex + 18, ey);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }
  // nose: one long line from between the brows, hooked at the end
  ctx.beginPath();
  ctx.moveTo(cx + 3, hy - 22);
  ctx.lineTo(cx - 4, hy + 22);
  ctx.quadraticCurveTo(cx - 5, hy + 32, cx + 10, hy + 30);
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();
  // mouth: a short line, turned up a touch for the Jack, level for the Queen and the King (whose
  // shows between moustache and beard), with a soft lower lip on the clean-shaven faces
  const smile = n === 11 ? 3 : n === 12 ? 1 : 0;
  if (n !== 13) {
    fillShape(() => {
      ctx.moveTo(cx - 11, hy + 51);
      ctx.quadraticCurveTo(cx, hy + 61, cx + 11, hy + 51);
    }, 'rgba(176,72,72,0.42)');
  }
  ctx.beginPath();
  ctx.moveTo(cx - 14, hy + 50);
  ctx.quadraticCurveTo(cx, hy + 50 + smile * 2, cx + 14, hy + 50);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.stroke();

  if (n === 13) {
    // a full beard to a point, and a moustache over it, with the mouth showing in the gap between
    fillShape(() => {
      ctx.moveTo(cx - 60, hy + 18);
      ctx.bezierCurveTo(cx - 64, hy + 84, cx - 30, hy + 116, cx, hy + 120);
      ctx.bezierCurveTo(cx + 30, hy + 116, cx + 64, hy + 84, cx + 60, hy + 18);
      ctx.quadraticCurveTo(cx + 30, hy + 58, cx, hy + 58);
      ctx.quadraticCurveTo(cx - 30, hy + 58, cx - 60, hy + 18);
    }, hair);
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx - 18, hy + 36, 21, 8, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 18, hy + 36, 21, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // hairline under the headgear: a shallow widow's peak, clipped to the face
  ctx.save();
  ctx.beginPath(); facePath(); ctx.closePath(); ctx.clip();
  fillShape(() => {
    ctx.moveTo(cx - 90, hy - 110);
    ctx.lineTo(cx + 90, hy - 110);
    ctx.lineTo(cx + 90, hy - 48);
    ctx.quadraticCurveTo(cx + 40, hy - 52, cx, hy - 34);
    ctx.quadraticCurveTo(cx - 40, hy - 52, cx - 90, hy - 48);
  }, hair);
  ctx.restore();

  // brooch at the collar point
  circle(ctx, cx, top + 56, 17);
  ctx.fillStyle = gold;
  ctx.fill();
  outline(2.5);
  circle(ctx, cx, top + 56, 8);
  ctx.fillStyle = primary;
  ctx.fill();
  outline(2);

  // headgear
  const brow = head.y - head.r; // top of the head
  if (n === 13) {
    // crown
    fillShape(() => {
      ctx.moveTo(cx - 80, brow + 26);
      ctx.lineTo(cx - 80, brow - 20);
      ctx.lineTo(cx - 54, brow - 84);
      ctx.lineTo(cx - 27, brow - 30);
      ctx.lineTo(cx, brow - 96);
      ctx.lineTo(cx + 27, brow - 30);
      ctx.lineTo(cx + 54, brow - 84);
      ctx.lineTo(cx + 80, brow - 20);
      ctx.lineTo(cx + 80, brow + 26);
    }, gold);
    outline(3);
    for (const [x, c] of [[cx - 46, primary], [cx, secondary], [cx + 46, primary]]) {
      circle(ctx, x, brow + 2, 9);
      ctx.fillStyle = c;
      ctx.fill();
      outline(2);
    }
  } else if (n === 12) {
    // tiara
    fillShape(() => {
      ctx.moveTo(cx - 68, brow + 20);
      ctx.lineTo(cx - 68, brow + 2);
      ctx.lineTo(cx - 44, brow - 30);
      ctx.lineTo(cx - 22, brow - 8);
      ctx.lineTo(cx, brow - 54);
      ctx.lineTo(cx + 22, brow - 8);
      ctx.lineTo(cx + 44, brow - 30);
      ctx.lineTo(cx + 68, brow + 2);
      ctx.lineTo(cx + 68, brow + 20);
    }, gold);
    outline(3);
    circle(ctx, cx, brow - 10, 10);
    ctx.fillStyle = primary;
    ctx.fill();
    outline(2);
  } else {
    // bonnet: a domed crown in the royal colour over a wide band in the suit colour with gold
    // piping, on a flat gold brim that reaches well past the head. Round where the Queen's tiara is
    // pointed, so the two silhouettes differ even at pile size. The feather is tucked behind the
    // band on the right and drawn first, so the cap hides its root.
    ctx.save();
    ctx.translate(cx + 2, brow + 4);
    ctx.rotate(-0.08);
    ctx.save();
    ctx.translate(60, -8);
    ctx.rotate(-0.65);
    ctx.beginPath();
    ctx.ellipse(0, -52, 13, 54, 0, 0, Math.PI * 2);
    ctx.fillStyle = primary;
    ctx.fill();
    outline(2.5);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -98); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    ctx.restore();
    // brim
    ctx.beginPath();
    ctx.ellipse(0, 9, 118, 17, 0, 0, Math.PI * 2);
    ctx.fillStyle = gold;
    ctx.fill();
    outline(3);
    // dome
    ctx.beginPath();
    ctx.ellipse(-2, -10, 90, 50, 0, Math.PI, Math.PI * 2);
    ctx.lineTo(88, 0);
    ctx.lineTo(-92, 0);
    ctx.closePath();
    ctx.fillStyle = secondary;
    ctx.fill();
    outline(3);
    // band
    roundRect(ctx, -94, -16, 184, 24, 5);
    ctx.fillStyle = primary;
    ctx.fill();
    outline(2.5);
    ctx.beginPath();
    ctx.moveTo(-90, -10); ctx.lineTo(86, -10);
    ctx.moveTo(-90, 2); ctx.lineTo(86, 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = gold;
    ctx.stroke();
    ctx.restore();
  }

  // motif
  if (n === 13) {
    // sword, held upright at the right
    const x = pw - 40;
    fillShape(() => {
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 12, 66);
      ctx.lineTo(x + 12, 262);
      ctx.lineTo(x - 12, 262);
      ctx.lineTo(x - 12, 66);
    }, steel);
    outline(2.5);
    ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, 256); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
    fillShape(() => roundRect(ctx, x - 34, 260, 68, 15, 5), gold);
    outline(2.5);
    fillShape(() => roundRect(ctx, x - 8, 273, 16, 56, 4), primary);
    outline(2.5);
    circle(ctx, x, 340, 12);
    ctx.fillStyle = gold;
    ctx.fill();
    outline(2.5);
  } else if (n === 12) {
    // flower, held at the left
    const x = 42, y = 250;
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.lineTo(x - 2, 352);
    ctx.lineWidth = 7;
    ctx.strokeStyle = secondary;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - 14, 306, 17, 7, -0.6, 0, Math.PI * 2);
    ctx.ellipse(x + 12, 326, 17, 7, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = secondary;
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      circle(ctx, x + Math.cos(a) * 21, y + Math.sin(a) * 21, 16);
      ctx.fillStyle = primary;
      ctx.fill();
      outline(2.5);
    }
    circle(ctx, x, y, 12);
    ctx.fillStyle = gold;
    ctx.fill();
    outline(2.5);
  } else {
    // sceptre, at the right
    const x = pw - 40;
    fillShape(() => roundRect(ctx, x - 7, 70, 14, 290, 6), gold);
    outline(2.5);
    fillShape(() => {
      ctx.moveTo(x, 30);
      ctx.lineTo(x + 22, 62);
      ctx.lineTo(x, 94);
      ctx.lineTo(x - 22, 62);
    }, primary);
    outline(2.5);
    for (const y of [120, 338]) {
      fillShape(() => roundRect(ctx, x - 13, y, 26, 12, 4), secondary);
      outline(2);
    }
  }
}

function drawCourt(ctx, n, suit, color, T) {
  const P = LAYOUT.court;
  ctx.save();
  ctx.fillStyle = T.panel;
  ctx.fillRect(P.x, P.y, P.w, P.h);
  ctx.lineWidth = 4;
  ctx.strokeStyle = T.ink;
  ctx.strokeRect(P.x, P.y, P.w, P.h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = T.gold;
  ctx.strokeRect(P.x + 9, P.y + 9, P.w - 18, P.h - 18);
  ctx.restore();

  const mx = P.x + P.w / 2, my = P.y + P.h / 2;
  for (let k = 0; k < 2; k++) {
    ctx.save();
    if (k) {
      ctx.translate(mx, my);
      ctx.rotate(Math.PI);
      ctx.translate(-mx, -my);
    }
    ctx.beginPath();
    ctx.rect(P.x + 2, P.y + 2, P.w - 4, P.h / 2 - 2);
    ctx.clip();
    ctx.translate(P.x, P.y);
    drawFigure(ctx, n, color, T, P.w, P.h / 2);
    // the suit in the panel corner
    ctx.save();
    ctx.translate(40, 44);
    drawSuit(ctx, suit, 42, color);
    ctx.restore();
    ctx.restore();
  }
}

/* ---------- public API ---------- */

// card = { rank: 0..12 (A..K), suit: '♠' | '♥' | '♦' | '♣' }
export function drawFace(ctx, card, themeId, w = CARD_PX.w, h = CARD_PX.h) {
  const T = PALETTE[themeId] || PALETTE.classic;
  const theme = PALETTE[themeId] ? themeId : 'classic';
  const label = RANK_LABELS[card.rank];
  const color = isRed(card.suit) ? T.red : T.ink;
  const n = card.rank + 1; // 1..13

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.scale(w / W, h / H);
  roundRect(ctx, 0, 0, W, H, W * CORNER);
  ctx.clip();
  paintStock(ctx, T, theme);

  if (n === 1) drawAce(ctx, card.suit, color, T, theme);
  else if (n <= 10) drawPips(ctx, n, card.suit, color);
  else drawCourt(ctx, n, card.suit, color, T);

  drawIndex(ctx, label, card.suit, color, T);
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  drawIndex(ctx, label, card.suit, color, T);
  ctx.restore();
}

export function drawBack(ctx, themeId, w = CARD_PX.w, h = CARD_PX.h) {
  const theme = PALETTE[themeId] ? themeId : 'classic';
  const T = PALETTE[theme];
  const r = W * CORNER;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.scale(w / W, h / H);
  roundRect(ctx, 0, 0, W, H, r);
  ctx.clip();

  if (theme === 'future') {
    // lighter rim band first, then the field inset into it. The rim is what survives the shrink to
    // 60 px on the pile: a 30 px band is still a visible 1.7 px frame there.
    ctx.fillStyle = T.backRim;
    ctx.fillRect(0, 0, W, H);
    const m = 30;
    ctx.save();
    roundRect(ctx, m, m, W - 2 * m, H - 2 * m, r * 0.6);
    ctx.clip();
    const fg = ctx.createLinearGradient(0, 0, W, H);
    fg.addColorStop(0, T.back);
    fg.addColorStop(1, T.back2);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    // a quiet grid, brighter every fourth line, fading toward the rim
    const step = 32;
    const x0 = W / 2 - Math.floor((W / 2 - m) / step) * step;
    const y0 = H / 2 - Math.floor((H / 2 - m) / step) * step;
    let i = 0;
    for (let x = x0; x <= W - m; x += step, i++) {
      ctx.strokeStyle = `rgba(92,225,230,${i % 4 === 0 ? 0.17 : 0.09})`;
      ctx.lineWidth = i % 4 === 0 ? 2 : 1.5;
      ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, H - m); ctx.stroke();
    }
    i = 0;
    for (let y = y0; y <= H - m; y += step, i++) {
      ctx.strokeStyle = `rgba(92,225,230,${i % 4 === 0 ? 0.17 : 0.09})`;
      ctx.lineWidth = i % 4 === 0 ? 2 : 1.5;
      ctx.beginPath(); ctx.moveTo(m, y); ctx.lineTo(W - m, y); ctx.stroke();
    }
    const glow = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.5);
    glow.addColorStop(0, 'rgba(92,225,230,0.16)');
    glow.addColorStop(1, 'rgba(92,225,230,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // field border (between rim and field) and corner ticks
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(92,225,230,0.9)';
    roundRect(ctx, m, m, W - 2 * m, H - 2 * m, r * 0.6);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = T.backBorder;
    const L = 44, o = m + 14;
    for (const [x, y, dx, dy] of [[o, o, 1, 1], [W - o, o, -1, 1], [o, H - o, 1, -1], [W - o, H - o, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke();
    }
    // centre emblem: rings and a spade
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = T.back;
    circle(ctx, cx, cy, 104); ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(92,225,230,0.85)';
    circle(ctx, cx, cy, 104); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(92,225,230,0.4)';
    circle(ctx, cx, cy, 88); ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy + 4);
    drawSuit(ctx, '♠', 120, T.backBorder);
    ctx.restore();
    // edge line so the back separates from the dark table. Half the stroke is outside the clip, so
    // 7 px of it shows: wide and bright enough to survive the mipmap chain down to pile size.
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(92,225,230,0.8)';
    roundRect(ctx, 0, 0, W, H, r);
    ctx.stroke();
  } else {
    // ivory border, deep red field with a lattice, a spade in an ivory ring
    ctx.fillStyle = T.backBorder;
    ctx.fillRect(0, 0, W, H);
    const m = 34;
    const field = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
    ctx.save();
    roundRect(ctx, field.x, field.y, field.w, field.h, r * 0.55);
    ctx.clip();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, T.back);
    g.addColorStop(1, T.back2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // lattice: two sets of diagonals, a dot where they cross
    const step = 52;
    ctx.strokeStyle = T.backLine;
    ctx.lineWidth = 3;
    for (let d = -H; d < W + H; d += step) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d, H); ctx.lineTo(d + H, 0); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(247,242,230,0.5)';
    for (let x = -step; x < W + step; x += step) {
      for (let y = (x / step) % 2 === 0 ? 0 : step / 2; y < H + step; y += step) {
        circle(ctx, x, y, 3.5);
        ctx.fill();
      }
    }
    ctx.restore();
    // inner ivory lines
    ctx.lineWidth = 3;
    ctx.strokeStyle = T.backBorder;
    roundRect(ctx, field.x + 12, field.y + 12, field.w - 24, field.h - 24, r * 0.4);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    roundRect(ctx, field.x + 20, field.y + 20, field.w - 40, field.h - 40, r * 0.35);
    ctx.stroke();
    // emblem
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = T.back2;
    circle(ctx, cx, cy, 98); ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = T.backBorder;
    circle(ctx, cx, cy, 98); ctx.stroke();
    ctx.lineWidth = 2;
    circle(ctx, cx, cy, 84); ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy + 4);
    drawSuit(ctx, '♠', 116, T.backBorder);
    ctx.restore();
    // edge line
    ctx.lineWidth = 6;
    ctx.strokeStyle = T.edge;
    roundRect(ctx, 0, 0, W, H, r);
    ctx.stroke();
  }
  ctx.restore();
}

// Every card in a deck, in a stable order (suit-major, A..K).
export function deck() {
  const out = [];
  for (const suit of SUITS) for (let rank = 0; rank < 13; rank++) out.push({ rank, suit });
  return out;
}

// Fonts the indices use. Canvas text does not trigger a web font download by itself, so a texture
// drawn before the font arrives falls back to a system face. Await this once before drawing.
export function loadCardFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return Promise.resolve();
  const wants = ['700 100px "Outfit"', '700 100px "Space Mono"'];
  return Promise.all(wants.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);
}
