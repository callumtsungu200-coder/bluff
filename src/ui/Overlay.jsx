import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, selMyTurn, selMyCall, selRealCount, shownPile, FLAGS } from '../store.js';
import { HUMAN_ID, RANKS, currentPlayer, getPlayer, rankName } from '../game.js';
import { toggleSetting } from '../settings.js';
import useKeyboard from '../hooks/useKeyboard.js';
import useMediaQuery from './useMediaQuery.js';
import TopBar from './TopBar.jsx';
import Guide from './Guide.jsx';
import ActionBar from './ActionBar.jsx';
import Log from './Log.jsx';
import Help, { HowToPlay } from './Help.jsx';
import RevealPanel, { VerdictLabel } from './Reveal.jsx';
import EndCard from './EndCard.jsx';
import useImmersive, { fsElement } from './useImmersive.js';

// Everything around the table: the top bar, the guide strip, the status line and action bar, the
// side column (the log with a collapsible How to play under it; a drawer in the immersive layout;
// both collapsible below the table on phones), the Help and Game over sheets, and the words of the
// bluff reveal (the verdict label over the stage, the panel in the foot).
// `children` is the stage (the 3D scene), placed between the guide and the action bar.

const END_CARD_DELAY = 600; // ms after the game ends before the sheet comes up (the sweep leads)

// While the cards are still turning over (the 'rise' stage, and the instant before runReveal
// sets it) the verdict is a secret: the status line and the log must not give it away.
function verdictHidden(game, revealStage) {
  return game.phase === 'reveal' && (!revealStage || revealStage === 'rise');
}

// The status line in sentences (Classic): game.status, with the deal and the secret verdict covered.
function statusFor(game, dealing, revealStage) {
  if (dealing) return 'Dealing the cards';
  if (verdictHidden(game, revealStage)) {
    const r = game.reveal;
    const who = (id) => (id === HUMAN_ID ? 'you' : getPlayer(game, id).name);
    return `${r.challengerId === HUMAN_ID ? 'You' : who(r.challengerId)} called bluff on ${who(r.playerId)}`;
  }
  return game.status;
}

// The same line in the Futuristic theme's terse style: a key and a value, "YOUR MOVE: PLAY ACES",
// "VEGA CLAIMS: 3 × ACE", "BLUFF: VEGA LIED". Derived from the phase and lastPlay, not from the
// sentence, so the two never drift apart. `tone` colours the key for the verdict.
export function terseStatus(game, dealing, revealStage) {
  const name = (id) => (id === HUMAN_ID ? 'YOU' : getPlayer(game, id).name.toUpperCase());
  const plural = (r) => rankName(r).toUpperCase();
  if (dealing) return { k: 'DEALING', v: '' };
  const { phase } = game;
  if (phase === 'play') {
    const cur = currentPlayer(game);
    return cur.isHuman
      ? { k: 'YOUR MOVE', v: `PLAY ${plural(game.rankIndex)}` }
      : { k: `${name(cur.id)} TO PLAY`, v: plural(game.rankIndex) };
  }
  if (phase === 'challenge' && game.lastPlay) {
    const lp = game.lastPlay;
    return { k: lp.playerId === HUMAN_ID ? 'YOU CLAIM' : `${name(lp.playerId)} CLAIMS`, v: `${lp.count} × ${rankName(lp.rank, 1).toUpperCase()}` };
  }
  if (phase === 'reveal') {
    const r = game.reveal;
    if (verdictHidden(game, revealStage)) {
      return { k: r.challengerId === HUMAN_ID ? 'YOU CALL BLUFF' : `${name(r.challengerId)} CALLS BLUFF`, v: `ON ${name(r.playerId)}` };
    }
    return r.wasLie
      ? { k: 'BLUFF', v: `${name(r.playerId)} LIED`, tone: 'bluff' }
      : { k: 'HONEST', v: `${name(r.playerId)} TOLD THE TRUTH`, tone: 'honest' };
  }
  if (phase === 'over') return { k: 'GAME OVER', v: game.winner === HUMAN_ID ? 'YOU WIN' : `${name(game.winner)} WINS` };
  return { k: '', v: game.status.toUpperCase() };
}

// game.js writes the "BLUFF. X picks up N cards." / "HONEST. ..." line the moment the call is made,
// about two seconds before the label lands. Hold that newest entry back until the verdict stage,
// so the log keeps pace with the table; it then appears with the label (Log fades new items in).
function logEntriesFor(game, revealStage) {
  const log = game.log;
  if (!verdictHidden(game, revealStage) || !log.length) return log;
  const last = log[log.length - 1];
  return last.kind === 'bluff' || last.kind === 'honest' ? log.slice(0, -1) : log;
}

function Status({ game, dealing, revealStage, terse }) {
  if (!terse) {
    const text = statusFor(game, dealing, revealStage);
    return <p key={text} className="status" aria-live="polite">{text}</p>;
  }
  const t = terseStatus(game, dealing, revealStage);
  return (
    <p key={`${t.k}|${t.v}`} className={`status status--terse ${t.tone ? `status--${t.tone}` : ''}`} aria-live="polite">
      <span className="status__k">{t.k}{t.v ? ':' : ''}</span>
      {t.v && <span className="status__v">{t.v}</span>}
    </p>
  );
}

