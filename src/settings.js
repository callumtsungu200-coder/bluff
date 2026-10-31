// Persisted settings, kept in localStorage under 'bluff-settings'.
//
//   getSettings()              { speed: 'normal' | 'fast', muted: bool } (same object until a change)
//   setSetting(key, value)     validated; unknown keys and bad values are ignored
//   toggleSetting(key)         for the boolean ones
//   resetSettings()
//   subscribe(fn)              fn runs after every change; returns an unsubscribe
//   useSettings()              React hook (useSyncExternalStore)
//   speedMultiplier()          1 for normal, 0.5 for fast
//   scaled(ms)                 ms * speedMultiplier(), rounded. Use it on BOT_THINK and friends.
//
// `muted` is mirrored into sound.setMuted on load and on every change, so the rest of the
// app only ever talks to settings.

import { useSyncExternalStore } from 'react';
import { setMuted } from './audio.js';

const KEY = 'bluff-settings';

export const SPEEDS = [
  { id: 'normal', label: 'Normal', multiplier: 1 },
  { id: 'fast', label: 'Fast', multiplier: 0.5 },
];

const DEFAULTS = Object.freeze({ speed: 'normal', muted: false });

const VALID = {
  speed: (v) => SPEEDS.some((s) => s.id === v),
  muted: (v) => typeof v === 'boolean',
};

const listeners = new Set();
let cached = null;

function read() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object') {
      for (const k of Object.keys(DEFAULTS)) if (VALID[k](p[k])) s[k] = p[k];
    }
  } catch {
    /* private mode or corrupt JSON: defaults */
  }
  return s;
}

function apply(next) {
  cached = next;
  setMuted(next.muted);
}

function write(next) {
  apply(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the session still uses the new value */
  }
  listeners.forEach((fn) => fn());
}

export function getSettings() {
  if (!cached) apply(read());
  return cached;
}

export function setSetting(key, value) {
  if (!VALID[key] || !VALID[key](value)) return getSettings();
  const s = getSettings();
  if (s[key] === value) return s;
  write({ ...s, [key]: value });
  return cached;
}

export function toggleSetting(key) {
  const s = getSettings();
  return typeof s[key] === 'boolean' ? setSetting(key, !s[key]) : s;
}

export function resetSettings() {
  write({ ...DEFAULTS });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

export function speedMultiplier() {
  const id = getSettings().speed;
  const s = SPEEDS.find((x) => x.id === id);
  return s ? s.multiplier : 1;
}

export const scaled = (ms) => Math.round(ms * speedMultiplier());

if (typeof window !== 'undefined') {
  // sync sound with the stored mute state straight away
  getSettings();
  // another tab changed a setting
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== KEY) return;
    apply(read());
    listeners.forEach((fn) => fn());
  });
}
