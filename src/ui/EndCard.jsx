import { HUMAN_ID } from '../game.js';
import { useStore } from '../store.js';
import StatsPanel from './StatsPanel.jsx';

// The game-over sheet: the result, your record, play again. The celebration itself is in the scene
// (scene/Celebration.jsx: the light sweep on a win, the dim on a loss); Overlay mounts this sheet a
// beat after the sweep has begun.

export default function EndCard() {
  const game = useStore((s) => s.game);
  const startGame = useStore((s) => s.startGame);
  const backToSetup = useStore((s) => s.backToSetup);
  if (!game || game.phase !== 'over') return null;
  const youWon = game.winner === HUMAN_ID;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="sheet endcard">
        <p className="eyebrow">Game over · {game.turn} turns</p>
        <h2 className={`endcard__title ${youWon ? 'is-win' : 'is-lose'}`}>{youWon ? 'You win' : 'You lose'}</h2>
        <p className="muted">{game.status}</p>
        <div className="endcard__record">
          <span className="eyebrow">Your record</span>
          <StatsPanel compact />
        </div>
        <div className="endcard__actions">
          <button type="button" className="btn btn--primary" onClick={startGame}>Play again <small>Enter</small></button>
          <button type="button" className="btn btn--ghost" onClick={backToSetup}>New game</button>
        </div>
      </div>
    </div>
  );
}
