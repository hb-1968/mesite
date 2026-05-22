import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PromptHeading } from './PromptHeading';
import { Wordmark } from './Wordmark';

// 2-col reader. ghosts on the sides are the other spread, faded out.
// flip = compress to center + fade. labels are pixel-typeface w/ snake.

type ColumnEntry = { label: string; passage: ReactNode };
type Column = { entries: ColumnEntry[] };
type Spread = { left: Column; right: Column };

const SPREADS: Spread[] = [
  {
    left: {
      entries: [
        {
          label: './about/research',
          passage: (
            <p key="research">
              Term time I'm in Boston; breaks I'm back in Glen Head, NY. The
              work I keep coming back to, ultimately, is computational pathology
              -- whole-slide images, foundation models (UNI and CONCH being the
              load-bearing ones at the moment), and the genuinely awkward seam
              where tile-level deep features have to be aggregated into
              something that actually tells you what's wrong with the slide.
            </p>
          )
        },
        {
          label: './about/dermpath',
          passage: (
            <p key="dermpath">
              A lot of why I gravitate toward <em>dermatopathology</em>{' '}
              specifically is, honestly, personal -- my mother is a
              dermatopathologist (and a dermatologist), so I've been around
              the field since I was a kid: society meetings (AAD, ASDP, Noah
              Worcester), conversations at the dinner table, the whole thing.
              That has, over the years, made me incredibly familiar with the
              actual clinical and diagnostic workflow -- I know what the
              slides look like, I know what the pathologist is actually
              trying to decide, and I know where the friction tends to sit.
            </p>
          )
        }
      ]
    },
    right: {
      entries: [
        {
          label: './about/math',
          passage: (
            <p key="math">
              Math is, honestly, the part that pulled me into all of this in
              the first place -- the deep-learning side is fun, but a lot of
              what I actually enjoy is the layer underneath. The corner I'm
              most enamored by is complexity theory -- specifically the work
              on NP-hard approximations, where you accept that an exact
              polynomial-time solution isn't available and so you have to
              derive a clean approximation guarantee from first principles
              instead -- alongside a lot of the Erdős tradition of
              combinatorial proofs that pull a tight bound out of what at
              first looks like an inscrutable counting problem. I'm taking
              MA531 (Mathematical Logic) this fall, after Calc I-III,
              differential equations, linear algebra, and probability --
              mostly because the foundations question of what it actually
              means to prove something has been bothering me in a productive
              way.
            </p>
          )
        },
        {
          label: './about/method',
          passage: (
            <p key="method">
              More generally, I'm pretty strongly drawn to axiomatic or
              deductive constructions for algorithms -- derivations that
              start from a small set of clearly-stated assumptions and reason
              forward -- over the empirical alternative, where you run a
              sweep and let the numbers vote. Both genuinely have their
              place; I just find the deductive side significantly more
              satisfying when it's available.
            </p>
          )
        }
      ]
    }
  },
  {
    left: {
      entries: [
        {
          label: './about/tools',
          passage: (
            <p key="tools">
              I don't really build tools for the sake of building tools --
              the non-research stuff I work on is almost always aimed at a
              moderately niche task where I've already worked out the
              procedure in my head and would rather just have it automated.
              The icon pipeline is the cleanest example: I got fairly good
              at pixel art when I was younger, and a lot of the decisions I
              used to make by hand -- palette quantization, fitting a logo
              into a tight grid, picking which features survive at smaller
              sizes -- were already algorithmic in spirit, so the project
              is mostly me transcribing those intuitions into code.
            </p>
          )
        },
        {
          label: './about/hardware',
          passage: (
            <p key="hardware">
              Mostly a personal-preference aside, but: I switched from
              Windows 10 to Fedora 44 earlier this year and have been
              enjoying it more than I expected -- partly because the
              configuration story is finally on my side, and partly
              because ROCm has gotten stable enough that running ML on an
              AMD GPU is no longer the open-ended suffering it used to be.
              Given the AMD/NVIDIA price gap, that matters more than it
              probably sounds like it should.
            </p>
          )
        }
      ]
    },
    right: {
      entries: [
        {
          label: './about/papers',
          passage: (
            <p key="papers">
              I read papers significantly more than I write them, though
              that ratio is changing -- I'd like to actually get a couple
              of pieces out before the end of junior year. Mostly methods
              papers, mostly in the dermatopathology / WSI corner; I tend
              to gravitate toward the ones that derive a method from a
              clean starting point rather than the ones that report a
              sweep across architectures.
            </p>
          )
        },
        {
          label: './about/me.json',
          passage: (
            <div key="manifest">
              <pre
                className="output"
                style={{
                  margin: 0,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  fontSize: 'var(--fs-sm)'
                }}
              >
{`{
  "`}<span className="key">location</span>{`": ["Boston, MA", "Glen Head, NY"],
  "`}<span className="key">school</span>{`":   "Boston University",
  "`}<span className="key">degree</span>{`":   "B.A. CS, Math minor",
  "`}<span className="key">expected</span>{`": `}<span className="str">"May 2028"</span>{`,
  "`}<span className="key">gpa</span>{`":      `}<span className="num">3.38</span>{`,
  "`}<span className="key">desktop</span>{`":  `}<span className="str">"Fedora 44"</span>{`,
  "`}<span className="key">langs</span>{`":    ["en (native)", "de (B2)"]
}`}
              </pre>

              {/* manifest is short -- park the expanded-about button here
                  so it doesn't dangle below the whole reader */}
              <div className="about-more">
                <button
                  type="button"
                  className="about-reader__btn about-more__btn"
                  disabled
                  aria-label="Expanded about + blog (work in progress)"
                  title="Expanded about + blog -- coming soon"
                >
                  <span className="about-more__arrow" aria-hidden="true">→</span>
                  <span className="about-more__path">./about/expanded</span>
                  <span className="about-more__plus" aria-hidden="true">+</span>
                  <span className="about-more__path">./blog</span>
                  <span className="about-more__wip">○ wip</span>
                </button>
              </div>
            </div>
          )
        }
      ]
    }
  }
];

