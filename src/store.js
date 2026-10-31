// The app's single store: game state, UI state, the bot scheduler and the card-flight bridge.
//
// State
//   game          game.js state, or null on the setup screen
//   opponents     1..3
//   theme         'classic' | 'future' (persisted in localStorage 'bluff-theme'; ?theme= overrides)
//   selected      card ids picked in your hand (max 4)
//   ghost         card ids hidden from the hand while they fly to the pile
//   busy          an animation is running; inputs wait (in the reveal phase it also fades the sheet out)
//   dealing       the deal is in progress
//   dealt         playerId -> cards dealt so far (only meaningful while dealing)
//   immersive     full-viewport layout (?layout=full, the F key, the full screen button)
//   logOpen       the log drawer (immersive layout only)
//   helpOpen      the How to play sheet
//   ready         the web fonts are in (or main.jsx stopped waiting); nothing renders before it
//   sceneReady    the 3D scene has drawn its first frame (reset on every new scene)
//                 App shows the loading screen until ready and, once a game is on, until sceneReady
//   reduceMotion  prefers-reduced-motion, or ?fast=1
//   revealStage   where the bluff reveal is, while game.phase is 'reveal' (null otherwise):
//                   'rise'     the played cards lift off the pile and turn face up (3D, Flights)
//                   'verdict'  the BLUFF / HONEST label is up over the table
//                   'wait'     the compact reveal panel is up; Continue (Enter) or 6 s moves on
//                   'sweep'    the pile is flying to whoever picks it up; finishReveal follows
//                 The sequence is run here (runReveal) so the scene and the HTML stay in step.
//   cameraNudge   0 or 1: the camera rig eases in toward the pile while it is 1 (the reveal)
//
// URL flags (FLAGS): ?auto=1 deals at once, &fast=1 skips flights, &theme=classic|future,
// &avatar=alt, &force=<mood>,<active>,<gesture> poses every bot, &layout=full, &bots=1..3 presets
// the opponent count (handy with auto=1 for screenshots of the 1 and 2 seat layouts), &pile=N
// starts the game with N cards already on the pile, taken from the bots' hands (debug: the stack),
// &reveal=bluff|honest[:rise|verdict|wait|run] fakes a reveal as soon as the deal is done (debug:
// Vega plays 3 cards, you call it) and holds the sequence with the cards risen but the verdict
// still secret (':rise'), at the verdict (default) or at the panel; ':run' lets it run through.
// &end=win|lose[:hold] ends the game as soon as the deal is done (debug: the light sweep or the dim
// and the Game over sheet; the record is not touched; ':hold' freezes the sweep or the dim midway
// and keeps the sheet away, for screenshots), &perf=1 shows the fps and draw call probe.
//
// Actions
//   setOpponents(n), setTheme(id), startGame(), toggleSelect(id), play(), callBluff(), letItGo(),
//   continueAfterReveal({ auto }?), backToSetup(), setImmersive(on), toggleLog(open?),
//   toggleHelp(open?), setReady(), setSceneReady(on), setFlyer(fn)
//   runReveal(n) is internal: onGameChange starts it once per reveal; continueAfterReveal only
//   works from the 'wait' stage.
//
// toggleSelect(id) returns true when the selection changed and false when the pick was refused
// (MAX_SELECT cards already chosen), so the hand can shake the card.
//
// The scene registers its imperative card animator with setFlyer(fn); fn(opts) returns a promise and
// takes { from, to, count, faces, duration, stagger, arc, vanish } where from/to are anchors:
//   { type: 'deck' } | { type: 'pile', base } | { type: 'seat', index, count } | { type: 'hand' } |
//   { type: 'handCard', indices }
// (`vanish`, with a pile `from`: that many more pile cards disappear under the last card to leave)
// or, for the reveal, { kind: 'reveal', cards, base, duration, stagger }: the real cards at pile
// slots base.. rise off the pile and turn face up, and stay there until the next flight from the
// pile (the pickup sweep) carries them off. Without a flyer flights resolve at once, so the game
// still runs; with reduceMotion only the reveal is sent (the scene snaps the cards face up).
//
// Bots are driven by a scheduler that re-arms after every relevant state change (and on a speed
// change), so React only renders state. Sounds and the lifetime record are produced here, once per
// event, keyed by game number and turn: 'deal' per dealt card, 'slide' per play (yours and the
// bots'), 'select' per pick, 'flip' per revealed card, 'stamp' then 'bluff' or 'honest' at the
// verdict, 'pickup' for the sweep, 'turn' when a move is yours, 'win' or 'lose' at the end and
// 'click' for the actions (main.jsx adds the same click to every button press).

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  HUMAN_ID, newGame, playCards, callBluff as ruleCallBluff, passChallenge, finishReveal,
  botPlay, botRespond, currentPlayer, getPlayer, claimText, sortHand,
} from './game.js';
import { play as sfx } from './audio.js';
import { recordGame, recordReveal } from './stats.js';
import { getSettings, scaled, subscribe as onSettingsChange } from './settings.js';

