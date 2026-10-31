import { HUMAN_ID, claimText, currentPlayer, getPlayer } from '../game.js';

export default function ActionBar({ game, selectedCount, disabled = false, onPlay, onCall, onPass }) {
  const { phase } = game;
  const cur = currentPlayer(game);

  if (phase === 'play' && cur.isHuman) {
    return (
      <div className="actionbar">
        <button type="button" className="btn btn--primary btn--big" disabled={disabled || selectedCount === 0} onClick={onPlay}>
          {selectedCount === 0 ? 'Choose cards from your hand' : `Play as ${claimText(selectedCount, game.rankIndex)}`}
        </button>
      </div>
    );
  }

  if (phase === 'challenge' && game.challengeQueue[0] === HUMAN_ID) {
    return (
      <div className="actionbar">
        <div className="actionbar__buttons">
          <button type="button" className="btn btn--danger btn--big" disabled={disabled} onClick={onCall}>
            Call Bluff <small>They lied</small>
          </button>
          <button type="button" className="btn btn--ghost btn--big" disabled={disabled} onClick={onPass}>
            Let it go <small>I believe them</small>
          </button>
        </div>
      </div>
    );
  }

  let waiting = '';
  if (phase === 'play') waiting = `${cur.name} is choosing cards`;
  else if (phase === 'challenge') waiting = `${getPlayer(game, game.challengeQueue[0]).name} is deciding`;
  else if (phase === 'reveal') waiting = 'Revealing';

  return (
    <div className="actionbar">
      <span className="actionbar__wait">
        <span className="spinner" aria-hidden="true" />
        {waiting}
      </span>
    </div>
  );
}
