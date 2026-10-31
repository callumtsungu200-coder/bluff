import { useStats, winRate } from '../stats.js';
import '../extras.css';

// Your lifetime record. compact: one short row (games, wins, win rate, best streak,
// bluffs caught) for a top bar or a menu. Full: eight numbers plus when you last played.

const pct = (r) => (r == null ? '-' : `${Math.round(r * 100)}%`);

function ago(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!(ms >= 0)) return '';
  const days = Math.floor(ms / 864e5);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months > 1 ? 's' : ''} ago` : 'over a year ago';
}

export default function StatsPanel({ compact = false, className = '' }) {
  const s = useStats();
  const rate = pct(winRate(s));

  const items = compact
    ? [
      ['Games', s.games],
      ['Wins', s.wins],
      ['Win rate', rate],
      ['Best streak', s.bestStreak],
      ['Bluffs caught', s.bluffsCaught],
    ]
    : [
      ['Games', s.games],
      ['Wins', s.wins],
      ['Losses', s.losses],
      ['Win rate', rate],
      ['Streak', s.streak, s.streak >= 3],
      ['Best streak', s.bestStreak],
      ['Bluffs caught', s.bluffsCaught],
      ['Times caught', s.timesCaught],
    ];

  if (!compact && s.games === 0) {
    return <p className={`stats__empty ${className}`}>No games yet. Your record is kept in this browser.</p>;
  }

  return (
    <>
      <dl className={`stats ${compact ? 'stats--compact' : ''} ${className}`} aria-label="Your record">
        {items.map(([label, value, gold]) => (
          <div className="stats__item" key={label}>
            <dt className="stats__label">{label}</dt>
            <dd className={`stats__value ${gold ? 'is-gold' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {!compact && s.lastPlayed && <p className="stats__foot">Last played {ago(s.lastPlayed)}.</p>}
    </>
  );
}