/* ---------- URL flags ---------- */

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const prefersReducedMotion = typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function parseForce(v) {
  if (!v) return null;
  const [mood, active, gesture] = v.split(',');
  return { mood: mood || null, active: active === '1', gesture: gesture || null };
}

// &reveal=bluff|honest[:rise|verdict|wait|run]
function parseReveal(v) {
  if (!v) return null;
  const [kind, hold = 'verdict'] = v.split(':');
  if (kind !== 'bluff' && kind !== 'honest') return null;
  return { kind, hold: hold === 'rise' || hold === 'wait' || hold === 'run' ? hold : 'verdict' };
}

// &end=win|lose[:hold]
function parseEnd(v) {
  if (!v) return null;
  const [kind, hold] = v.split(':');
  if (kind !== 'win' && kind !== 'lose') return null;
  return { kind, hold: hold === 'hold' };
}

export const FLAGS = Object.freeze({
  auto: !!params.get('auto'), // deal straight away
  fast: !!params.get('fast'), // skip card flights, snap transitions
  alt: params.get('avatar') === 'alt', // the alternative character design
  layoutFull: params.get('layout') === 'full', // immersive layout without the Fullscreen API
  force: parseForce(params.get('force')), // pose every bot: mood,active,gesture
  bots: Math.min(3, Math.max(0, Number(params.get('bots')) || 0)), // ?bots=1..3 presets the opponent count
  pile: Math.min(39, Math.max(0, Number(params.get('pile')) || 0)), // ?pile=N starts with N bot cards on the pile (debug)
  reveal: parseReveal(params.get('reveal')), // &reveal=bluff|honest[:rise|verdict|wait|run] fakes a reveal after the deal (debug)
  end: parseEnd(params.get('end')), // &end=win|lose[:hold] ends the game after the deal (debug)
  perf: !!params.get('perf'), // &perf=1 shows the fps and draw call probe over the stage
});

// The scene modules read these at render time.
if (typeof window !== 'undefined') {
  if (FLAGS.alt) window.__AVATAR_ALT = true;
  if (FLAGS.fast) window.__BLUFF_FAST = true;
  if (FLAGS.force) window.__AVATAR_FORCE = FLAGS.force;
}

const THEME_KEY = 'bluff-theme';
const isTheme = (t) => t === 'classic' || t === 'future';

function initialTheme() {
  const q = params.get('theme');
  if (isTheme(q)) return q;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (isTheme(saved)) return saved;
  } catch { /* private mode */ }
  return 'classic';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
}

// ?pile=N (debug): move N cards from the bots' hands onto the pile before the deal, so the stack can
// be looked at without playing N cards. Cards stay conserved; the deal simply hands the bots fewer.
function seedPile(game, n) {
  if (!n) return game;
  const s = { ...game, players: game.players.map((p) => ({ ...p, hand: p.hand.slice() })), pile: game.pile.slice() };
  const bots = s.players.filter((p) => !p.isHuman);
  for (let i = 0; i < n; i++) {
    const b = bots[i % bots.length];
    if (!b.hand.length) break;
    s.pile.push(b.hand.pop());
  }
  return s;
}

