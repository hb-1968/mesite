import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Wordmark } from './Wordmark';

type Props = {
  cmd: string;
  meta?: string;
  children?: ReactNode;
  // amber wipe-rule under the prompt. default on
  rule?: boolean;
};

// `$ <cmd>` header. cmd renders in the pixel typeface w/ snake anim,
// $ and meta stay regular mono so it still reads as a shell line
export function PromptHeading({ cmd, meta, rule = true }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [playKey, setPlayKey] = useState(0);

  // re-fire snake on scroll-in. skip IO's synchronous first fire
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let first = true;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (first) { first = false; return; }
        if (entry.isIntersecting) setPlayKey(k => k + 1);
      },
      { threshold: 0.25 }
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={rootRef} role="presentation">
      <div className="prompt-heading">
        <span className="glyph">$</span>
        <Wordmark
          text={cmd}
          cellSize={2}
          color="var(--fg)"
          joinerCols={2}
          ariaLabel={cmd}
          animate
          cellDelayMs={18}
          playKey={playKey}
          className="prompt-heading__cmd"
        />
        {meta && <span className="meta">{meta}</span>}
      </div>
      {rule && <div className="wipe-rule" aria-hidden="true" />}
    </div>
  );
}
