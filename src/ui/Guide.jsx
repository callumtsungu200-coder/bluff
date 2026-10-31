import { HUMAN_ID, RANKS, claimText, currentPlayer, getPlayer, rankName } from '../game.js';

// One sentence that always says what is happening and what you should do.
export default function Guide({ game, selectedCount, realCount, dealing }) {
  const { phase } = game;
  const cur = currentPlayer(game);
  const rank = rankName(game.rankIndex);

  let step = '';
  let title = '';
  let body = '';
  let tone = 'info';

  if (dealing) {
    step = 'Dealing';
    title = 'Shuffling and dealing';
    body = 'Everyone gets the same number of cards. You lead with Aces.';
  } else if (phase === 'play' && cur.isHuman) {
    step = 'Your turn';
    tone = 'you';
    if (selectedCount === 0) {
      title = `Play 1 to 4 cards as ${rank}`;
      body = realCount > 0
        ? `You hold ${realCount} real ${rankName(game.rankIndex, realCount)} (highlighted). Tap cards to select them, or pick other cards to bluff.`
        : `You have no ${rank}, so you must bluff. Tap 1 or 2 cards you don't need and claim they're ${rank}.`;
    } else {
      title = `Ready: ${claimText(selectedCount, game.rankIndex)}`;
      body = 'Press the blue button to put them face down on the pile. The others may call your bluff.';
    }
  } else if (phase === 'play') {
    step = `${cur.name}'s turn`;
    title = `${cur.name} must play ${rank}`;
    body = 'Watch their claim. Next you decide whether to believe it.';
  } else if (phase === 'challenge') {
    const lp = game.lastPlay;
    const claim = claimText(lp.count, lp.rank);
    const who = getPlayer(game, lp.playerId);
    if (game.challengeQueue[0] === HUMAN_ID) {
      step = 'Your call';
      tone = 'you';
      title = `${who.name} claims ${claim}. Believe it?`;
      const left = 4 - realCount;
      body = realCount > 0
        ? `You hold ${realCount} ${rankName(lp.rank, realCount)}, so at most ${left} ${left === 1 ? 'is' : 'are'} out there. `
        : '';
      body += lp.count + realCount > 4
        ? `That claim is impossible. Call it!`
        : `Call Bluff if you think they lied (they take the pile). If they were honest, you take it.`;
      if (who.hand.length === 0) body += ` ${who.name} has no cards left. If you let it go, they win.`;
    } else {
      const d = getPlayer(game, game.challengeQueue[0]);
      step = 'Deciding';
      title = lp.playerId === HUMAN_ID ? `You claimed ${claim}` : `${who.name} claims ${claim}`;
      body = `${d.name} is deciding whether to call bluff…`;
    }
  } else if (phase === 'reveal') {
    step = 'Reveal';
    title = 'Cards flipped';
    body = 'The pile goes to whoever was wrong.';
  } else if (phase === 'over') {
    step = 'Game over';
    title = game.status;
  }

  return (
    <div className={`guide guide--${tone}`}>
      <div className="guide__step">{step}</div>
      <div className="guide__text">
        <div className="guide__title">{title}</div>
        {body && <div className="guide__body">{body}</div>}
      </div>
      <div className="guide__rank" aria-hidden="true">{RANKS[game.rankIndex]}</div>
    </div>
  );
}