export default function Overlay({ children }) {
  const game = useStore((s) => s.game);
  const theme = useStore((s) => s.theme);
  const busy = useStore((s) => s.busy);
  const dealing = useStore((s) => s.dealing);
  const revealStage = useStore((s) => s.revealStage);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const selectedCount = useStore((s) => s.selected.length);
  const logOpen = useStore((s) => s.logOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const pile = useStore(shownPile);
  const myTurn = useStore(selMyTurn);
  const myCall = useStore(selMyCall);
  const realCount = useStore(selRealCount);
  const play = useStore((s) => s.play);
  const callBluff = useStore((s) => s.callBluff);
  const letItGo = useStore((s) => s.letItGo);
  const continueAfterReveal = useStore((s) => s.continueAfterReveal);
  const startGame = useStore((s) => s.startGame);
  const backToSetup = useStore((s) => s.backToSetup);
  const toggleLog = useStore((s) => s.toggleLog);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const { immersive, toggle: toggleImmersive, exit: exitImmersive } = useImmersive();
  const [menuOpen, setMenuOpen] = useState(false);
  // Below 1000 px the side column moves under the table (styles.css); there the log collapses too.
  const stacked = useMediaQuery('(max-width: 1000px)');

  // The immersive layout only applies to the table; the setup screen keeps its normal page.
  useLayoutEffect(() => {
    document.body.classList.toggle('is-immersive', immersive);
    return () => document.body.classList.remove('is-immersive');
  }, [immersive]);

  // The log drawer closes on a tap outside it (the toggle button handles itself).
  const sideRef = useRef(null);
  useEffect(() => {
    if (!logOpen || !immersive) return undefined;
    const onDown = (e) => {
      if (sideRef.current && sideRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-log-toggle]')) return;
      toggleLog(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [logOpen, immersive, toggleLog]);

  const inReveal = !!game && game.phase === 'reveal';
  const over = !!game && game.phase === 'over';
  const verdictUp = inReveal && (revealStage === 'verdict' || revealStage === 'wait');
  const panelUp = inReveal && (revealStage === 'wait' || revealStage === 'sweep');

  // The Game over sheet comes up once the scene's light sweep (or dim) is under way, not over its
  // first frames; with reduced motion there is no sweep to wait for.
  const [endUp, setEndUp] = useState(false);
  useEffect(() => {
    if (!over || (FLAGS.end && FLAGS.end.hold)) { setEndUp(false); return undefined; } // &end=...:hold keeps the sheet away
    const t = setTimeout(() => setEndUp(true), reduceMotion ? 0 : END_CARD_DELAY);
    return () => clearTimeout(t);
  }, [over, reduceMotion]);

  // Only what is available right now; Help swallows the rest.
  useKeyboard({
    Enter: helpOpen ? () => toggleHelp(false)
      : over ? startGame
        : inReveal ? () => continueAfterReveal()
          : myTurn && selectedCount ? play : null,
    b: myCall && !busy && !helpOpen ? callBluff : null,
    l: myCall && !busy && !helpOpen ? letItGo : null,
    f: toggleImmersive,
    m: () => toggleSetting('muted'),
    Escape: () => {
      if (helpOpen) toggleHelp(false);
      else if (logOpen) toggleLog(false);
      else if (immersive && !fsElement()) exitImmersive();
    },
  }, !menuOpen);

  if (!game) return null;
  const drawerHidden = immersive && !logOpen;
  const terse = theme === 'future';

  return (
    <div className={`app ${immersive ? 'app--immersive' : ''}`}>
      <TopBar immersive={immersive} onToggleImmersive={toggleImmersive} onMenuOpenChange={setMenuOpen} />

      <main className="table">
        <div className="table__guide">
          <Guide game={game} selectedCount={selectedCount} realCount={realCount} dealing={dealing} />
        </div>

        {/* is-verdict hides the pile count label under the BLUFF / HONEST label (styles.css) */}
        <div className={`table__stage ${verdictUp ? 'is-verdict' : ''}`}>
          {children}
          {verdictUp && (
            <VerdictLabel key={game.turn} wasLie={game.reveal.wasLie} quiet={reduceMotion} held={!!FLAGS.reveal && FLAGS.reveal.hold === 'verdict'} />
          )}
        </div>

        <div className="table__foot">
          {panelUp ? (
            <RevealPanel key={game.turn} game={game} leaving={revealStage === 'sweep'} auto={!FLAGS.reveal || FLAGS.reveal.hold === 'run'} onContinue={continueAfterReveal} />
          ) : (
            <>
              <Status game={game} dealing={dealing} revealStage={revealStage} terse={terse} />
              <ActionBar
                game={game}
                selectedCount={selectedCount}
                disabled={busy || dealing}
                onPlay={play}
                onCall={callBluff}
                onPass={letItGo}
              />
            </>
          )}
        </div>
      </main>

      <aside id="game-log" ref={sideRef} className={`side ${logOpen ? 'is-open' : ''}`} aria-hidden={drawerHidden} inert={drawerHidden}>
        {immersive && (
          <p className="side__turn eyebrow">
            Turn {game.turn} <span className="side__sep" aria-hidden="true">·</span> Rank {RANKS[game.rankIndex]} <span className="side__sep" aria-hidden="true">·</span> Pile {pile}
          </p>
        )}
        <Log entries={logEntriesFor(game, revealStage)} collapsible={stacked && !immersive} />
        <details className="side__howto">
          <summary className="panel__head">How to play</summary>
          <HowToPlay />
        </details>
        {immersive && (
          <div className="side__foot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={backToSetup}>New game</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleLog(false)}>Close</button>
          </div>
        )}
      </aside>

      {helpOpen && <Help onClose={() => toggleHelp(false)} />}
      {over && endUp && <EndCard />}
    </div>
  );
}
