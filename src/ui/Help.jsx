import Card from './Card2D.jsx';

const demo = (id, rank, suit) => ({ id, rank, suit });

const STEPS = [
  {
    title: '1. Play face down and make a claim',
    body: 'Each turn has a rank (Aces, then Twos, Threes…). Put 1 to 4 cards on the pile and say they\'re that rank. They don\'t have to be. Lying is the game.',
    art: (
      <>
        <Card card={demo('a', 6, '♠')} size="sm" />
        <Card card={demo('b', 6, '♥')} size="sm" />
        <Card card={demo('c', 10, '♣')} size="sm" className="is-fake-demo" />
      </>
    ),
  },
  {
    title: '2. Believe it, or call bluff',
    body: 'After every play, anyone can call bluff. The cards flip over. If even one is wrong, the liar takes the whole pile. If they were honest, the caller takes it.',
    art: <><span className="pill pill--red">Call Bluff</span><span className="pill">Let it go</span></>,
    artClass: 'step__art--btn',
  },
  {
    title: '3. Empty your hand to win',
    body: 'First to zero cards wins, unless their final play gets caught as a bluff. Watch out: everyone calls harder when you\'re nearly out.',
    art: <span className="big-zero">0</span>,
  },
];

export const HELP_TIP = 'Tip: only 4 of each rank exist. If you hold two Sevens and someone claims three, they\'re lying.';

// The three steps. `compact` drops the illustrations (the side column and the log drawer).
export function HelpSteps({ compact = false }) {
  return (
    <ol className={`steps ${compact ? 'steps--compact' : ''}`}>
      {STEPS.map((s) => (
        <li key={s.title} className="step">
          {!compact && <div className={`step__art ${s.artClass || ''}`}>{s.art}</div>}
          <div className="step__text">
            <strong>{s.title}</strong>
            <p>{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Steps and tip together, for the collapsible section under the log.
export function HowToPlay({ compact = true }) {
  return (
    <div className="howto">
      <HelpSteps compact={compact} />
      <p className="help__tip">{HELP_TIP}</p>
    </div>
  );
}

export default function Help({ onClose }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="sheet help">
        <h2 className="sheet__title">How to play</h2>
        <HelpSteps />
        <p className="help__tip">{HELP_TIP}</p>
        <button type="button" className="btn btn--primary btn--wide" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