const HALF_FLIP_MS = 240;
const LABEL_CELL_DELAY_MS = 8;
// rough avg cells/char -- used to guess when the snake finishes so the
// dash rules can bloom right after
const AVG_CELLS_PER_CHAR = 14;

function estimateSnakeDurationMs(text: string, cellDelayMs: number): number {
  // word-break + space chars don't render a glyph
  const rendered = [...text].filter((c) => c !== '|' && c !== ' ');
  const cells = rendered.length * AVG_CELLS_PER_CHAR;
  // trailing buffer = last cell's own animation (2x cellDelay)
  return cells * cellDelayMs + 2 * cellDelayMs;
}

function ReaderLabel({ text }: { text: string }) {
  // bloom fires once the snake's done painting
  const bloomDelayMs = estimateSnakeDurationMs(text, LABEL_CELL_DELAY_MS);
  return (
    <div
      className="reader-label"
      aria-hidden="true"
      style={{ ['--bloom-delay' as string]: `${bloomDelayMs}ms` }}
    >
      <span className="reader-label__rule reader-label__rule--left" />
      <Wordmark
        text={text}
        cellSize={2}
        color="var(--amber)"
        joinerCols={2}
        animate
        cellDelayMs={LABEL_CELL_DELAY_MS}
        className="reader-label__wordmark"
        ariaLabel={text}
      />
      <span className="reader-label__rule reader-label__rule--right" />
    </div>
  );
}

function ReaderColumn({ column }: { column: Column }) {
  // label-then-passage for every entry so the top of each column has a
  // header too (left->right column jump needs it)
  return (
    <div className="reader-column">
      {column.entries.map((entry, i) => (
        <div key={i}>
          <ReaderLabel text={entry.label} />
          {entry.passage}
        </div>
      ))}
    </div>
  );
}

