// hero monogram -- big "hb" stacked over the "hunterbridges" wordmark.
// snake-paints on mount, then re-paints whenever the monogram scrolls
// back into view (IO bumps playKey on each enter).
import { useEffect, useRef, useState } from 'react';
import { Wordmark } from './Wordmark';

// ~70 cells/sec. wordmark has 209 cells -> ~3.6s for the whole intro
const CELL_DELAY_MS = 14;

// hb cells: 13 (h) + 2 (bridge) + 17 (b) = 32
const HB_CELL_COUNT = 32;

// beat between hb and wordmark -- long enough to register, short enough
// not to drag
const HANDOFF_MS = 240;

const WORDMARK_START_MS = HB_CELL_COUNT * CELL_DELAY_MS + HANDOFF_MS;

export function Monogram() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [playKey, setPlayKey] = useState(0);

  // bump playKey on every enter. skip IO's synchronous first callback
  // so the mount-time anim isn't clobbered on top of itself
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let first = true;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (first) {
          first = false;
          return;
        }
        if (entry.isIntersecting) {
          setPlayKey(k => k + 1);
        }
      },
      // low threshold -- replay fires while the user is still scrolling
      // in, so the snake's already mid-paint by the time they settle
      { threshold: 0.1 }
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="monogram" aria-label="Hunter Bridges">
      <Wordmark
        text="hb"
        cellSize={14}
        color="var(--amber)"
        joinerCols={2}
        decorative
        animate
        cellDelayMs={CELL_DELAY_MS}
        playKey={playKey}
      />
      <Wordmark
        text="hunter|bridges"
        cellSize={3}
        color="var(--fg-muted)"
        joinerCols={2}
        decorative
        animate
        cellDelayMs={CELL_DELAY_MS}
        animationStartMs={WORDMARK_START_MS}
        playKey={playKey}
      />
    </div>
  );
}
