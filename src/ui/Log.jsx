import { useEffect, useRef } from 'react';

// The game log. `collapsible` renders it as a details/summary block (the phone layout, where it sits
// below the table), closed to start; the summary carries the entry count so a closed log still says
// something happened.
export default function Log({ entries, collapsible = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const list = (
    <ol className="log__list" ref={ref} aria-live="polite">
      {entries.map((e) => (
        <li key={e.id} className={`log__item log__item--${e.kind}`}>
          <span className="log__dot" aria-hidden="true" />
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );

  if (collapsible) {
    return (
      <details className="panel log log--collapsible">
        <summary className="panel__head">Game log <span className="panel__count">{entries.length}</span></summary>
        {list}
      </details>
    );
  }
  return (
    <section className="panel log">
      <header className="panel__head">Game log</header>
      {list}
    </section>
  );
}