function SpreadContent({
  spread,
  variant
}: {
  spread: Spread;
  variant: 'current' | 'ghost';
}) {
  // ghosts skip the snake (static text instead) -- the parent already
  // handles the stretch + fade via CSS
  if (variant === 'ghost') {
    return (
      <div className="reader-spread__inner" aria-hidden="true">
        {[spread.left, spread.right].map((column, ci) => (
          <div className="reader-column" key={ci}>
            {column.entries.map((entry, i) => (
              <div key={i}>
                <div className="reader-label">
                  <span className="reader-label__rule" />
                  <span className="reader-label__text-static">{entry.label}</span>
                  <span className="reader-label__rule" />
                </div>
                {entry.passage}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="reader-spread__inner">
      <ReaderColumn column={spread.left} />
      <ReaderColumn column={spread.right} />
    </div>
  );
}

function AboutReader() {
  const [spread, setSpread] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [scrollPlayKey, setScrollPlayKey] = useState(0);
  const readerRef = useRef<HTMLDivElement>(null);
  const total = SPREADS.length;

  const flipTo = (target: number) => {
    if (exiting) return;
    if (target < 0 || target >= total || target === spread) return;
    setExiting(true);
    window.setTimeout(() => {
      setSpread(target);
      setExiting(false);
    }, HALF_FLIP_MS);
  };

  const goNext = () => flipTo(spread + 1);
  const goPrev = () => flipTo(spread - 1);

  // arrow keys flip pages -- only when reader is in view + not typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const el = readerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.bottom > 0 && rect.top < window.innerHeight;
      if (!inView) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // bump scrollPlayKey when reader re-enters view -- skip the first
  // synchronous IO fire so initial mount doesn't double-trigger
  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    let first = true;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (first) { first = false; return; }
        if (entry.isIntersecting) setScrollPlayKey((k) => k + 1);
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // React key on the current spread -- changes on flip OR scroll-in,
  // which remounts and re-fires the label snakes + dash blooms
  const currentKey = useMemo(
    () => spread * 1000 + scrollPlayKey,
    [spread, scrollPlayKey]
  );

  const current = SPREADS[spread];
  const prev = spread > 0 ? SPREADS[spread - 1] : null;
  const next = spread < total - 1 ? SPREADS[spread + 1] : null;
  // at the edges, fall back to "the other" spread so both ghost sides
  // are always populated and the layout stays the same width
  const leftGhost = prev ?? next;
  const rightGhost = next ?? prev;
  const atStart = spread === 0;
  const atEnd = spread === total - 1;
  // total pages = spreads x 2 cols. page 1 = spread-0 left, etc.
  const totalPages = total * 2;
  const leftPageNum = spread * 2 + 1;
  const rightPageNum = spread * 2 + 2;

  return (
    <div ref={readerRef} className="about-reader">
      <div className="about-reader__nav" aria-label="reader navigation">
        {/* 4 boxes: < prev | left# | right# | next >. counters touch */}
        <button
          type="button"
          className="about-reader__btn"
          onClick={goPrev}
          disabled={atStart || exiting}
          aria-label="previous spread"
        >
          &lt; prev
        </button>
        <span
          className="about-reader__btn about-reader__count about-reader__count--left"
          aria-label={`page ${leftPageNum} of ${totalPages}`}
        >
          {leftPageNum} / {totalPages}
        </span>
        <span
          className="about-reader__btn about-reader__count about-reader__count--right"
          aria-label={`page ${rightPageNum} of ${totalPages}`}
        >
          {rightPageNum} / {totalPages}
        </span>
        <button
          type="button"
          className="about-reader__btn"
          onClick={goNext}
          disabled={atEnd || exiting}
          aria-label="next spread"
        >
          next &gt;
        </button>
      </div>

      <div className="about-reader__stage">
        {/* left ghost (falls back to next at the start) */}
        <div className="reader-spread reader-spread--ghost reader-spread--ghost-left">
          {leftGhost && <SpreadContent spread={leftGhost} variant="ghost" />}
        </div>

        {/* current spread -- key remounts on flip OR scroll-in */}
        <div
          key={currentKey}
          className="reader-spread reader-spread--current"
          data-exiting={exiting ? 'true' : 'false'}
        >
          <SpreadContent spread={current} variant="current" />
        </div>

        {/* right ghost (falls back to prev at the end) */}
        <div className="reader-spread reader-spread--ghost reader-spread--ghost-right">
          {rightGhost && <SpreadContent spread={rightGhost} variant="ghost" />}
        </div>
      </div>
    </div>
  );
}

export function About() {
  return (
    <section id="whoami" className="section reveal" aria-labelledby="about-title">
      <div className="container">
        <PromptHeading cmd="whoami" meta="// paged reader · ← / → to flip" />
        <h2 id="about-title" className="section-title">
          Dialectics in creative Software and{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--sage)' }}>Dermatopathology</em>;
          <br />
          Computer Science @ Boston University.
        </h2>

        <AboutReader />
      </div>

      <style>{`
        /* expanded-about button -- lives in the manifest's dead space */
        #whoami .about-more {
          display: flex;
          justify-content: flex-start;
          margin-top: var(--sp-5);
        }
        #whoami .about-more__btn {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-3);
          opacity: 0.6;
          cursor: not-allowed;
        }
        #whoami .about-more__arrow { color: var(--amber); }
        #whoami .about-more__path  { color: var(--fg); }
        #whoami .about-more__plus  { color: var(--fg-dim); }
        #whoami .about-more__wip {
          margin-left: var(--sp-2);
          padding: 2px 8px;
          border: 1px dashed var(--terracotta);
          color: var(--terracotta);
          font-size: var(--fs-xs);
          letter-spacing: 0.06em;
          text-transform: lowercase;
        }

        #whoami .about-reader {
          margin-top: var(--sp-6);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }
        #whoami .about-reader__nav {
          display: flex;
          align-items: center;
          /* center the cluster so counters sit between the arrows */
          justify-content: center;
          gap: var(--sp-3);
          font-size: var(--fs-sm);
          color: var(--fg-muted);
          font-variant-numeric: tabular-nums;
        }
        /* counters pull together a bit -- tighter than the rest of the nav */
        #whoami .about-reader__count--left  { margin-right: calc(var(--sp-3) * -0.5); }
        #whoami .about-reader__count--right { margin-left:  calc(var(--sp-3) * -0.5); }
        #whoami .about-reader__btn {
          padding: 4px 12px;
          background: transparent;
          border: 2px solid var(--fg-muted);
          color: var(--fg);
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          cursor: pointer;
          transition: border-color 140ms, color 140ms, opacity 140ms;
        }
        #whoami .about-reader__btn:hover:not(:disabled) {
          border-color: var(--amber);
          color: var(--amber);
        }
        #whoami .about-reader__btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        /* counter shares the .btn box outline -- just amber + non-clickable */
        #whoami .about-reader__count {
          color: var(--amber);
          cursor: default;
          border-color: var(--amber);
        }
        #whoami .about-reader__count:hover {
          border-color: var(--amber);
          color: var(--amber);
        }

        /* relative stage -- ghosts are absolute over its edges. current
           is narrower than the stage, leaving gutters for the ghosts */
        #whoami .about-reader__stage {
          position: relative;
          overflow: hidden;
        }
        #whoami .reader-spread {
          min-height: 220px;
        }

        /* current spread is 85% wide, gutters on each side for ghosts.
           z-index 2 puts it over the ghosts. flip pivots from center */
        #whoami .reader-spread--current {
          position: relative;
          z-index: 2;
          width: 85%;
          margin-inline: auto;
          transform-origin: center center;
          animation: spread-enter ${HALF_FLIP_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        #whoami .reader-spread--current[data-exiting="true"] {
          animation: spread-exit ${HALF_FLIP_MS}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards;
        }
        @keyframes spread-enter {
          0%   { transform: scaleX(0.02); opacity: 0; filter: blur(1px); }
          60%  { opacity: 0.85; filter: blur(0.3px); }
          100% { transform: scaleX(1);   opacity: 1; filter: blur(0); }
        }
        @keyframes spread-exit {
          0%   { transform: scaleX(1);   opacity: 1; filter: blur(0); }
          40%  { opacity: 0.6; filter: blur(0.4px); }
          100% { transform: scaleX(0.02); opacity: 0; filter: blur(1px); }
        }

        /* ghosts pinned to the stage edges, 30% wide. outer slice peeks
           in the gutter, inner slice underlaps the current spread. mask
           fades the underlap part so it doesn't fight the readable text */
        #whoami .reader-spread--ghost {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 30%;
          z-index: 1;
          opacity: 0.28;
          pointer-events: none;
          filter: blur(0.4px);
          transition: opacity 280ms, transform 280ms;
        }
        #whoami .reader-spread--ghost-left {
          left: 0;
          transform: scaleX(1.1);
          transform-origin: right center;
          /* solid in the gutter, fades behind the current spread */
          -webkit-mask-image: linear-gradient(to right, black 0%, black 25%, transparent 100%);
                  mask-image: linear-gradient(to right, black 0%, black 25%, transparent 100%);
        }
        #whoami .reader-spread--ghost-right {
          right: 0;
          transform: scaleX(1.1);
          transform-origin: left center;
          -webkit-mask-image: linear-gradient(to left, black 0%, black 25%, transparent 100%);
                  mask-image: linear-gradient(to left, black 0%, black 25%, transparent 100%);
        }

        /* 2-col prose, no box wrappers -- labels do the dividing */
        #whoami .reader-spread__inner {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--sp-7);
        }
        #whoami .reader-column {
          display: flex;
          flex-direction: column;
          color: var(--fg-muted);
        }
        #whoami .reader-column p {
          margin: 0;
          color: var(--fg);
        }
        #whoami .reader-column pre {
          color: var(--fg);
        }

        /* inline subscript label -- pixel-typeface Wordmark with snake
           anim. ghosts get static text instead */
        #whoami .reader-label {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          margin: var(--sp-5) 0;
          color: var(--fg-dim);
        }
        /* rule is the muted dashed bg. ::after is the amber bloom that
           scales out after the snake finishes (delay from --bloom-delay) */
        #whoami .reader-label__rule {
          position: relative;
          flex: 1;
          height: var(--dash-thickness);
          background-image: linear-gradient(
            to right,
            var(--fg-faint) 0 var(--dash-len),
            transparent var(--dash-len) var(--dash-stride)
          );
          background-size: var(--dash-stride) 100%;
          background-repeat: repeat-x;
          overflow: hidden;
        }
        #whoami .reader-label__rule::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: linear-gradient(
            to right,
            var(--amber-hi) 0 var(--dash-len),
            transparent var(--dash-len) var(--dash-stride)
          );
          background-size: var(--dash-stride) 100%;
          background-repeat: repeat-x;
          transform: scaleX(0);
          animation: rule-bloom 560ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
          animation-delay: var(--bloom-delay, 1800ms);
        }
        /* both rules bloom outward from the wordmark in the middle */
        #whoami .reader-label__rule--left::after  { transform-origin: right center; }
        #whoami .reader-label__rule--right::after { transform-origin: left center; }
        @keyframes rule-bloom {
          to { transform: scaleX(1); }
        }
        /* ghosts stay muted -- no bloom */
        #whoami .reader-spread--ghost .reader-label__rule::after {
          animation: none;
        }
        #whoami .reader-label__text-static {
          font-size: var(--fs-xs);
          font-family: var(--font-mono);
          color: var(--amber);
          letter-spacing: 0.06em;
        }
        #whoami .reader-label__wordmark {
          flex-shrink: 0;
        }

        @media (max-width: 720px) {
          #whoami .about-reader__stage {
            grid-template-columns: 1fr;
            overflow: visible;
          }
          #whoami .reader-spread--ghost { display: none; }
          #whoami .reader-spread__inner {
            grid-template-columns: 1fr;
            gap: var(--sp-5);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          #whoami .reader-spread--current,
          #whoami .reader-spread--current[data-exiting="true"] {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