// &reveal=bluff|honest (debug): right after the deal, hand Vega the cards it needs (gathered from
// the other hands), put a few more cards on the pile, have Vega play 3 as the rank in play and you
// call bluff, all through the real rules, so the reveal sequence can be looked at without playing
// up to it. Cards stay conserved.
function fakeReveal(game, kind) {
  const s = { ...game, players: game.players.map((p) => ({ ...p, hand: p.hand.slice() })), pile: game.pile.slice() };
  const bot = s.players[1];
  const rank = s.rankIndex;
  const others = [...s.players.filter((p) => p !== bot && !p.isHuman), s.players[0], bot];
  const take = (pred, n) => {
    const out = [];
    for (const p of others) {
      for (let i = p.hand.length - 1; i >= 0 && out.length < n; i--) {
        if (pred(p.hand[i])) out.push(...p.hand.splice(i, 1));
      }
    }
    return out;
  };
  const played = kind === 'honest'
    ? take((c) => c.rank === rank, 3)
    : [...take((c) => c.rank === rank, 2), ...take((c) => c.rank === 12, 1)];
  s.pile.push(...take(() => true, 7));
  bot.hand = sortHand(bot.hand.concat(played));
  s.current = s.players.indexOf(bot);
  try {
    return ruleCallBluff(playCards(s, bot.id, played.map((c) => c.id)), HUMAN_ID);
  } catch {
    return game;
  }
}

// &end=win|lose (debug): right after the deal, the game is over, won by you or by Vega, so the end
// of a game (the light sweep or the dim, then the Game over sheet) can be looked at without playing
// one out. Hands are left as dealt (nothing else reads them once the game is over).
function fakeEnd(game, kind) {
  const winner = kind === 'win' ? getPlayer(game, HUMAN_ID) : game.players[1];
  const seq = game.logSeq + 1;
  return {
    ...game,
    phase: 'over',
    winner: winner.id,
    challengeQueue: [],
    status: winner.isHuman ? 'You emptied your hand. You win.' : `${winner.name} emptied their hand and wins.`,
    logSeq: seq,
    log: [...game.log, { id: seq, text: winner.isHuman ? 'You win the game.' : `${winner.name} wins the game.`, kind: 'system' }],
  };
}

/* ---------- selection ---------- */

export const MAX_SELECT = 4; // the rules allow 1 to 4 cards per play

/* ---------- pacing ---------- */

// Slow enough to read each step; scaled() halves them on the Fast setting.
export const BOT_THINK = 1100;
export const BOT_CALL_DELAY = 1200;
export const DEAL_STAGGER = 70;
export const DEAL_FLIGHT = 340;
export const PLAY_FLIGHT = 620;
export const BOT_FLIGHT = 560;
export const PICKUP_FLIGHT = 480;
export const SWEEP_MAX = 16; // cards that fly in the pickup sweep (the pile's drawn depth, Pile.jsx PILE_SHOWN); the rest vanish under them

// The reveal (runReveal). The played cards rise off the pile one every REVEAL_STAGGER ms, each turn
// taking REVEAL_FLIP; after a short beat the verdict label is up for VERDICT_HOLD (its CSS glitch,
// hold and fade are timed to this, styles.css .verdict-label); then the panel waits REVEAL_AUTO for
// Continue before moving on by itself. Reduced motion snaps the rise and shortens the holds.
export const REVEAL_STAGGER = 120;
export const REVEAL_FLIP = 450;
export const REVEAL_BEAT = 150;
export const VERDICT_HOLD = 1400;
export const VERDICT_HOLD_QUIET = 700;
export const REVEAL_AUTO = 6000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Apply a game action; if it no longer fits the state (e.g. a stale timer), keep the state.
const safe = (fn) => (g) => {
  try {
    return fn(g);
  } catch {
    return g;
  }
};

/* ---------- derived helpers (pure, take the store state or a game) ---------- */

export const selCurrent = (s) => (s.game ? currentPlayer(s.game) : null);
export const selMyTurn = (s) => !!s.game && s.game.phase === 'play' && currentPlayer(s.game).isHuman && !s.busy && !s.dealing;
export const selMyCall = (s) => !!s.game && s.game.phase === 'challenge' && s.game.challengeQueue[0] === HUMAN_ID;
export const selInReveal = (s) => !!s.game && s.game.phase === 'reveal';
export const selDeciding = (s) => (s.game && s.game.phase === 'challenge' ? s.game.challengeQueue[0] : null);
export const selRelevantRank = (s) => {
  const g = s.game;
  if (!g) return 0;
  return selMyCall(s) || g.phase === 'reveal' ? g.lastPlay.rank : g.rankIndex;
};
export const selRealCount = (s) => {
  const g = s.game;
  if (!g) return 0;
  const rank = selRelevantRank(s);
  return getPlayer(g, HUMAN_ID).hand.filter((c) => c.rank === rank).length;
};
export const selBots = (g) => (g ? g.players.filter((p) => !p.isHuman) : []);

