// pause overlay -- mounts when the engine pauses (Escape or tab-out).
// the overlay itself is purely visual; the engine handles every state
// freeze (game-time clock, audio, key input). gothic register matches
// the phase-transition title-card so the pause reads as part of the
// movement
export function PauseOverlay() {
  return (
    <div className="hole2-pause" aria-live="polite">
      <div className="hole2-pause__dim" aria-hidden="true" />
      <div className="hole2-pause__panel">
        <div className="hole2-pause__title">PAUSED</div>
        <div className="hole2-pause__sub">FERMATA</div>
        <div className="hole2-pause__hint">
          press <kbd>Esc</kbd> to resume
        </div>
      </div>
    </div>
  );
}
