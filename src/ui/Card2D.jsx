import { RANKS } from '../game.js';

const RED = new Set(['♥', '♦']);

// `ref` is a normal prop in React 19.
export default function Card({ card, faceDown = false, selected = false, onClick, size = 'md', className = '', style, ref }) {
  const cls = [
    'card',
    `card--${size}`,
    faceDown && 'card--back',
    !faceDown && (RED.has(card.suit) ? 'card--red' : 'card--black'),
    selected && 'is-selected',
    onClick && 'is-clickable',
    className,
  ].filter(Boolean).join(' ');

  if (faceDown) {
    return <div ref={ref} className={cls} style={style} aria-hidden="true"><span className="card__back-mark" /></div>;
  }

  const rank = RANKS[card.rank];
  const content = (
    <>
      <span className="card__corner card__corner--tl"><b>{rank}</b><i>{card.suit}</i></span>
      <span className="card__pip">{card.suit}</span>
      <span className="card__corner card__corner--br"><b>{rank}</b><i>{card.suit}</i></span>
    </>
  );

  if (!onClick) return <div ref={ref} className={cls} style={style}>{content}</div>;
  return (
    <button ref={ref} type="button" className={cls} style={style} onClick={onClick} aria-pressed={selected} aria-label={`${rank} of ${card.suit}`}>
      {content}
    </button>
  );
}