// During the reveal the pile is still on the table, so hands show as they were before the pickup.
export function shownHand(s) {
  const g = s.game;
  if (!g) return [];
  const me = getPlayer(g, HUMAN_ID);
  if (g.phase === 'reveal' && g.reveal.loserId === HUMAN_ID) return me.hand.filter((c) => !g.reveal.pickedUp.includes(c.id));
  return me.hand;
}
export function seatCount(s, p) {
  const g = s.game;
  if (s.dealing) return s.dealt[p.id] || 0;
  if (g.phase === 'reveal' && g.reveal.loserId === p.id) return p.hand.length - g.reveal.pickedUp.length;
  return p.hand.length;
}
export function seatActive(s, p) {
  const g = s.game;
  return !s.dealing && ((g.phase === 'play' && currentPlayer(g).id === p.id) || selDeciding(s) === p.id);
}
export function seatTag(s, p) {
  const g = s.game;
  if (selDeciding(s) === p.id) return 'Deciding';
  if (g.phase === 'play' && currentPlayer(g).id === p.id && !s.dealing) return 'Playing';
  return null;
}
export function seatMood(s, p) {
  const b = bubbleFor(s.game, p);
  if (b && b.tone === 'call') return 'grin';
  const g = s.game;
  if (selDeciding(s) === p.id || (g.phase === 'play' && currentPlayer(g).id === p.id)) return 'think';
  return 'smile';
}
export function deckSize(s) {
  if (!s.dealing) return 0;
  let total = 0;
  for (const k of Object.keys(s.dealt)) total += s.dealt[k];
  return 52 - total;
}
export function shownPile(s) {
  const g = s.game;
  if (!g) return 0;
  return g.phase === 'reveal' ? g.reveal.pileCount : g.pile.length;
}
export const handVisible = (s) => (s.dealing ? (s.dealt[HUMAN_ID] || 0) : Infinity);

// Speech bubble for a bot, derived purely from the game state.
export function bubbleFor(game, p) {
  const lp = game.lastPlay;
  if (game.phase === 'challenge' || game.phase === 'reveal') {
    if (lp && lp.playerId === p.id) return { key: `claim${lp.turn}`, tone: 'claim', text: claimText(lp.count, lp.rank) };
    if (game.phase === 'reveal' && game.reveal.challengerId === p.id) return { key: `call${game.turn}`, tone: 'call', text: 'Bluff!' };
    if (game.passed.includes(p.id)) return { key: `pass${lp.turn}`, tone: 'pass', text: 'Let it go' };
  }
  return null;
}

// What a bot just did, for the avatar's gesture animation. The key changes per event. The loser
// only reacts once the verdict is out (`stage` is the store's revealStage), not while the cards
// are still turning over.
export function gestureFor(game, p, stage = 'verdict') {
  const lp = game.lastPlay;
  if (game.phase === 'reveal') {
    if (game.reveal.challengerId === p.id) return { type: 'call', key: `call${game.turn}` };
    if (game.reveal.loserId === p.id && stage !== 'rise') return { type: 'lose', key: `lose${game.turn}` };
  }
  if ((game.phase === 'challenge' || game.phase === 'reveal') && lp && lp.playerId === p.id) return { type: 'play', key: `play${lp.turn}` };
  if (game.phase === 'challenge' && game.passed.includes(p.id)) return { type: 'pass', key: `pass${lp.turn}` };
  if (game.phase === 'over' && game.winner === p.id) return { type: 'win', key: 'win' };
  return null;
}

// Flight anchor for a player's cards: your hand, or a bot's seat.
export function anchorFor(game, playerId) {
  if (playerId === HUMAN_ID) return { type: 'hand' };
  const bots = selBots(game);
  return { type: 'seat', index: bots.findIndex((p) => p.id === playerId), count: bots.length };
}

