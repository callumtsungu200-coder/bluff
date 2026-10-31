// Pure game logic for Bluff (a.k.a. Cheat).
// No React, no DOM: every function takes a state and returns a new one,
// so this module can move to a Node server unchanged.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];

const RANK_NAMES = [
  ['Ace', 'Aces'], ['Two', 'Twos'], ['Three', 'Threes'], ['Four', 'Fours'],
  ['Five', 'Fives'], ['Six', 'Sixes'], ['Seven', 'Sevens'], ['Eight', 'Eights'],
  ['Nine', 'Nines'], ['Ten', 'Tens'], ['Jack', 'Jacks'], ['Queen', 'Queens'],
  ['King', 'Kings'],
];

export const PERSONALITIES = {
  // bluffExtra: chance to slip a fake card in with an honest play
  // doubleBluff: chance to bluff with 2 cards instead of 1
  // callBase: baseline chance to call bluff
  cautious: { label: 'Cautious', bluffExtra: 0.08, doubleBluff: 0.15, callBase: 0.05 },
  reckless: { label: 'Reckless', bluffExtra: 0.4, doubleBluff: 0.6, callBase: 0.22 },
  sly: { label: 'Sly', bluffExtra: 0.25, doubleBluff: 0.35, callBase: 0.12 },
};

export const BOT_ROSTER = [
  { name: 'Vega', personality: 'cautious' },
  { name: 'Orin', personality: 'reckless' },
  { name: 'Juno', personality: 'sly' },
];

export const HUMAN_ID = 'you';

/* ---------- helpers ---------- */

export function rankName(rank, count = 2) {
  return RANK_NAMES[rank][count === 1 ? 0 : 1];
}

export function claimText(count, rank) {
  return `${count} ${rankName(rank, count)}`;
}

export function createDeck() {
  const deck = [];
  for (let r = 0; r < 13; r++) {
    for (let s = 0; s < 4; s++) deck.push({ id: `${RANKS[r]}${SUITS[s]}`, rank: r, suit: SUITS[s] });
  }
  return deck;
}

