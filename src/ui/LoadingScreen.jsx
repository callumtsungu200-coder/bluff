// Covers the app until the web fonts are in and, when a game is on, until the table has drawn its
// first frame. `leaving` fades it out; App unmounts it once the fade has run.
export default function LoadingScreen({ leaving = false }) {
  return (
    <div className={`loading ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite" aria-hidden={leaving}>
      <div className="loading__inner">
        <div className="loading__cards" aria-hidden="true"><i /><i /><i /><i /></div>
        <p className="loading__text">Shuffling the deck</p>
      </div>
    </div>
  );
}
