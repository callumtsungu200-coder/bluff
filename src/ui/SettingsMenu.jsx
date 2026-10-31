import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SPEEDS, setSetting, useSettings } from '../settings.js';
import { resetStats } from '../stats.js';
import { SHORTCUTS } from '../hooks/useKeyboard.js';
import StatsPanel from './StatsPanel.jsx';
import '../extras.css';

// A gear button that opens a small popover: speed, sound, full screen, your record,
// reset stats (confirmed inline) and the keyboard shortcuts. Click outside or Esc closes it.
//
// Props (all optional):
//   fullscreen, onToggleFullscreen   drive the full screen row from the app. Leave both out
//                                    and the menu manages full screen itself (useFullscreen).
//   canFullscreen                    hide the row when false. Defaults to browser support.
//   shortcuts                        [{ key, label }] to print; defaults to SHORTCUTS.
//   showStats                        show the compact record above Reset stats (default true).
//   defaultOpen                      start open (tests, screenshots).
//   onOpenChange(open)               told whenever the popover opens or closes, handy for
//                                    switching useKeyboard off while the menu is up.

const doc = typeof document !== 'undefined' ? document : null;
const fsElement = () => (doc ? doc.fullscreenElement || doc.webkitFullscreenElement || null : null);

// Full screen state for the whole page (or getTarget() when given), with the webkit fallbacks.
export function useFullscreen(getTarget) {
  const [active, setActive] = useState(() => !!fsElement());
  useEffect(() => {
    if (!doc) return undefined;
    const sync = () => setActive(!!fsElement());
    doc.addEventListener('fullscreenchange', sync);
    doc.addEventListener('webkitfullscreenchange', sync);
    return () => {
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  const supported = !!doc && !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const toggle = useCallback(async () => {
    if (!doc) return;
    try {
      if (fsElement()) {
        await (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      } else {
        const el = (getTarget && getTarget()) || doc.documentElement;
        await (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      }
    } catch {
      /* refused by the browser, nothing to do */
    }
  }, [getTarget]);
  return { fullscreen: active, supported, toggle };
}

function Gear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5.5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path strokeWidth="2.4" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      </g>
    </svg>
  );
}

function Switch({ on, onChange, labelledBy, disabled = false }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} disabled={disabled}
      className={`switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="switch__knob" />
    </button>
  );
}

export default function SettingsMenu({
  fullscreen,
  onToggleFullscreen,
  canFullscreen,
  shortcuts = SHORTCUTS,
  showStats = true,
  defaultOpen = false,
  onOpenChange,
}) {
  const settings = useSettings();
  const fs = useFullscreen();
  const [open, setOpen] = useState(defaultOpen);
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const wrap = useRef(null);
  const gear = useRef(null);
  const pop = useRef(null);
  const id = useId();

  const isFull = onToggleFullscreen ? !!fullscreen : fs.fullscreen;
  const toggleFull = onToggleFullscreen || fs.toggle;
  const showFull = canFullscreen === undefined ? fs.supported : canFullscreen;

  const change = (next) => {
    setOpen(next);
    if (!next) setConfirm(false);
    if (onOpenChange) onOpenChange(next);
  };

  // click outside or Esc closes; Esc also hands focus back to the gear
  useEffect(() => {
    if (!open || !doc) return undefined;
    const onDown = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) change(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      change(false);
      if (gear.current) gear.current.focus();
    };
    doc.addEventListener('pointerdown', onDown);
    doc.addEventListener('keydown', onKey, true);
    return () => {
      doc.removeEventListener('pointerdown', onDown);
      doc.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // move focus into the popover when it opens
  useEffect(() => {
    if (!open || !pop.current) return;
    const first = pop.current.querySelector('button, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus({ preventScroll: true });
  }, [open]);

  // the "Cleared" note fades after a moment
  useEffect(() => {
    if (!cleared) return undefined;
    const t = setTimeout(() => setCleared(false), 1800);
    return () => clearTimeout(t);
  }, [cleared]);

  const doReset = () => {
    resetStats();
    setConfirm(false);
    setCleared(true);
  };

  return (
    <div className="menu" ref={wrap}>
      <button type="button" ref={gear} className="btn btn--ghost btn--sm menu__gear"
        aria-label="Settings" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-pop` : undefined}
        onClick={() => change(!open)}>
        <Gear />
      </button>

      {open && (
        <div className="menu__pop" id={`${id}-pop`} ref={pop} role="dialog" aria-label="Settings">
          <div className="menu__row">
            <span className="menu__label" id={`${id}-speed`}>
              Speed
              <span className="menu__hint">Bot thinking time</span>
            </span>
            <div className="segmented menu__seg" role="radiogroup" aria-labelledby={`${id}-speed`}>
              {SPEEDS.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={settings.speed === s.id}
                  className={settings.speed === s.id ? 'is-on' : ''} onClick={() => setSetting('speed', s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="menu__row">
            <span className="menu__label" id={`${id}-sound`}>
              Sound
              <span className="menu__hint">Card and table effects</span>
            </span>
            <Switch on={!settings.muted} labelledBy={`${id}-sound`} onChange={(on) => setSetting('muted', !on)} />
          </div>

          {showFull && (
            <div className="menu__row">
              <span className="menu__label" id={`${id}-full`}>
                Full screen
                <span className="menu__hint">Esc leaves it again</span>
              </span>
              <Switch on={isFull} labelledBy={`${id}-full`} onChange={() => toggleFull()} />
            </div>
          )}

          {showStats && (
            <div className="menu__section">
              <span className="eyebrow">Your record</span>
              <StatsPanel compact />
            </div>
          )}

          <div className="menu__row">
            {confirm ? (
              <div className="menu__confirm" role="alert">
                <span>Clear your record?</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={doReset}>Reset</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(false)}>Keep</button>
              </div>
            ) : (
              <>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)}>Reset stats</button>
                {cleared && <span className="menu__done" role="status">Cleared</span>}
              </>
            )}
          </div>

          <div className="menu__section">
            <span className="eyebrow">Keyboard</span>
            <ul className="keys">
              {shortcuts.map((s) => (
                <li key={s.key}><kbd>{s.key}</kbd><span>{s.label}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