export function shuffle(cards, rng = Math.random) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(hand) {
  return hand.slice().sort((a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

export function getPlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

export function currentPlayer(state) {
  return state.players[state.current];
}

function clone(state) {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    pile: state.pile.slice(),
    challengeQueue: state.challengeQueue.slice(),
    passed: state.passed.slice(),
    log: state.log.slice(),
  };
}

function addLog(s, text, kind = 'info') {
  s.logSeq += 1;
  s.log.push({ id: s.logSeq, text, kind });
}

function nameOf(s, id) {
  return getPlayer(s, id).name;
}

/* ---------- setup ---------- */

export function newGame({ opponents = 3, rng = Math.random } = {}) {
  const n = Math.max(1, Math.min(3, opponents));
  const players = [
    { id: HUMAN_ID, name: 'You', isHuman: true, personality: null, hand: [] },
    ...BOT_ROSTER.slice(0, n).map((b, i) => ({ id: `bot${i + 1}`, ...b, isHuman: false, hand: [] })),
  ];
  shuffle(createDeck(), rng).forEach((card, i) => players[i % players.length].hand.push(card));
  players.forEach((p) => { p.hand = sortHand(p.hand); });

  const s = {
    players,
    current: 0,
    rankIndex: 0,
    pile: [],
    lastPlay: null,
    phase: 'play', // play | challenge | reveal | over
    challengeQueue: [],
    passed: [],
    reveal: null,
    winner: null,
    turn: 1,
    status: 'Your move. Play Aces.',
    log: [],
    logSeq: 0,
  };
  addLog(s, `New game with ${n} opponent${n > 1 ? 's' : ''}. You lead with Aces.`, 'system');
  return s;
}

/* ---------- actions ---------- */

// Who gets the chance to call bluff, in order. The human (if not the one
// who played) is asked first; then the bots in seat order after the player.
function buildChallengeQueue(s, playerId) {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.id === playerId);
  const order = [];
  for (let k = 1; k < n; k++) order.push(s.players[(start + k) % n].id);
  const humanAt = order.indexOf(HUMAN_ID);
  if (humanAt > 0) order.unshift(order.splice(humanAt, 1)[0]);
  return order;
}

export function playCards(state, playerId, cardIds) {
  if (state.phase !== 'play') throw new Error('Not in play phase');
  if (currentPlayer(state).id !== playerId) throw new Error('Not your turn');
  if (!cardIds.length || cardIds.length > 4) throw new Error('Play 1 to 4 cards');

  const s = clone(state);
  const player = getPlayer(s, playerId);
  const cards = cardIds.map((id) => {
    const card = player.hand.find((c) => c.id === id);
    if (!card) throw new Error(`Card ${id} not in hand`);
    return card;
  });
  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  s.pile.push(...cards);
  s.lastPlay = { playerId, cards, rank: s.rankIndex, count: cards.length, turn: s.turn };
  s.phase = 'challenge';
  s.challengeQueue = buildChallengeQueue(s, playerId);
  s.passed = [];

  const claim = claimText(cards.length, s.rankIndex);
  const who = player.isHuman ? 'You' : player.name;
  s.status = `${who} ${player.isHuman ? 'claim' : 'claims'} ${claim}.`;
  addLog(s, `${who} played ${claim}.`, 'play');
  if (player.hand.length === 0) addLog(s, `${who} ${player.isHuman ? 'have' : 'has'} no cards left.`, 'system');
  return s;
}

export function passChallenge(state, playerId) {
  if (state.phase !== 'challenge') throw new Error('Not in challenge phase');
  if (state.challengeQueue[0] !== playerId) throw new Error('Not your call');
  const s = clone(state);
  s.challengeQueue.shift();
  s.passed.push(playerId);
  addLog(s, playerId === HUMAN_ID ? 'You let it go.' : nameOf(s, playerId) + ' let it go.', 'muted');
  if (s.challengeQueue.length === 0) return resolveUnchallenged(s);
  return s;
}

function resolveUnchallenged(s) {
  const player = getPlayer(s, s.lastPlay.playerId);
  addLog(s, 'No one called bluff.', 'muted');
  if (player.hand.length === 0) return endGame(s, player.id);
  return advance(s);
}

export function callBluff(state, challengerId) {
  if (state.phase !== 'challenge') throw new Error('Not in challenge phase');
  if (state.challengeQueue[0] !== challengerId) throw new Error('Not your call');

  const s = clone(state);
  const lp = s.lastPlay;
  const wasLie = lp.cards.some((c) => c.rank !== lp.rank);
  const loserId = wasLie ? lp.playerId : challengerId;
  const loser = getPlayer(s, loserId);
  const pileCount = s.pile.length;

  const pickedUp = s.pile.map((c) => c.id);
  loser.hand = sortHand(loser.hand.concat(s.pile));
  s.pile = [];
  s.challengeQueue = [];
  s.phase = 'reveal';
  s.reveal = { cards: lp.cards, rank: lp.rank, wasLie, challengerId, playerId: lp.playerId, loserId, pileCount, pickedUp };

  const challenger = nameOf(s, challengerId);
  const player = nameOf(s, lp.playerId);
  addLog(s, `${challenger} called bluff on ${player}.`, 'call');
  addLog(
    s,
    wasLie
      ? `BLUFF. ${player} ${lp.playerId === HUMAN_ID ? 'pick' : 'picks'} up ${pileCount} ${pileCount === 1 ? 'card' : 'cards'}.`
      : `HONEST. ${challenger} ${challengerId === HUMAN_ID ? 'pick' : 'picks'} up ${pileCount} ${pileCount === 1 ? 'card' : 'cards'}.`,
    wasLie ? 'bluff' : 'honest',
  );
  s.status = wasLie ? `Bluff! ${player} lied.` : `Honest! ${player} told the truth.`;
  return s;
}

export function finishReveal(state) {
  if (state.phase !== 'reveal') throw new Error('Not in reveal phase');
  const s = clone(state);
  const { wasLie, playerId } = s.reveal;
  s.reveal = null;
  if (!wasLie && getPlayer(s, playerId).hand.length === 0) return endGame(s, playerId);
  return advance(s);
}

export function advanceTurn(state) {
  return advance(clone(state));
}

function advance(s) {
  s.lastPlay = null;
  s.current = (s.current + 1) % s.players.length;
  s.rankIndex = (s.rankIndex + 1) % 13;
  s.turn += 1;
  s.phase = 'play';
  const p = currentPlayer(s);
  s.status = p.isHuman ? `Your move. Play ${rankName(s.rankIndex)}.` : `${p.name} to play ${rankName(s.rankIndex)}.`;
  return s;
}

function endGame(s, winnerId) {
  s.phase = 'over';
  s.winner = winnerId;
  s.challengeQueue = [];
  const w = getPlayer(s, winnerId);
  s.status = w.isHuman ? 'You emptied your hand. You win.' : `${w.name} emptied their hand and wins.`;
  addLog(s, w.isHuman ? 'You win the game.' : `${w.name} wins the game.`, 'system');
  return s;
}

/* ---------- bots ---------- */

// Everything a bot is allowed to know: its own hand plus public information.
// Other hands and the face-down pile cards are never exposed.
export function publicView(state, viewerId) {
  const me = getPlayer(state, viewerId);
  return {
    me: { id: me.id, hand: me.hand.slice(), personality: me.personality },
    players: state.players.map((p) => ({ id: p.id, name: p.name, handCount: p.hand.length })),
    myIndex: state.players.indexOf(me),
    rankIndex: state.rankIndex,
    pileSize: state.pile.length,
    lastPlay: state.lastPlay && {
      playerId: state.lastPlay.playerId,
      rank: state.lastPlay.rank,
      count: state.lastPlay.count,
    },
  };
}

// How many of my own turns until I'll be asked for this rank (bigger = needed less).
function turnsUntilNeeded(rank, rankIndex, playerCount) {
  for (let k = 1; k <= 13; k++) {
    if ((rankIndex + k * playerCount) % 13 === rank) return k;
  }
  return 13;
}

function leastNeeded(cards, view) {
  const n = view.players.length;
  return cards
    .slice()
    .sort((a, b) => turnsUntilNeeded(b.rank, view.rankIndex, n) - turnsUntilNeeded(a.rank, view.rankIndex, n));
}

export function botChoosePlay(view, rng = Math.random) {
  const pers = PERSONALITIES[view.me.personality] || PERSONALITIES.sly;
  const hand = view.me.hand;
  const matching = hand.filter((c) => c.rank === view.rankIndex).slice(0, 4);
  const others = hand.filter((c) => c.rank !== view.rankIndex);

  if (matching.length > 0) {
    const play = matching.map((c) => c.id);
    if (matching.length < 4 && others.length > 0 && rng() < pers.bluffExtra) {
      play.push(leastNeeded(others, view)[0].id);
    }
    return play;
  }

  const count = others.length >= 2 && rng() < pers.doubleBluff ? 2 : 1;
  return leastNeeded(others, view).slice(0, count).map((c) => c.id);
}

export function botShouldCall(view, rng = Math.random) {
  const lp = view.lastPlay;
  if (!lp || lp.playerId === view.me.id) return false;
  const pers = PERSONALITIES[view.me.personality] || PERSONALITIES.sly;
  const own = view.me.hand.filter((c) => c.rank === lp.rank).length;

  if (own + lp.count > 4) return true; // impossible claim

  const remaining = view.players.find((p) => p.id === lp.playerId).handCount;
  let p = pers.callBase;
  p += (lp.count - 1) * 0.1; // big claims are suspicious
  if (remaining === 0) p += 0.5; // they'd win
  else if (remaining <= 2) p += 0.2;
  else if (remaining <= 4) p += 0.08;
  p += own * 0.08; // I hold some of that rank
  p -= Math.min(0.35, view.pileSize * 0.02); // big pile = costly to be wrong
  p = Math.max(0.03, Math.min(0.95, p));
  return rng() < p;
}

export function botPlay(state, botId, rng = Math.random) {
  return playCards(state, botId, botChoosePlay(publicView(state, botId), rng));
}

export function botRespond(state, botId, rng = Math.random) {
  return botShouldCall(publicView(state, botId), rng) ? callBluff(state, botId) : passChallenge(state, botId);
}
