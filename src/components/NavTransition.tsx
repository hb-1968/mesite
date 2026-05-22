// page-style curtain transitions for nav clicks.
// two prong-door panels slide in from left+right, meet at center.
// terminal pane fades in over the seam ($ cd ~/<target> + boot lines),
// page jump-scrolls, doors slide back out. section's .in is
// stripped/restored on the same beat so the wipe-rule re-draws in sync.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties
} from 'react';
import { parseRoute, type Route } from '../hooks/useRoute';

type Phase = 'idle' | 'rise' | 'boot' | 'settle' | 'exit';
type NavCtx = { navigateTo: (hash: string) => void; busy: boolean };
const NavContext = createContext<NavCtx | null>(null);

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside <NavTransition>');
  return ctx;
}

const RISE_MS    = 480;
const LINE_MS    = 140;
const TOTAL_LINES = 5;
const BOOT_MS    = LINE_MS * (TOTAL_LINES + 1);
const SETTLE_MS  = 120;
const EXIT_MS    = 480;
const SCROLL_OFFSET = 56;

type Props = { children: ReactNode; currentRoute: Route; onRouteChange: (r: Route) => void };

export function NavTransition({ children, currentRoute, onRouteChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [label, setLabel] = useState<string>('');
  const [bootStep, setBootStep] = useState<number>(0);
  const busy = phase !== 'idle';
  const queued = useRef<string | null>(null);
  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  const reduced = useRef<boolean>(false);
  useEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  const stripReveal = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el?.classList.contains('reveal')) {
      el.setAttribute('data-nav-locked', '');
      el.classList.remove('in');
    }
  }, []);

  const restoreReveal = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el?.classList.contains('reveal')) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetHeight;
      el.classList.add('in');
      el.removeAttribute('data-nav-locked');
    }
  }, []);

  const scrollToId = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const y = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: y, behavior: 'auto' });
  }, []);

  const land = useCallback(
    (target: Route) => {
      const current = currentRouteRef.current;
      const samePage = current.page === target.page;
      if (samePage) {
        const id = target.slug ?? target.anchor;
        if (id) {
          scrollToId(id);
          stripReveal(id);
        } else {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      } else {
        onRouteChange(target);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (target.slug) scrollToId(target.slug);
            else window.scrollTo({ top: 0, behavior: 'auto' });
          });
        });
      }
    },
    [scrollToId, stripReveal, onRouteChange]
  );

  const navigateTo = useCallback(
    (hash: string) => {
      if (queued.current) return;
      queued.current = hash;

      const target = parseRoute(hash);
      const human =
        target.page === 'projects'
          ? target.slug
            ? `projects/${target.slug}`
            : 'projects'
          : target.anchor ?? '~';
      setLabel(human);

      if (reduced.current) {
        land(target);
        queued.current = null;
        return;
      }

      setBootStep(0);
      setPhase('rise');

      window.setTimeout(() => {
        land(target);
        setPhase('boot');
        for (let i = 1; i <= TOTAL_LINES; i++) {
          window.setTimeout(() => setBootStep(i), i * LINE_MS);
        }
        window.setTimeout(() => {
          setPhase('settle');
          window.setTimeout(() => {
            const current = currentRouteRef.current;
            const samePage = current.page === target.page;
            if (samePage) {
              const id = target.slug ?? target.anchor;
              if (id) restoreReveal(id);
            }
            setPhase('exit');
            window.setTimeout(() => {
              setPhase('idle');
              setBootStep(0);
              queued.current = null;
            }, EXIT_MS);
          }, SETTLE_MS);
        }, BOOT_MS);
      }, RISE_MS);
    },
    [land, restoreReveal]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (href === '#') {
        e.preventDefault();
        navigateTo('');
        return;
      }
      const target = parseRoute(href);
      const id = target.slug ?? target.anchor;
      if (id && !document.getElementById(id) && target.page === currentRouteRef.current.page) {
        return;
      }
      e.preventDefault();
      navigateTo(href);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [navigateTo]);

  const value = useMemo(() => ({ navigateTo, busy }), [navigateTo, busy]);

  return (
    <NavContext.Provider value={value}>
      {children}
      <Curtain phase={phase} target={label} bootStep={bootStep} />
    </NavContext.Provider>
  );
}

// each prong = a door row, height = 100/N_PRONGS, width varies. the
// "extra" values describe how far past the 50% baseline each row goes.
// kept in [0.02, 0.28] so the comb varies without prongs vanishing or
// crossing into the other door
const N_PRONGS = 14;
const LEFT_PRONGS  = [0.08, 0.22, 0.04, 0.26, 0.10, 0.18, 0.06, 0.24, 0.12, 0.20, 0.02, 0.16, 0.14, 0.09];
const RIGHT_PRONGS = [0.18, 0.06, 0.24, 0.10, 0.20, 0.04, 0.26, 0.14, 0.08, 0.22, 0.16, 0.12, 0.03, 0.19];

