import { useEffect, useRef, useState } from 'react';
import { HUMAN_ID, RANKS, claimText, getPlayer, rankName } from '../game.js';
import { REVEAL_AUTO } from '../store.js';

// The HTML half of the bluff reveal. The cards themselves turn over in the scene (Flights, the
// store's revealStage drives the order); these two only carry the words.
//
//   <VerdictLabel wasLie quiet held>   BLUFF or HONEST, big, over the table, for the 'verdict' and
//                                      'wait' stages: a short glitch, a hold, then it fades on its
//                                      own (styles.css .verdict-label). `quiet` (reduced motion)
//                                      drops the glitch and shortens the hold; `held` keeps it up
//                                      (the &reveal= debug flag).
//   <RevealPanel game leaving auto onContinue>
//                                      the compact panel at the foot of the stage for the 'wait'
//                                      stage: what was claimed and what the cards were, who picks
//                                      up how many, and Continue. With `auto` it continues by
//                                      itself after REVEAL_AUTO (calling onContinue({ auto: true })),
//                                      paused while the pointer is over it. `leaving` (the 'sweep'
//                                      stage) fades it out.

const RED = new Set(['♥', '♦']);
const AN = new Set([0, 7]); // an Ace, an Eight
const one = (rank) => `${AN.has(rank) ? 'an' : 'a'} ${rankName(rank, 1)}`;

export function VerdictLabel({ wasLie, quiet = false, held = false }) {
  const text = wasLie ? 'BLUFF' : 'HONEST';
  return (
    <div className={`verdict-label ${wasLie ? 'verdict-label--bluff' : 'verdict-label--honest'} ${quiet ? 'is-quiet' : ''} ${held ? 'is-held' : ''}`} aria-hidden="true">
      <span className="verdict-label__text" data-text={text}>{text}</span>
    </div>
  );
}

function CardChip({ card, ok }) {
  return (
    <span className={`rc ${RED.has(card.suit) ? 'rc--red' : ''} ${ok ? '' : 'rc--fake'}`} title={ok ? 'as claimed' : 'not as claimed'}>
      {RANKS[card.rank]}{card.suit}
    </span>
  );
}

export default function RevealPanel({ game, leaving = false, auto = true, onContinue }) {
  const r = game.reveal;
  const you = (id) => id === HUMAN_ID;
  const name = (id) => (you(id) ? 'You' : getPlayer(game, id).name);
  const fakes = r.cards.filter((c) => c.rank !== r.rank).length;
  const n = r.cards.length;

  // The 6 s auto-advance: a plain timer that stops while the pointer is over the panel and resumes
  // with what was left. The bar on the button shows the same countdown (CSS, paused with the timer).
  // It continues with { auto: true }, so the store skips the button click sound (nobody clicked).
  const [paused, setPaused] = useState(false);
  const left = useRef(REVEAL_AUTO);
  const since = useRef(0);
  const fire = useRef(onContinue);
  fire.current = onContinue;
  useEffect(() => {
    if (!auto || leaving || paused) return undefined;
    since.current = performance.now();
    const t = setTimeout(() => fire.current && fire.current({ auto: true }), left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (performance.now() - since.current));
    };
  }, [auto, leaving, paused]);

  const all = n === 2 ? 'Both' : `All ${n}`;
  const were = fakes === 0
    ? (n === 1 ? `It really was ${one(r.rank)}.` : `${all} were ${rankName(r.rank)}.`)
    : fakes === n
      ? (n === 1 ? `It was not ${one(r.rank)}.` : n === 2 ? `Neither was ${one(r.rank)}.` : `None were ${rankName(r.rank)}.`)
      : `Only ${n - fakes} of ${n} ${n - fakes === 1 ? `was ${one(r.rank)}` : `were ${rankName(r.rank)}`}.`;

  return (
    <div
      className={`reveal-panel ${r.wasLie ? 'reveal-panel--bluff' : 'reveal-panel--honest'} ${leaving ? 'is-leaving' : ''} ${paused ? 'is-paused' : ''}`}
      style={{ '--auto': `${REVEAL_AUTO}ms` }}
      role="status"
      aria-live="polite"
      inert={leaving || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <p className="reveal-panel__claim">
        <span>{name(r.playerId)} claimed <strong>{claimText(n, r.rank)}</strong>. {were}</span>
        <span className="reveal-panel__cards">
          {r.cards.map((c) => <CardChip key={c.id} card={c} ok={c.rank === r.rank} />)}
        </span>
      </p>
      <p className="reveal-panel__pickup">
        {you(r.loserId) ? 'You pick' : `${name(r.loserId)} picks`} up {r.pileCount} {r.pileCount === 1 ? 'card' : 'cards'}
      </p>
      <button type="button" className="btn btn--primary reveal-panel__continue" onClick={() => onContinue()}>
        Continue <small>Enter</small>
        {auto && !leaving && <span className="reveal-panel__bar" aria-hidden="true" />}
      </button>
    </div>
  );
}
