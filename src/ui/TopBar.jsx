import { useStore, shownPile } from '../store.js';
import { RANKS, rankName } from '../game.js';
import { useSettings, toggleSetting } from '../settings.js';
import useMediaQuery from './useMediaQuery.js';
import SettingsMenu from './SettingsMenu.jsx';

// The bar above the table: the brand, a compact readout of the rank in play and the pile, the turn
// counter, the theme toggle, How to play, New game, the settings gear, the sound toggle and Full
// screen. One row from about 1000 px up; on narrow screens the controls wrap onto a second row as
// icons (styles.css .topbar, the text spans hide under 1180 px). On a phone (under 560 px) the
// theme segmented control gives way to the single look button, so six 44 px touch targets fit the
// row. In the immersive layout the bar is the compact control cluster top right: look, log, sound,
// settings, leave full screen.
// Also exports the theme toggle, the sound button and the full screen button for the setup screen.

const THEMES = [
  { id: 'classic', label: 'Classic' },
  { id: 'future', label: 'Futuristic' },
];

const Icon = ({ d, children }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
);
const IconExpand = () => <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />;
const IconCompress = () => <Icon d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />;
const IconLog = () => <Icon d="M4 6h16M4 12h16M4 18h10" />;
const IconHelp = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9.2 9.5a2.8 2.8 0 1 1 4 2.5c-.8.5-1.2 1-1.2 2M12 17.2h.01" /></Icon>;
const IconNew = () => <Icon d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 20v-4.5h4.5" />;
const IconSoundOn = () => <Icon><path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" /><path d="M16.5 8.8a4.5 4.5 0 0 1 0 6.4M19 6.3a8 8 0 0 1 0 11.4" /></Icon>;
const IconSoundOff = () => <Icon><path d="M4 9.5v5h3.5L13 19V5L7.5 9.5H4z" /><path d="M16.5 9.5l4 5M20.5 9.5l-4 5" /></Icon>;
const IconLook = () => <Icon><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></Icon>;

export function ThemeToggle({ compact = false }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <div className={`segmented segmented--theme ${compact ? 'segmented--compact' : ''}`} role="radiogroup" aria-label="Visual style">
      {THEMES.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={theme === t.id}
          className={theme === t.id ? 'is-on' : ''} onClick={() => setTheme(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// One icon that switches to the other look (the immersive cluster has no room for the segmented control).
function LookButton() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const other = THEMES.find((t) => t.id !== theme) || THEMES[0];
  const label = `Switch to the ${other.label} look`;
  return (
    <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={label} title={label} onClick={() => setTheme(other.id)}>
      <IconLook />
    </button>
  );
}

export function SoundButton({ iconOnly = false }) {
  const { muted } = useSettings();
  const label = muted ? 'Sound off' : 'Sound on';
  return (
    <button type="button" className={`btn btn--ghost btn--sm btn--tool ${iconOnly ? 'btn--icon' : ''}`}
      aria-label={label} aria-pressed={!muted} title={`${muted ? 'Unmute' : 'Mute'} (M)`} onClick={() => toggleSetting('muted')}>
      {muted ? <IconSoundOff /> : <IconSoundOn />}
      {!iconOnly && <span className="btn__text">Sound</span>}
    </button>
  );
}

export function FullscreenButton({ on, onToggle, iconOnly = false }) {
  const label = on ? 'Exit full screen' : 'Full screen';
  return (
    <button type="button" className={`btn btn--ghost btn--sm btn--tool ${iconOnly ? 'btn--icon' : ''}`}
      aria-label={label} aria-pressed={on} title={`${label} (F)`} onClick={onToggle}>
      {on ? <IconCompress /> : <IconExpand />}
      {!iconOnly && <span className="btn__text">{label}</span>}
    </button>
  );
}

// "RANK 7 · SEVENS" and the pile count, read straight from the game.
function Readout() {
  const rankIndex = useStore((s) => (s.game ? s.game.rankIndex : 0));
  const pile = useStore(shownPile);
  return (
    <div className="readout" aria-label={`Rank in play ${rankName(rankIndex)}, ${pile} ${pile === 1 ? 'card' : 'cards'} on the pile`}>
      <span className="readout__item">
        <span className="readout__k">Rank</span>
        <span className="readout__v"><b>{RANKS[rankIndex]}</b><i aria-hidden="true">·</i>{rankName(rankIndex)}</span>
      </span>
      <span className="readout__item">
        <span className="readout__k">Pile</span>
        <span key={pile} className="readout__v readout__v--num">{pile}</span>
      </span>
    </div>
  );
}

export default function TopBar({ immersive, onToggleImmersive, onMenuOpenChange }) {
  const turn = useStore((s) => (s.game ? s.game.turn : 0));
  const logOpen = useStore((s) => s.logOpen);
  const toggleLog = useStore((s) => s.toggleLog);
  const toggleHelp = useStore((s) => s.toggleHelp);
  const backToSetup = useStore((s) => s.backToSetup);
  const phone = useMediaQuery('(max-width: 560px)');

  if (immersive) {
    return (
      <header className="topbar topbar--cluster">
        <LookButton />
        <button type="button" className="btn btn--ghost btn--sm btn--icon" data-log-toggle
          aria-label="Game log and how to play" aria-expanded={logOpen} aria-controls="game-log" title="Game log"
          onClick={() => toggleLog()}>
          <IconLog />
        </button>
        <SoundButton iconOnly />
        <SettingsMenu fullscreen={immersive} onToggleFullscreen={onToggleImmersive} canFullscreen onOpenChange={onMenuOpenChange} />
        <FullscreenButton on={immersive} onToggle={onToggleImmersive} iconOnly />
      </header>
    );
  }

  return (
    <header className="topbar">
      <span className="brand">Bluff</span>
      <Readout />
      <div className="topbar__controls">
        <span className="topbar__turn">Turn {turn}</span>
        {phone ? <LookButton /> : <ThemeToggle compact />}
        <button type="button" className="btn btn--ghost btn--sm btn--tool" aria-label="How to play" title="How to play" onClick={() => toggleHelp(true)}>
          <IconHelp /><span className="btn__text">How to play</span>
        </button>
        <button type="button" className="btn btn--ghost btn--sm btn--tool" aria-label="New game" title="New game" onClick={backToSetup}>
          <IconNew /><span className="btn__text">New game</span>
        </button>
        <SettingsMenu fullscreen={immersive} onToggleFullscreen={onToggleImmersive} canFullscreen onOpenChange={onMenuOpenChange} />
        <SoundButton />
        <FullscreenButton on={immersive} onToggle={onToggleImmersive} />
      </div>
    </header>
  );
}
