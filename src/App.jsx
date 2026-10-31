import { useEffect, useRef, useState } from 'react';
import { useStore, FLAGS } from './store.js';
import Scene from './scene/Scene.jsx';
import Overlay from './ui/Overlay.jsx';
import SetupScreen from './ui/SetupScreen.jsx';
import LoadingScreen from './ui/LoadingScreen.jsx';

// Thin shell. The loading screen covers the font wait (main.jsx flips `ready`) and, once a game is
// on, the table's first frame (WebGL context, shader compiles); under it sits the setup screen or
// the table (the 3D scene inside the HTML overlay). All state and pacing live in store.js.
//
// The loader stays up for LOADER_MIN at least (a fast machine must not flash it), never longer than
// SCENE_WAIT for the table's first frame (a background tab pauses the frame loop), and fades for
// LOADER_FADE before it unmounts.

const LOADER_FADE = 300; // matches .loading.is-leaving in styles.css
const LOADER_MIN = 250; // the least time the loader is up once it has shown
const SCENE_WAIT = 4000; // the most the loader waits for the table's first frame

// True while `on`, and for `ms` after it turns off, so the element can fade out before it unmounts.
function useLingering(on, ms) {
  const [shown, setShown] = useState(on);
  useEffect(() => {
    if (on) { setShown(true); return undefined; }
    const t = setTimeout(() => setShown(false), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return shown;
}

// `on`, but never for longer than `maxMs` in one stretch. A scene that cannot draw yet (a background
// tab pauses the frame loop) must not keep an opaque screen over the app for good.
function useCapped(on, maxMs) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!on) { setExpired(false); return undefined; }
    const t = setTimeout(() => setExpired(true), maxMs);
    return () => clearTimeout(t);
  }, [on, maxMs]);
  return on && !expired;
}

// `on`, held true until it has been on for at least `minMs` in one stretch.
function useMinimum(on, minMs) {
  const [held, setHeld] = useState(on);
  const since = useRef(on ? performance.now() : 0);
  useEffect(() => {
    if (on) { since.current = performance.now(); setHeld(true); return undefined; }
    const left = Math.max(0, minMs - (performance.now() - since.current));
    const t = setTimeout(() => setHeld(false), left);
    return () => clearTimeout(t);
  }, [on, minMs]);
  return on || held;
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const playing = useStore((s) => !!s.game);
  const sceneReady = useStore((s) => s.sceneReady);

  // ?auto=1 deals as soon as the fonts are in (handy for screenshots and testing).
  useEffect(() => {
    if (!ready || !FLAGS.auto) return;
    const st = useStore.getState();
    if (!st.game) st.startGame();
  }, [ready]);

  const sceneWait = useCapped(playing && !sceneReady, SCENE_WAIT);
  const loading = useMinimum(!ready || sceneWait, LOADER_MIN);
  const loader = useLingering(loading, LOADER_FADE);

  return (
    <>
      {loader && <LoadingScreen leaving={!loading} />}
      {ready && (playing ? <Overlay><Scene /></Overlay> : <SetupScreen />)}
    </>
  );
}
