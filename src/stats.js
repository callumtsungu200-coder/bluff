// Lifetime record, kept in localStorage under 'bluff-stats'.
//
//   getStats()                               current snapshot (same object until something changes)
//   recordGame({ won, id })                  call once when a game ends
//   recordCall({ youCalled, wasLie, id })    call once per reveal that involves you:
//                                              youCalled && wasLie    -> bluffsCaught
//                                              youCalled && !wasLie   -> badCalls (you picked up)
//                                              !youCalled && wasLie   -> timesCaught
//                                              !youCalled && !wasLie  -> survivedCalls (they picked up)
//   recordReveal(game, id)                   convenience: reads game.reveal, works out youCalled,
//                                            ignores bot-vs-bot calls
//   resetStats()
//   subscribe(fn)                            fn runs after every change; returns an unsubscribe
//   useStats()                               React hook (useSyncExternalStore)
//   winRate(stats), callAccuracy(stats)      derived ratios 0..1, null when there is no data
//
// `id` is optional. A call that repeats the previous id is ignored, which makes the record
// functions safe to call from effects that can run twice (StrictMode, HMR, a re-render).

import { useSyncExternalStore } from 'react';
import { HUMAN_ID } from './game.js';

const KEY = 'bluff-stats';

export const EMPTY_STATS = Object.freeze({
  games: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  bluffsCaught: 0,
  badCalls: 0,
  timesCaught: 0,
  survivedCalls: 0,
  lastPlayed: null,
});

const listeners = new Set();
let cached = null;
let lastGameId;
let lastCallId;

const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function read() {
  const s = { ...EMPTY_STATS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return s;
    for (const k of Object.keys(EMPTY_STATS)) {
      if (k === 'lastPlayed') s[k] = typeof p[k] === 'string' ? p[k] : null;
      else s[k] = num(p[k]);
    }
  } catch {
    /* private mode or corrupt JSON: start fresh */
  }
  return s;
}

function write(next) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the session still sees the new numbers */
  }
  listeners.forEach((fn) => fn());
}

export function getStats() {
  if (!cached) cached = read();
  return cached;
}

export function recordGame({ won, id } = {}) {
  if (id !== undefined && id === lastGameId) return getStats();
  lastGameId = id;
  const s = getStats();
  const streak = won ? s.streak + 1 : 0;
  write({
    ...s,
    games: s.games + 1,
    wins: s.wins + (won ? 1 : 0),
    losses: s.losses + (won ? 0 : 1),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    lastPlayed: new Date().toISOString(),
  });
  return cached;
}

export function recordCall({ youCalled, wasLie, id } = {}) {
  if (id !== undefined && id === lastCallId) return getStats();
  lastCallId = id;
  const s = getStats();
  const next = { ...s };
  if (youCalled) next[wasLie ? 'bluffsCaught' : 'badCalls'] += 1;
  else next[wasLie ? 'timesCaught' : 'survivedCalls'] += 1;
  write(next);
  return cached;
}

// Pass the game state while phase === 'reveal'. Bot-on-bot calls are not recorded.
export function recordReveal(game, id) {
  const r = game && game.reveal;
  if (!r) return getStats();
  const key = id === undefined ? `reveal-${game.turn}-${r.challengerId}-${r.playerId}` : id;
  if (r.challengerId === HUMAN_ID) return recordCall({ youCalled: true, wasLie: r.wasLie, id: key });
  if (r.playerId === HUMAN_ID) return recordCall({ youCalled: false, wasLie: r.wasLie, id: key });
  return getStats();
}

export function resetStats() {
  lastGameId = undefined;
  lastCallId = undefined;
  write({ ...EMPTY_STATS });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStats() {
  return useSyncExternalStore(subscribe, getStats, getStats);
}

export const winRate = (s = getStats()) => (s.games ? s.wins / s.games : null);
export const callAccuracy = (s = getStats()) => {
  const n = s.bluffsCaught + s.badCalls;
  return n ? s.bluffsCaught / n : null;
};

// another tab changed the record
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== KEY) return;
    cached = read();
    listeners.forEach((fn) => fn());
  });
}
