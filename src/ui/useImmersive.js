import { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { useFullscreen } from './SettingsMenu.jsx';

// The immersive (full-viewport) layout and the browser's Fullscreen API, kept in step: entering
// immersive asks for full screen where supported, leaving full screen (Esc) leaves the layout too.
// ?layout=full gives the layout without the API (screenshots, iOS).

export const fsElement = () => (typeof document === 'undefined' ? null : document.fullscreenElement || document.webkitFullscreenElement || null);

export default function useImmersive() {
  const immersive = useStore((s) => s.immersive);
  const setImmersive = useStore((s) => s.setImmersive);
  const fs = useFullscreen();

  const enter = () => {
    setImmersive(true);
    if (fs.supported && !fsElement()) fs.toggle();
  };
  const exit = () => {
    setImmersive(false);
    if (fsElement()) fs.toggle();
  };
  const toggle = () => (immersive ? exit() : enter());

  const wasFull = useRef(fs.fullscreen);
  useEffect(() => {
    if (wasFull.current && !fs.fullscreen) setImmersive(false);
    wasFull.current = fs.fullscreen;
  }, [fs.fullscreen, setImmersive]);

  return { immersive, enter, exit, toggle };
}