/* ---------- the store ---------- */

let flyer = null; // the scene's animator, see setFlyer
let gameNo = 0; // counts games this session: stale async work and the record both key off it
let timer = null; // the pending bot action

const fly = (opts) => {
  if (!flyer) return Promise.resolve();
  // Reduced motion skips every flight but the reveal, which the scene snaps (the cards must show).
  if (useStore.getState().reduceMotion && opts.kind !== 'reveal') return Promise.resolve();
  try {
    return Promise.resolve(flyer(opts));
  } catch {
    return Promise.resolve();
  }
};

export const useStore = create(subscribeWithSelector((set, get) => {
  const setGame = (fn) => {
    const g = get().game;
    if (!g) return;
    const next = safe(fn)(g);
    if (next !== g) set({ game: next });
  };

  // Dealing: one card at a time from the deck, round the table.
  async function runDeal(n) {
    await wait(250);
    if (gameNo !== n) return;
    const game = get().game;
    const players = game.players;
    const perPlayer = players[0].hand.length;
    const quick = get().reduceMotion;
    const flights = [];
    for (let r = 0; r < perPlayer; r++) {
      for (let i = 0; i < players.length; i++) {
        if (gameNo !== n) return;
        const p = players[i];
        if (r >= p.hand.length) continue;
        if (!quick) sfx('deal', { volume: 0.7 });
        // Your cards land on the slot they will show in (card r of the sorted hand); a bot's land at
        // its fan centre, where the fan grows a card from.
        const to = p.isHuman ? { type: 'handCard', indices: [r] } : anchorFor(game, p.id);
        flights.push(
          fly({ from: { type: 'deck' }, to, count: 1, duration: scaled(DEAL_FLIGHT), arc: 0.5 })
            .then(() => {
              if (gameNo === n) set((s) => ({ dealt: { ...s.dealt, [p.id]: (s.dealt[p.id] || 0) + 1 } }));
            }),
        );
        await wait(quick ? 0 : scaled(DEAL_STAGGER));
      }
    }
    await Promise.all(flights);
    if (gameNo !== n) return;
    await wait(200);
    if (gameNo !== n) return;
    set({ dealing: false });
    // &reveal=bluff|honest and &end=win|lose (debug): straight into a reveal or the end, see fakeReveal and fakeEnd.
    if (FLAGS.end) setGame((g) => fakeEnd(g, FLAGS.end.kind));
    else if (FLAGS.reveal) setGame((g) => fakeReveal(g, FLAGS.reveal.kind));
  }

  // The reveal sequence, started once per reveal by onGameChange when the phase turns to 'reveal'.
  // Stages drive the scene (Flights, CameraRig) and the HTML (Overlay) alike; see revealStage.
  async function runReveal(n) {
    const g = get().game;
    if (!g || g.phase !== 'reveal') return;
    const r = g.reveal;
    const k = r.cards.length;
    const quick = get().reduceMotion;
    const hold = FLAGS.reveal ? FLAGS.reveal.hold : null;
    const live = () => gameNo === n && get().game === g;

    set({ revealStage: 'rise', cameraNudge: quick ? 0 : 1 });
    if (!quick) r.cards.forEach((_, i) => sfx('flip', { delay: (i * scaled(REVEAL_STAGGER)) / 1000 }));
    else sfx('flip');
    await fly({ kind: 'reveal', cards: r.cards, base: r.pileCount - k, duration: scaled(REVEAL_FLIP), stagger: scaled(REVEAL_STAGGER) });
    if (!live()) return;
    if (hold === 'rise') return; // debug: cards up, verdict still secret
    await wait(quick ? 0 : scaled(REVEAL_BEAT));
    if (!live()) return;

    set({ revealStage: 'verdict' });
    sfx('stamp');
    sfx(r.wasLie ? 'bluff' : 'honest', { delay: 0.25 });
    if (hold === 'verdict') return;
    await wait(quick ? VERDICT_HOLD_QUIET : scaled(VERDICT_HOLD));
    if (!live()) return;

    set({ revealStage: 'wait' });
  }

  return {
    game: null,
    opponents: FLAGS.bots || 3,
    theme: initialTheme(),
    selected: [],
    ghost: [],
    busy: false,
    dealing: false,
    dealt: {},
    immersive: FLAGS.layoutFull,
    logOpen: false,
    helpOpen: false,
    ready: false,
    sceneReady: false,
    reduceMotion: FLAGS.fast || prefersReducedMotion,
    revealStage: null,
    cameraNudge: 0,

    setOpponents: (n) => set({ opponents: Math.min(3, Math.max(1, Math.round(n) || 1)) }),

    setTheme: (theme) => {
      if (!isTheme(theme) || theme === get().theme) return;
      applyTheme(theme);
      set({ theme });
    },

    startGame: () => {
      sfx('click');
      gameNo += 1;
      cancelTimer();
      set({
        game: seedPile(newGame({ opponents: get().opponents }), FLAGS.pile),
        selected: [], ghost: [], busy: false, dealt: {}, dealing: true, helpOpen: false,
        revealStage: null, cameraNudge: 0,
      });
      runDeal(gameNo);
    },

    toggleSelect: (id) => {
      const s = get();
      if (!s.game) return false;
      const sel = s.selected;
      if (sel.includes(id)) {
        sfx('select');
        set({ selected: sel.filter((x) => x !== id) });
        return true;
      }
      if (sel.length >= MAX_SELECT) return false; // the hand shakes the card instead
      sfx('select');
      set({ selected: [...sel, id] });
      return true;
    },

    play: async () => {
      const s = get();
      if (!selMyTurn(s)) return;
      const me = getPlayer(s.game, HUMAN_ID);
      const ids = s.selected.filter((id) => me.hand.some((c) => c.id === id));
      if (!ids.length) return;
      const n = gameNo;
      set({ busy: true, ghost: ids });
      sfx('click');
      sfx('slide', { delay: 0.05 });
      const faces = ids.map((id) => me.hand.find((c) => c.id === id));
      const indices = ids.map((id) => me.hand.findIndex((c) => c.id === id));
      await fly({ from: { type: 'handCard', indices }, to: { type: 'pile', base: s.game.pile.length }, count: ids.length, faces, arc: 1.1, duration: scaled(PLAY_FLIGHT) });
      if (gameNo !== n) return;
      set({ selected: [], ghost: [], game: safe((g) => playCards(g, HUMAN_ID, ids))(get().game), busy: false });
    },

    callBluff: () => {
      const s = get();
      if (s.busy || !selMyCall(s)) return;
      sfx('click');
      setGame((g) => ruleCallBluff(g, HUMAN_ID));
    },

    letItGo: () => {
      const s = get();
      if (s.busy || !selMyCall(s)) return;
      sfx('pass');
      setGame((g) => passChallenge(g, HUMAN_ID));
    },

    // Continue (the panel's button, Enter, or the panel's own 6 s timer, which passes { auto: true }
    // and gets no click sound): the whole pile, the revealed cards on top, sweeps to whoever picks it
    // up, then the game moves on. The top SWEEP_MAX cards fly; the pile drops the rest under the
    // last of them (the flight's `vanish`), so nothing is left to pop when the state catches up.
    // Only from the 'wait' stage, so the verdict is never skipped and the sweep never runs twice.
    continueAfterReveal: async (opts) => {
      const s = get();
      const g = s.game;
      if (!g || g.phase !== 'reveal' || s.revealStage !== 'wait') return;
      const n = gameNo;
      const r = g.reveal;
      set({ revealStage: 'sweep', cameraNudge: 0 });
      if (!(opts && opts.auto)) sfx('click');
      sfx('pickup', { delay: 0.1 });
      const count = Math.min(r.pileCount, SWEEP_MAX);
      await fly({ from: { type: 'pile', base: r.pileCount - count }, to: anchorFor(g, r.loserId), count, vanish: r.pileCount - count, duration: scaled(PICKUP_FLIGHT), stagger: scaled(40), arc: 0.6 });
      if (gameNo !== n || get().game !== g) return;
      set({ game: safe(finishReveal)(g), revealStage: null });
    },

    backToSetup: () => {
      sfx('click');
      gameNo += 1;
      cancelTimer();
      set({ game: null, logOpen: false, helpOpen: false, selected: [], ghost: [], busy: false, dealing: false, dealt: {}, sceneReady: false, revealStage: null, cameraNudge: 0 });
    },

    setImmersive: (on) => set(on ? { immersive: true } : { immersive: false, logOpen: false }),
    toggleLog: (open) => set((s) => ({ logOpen: open === undefined ? !s.logOpen : !!open })),
    toggleHelp: (open) => set((s) => ({ helpOpen: open === undefined ? !s.helpOpen : !!open })),
    setReady: () => { if (!get().ready) set({ ready: true }); },
    setSceneReady: (on = true) => {
      const s = get();
      if (on && !s.sceneReady) set({ sceneReady: true });
      else if (!on && s.sceneReady) set({ sceneReady: false });
    },
    setFlyer: (fn) => { flyer = typeof fn === 'function' ? fn : null; },
    runReveal,
  };
}));

