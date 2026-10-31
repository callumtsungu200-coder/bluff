import { useSyncExternalStore } from 'react';

// True while the media query matches; re-renders on change. False where matchMedia is missing.
const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';

export default function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (!supported) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => (supported ? window.matchMedia(query).matches : false),
    () => false,
  );
}
