// Rules tests for the pure game logic. Plain node, no extra packages:
//   node --test src/game.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMAN_ID, botChoosePlay, botPlay, botRespond, botShouldCall, callBluff, createDeck, finishReveal,
  newGame, passChallenge, playCards, publicView,
} from './game.js';

// Deterministic generator so every run deals the same hands.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hand-built state: you hold `mine`, Vega holds `theirs`, nothing on the pile.
function fixed(mine, theirs) {
  const s = newGame({ opponents: 1, rng: seeded(1) });
  s.players[0].hand = mine;
  s.players[1].hand = theirs;
  return s;
}
const card = (rank, suit = '♠') => ({ id: `${rank}${suit}`, rank, suit });

test('the deck has 52 distinct cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test('a new game deals every card exactly once', () => {
  for (const opponents of [1, 2, 3]) {
    const s = newGame({ opponents, rng: seeded(opponents) });
    assert.equal(s.players.length, opponents + 1);
    const dealt = s.players.flatMap((p) => p.hand.map((c) => c.id));
    assert.equal(new Set(dealt).size, 52);
    assert.equal(s.phase, 'play');
    assert.equal(s.rankIndex, 0, 'the game opens on Aces');
  }
});

test('playCards rejects out-of-turn and oversized plays', () => {
  const s = newGame({ opponents: 3, rng: seeded(7) });
  const mine = s.players[0].hand.map((c) => c.id);
  assert.throws(() => playCards(s, 'bot1', [s.players[1].hand[0].id]), /Not your turn/);
  assert.throws(() => playCards(s, HUMAN_ID, []), /1 to 4/);
  assert.throws(() => playCards(s, HUMAN_ID, mine.slice(0, 5)), /1 to 4/);
  assert.throws(() => playCards(s, HUMAN_ID, ['not-a-card']), /not in hand/);
});

test('state updates are immutable', () => {
  const s = fixed([card(0), card(5)], [card(1)]);
  const before = JSON.stringify(s);
  playCards(s, HUMAN_ID, ['0♠']);
  assert.equal(JSON.stringify(s), before);
});

test('calling a lie makes the liar pick up the pile', () => {
  let s = fixed([card(5), card(6)], [card(1), card(2)]);
  s = playCards(s, HUMAN_ID, ['5♠']); // claims an Ace, plays a Six
  assert.equal(s.phase, 'challenge');
  s = callBluff(s, 'bot1');
  assert.equal(s.reveal.wasLie, true);
  assert.equal(s.reveal.loserId, HUMAN_ID);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.pile.length, 0);
});

test('calling an honest play makes the challenger pick up the pile', () => {
  let s = fixed([card(0), card(6)], [card(1), card(2)]);
  s = playCards(s, HUMAN_ID, ['0♠']); // a real Ace
  s = callBluff(s, 'bot1');
  assert.equal(s.reveal.wasLie, false);
  assert.equal(s.players[1].hand.length, 3);
  s = finishReveal(s);
  assert.equal(s.phase, 'play');
  assert.equal(s.rankIndex, 1, 'the rank moves on to Twos');
  assert.equal(s.current, 1);
});

test('emptying your hand unchallenged wins', () => {
  let s = fixed([card(0)], [card(1), card(2)]);
  s = playCards(s, HUMAN_ID, ['0♠']);
  s = passChallenge(s, 'bot1');
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, HUMAN_ID);
});

test('emptying your hand with a lie that gets called does not win', () => {
  let s = fixed([card(4)], [card(1), card(2)]);
  s = playCards(s, HUMAN_ID, ['4♠']);
  s = finishReveal(callBluff(s, 'bot1'));
  assert.equal(s.winner, null);
  assert.equal(s.players[0].hand.length, 1);
});

test('publicView hides other hands and the pile contents', () => {
  const s = playCards(fixed([card(0), card(3)], [card(1), card(2)]), HUMAN_ID, ['3♠']);
  const view = publicView(s, 'bot1');
  assert.deepEqual(Object.keys(view.lastPlay).sort(), ['count', 'playerId', 'rank']);
  assert.equal(view.players[0].hand, undefined);
  assert.equal(view.players[0].handCount, 1);
  assert.equal(view.pileSize, 1);
});

test('bots always call a claim that is impossible from their own hand', () => {
  const s = fixed([card(0, '♠'), card(5)], [card(0, '♥'), card(0, '♦'), card(0, '♣'), card(2)]);
  const played = playCards(s, HUMAN_ID, ['0♠', '5♠']); // claims 2 Aces; Vega holds the other 3
  assert.equal(botShouldCall(publicView(played, 'bot1'), () => 0.99), true);
});

test('bots play real cards of the asked rank when they have them', () => {
  const s = fixed([card(1)], [card(0, '♥'), card(0, '♦'), card(7)]);
  s.current = 1;
  const play = botChoosePlay(publicView(s, 'bot1'), () => 0.99); // high roll: no extra bluff card
  assert.deepEqual(play.sort(), ['0♥', '0♦']);
});

test('a seeded all-bot game always finishes with one winner', () => {
  const rng = seeded(42);
  let s = newGame({ opponents: 3, rng });
  for (let steps = 0; s.phase !== 'over' && steps < 5000; steps++) {
    if (s.phase === 'play') {
      const id = s.players[s.current].id;
      s = id === HUMAN_ID ? playCards(s, id, [s.players[0].hand[0].id]) : botPlay(s, id, rng);
    } else if (s.phase === 'challenge') {
      const id = s.challengeQueue[0];
      s = id === HUMAN_ID ? passChallenge(s, id) : botRespond(s, id, rng);
    } else if (s.phase === 'reveal') {
      s = finishReveal(s);
    }
  }
  assert.equal(s.phase, 'over');
  assert.equal(s.players.find((p) => p.id === s.winner).hand.length, 0);
  assert.equal(s.players.reduce((n, p) => n + p.hand.length, 0) + s.pile.length, 52, 'no card is lost or duplicated');
});
