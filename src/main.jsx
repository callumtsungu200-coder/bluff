import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { useStore } from './store.js';
import { play as sfx } from './audio.js';
import './styles.css';

// Render at once: App shows the loading screen until the store says the fonts are ready.
// Canvas textures (card faces, the rank marker) draw text with the web fonts, so nothing that
// draws text mounts before they have arrived. A slow network must never block the app: 1.5s,
// then carry on anyway.
const FONTS = ['700 40px Outfit', '500 300px Outfit', '700 40px "Space Mono"', '400 20px Sora'];
const FONT_WAIT = 1500;

function fontsReady() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return Promise.resolve();
  const loads = Promise.allSettled(FONTS.map((f) => document.fonts.load(f)));
  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT));
  return Promise.race([loads, timeout]);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

const markReady = () => useStore.getState().setReady();
fontsReady().then(markReady, markReady);

// Every button press clicks, in one place rather than in every handler. The store's actions click
// too (they also run from the keyboard); audio.js drops a second 'click' within 20 ms, so a button
// that triggers one never clicks twice. Runs after React's own handler, so the sound toggle clicks
// when it unmutes and stays quiet when it mutes.
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest('button') : null;
  if (b && !b.disabled) sfx('click');
});