function Curtain({ phase, target, bootStep }: { phase: Phase; target: string; bootStep: number }) {
  const closed = phase === 'rise' || phase === 'boot' || phase === 'settle';

  const leftTransform  = closed ? 'translateX(0)'      : 'translateX(-100%)';
  const rightTransform = closed ? 'translateX(0)'      : 'translateX(100%)';

  const transitionMs = phase === 'rise' ? RISE_MS : phase === 'exit' ? EXIT_MS : 0;
  const doorTransition = transitionMs
    ? `transform ${transitionMs}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
    : 'none';

  const terminalVisible = phase === 'boot' || phase === 'settle';

  type Line = { kind: 'cmd' | 'ok'; text: string };
  const lines: Line[] = [
    { kind: 'cmd', text: `$ cd ~/${target || 'section'}` },
    { kind: 'ok',  text: 'resolve anchor' },
    { kind: 'ok',  text: 'scroll commit' },
    { kind: 'ok',  text: 'reveal.draw()' },
    { kind: 'ok',  text: 'ready' }
  ];

  return (
    <div
      aria-hidden={phase === 'idle'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        pointerEvents: phase === 'idle' ? 'none' : 'auto',
        overflow: 'hidden'
      }}
    >
      {/* left door, prongs on right edge */}
      <Door
        side="left"
        prongs={LEFT_PRONGS}
        transform={leftTransform}
        transition={doorTransition}
      />

      {/* right door, prongs on left edge */}
      <Door
        side="right"
        prongs={RIGHT_PRONGS}
        transform={rightTransform}
        transition={doorTransition}
      />

      {/* terminal pane fades in once doors are seated */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--sp-5)',
          opacity: terminalVisible ? 1 : 0,
          transform: terminalVisible ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 220ms linear, transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          pointerEvents: 'none'
        }}
      >
        <div
          role="presentation"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--fg-muted)',
            fontSize: 'var(--fs-sm)',
            lineHeight: 1.7,
            background: 'var(--bg-deep)',
            border: '1px solid var(--amber)',
            boxShadow: '0 0 0 4px var(--bg-base), 0 0 0 5px var(--amber)',
            width: 'min(460px, 92vw)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 12px',
              borderBottom: '1px solid var(--fg-faint)',
              color: 'var(--fg-dim)',
              fontSize: 'var(--fs-xs)',
              letterSpacing: '0.06em'
            }}
          >
            <span>─ sh ─</span>
            <span>{String(bootStep).padStart(2, '0')} / {TOTAL_LINES}</span>
          </div>
          <div style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
            {lines.map((ln, idx) => {
              const i = idx + 1;
              const visible = bootStep >= i;
              const typing = bootStep === i;
              return (
                <div key={i} style={{ minHeight: '1.7em' }}>
                  {visible && (
                    ln.kind === 'cmd' ? (
                      <span style={{ color: 'var(--amber)' }}>
                        {ln.text}{typing && <span className="cursor" aria-hidden="true" />}
                      </span>
                    ) : (
                      <span>
                        <span style={{ color: 'var(--olive)' }}>[OK]</span>
                        {'  '}
                        <span>{ln.text}</span>
                        {typing && <span className="cursor" aria-hidden="true" />}
                        <DotPad text={`[OK]  ${ln.text}`} to={36} />
                        <span style={{ color: 'var(--fg-dim)' }}>done</span>
                      </span>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Door({
  side,
  prongs,
  transform,
  transition
}: {
  side: 'left' | 'right';
  prongs: number[];
  transform: string;
  transition: string;
}) {
  const isLeft = side === 'left';
  const containerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    [isLeft ? 'left' : 'right']: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: isLeft ? 'flex-start' : 'flex-end',
    transform,
    transition,
    willChange: 'transform'
  };

  return (
    <div style={containerStyle}>
      {prongs.map((extra, i) => {
        // 50% baseline plus the per-prong extra. The amber edge on the
        // inner side is what reads as a "tooth" when doors interlace.
        const widthPct = 50 + extra * 100;
        // bg-overlay is the warmest/most-contrasting surface in the
        // palette in both themes — clearly stands apart from the
        // bg-base page background so the comb silhouette is legible.
        // A soft amber drop-shadow on the inner edge gives each prong
        // depth against neighbouring rows.
        const prongStyle: CSSProperties = {
          height: `${100 / N_PRONGS}%`,
          width: `${widthPct}%`,
          background: 'var(--bg-overlay)',
          ...(isLeft
            ? {
                borderRight: '2px solid var(--amber)',
                boxShadow:
                  'inset -1px 0 0 var(--amber-hi), 4px 0 12px -2px rgba(0,0,0,0.45)'
              }
            : {
                borderLeft: '2px solid var(--amber)',
                boxShadow:
                  'inset 1px 0 0 var(--amber-hi), -4px 0 12px -2px rgba(0,0,0,0.45)'
              })
        };
        return <div key={i} style={prongStyle} />;
      })}
    </div>
  );
}

function DotPad({ text, to }: { text: string; to: number }) {
  const n = Math.max(2, to - text.length);
  return <span style={{ color: 'var(--fg-faint)' }}>{' ' + '.'.repeat(n) + ' '}</span>;
}
