// Sanity checks for the card artwork tables. Plain node, no runner:
//   node src/scene/cardArt.test.js
// Draws nothing; it only checks that the data the drawing code relies on is complete.

import { CARD_PX, CORNER, PALETTE, PIP_LAYOUT, SUITS, RANK_LABELS, LAYOUT, SUIT_HALF_WIDTH, deck, isRed } from './cardArt.js';

let failures = 0;
function check(ok, what) {
  if (!ok) {
    failures++;
    console.error('FAIL', what);
  }
}

// geometry
check(CARD_PX.w > 0 && CARD_PX.h > 0, 'CARD_PX has positive size');
check(Math.abs(CARD_PX.w / CARD_PX.h - 0.64 / 0.9) < 0.01, 'CARD_PX matches the 0.64 x 0.9 card');
check(CORNER > 0 && CORNER < 0.25, 'CORNER is a sane fraction of the width');

// palettes: both themes, every colour the drawing code reads
const NEEDED = ['face', 'face2', 'ink', 'red', 'frame', 'edge', 'gold', 'royal', 'skin', 'hair', 'steel', 'panel', 'back', 'back2', 'backLine', 'backBorder', 'indexFont'];
for (const theme of ['classic', 'future']) {
  check(PALETTE[theme], `PALETTE.${theme} exists`);
  for (const key of NEEDED) check(typeof PALETTE[theme]?.[key] === 'string' && PALETTE[theme][key].length > 0, `PALETTE.${theme}.${key}`);
  for (const key of ['face', 'ink', 'red', 'gold', 'back']) {
    check(/^#[0-9a-f]{6}$/i.test(PALETTE[theme][key]), `PALETTE.${theme}.${key} is a hex colour`);
  }
}
check(PALETTE.classic.face.toUpperCase() === '#F7F2E6', 'classic face is ivory');
check(PALETTE.future.face.toUpperCase() === '#F2F5F9', 'future face is cool off-white');
check(PALETTE.classic.red.toUpperCase() === '#C8252C' && PALETTE.future.red.toUpperCase() === '#FF4D5E', 'reds per brief');

// pips: 2..10, the right count, standard symmetry
for (let n = 2; n <= 10; n++) {
  const pips = PIP_LAYOUT[n];
  check(Array.isArray(pips) && pips.length === n, `PIP_LAYOUT[${n}] has ${n} pips`);
  for (const [col, row, flipped] of pips) {
    check([-1, 0, 1].includes(col), `PIP_LAYOUT[${n}] column ${col}`);
    check(row >= 0 && row <= 1, `PIP_LAYOUT[${n}] row ${row}`);
    check(flipped === undefined || flipped === 1, `PIP_LAYOUT[${n}] flip flag`);
    if (row > 0.5) check(flipped === 1, `PIP_LAYOUT[${n}] lower pip at row ${row} is flipped`);
    if (row < 0.5) check(!flipped, `PIP_LAYOUT[${n}] upper pip at row ${row} is upright`);
  }
  // the side columns mirror top to bottom (every pip at row r has a partner at 1 - r)
  for (const [col, row] of pips) {
    if (col === 0) continue;
    const partner = pips.find(([c, r]) => c === col && Math.abs(r - (1 - row)) < 1e-9);
    check(partner, `PIP_LAYOUT[${n}] pip (${col}, ${row}) has a mirrored partner`);
  }
  // left and right columns match, and the centre column has the standard count
  // (the 7 is the one asymmetric card: a single extra pip in the upper middle)
  const left = pips.filter(([c]) => c === -1).length;
  const right = pips.filter(([c]) => c === 1).length;
  check(left === right, `PIP_LAYOUT[${n}] balanced columns`);
  const CENTRE = { 2: 2, 3: 3, 4: 0, 5: 1, 6: 0, 7: 1, 8: 2, 9: 1, 10: 2 };
  check(pips.filter(([c]) => c === 0).length === CENTRE[n], `PIP_LAYOUT[${n}] has ${CENTRE[n]} centre pip(s)`);
}
check(Object.keys(PIP_LAYOUT).length === 9, 'PIP_LAYOUT covers exactly 2..10');

// pip geometry: real-deck proportions, and the field keeps clear of the indices and the frame
{
  const { w: W, h: H } = CARD_PX;
  const P = LAYOUT.pips;
  const I = LAYOUT.index;
  for (const suit of SUITS) check(SUIT_HALF_WIDTH[suit] > 0.3 && SUIT_HALF_WIDTH[suit] < 0.6, `SUIT_HALF_WIDTH[${suit}]`);
  check(P.size / W > 0.15 && P.size / W < 0.18, 'pips are about a sixth of the card width');
  check(P.col / W > 0.125 && P.col / W < 0.15, 'pip columns sit at about plus or minus 0.135 W');
  check(Math.abs(P.top + P.bottom - H) < 1e-6, 'pip rows are symmetric top to bottom');
  const widest = Math.max(...Object.values(SUIT_HALF_WIDTH));
  const pipLeft = W / 2 - P.col - widest * P.size;
  const indexRight = I.cx + I.maxW / 2; // the index condenses its ink to maxW, centred on cx
  check(pipLeft - indexRight >= 8, `left pip column (${pipLeft.toFixed(0)}) clears the index column (${indexRight.toFixed(0)})`);
  check(W / 2 + P.col + widest * P.size < W - 24, 'right pip column stays inside the inner frame');
  check(P.top - P.size / 2 > 24 && P.bottom + P.size / 2 < H - 24, 'top and bottom pip rows stay inside the inner frame');
  // the 10's centre pips sit between the side rows without touching them vertically
  const span = P.bottom - P.top;
  check(span / 6 > P.size * 0.5, 'the 10 has room for its centre pips');
}

// the deck: 52 distinct cards, 13 per suit, labels for every rank
check(SUITS.length === 4, 'four suits');
check(RANK_LABELS.length === 13, 'thirteen rank labels');
check(RANK_LABELS[0] === 'A' && RANK_LABELS[9] === '10' && RANK_LABELS[12] === 'K', 'rank labels in A..K order');
const cards = deck();
check(cards.length === 52, 'deck has 52 cards');
check(new Set(cards.map((c) => `${c.rank}${c.suit}`)).size === 52, 'deck cards are distinct');
for (const suit of SUITS) check(cards.filter((c) => c.suit === suit).length === 13, `13 cards of ${suit}`);
check(cards.every((c) => c.rank >= 0 && c.rank < 13 && SUITS.includes(c.suit)), 'every card has a valid rank and suit');
check(isRed('♥') && isRed('♦') && !isRed('♠') && !isRed('♣'), 'red suits');

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('cardArt tables ok: 52 cards, pips 2..10, both palettes');