applyTheme(useStore.getState().theme);

/* ---------- the bot scheduler and the cues ---------- */

function cancelTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function botTurn(id, n) {
  const s = useStore.getState();
  const g = s.game;
  if (!g || gameNo !== n || s.busy || s.dealing) return;
  const next = safe((x) => botPlay(x, id))(g);
  if (next === g) return;
  useStore.setState({ busy: true });
  sfx('slide');
  await fly({ from: anchorFor(g, id), to: { type: 'pile', base: g.pile.length }, count: next.lastPlay.count, duration: scaled(BOT_FLIGHT), arc: 0.9 });
  if (gameNo !== n) return;
  if (useStore.getState().game !== g) { useStore.setState({ busy: false }); return; }
  useStore.setState({ game: next, busy: false });
}

// Arms the next bot action for the current state (and drops any pending one).
function schedule() {
  cancelTimer();
  const s = useStore.getState();
  const { game, busy, dealing } = s;
  if (!game || busy || dealing) return;
  const n = gameNo;
  if (game.phase === 'play' && !currentPlayer(game).isHuman) {
    const id = currentPlayer(game).id;
    timer = setTimeout(() => { timer = null; botTurn(id, n); }, scaled(BOT_THINK));
  } else if (game.phase === 'challenge' && game.challengeQueue[0] !== HUMAN_ID) {
    const id = game.challengeQueue[0];
    timer = setTimeout(() => {
      timer = null;
      if (gameNo !== n) return;
      const g = useStore.getState().game;
      if (!g) return;
      const next = safe((x) => botRespond(x, id))(g);
      if (next !== g) useStore.setState({ game: next });
    }, scaled(BOT_CALL_DELAY));
  }
}

