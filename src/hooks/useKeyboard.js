// Global keyboard shortcuts.
//
//   useKeyboard(map, enabled = true)
//     map: { Enter: fn, b: fn, l: fn, f: fn, m: fn, Escape: fn, Space: fn, '?': fn, ... }
//     Letters are case-insensitive (write them either way). Handlers get the KeyboardEvent.
//     Ignored: key repeats, events from inputs / textareas / selects / contenteditable,
//     Ctrl / Alt / Meta held, Shift held with a letter, and Enter / Space while a button or
//     link has focus (the browser already activates it, firing twice would be a bug).
//     A matched key is preventDefault-ed. Pass enabled = false to switch the hook off
//     (for example while a menu or a sheet is open).
//
//   SHORTCUTS: the list the settings menu prints. One source of truth for the hints.

import { useEffect, useRef } from 'react';

export const SHORTCUTS = [
  { key: 'Enter', label: 'Play cards, or continue' },
  { key: 'B', label: 'Call bluff' },
  { key: 'L', label: 'Let it go' },
  { key: 'F', label: 'Full screen' },
  { key: 'M', label: 'Mute' },
];

const EDITABLE = /^(input|textarea|select)$/i;
const ACTIVATES = /^(button|a|summary)$/i;

const norm = (k) => (k === ' ' || k === 'Spacebar' ? 'Space' : k.length === 1 ? k.toLowerCase() : k);

function lookup(map, key) {
  if (!map) return undefined;
  for (const k of Object.keys(map)) if (norm(k) === key) return map[k];
  return undefined;
}

export default function useKeyboard(map, enabled = true) {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = norm(e.key);
      if (e.shiftKey && /^[a-z]$/.test(key)) return;
      const t = e.target;
      if (t && t.tagName && (EDITABLE.test(t.tagName) || t.isContentEditable)) return;
      if ((key === 'Enter' || key === 'Space') && t && t.tagName && ACTIVATES.test(t.tagName)) return;
      const fn = lookup(ref.current, key);
      if (typeof fn !== 'function') return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
