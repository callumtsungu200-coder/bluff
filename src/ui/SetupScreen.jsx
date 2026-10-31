import { useState } from 'react';
import { BOT_ROSTER, PERSONALITIES } from '../game.js';
import { useStore } from '../store.js';
import { toggleSetting } from '../settings.js';
import { useStats } from '../stats.js';
import useKeyboard from '../hooks/useKeyboard.js';
import { HelpSteps } from './Help.jsx';
import StatsPanel from './StatsPanel.jsx';
import SettingsMenu from './SettingsMenu.jsx';
import { ThemeToggle, FullscreenButton } from './TopBar.jsx';
import useImmersive from './useImmersive.js';

// The start screen: pick a look and the number of opponents, see your record, read the rules.

export default function SetupScreen() {
  const opponents = useStore((s) => s.opponents);
  const setOpponents = useStore((s) => s.setOpponents);
  const startGame = useStore((s) => s.startGame);
  const stats = useStats();
  const { immersive, toggle: toggleImmersive } = useImmersive();
  const [menuOpen, setMenuOpen] = useState(false);

  useKeyboard({
    Enter: startGame,
    f: toggleImmersive,
    m: () => toggleSetting('muted'),
  }, !menuOpen);

  return (
    <>
      <div className="setup__tools">
        <SettingsMenu fullscreen={immersive} onToggleFullscreen={toggleImmersive} canFullscreen onOpenChange={setMenuOpen} />
        <FullscreenButton on={immersive} onToggle={toggleImmersive} />
      </div>
      <div className="setup">
        <div className="setup__hero" aria-hidden="true">
          <div className="card card--lg card--black hero-card hero-card--1"><span className="card__pip">♠</span></div>
          <div className="card card--lg card--red hero-card hero-card--2"><span className="card__pip">♥</span></div>
          <div className="card card--lg card--black hero-card hero-card--3"><span className="card__pip">♣</span></div>
          <div className="card card--lg card--red hero-card hero-card--4"><span className="card__pip">♦</span></div>
        </div>
        <h1 className="setup__title">Bluff</h1>
        <p className="setup__sub">A card game about lying well, and catching liars.</p>

        <div className="setup__form">
          <span className="eyebrow">Look</span>
          <ThemeToggle />
          <span className="eyebrow setup__gap">Opponents</span>
          <div className="segmented" role="radiogroup" aria-label="Number of opponents">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={opponents === n}
                className={opponents === n ? 'is-on' : ''} onClick={() => setOpponents(n)}>
                {n}
              </button>
            ))}
          </div>
          <ul className="roster">
            {BOT_ROSTER.map((b, i) => (
              <li key={b.name} className={i < opponents ? '' : 'is-off'}>
                <span className="roster__name">{b.name}</span>
                <span className="roster__meta">{PERSONALITIES[b.personality].label}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--primary btn--big btn--wide" onClick={startGame}>Deal the cards</button>
          {stats.games > 0 && (
            <div className="setup__record">
              <span className="eyebrow">Your record</span>
              <StatsPanel compact />
            </div>
          )}
        </div>

        <div className="setup__howto">
          <h2 className="h2">How it works</h2>
          <HelpSteps />
        </div>
      </div>
    </>
  );
}