let wasMine = false;
let lastRevealKey = null;
let lastOverKey = null;

// Runs once per change of (game, busy, dealing): sounds, the record, then the next bot action.
function onGameChange() {
  const s = useStore.getState();
  const g = s.game;

  const mine = selMyTurn(s) || selMyCall(s);
  if (mine && !wasMine) sfx('turn');
  wasMine = mine;

  // A new reveal: the record once, then the sequence (which plays the flips, the stamp and the
  // sting or chime as it goes).
  if (g && g.phase === 'reveal') {
    const key = `reveal-${gameNo}-${g.turn}`;
    if (key !== lastRevealKey) {
      lastRevealKey = key;
      recordReveal(g, key);
      s.runReveal(gameNo);
    }
  }

  if (g && g.phase === 'over') {
    const key = `game-${gameNo}`;
    if (key !== lastOverKey) {
      lastOverKey = key;
      const won = g.winner === HUMAN_ID;
      if (!FLAGS.end) recordGame({ won, id: key }); // a faked end (debug) stays out of the record
      sfx(won ? 'win' : 'lose', { delay: 0.15 });
    }
  }

  schedule();
}

useStore.subscribe(
  (s) => [s.game, s.busy, s.dealing],
  onGameChange,
  { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] },
);

// A speed change re-arms the pending bot action at the new pace.
let lastSpeed = getSettings().speed;
onSettingsChange(() => {
  const speed = getSettings().speed;
  if (speed !== lastSpeed) {
    lastSpeed = speed;
    schedule();
  }
});

export default useStore;
