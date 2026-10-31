import { Suspense, lazy, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HUMAN_ID } from '../game.js';
import { THEME, disposeThemeTextures } from './textures.js';
import { disposeAvatarFaces } from './avatarFaces.js';
import { CAMERA } from './layout.js';
import CameraRig from './CameraRig.jsx';
import Lights from './Lights.jsx';
import Table from './Table.jsx';
import RankHologram from './RankHologram.jsx';
import Pile, { PILE_LABEL_ANCHOR } from './Pile.jsx';
import OpponentSeat, { SeatPlate } from './OpponentSeat.jsx';
import Hand from './Hand.jsx';
import Flights from './Flights.jsx';
import Celebration from './Celebration.jsx';
import { Label, LabelTracker, OVERLAY_STYLE } from './Labels.jsx';
import {
  useStore, FLAGS, selBots, selMyTurn, selRelevantRank, shownHand, seatCount, seatActive, seatTag, seatMood,
  deckSize, shownPile, handVisible, bubbleFor, gestureFor,
} from '../store.js';

// The 3D table. Reads the store and renders it; the only way back is toggleSelect from the hand and
// the flight animator (Flights) that the store awaits.

// The bloom (and with it the whole post-processing stack) is a separate chunk that only the
// Futuristic look with motion on ever downloads.
const Effects = lazy(() => import('./Effects.jsx'));

// Marks the scene ready once a frame has actually been drawn (the second frame callback runs after
// the first frame has been presented).
function FirstFrame() {
  const setSceneReady = useStore((s) => s.setSceneReady);
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current > 1) return;
    frames.current += 1;
    if (frames.current === 2) setSceneReady(true);
  });
  useEffect(() => () => setSceneReady(false), [setSceneReady]);
  return null;
}

// &perf=1: frames per second, draw calls and triangles per frame, textures and programs alive,
// written into `el` twice a second. The renderer's counters are read before each frame renders
// (so they hold the whole previous frame, every pass of the composer included) and reset here.
function PerfProbe({ el }) {
  const { gl } = useThree();
  const acc = useRef({ frames: 0, calls: 0, tris: 0, t0: performance.now() });
  useEffect(() => {
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = true; };
  }, [gl]);
  useFrame(() => {
    const a = acc.current;
    a.frames += 1;
    a.calls += gl.info.render.calls;
    a.tris += gl.info.render.triangles;
    gl.info.reset();
    const now = performance.now();
    if (now - a.t0 < 500) return;
    const fps = Math.round((a.frames * 1000) / (now - a.t0));
    const node = el.current;
    if (node) {
      node.textContent = `${fps} fps · ${Math.round(a.calls / a.frames)} calls · ${Math.round(a.tris / a.frames / 1000)}k tris · ${gl.info.memory.textures} tex · ${gl.info.programs.length} prog`;
    }
    a.frames = 0; a.calls = 0; a.tris = 0; a.t0 = now;
  });
  return null;
}

export default function Scene() {
  const game = useStore((s) => s.game);
  const theme = useStore((s) => s.theme);
  const dealing = useStore((s) => s.dealing);
  const dealt = useStore((s) => s.dealt);
  const busy = useStore((s) => s.busy);
  const selected = useStore((s) => s.selected);
  const ghost = useStore((s) => s.ghost);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const sceneReady = useStore((s) => s.sceneReady);
  const revealStage = useStore((s) => s.revealStage);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const labels = useMemo(() => new Set(), []);
  const perfEl = useRef(null);

  // Switching the look frees the GPU copies of the textures the other look drew (card faces, rank
  // markers, painted faces); they come back from their canvases if it is switched again.
  const lastTheme = useRef(theme);
  useEffect(() => {
    const prev = lastTheme.current;
    lastTheme.current = theme;
    if (prev !== theme) { disposeThemeTextures(prev); disposeAvatarFaces(prev); }
  }, [theme]);

  if (!game) return null;
  const s = { game, dealing, dealt, busy };
  const T = THEME[theme];
  const future = theme === 'future';
  const bots = selBots(game);
  const hand = shownHand(s);
  const pile = shownPile(s);
  const myTurn = selMyTurn(s);
  const over = game.phase === 'over';

  return (
    <div className={`stage ${sceneReady ? 'is-ready' : ''}`}>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: CAMERA.fov, near: 0.1, far: 60, position: CAMERA.pos }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={[T.fog]} />
        <fog attach="fog" args={[T.fog, future ? 13 : 11, future ? 30 : 24]} />
        <CameraRig />
        <Lights theme={theme} />
        <Table theme={theme} />
        <RankHologram rankIndex={game.rankIndex} theme={theme} />
        <Pile pileSize={pile} deckSize={deckSize(s)} turn={dealing ? -1 : game.turn} theme={theme} />
        {bots.map((b, i) => (
          <OpponentSeat
            key={b.id}
            index={i}
            count={bots.length}
            bot={b}
            cards={seatCount(s, b)}
            active={seatActive(s, b)}
            tag={seatTag(s, b)}
            mood={seatMood(s, b)}
            gesture={gestureFor(game, b, revealStage || 'rise')}
            theme={theme}
          />
        ))}
        <Hand
          hand={hand}
          selected={selected}
          ghost={ghost}
          visibleCount={handVisible(s)}
          active={myTurn}
          matchRank={selRelevantRank(s)}
          onToggle={toggleSelect}
          theme={theme}
        />
        <Flights />
        {over && <Celebration won={game.winner === HUMAN_ID} theme={theme} />}
        {future && !reduceMotion && (
          <Suspense fallback={null}>
            <Effects />
          </Suspense>
        )}
        <LabelTracker registry={labels} />
        <FirstFrame />
        {FLAGS.perf && <PerfProbe el={perfEl} />}
      </Canvas>
      <div style={OVERLAY_STYLE}>
        {bots.map((b, i) => (
          <SeatPlate
            key={b.id}
            registry={labels}
            index={i}
            count={bots.length}
            bot={b}
            cards={seatCount(s, b)}
            active={seatActive(s, b)}
            tag={seatTag(s, b)}
            bubble={bubbleFor(game, b)}
            theme={theme}
          />
        ))}
        <Label registry={labels} anchor={PILE_LABEL_ANCHOR} layer={1}>
          <div className="pile-label">{pile} {pile === 1 ? 'card' : 'cards'}</div>
        </Label>
      </div>
      {FLAGS.perf && <div ref={perfEl} className="perf" aria-hidden="true">measuring</div>}
    </div>
  );
}
