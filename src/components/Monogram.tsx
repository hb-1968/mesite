// hero monogram -- big "hb" stacked over the "hunterbridges" wordmark.
// snake-paints on mount, then re-paints whenever the monogram scrolls
// back into view (IO bumps playKey on each enter).
//
// easter egg ladder:
//   1. click `h`, then `b` within ~3s -> maze game on filled cells of
//      big hb. 4px hitbox, 2px steps, wall hit = instant fail.
//      goal: thread up to cell (7,0), the topmost cell of b's left
//      stem (requires looping around b's bowl).
//   1b. bypass: while phase=idle, typing `uninet` skips the maze and
//       unlocks the reward button. the `hunter` half of the small
//       wordmark flashes amber-hi on each letter typed -- gives the
//       name on the left a "keyboard" feel without rewriting the
//       wordmark renderer.
//   2. win the maze (or bypass) -> reward button [continue?] reveals
//      above the monogram. session-scoped, no persistence.
//   3. click the button -> the monogram fades out, a pixel hill paints
//      itself in two passes (surface outline first, then fill below),
//      and a sisyphus sprite (person silhouette pushing a ball)
//      appears at the bottom. hold W/up to push it up the slope;
//      release to let it slide back. there's a continuous
//      (height-scaled) chance per frame for the ball to slip and
//      plunge to the bottom. esc exits.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Wordmark, composeWordmark } from './Wordmark';

// ~70 cells/sec. wordmark has 209 cells -> ~3.6s for the whole intro
const CELL_DELAY_MS = 14;

// hb cells: 13 (h) + 2 (bridge) + 17 (b) = 32
const HB_CELL_COUNT = 32;

// beat between hb and wordmark
const HANDOFF_MS = 240;

const WORDMARK_START_MS = HB_CELL_COUNT * CELL_DELAY_MS + HANDOFF_MS;

// big "hb" geometry -- must mirror the props we pass to <Wordmark>
const HB_CELL_SIZE = 14;
const HB_JOINER = 2;

// shared dot/ball hitbox -- both games use the same 4px square so the
// visual identity carries across
const HITBOX = 4;

// --- maze 1 -----------------------------------------------------

const STEP = 2;
const START_PX = { x: 5, y: 5 };
const EXIT_CELL: readonly [number, number] = [7, 0];
const ARM_TIMEOUT_MS = 3000;
const WIN_DISMISS_MS = 1800;

const pxToCell = (px: number) => Math.floor(px / HB_CELL_SIZE);
const cellKey = (c: number, r: number) => `${c},${r}`;

function isWalkable(x: number, y: number, grid: boolean[][]): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const corners: [number, number][] = [
    [x, y],
    [x + HITBOX - 1, y],
    [x, y + HITBOX - 1],
    [x + HITBOX - 1, y + HITBOX - 1]
  ];
  for (const [px, py] of corners) {
    const cc = pxToCell(px);
    const rr = pxToCell(py);
    if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return false;
    if (!grid[rr][cc]) return false;
  }
  return true;
}

function centerCell(x: number, y: number): [number, number] {
  const half = Math.floor(HITBOX / 2);
  return [pxToCell(x + half), pxToCell(y + half)];
}

// --- sisyphus ---------------------------------------------------

// denser grid -- 48x22 at 7px ≈ 336x154 px total. ~3x cell count of
// the previous pass; reads as a smooth parabola at this density
const HILL_COLS = 48;
const HILL_ROWS = 22;
const HILL_CELL_SIZE = 7;

// hill paints faster than the wordmark -- more cells, but we don't
// want a 5s reveal. delay = 5ms, duration = 2 strides keeps the
// head-flash phase to ~1 cell at a time
const HILL_CELL_DELAY_MS = 5;
const HILL_CELL_DURATION_MS = HILL_CELL_DELAY_MS * 2;

// sprite is an SVG of a person pushing a ball. ball CENTER lives at
// (SPRITE_BALL_X, SPRITE_BALL_Y) inside the sprite's viewBox so we
// can pin the sprite's position by the ball, not the corner.
// 2x bigger than the previous pass for visibility on the dark bg
const SPRITE_W = 28;
const SPRITE_H = 20;
const SPRITE_BALL_X = 20;
const SPRITE_BALL_Y = 8;
const BALL_RADIUS = 6;

// physics rates -- per second. dt is applied at frame time so the
// game runs at the same pace regardless of monitor refresh
const CLIMB_RATE = 0.18;      // t units / sec under full grip
const GRIP_DECAY = 0.13;      // grip lost / sec while holding
const GRIP_RECOVER = 0.55;    // grip regained / sec when released
const GRAVITY = 0.32;         // t units / sec sliding back
// slip prob per second = SLIP_K * t^2. at t=0.3 -> ~0.05/s. at t=0.9
// -> ~0.49/s -- ie a ~2s mean time to slip near the top
const SLIP_K = 0.6;
// when slip fires, ball rolls under acceleration -- gravity-style
// pickup of speed -- rather than teleporting to t=0. accel is in
// t-units/sec^2. at t=0.5 the slide takes ~0.4s; at t=0.9 ~0.55s
const SLIP_ACCEL = 6;

// parabolic-ish slope: rises gently at first, steepens to the right.
// exponent > 1 = harder near the top, which is the point
function hillSurfaceRow(col: number): number {
  const maxCol = HILL_COLS - 1;
  const maxRow = HILL_ROWS - 1;
  const norm = Math.max(0, Math.min(1, col / maxCol));
  return Math.floor(maxRow * (1 - Math.pow(norm, 1.5)) + 0.5);
}

// two-pass paint order. pass 1 draws the surface outline (one cell
// per column, left-to-right) so the silhouette of the hill appears
// first. pass 2 fills below the surface, column-by-column, so the
// hill "refines itself" -- silhouette resolves to a solid form
const HILL_PATH: [number, number][] = (() => {
  const path: [number, number][] = [];
  // pass 1 -- surface outline
  for (let c = 0; c < HILL_COLS; c++) {
    path.push([c, hillSurfaceRow(c)]);
  }
  // pass 2 -- fill below the surface
  for (let c = 0; c < HILL_COLS; c++) {
    const sr = hillSurfaceRow(c);
    for (let r = sr + 1; r < HILL_ROWS; r++) {
      path.push([c, r]);
    }
  }
  return path;
})();

// linear interp between surface rows so the ball's y is smooth even
// as the cell under it stays discrete
function smoothSurfaceY(xCellFloat: number): number {
  const lo = Math.max(0, Math.min(HILL_COLS - 1, Math.floor(xCellFloat)));
  const hi = Math.min(HILL_COLS - 1, lo + 1);
  const frac = xCellFloat - lo;
  return hillSurfaceRow(lo) * (1 - frac) + hillSurfaceRow(hi) * frac;
}

// --- bypass keyboard --------------------------------------------

// typing this anywhere while phase=idle && !rewarded skips the maze
const BYPASS_CODE = 'uninet';

// width of the `hunter` half of the small wordmark at cellSize=3.
// h+u+n+t+e+r = 6 letters * 5 cols + (2+2+1+1+2) joiner cols = 38
// cols. at 3 px/cell = 114 px. hardcoded so the flash overlay can
// size itself without re-deriving from typeface internals
const HUNTER_WIDTH_PX = 114;

// --- ambient music ----------------------------------------------

// after this many ms in sisyphus, mount an offscreen iframe that
// plays the audio. user already gestured (clicked [continue?]) so
// browsers should allow autoplay
const MUSIC_DELAY_MS = 45_000;

// privacy-enhanced domain so YT doesn't drop cookies unless the
// embed gets interacted with directly
const MUSIC_SRC =
  'https://www.youtube-nocookie.com/embed/CB42Hz349JM' +
  '?autoplay=1&controls=0&playsinline=1&rel=0';

// --- state machine ----------------------------------------------

type Phase =
  | 'idle'
  | 'maze-armed'
  | 'maze-active'
  | 'maze-won'
  | 'sisyphus-active';

// --- component --------------------------------------------------

export function Monogram() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let first = true;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (first) { first = false; return; }
        if (entry.isIntersecting) setPlayKey(k => k + 1);
      },
      { threshold: 0.1 }
    );
    obs.observe(root);
    return () => obs.disconnect();
  }, []);

  const hbGrid = useMemo(() => composeWordmark('hb', HB_JOINER), []);
  const hbRows = hbGrid.length;
  const hbCols = hbGrid[0]?.length ?? 0;

  const [phase, setPhase] = useState<Phase>('idle');
  const [rewarded, setRewarded] = useState(false);

  // maze state
  const [dot, setDot] = useState<{ x: number; y: number }>(START_PX);
  const [trail, setTrail] = useState<Set<string>>(() => new Set());
  const armTimer = useRef<number | null>(null);
  // win timer in a ref so the effect that creates it can re-run on
  // phase change without trampling the pending timeout
  const winTimer = useRef<number | null>(null);
  const dotRef = useRef(dot);
  useEffect(() => { dotRef.current = dot; }, [dot]);

  // sisyphus state. ballT is the state we render from; ballTRef stays
  // in sync so the physics loop can read it without re-creating itself
  const [ballT, setBallT] = useState(0);
  const ballTRef = useRef(0);
  useEffect(() => { ballTRef.current = ballT; }, [ballT]);
  const holdingRef = useRef(false);
  const gripRef = useRef(1);
  // slip state -- while active, ignore input and let the ball roll
  // back under acceleration. velocity ramps up over the slide so it
  // reads as a real plunge, not a teleport
  const slipRef = useRef<{ active: boolean; velocity: number }>({
    active: false,
    velocity: 0
  });
  // playKey for hill snake-paint -- bump on each sisyphus entry so
  // the paint replays from frame 0
  const [hillKey, setHillKey] = useState(0);

  // bypass keyboard. bufferRef keeps the last N typed letters. flashKey
  // re-mounts the flash overlay so its animation restarts on each key
  const bufferRef = useRef('');
  const [flashKey, setFlashKey] = useState(0);

  // ambient music: flips true after MUSIC_DELAY_MS in sisyphus, gets
  // un-flipped (and the iframe unmounts) the moment we leave
  const [musicPlaying, setMusicPlaying] = useState(false);

  function clearArmTimer() {
    if (armTimer.current != null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  }

  function resetMaze() {
    clearArmTimer();
    setPhase('idle');
    setDot(START_PX);
    setTrail(new Set());
  }

  function startMaze() {
    clearArmTimer();
    setDot(START_PX);
    const [sc, sr] = centerCell(START_PX.x, START_PX.y);
    setTrail(new Set([cellKey(sc, sr)]));
    setPhase('maze-active');
  }

  function onClickH() {
    if (phase !== 'idle' && phase !== 'maze-armed') return;
    clearArmTimer();
    setPhase('maze-armed');
    armTimer.current = window.setTimeout(() => {
      setPhase('idle');
      armTimer.current = null;
    }, ARM_TIMEOUT_MS);
  }

  function onClickB() {
    if (phase !== 'maze-armed') return;
    startMaze();
  }

  function onClickReward() {
    if (phase !== 'idle') return;
    // reset sisyphus state, kick off the hill snake-paint
    ballTRef.current = 0;
    setBallT(0);
    gripRef.current = 1;
    holdingRef.current = false;
    slipRef.current.active = false;
    slipRef.current.velocity = 0;
    setHillKey(k => k + 1);
    setPhase('sisyphus-active');
  }

  function exitSisyphus() {
    holdingRef.current = false;
    setPhase('idle');
  }

  // --- maze movement ---
  useEffect(() => {
    if (phase !== 'maze-active') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        resetMaze();
        return;
      }
      const k = e.key.toLowerCase();
      let dx = 0, dy = 0;
      if (k === 'w' || k === 'arrowup')         dy = -STEP;
      else if (k === 's' || k === 'arrowdown')  dy = STEP;
      else if (k === 'a' || k === 'arrowleft')  dx = -STEP;
      else if (k === 'd' || k === 'arrowright') dx = STEP;
      else return;
      e.preventDefault();
      const cur = dotRef.current;
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isWalkable(nx, ny, hbGrid)) {
        // wall hit -- auto-esc out
        resetMaze();
        return;
      }
      setDot({ x: nx, y: ny });
      const [cc, rr] = centerCell(nx, ny);
      setTrail(t => {
        const key = cellKey(cc, rr);
        if (t.has(key)) return t;
        const next = new Set(t);
        next.add(key);
        return next;
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, hbGrid]);

  // --- maze win ---
  // ref-stored timer -- if we returned `() => clearTimeout(t)` as the
  // cleanup, the very next render (triggered by setPhase below) would
  // run that cleanup and cancel our own timeout. so we keep the timer
  // outside the effect's lifecycle and only cancel it on unmount
  useEffect(() => {
    if (phase !== 'maze-active') return;
    const [cc, rr] = centerCell(dot.x, dot.y);
    if (cc !== EXIT_CELL[0] || rr !== EXIT_CELL[1]) return;
    setPhase('maze-won');
    setPlayKey(k => k + 1);
    if (winTimer.current != null) window.clearTimeout(winTimer.current);
    winTimer.current = window.setTimeout(() => {
      // unlock the reward -- transition to idle BUT keep rewarded
      setPhase('idle');
      setDot(START_PX);
      setTrail(new Set());
      setRewarded(true);
      winTimer.current = null;
    }, WIN_DISMISS_MS);
  }, [dot, phase]);

  // --- click-outside exit (applies to both games) ---
  useEffect(() => {
    if (phase !== 'maze-active' && phase !== 'sisyphus-active') return;
    function onDocMouseDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) {
        if (phase === 'maze-active') resetMaze();
        else if (phase === 'sisyphus-active') exitSisyphus();
      }
    }
    window.addEventListener('mousedown', onDocMouseDown);
    return () => window.removeEventListener('mousedown', onDocMouseDown);
  }, [phase]);

  // --- sisyphus input ---
  useEffect(() => {
    if (phase !== 'sisyphus-active') return;
    function onDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitSisyphus();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup' || k === ' ') {
        e.preventDefault();
        holdingRef.current = true;
      }
    }
    function onUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup' || k === ' ') {
        holdingRef.current = false;
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      holdingRef.current = false;
    };
  }, [phase]);

  // --- bypass keyboard ---
  // listen while we're idle and not yet rewarded. tracks last N keys,
  // unlocks the reward button if the buffer ends in BYPASS_CODE.
  // each letter keypress also bumps flashKey so the `hunter` overlay
  // pulses -- cheap visual cue that the keyboard is hot
  useEffect(() => {
    if (phase !== 'idle' || rewarded) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      // only ascii letters count. avoids polluting the buffer with
      // arrow keys, shift, etc when user is just navigating
      if (k.length !== 1 || !/[a-zA-Z]/.test(k)) return;
      const ch = k.toLowerCase();
      bufferRef.current = (bufferRef.current + ch).slice(-BYPASS_CODE.length);
      setFlashKey(fk => fk + 1);
      if (bufferRef.current === BYPASS_CODE) {
        bufferRef.current = '';
        setRewarded(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, rewarded]);

  // --- sisyphus physics loop ---
  useEffect(() => {
    if (phase !== 'sisyphus-active') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let t = ballTRef.current;

      if (slipRef.current.active) {
        // mid-slip: ball accelerates downhill, player input ignored.
        // ends when it hits the bottom -- then grip resets and play
        // resumes from t=0
        slipRef.current.velocity += SLIP_ACCEL * dt;
        t -= slipRef.current.velocity * dt;
        if (t <= 0) {
          t = 0;
          slipRef.current.active = false;
          slipRef.current.velocity = 0;
          gripRef.current = 1;
        }
      } else if (holdingRef.current) {
        gripRef.current = Math.max(0, gripRef.current - GRIP_DECAY * dt);
        t += CLIMB_RATE * gripRef.current * dt;
      } else {
        gripRef.current = Math.min(1, gripRef.current + GRIP_RECOVER * dt);
        t -= GRAVITY * dt;
      }
      if (t < 0) t = 0;
      if (t > 1) t = 1;

      // stochastic slip check -- only when not already slipping.
      // chance per sec scales with t^2 so it's tame at the base and
      // unforgiving at the top
      if (!slipRef.current.active) {
        const slipPerSec = SLIP_K * t * t;
        if (Math.random() < slipPerSec * dt) {
          slipRef.current.active = true;
          slipRef.current.velocity = 0;
        }
      }

      ballTRef.current = t;
      setBallT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // --- music timer ---
  // 45s into sisyphus, swap in the ambient iframe. cleanup unmounts
  // it (audio stops) when phase changes away or component unmounts
  useEffect(() => {
    if (phase !== 'sisyphus-active') {
      setMusicPlaying(false);
      return;
    }
    const t = window.setTimeout(() => {
      setMusicPlaying(true);
    }, MUSIC_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      setMusicPlaying(false);
    };
  }, [phase]);

  // cleanup any pending timers on unmount
  useEffect(() => () => {
    clearArmTimer();
    if (winTimer.current != null) {
      window.clearTimeout(winTimer.current);
      winTimer.current = null;
    }
  }, []);

  const showMazeOverlay = phase === 'maze-active' || phase === 'maze-won';
  const inSisyphus = phase === 'sisyphus-active';

  return (
    <div ref={rootRef} className="monogram" aria-label="Hunter Bridges">
      {!inSisyphus && (
        <div className="monogram__group monogram__group--enter">
          {rewarded && phase === 'idle' && (
            <button
              type="button"
              className="monogram__reward"
              onClick={onClickReward}
            >
              [continue?]
            </button>
          )}

          <div
            className={
              'monogram__stage' +
              (phase === 'maze-active' ? ' is-active' : '')
            }
            style={{
              width: `${hbCols * HB_CELL_SIZE}px`,
              height: `${hbRows * HB_CELL_SIZE}px`
            }}
          >
            <Wordmark
              text="hb"
              cellSize={HB_CELL_SIZE}
              color="var(--amber)"
              joinerCols={HB_JOINER}
              decorative
              animate
              cellDelayMs={CELL_DELAY_MS}
              playKey={playKey}
            />

            <span
              className="monogram__hit monogram__hit--h"
              onClick={onClickH}
              role="presentation"
              aria-hidden
            />
            <span
              className="monogram__hit monogram__hit--b"
              onClick={onClickB}
              role="presentation"
              aria-hidden
            />

            {showMazeOverlay && (
              <>
                <span
                  className="monogram__exit"
                  style={{
                    transform: `translate(${EXIT_CELL[0] * HB_CELL_SIZE}px, ${EXIT_CELL[1] * HB_CELL_SIZE}px)`,
                    width: `${HB_CELL_SIZE}px`,
                    height: `${HB_CELL_SIZE}px`
                  }}
                />
                {Array.from(trail).map(key => {
                  const [c, r] = key.split(',').map(Number);
                  return (
                    <span
                      key={`trail-${key}`}
                      className="monogram__trail"
                      style={{
                        transform: `translate(${c * HB_CELL_SIZE}px, ${r * HB_CELL_SIZE}px)`,
                        width: `${HB_CELL_SIZE}px`,
                        height: `${HB_CELL_SIZE}px`
                      }}
                    />
                  );
                })}
                <span
                  className="monogram__dot"
                  style={{
                    transform: `translate(${dot.x}px, ${dot.y}px)`,
                    width: `${HITBOX}px`,
                    height: `${HITBOX}px`
                  }}
                />
              </>
            )}
          </div>

          <div className="monogram__small-wm">
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
            {/* bypass-keyboard flash. only the `hunter` half gets it --
                pulses amber-hi when a letter key fires. keyed on
                flashKey so each press restarts the animation */}
            {flashKey > 0 && phase === 'idle' && !rewarded && (
              <span
                key={flashKey}
                className="monogram__keyboard-flash"
                style={{ width: `${HUNTER_WIDTH_PX}px` }}
                aria-hidden
              />
            )}
          </div>

          {phase === 'maze-active' && (
            <div className="monogram__hint" aria-hidden>
              wasd · esc
            </div>
          )}
        </div>
      )}

      {inSisyphus && (
        <div className="monogram__group monogram__group--enter">
          <HillStage hillKey={hillKey} ballT={ballT} />
          <div className="monogram__hint" aria-hidden>
            hold w · esc
          </div>
        </div>
      )}

      {/* hidden audio iframe -- mounts after 45s in sisyphus. lives
          offscreen via CSS so it can play but not show. unmounts when
          we exit sisyphus, which cuts the audio */}
      {musicPlaying && (
        <iframe
          className="monogram__audio"
          src={MUSIC_SRC}
          title="Me and the Birds -- Duster"
          allow="autoplay; encrypted-media"
          aria-hidden
          tabIndex={-1}
        />
      )}
    </div>
  );
}

// hill grid + sisyphus sprite. cells snake-paint in via the
// wordmark--snake keyframe; key on hillKey so each entry replays from
// frame 0. HILL_PATH is ordered outline-first then fill-below so the
// silhouette appears first and the body refines under it
function HillStage({ hillKey, ballT }: { hillKey: number; ballT: number }) {
  const cells: JSX.Element[] = [];
  HILL_PATH.forEach(([c, r], idx) => {
    const delay = idx * HILL_CELL_DELAY_MS;
    cells.push(
      <span
        key={`${c}-${r}`}
        data-on="true"
        style={{
          gridColumn: c + 1,
          gridRow: r + 1,
          ['--snake-color' as string]: 'var(--amber)',
          ['--snake-delay' as string]: `${delay}ms`,
          ['--snake-duration' as string]: `${HILL_CELL_DURATION_MS}ms`
        }}
      />
    );
  });

  // ball center sits on top of the surface curve. sprite top-left is
  // back-computed so the in-sprite ball coords land at that center
  const xCellFloat = ballT * (HILL_COLS - 1);
  const surfaceFloat = smoothSurfaceY(xCellFloat);
  const ballCenterX = (xCellFloat + 0.5) * HILL_CELL_SIZE;
  // ball BOTTOM kisses the top edge of the surface cell. center is
  // BALL_RADIUS above that
  const ballCenterY = surfaceFloat * HILL_CELL_SIZE - BALL_RADIUS;
  const spriteX = ballCenterX - SPRITE_BALL_X;
  const spriteY = ballCenterY - SPRITE_BALL_Y;

  return (
    <div
      key={hillKey}
      className="monogram__hill wordmark--snake"
      style={{
        gridTemplateColumns: `repeat(${HILL_COLS}, ${HILL_CELL_SIZE}px)`,
        gridTemplateRows: `repeat(${HILL_ROWS}, ${HILL_CELL_SIZE}px)`,
        width: `${HILL_COLS * HILL_CELL_SIZE}px`,
        height: `${HILL_ROWS * HILL_CELL_SIZE}px`
      }}
      aria-hidden
    >
      {cells}
      <SisyphusSprite x={spriteX} y={spriteY} />
    </div>
  );
}

// pixel-art silhouette: head + body + arms + legs on the left, ball
// on the right. arms reach forward into the ball. all currentColor so
// the CSS can theme it. coords are 2x the previous pass so the figure
// reads at hero scale. crispEdges keeps the circle pixelated
function SisyphusSprite({ x, y }: { x: number; y: number }) {
  return (
    <svg
      className="monogram__sprite"
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      width={SPRITE_W}
      height={SPRITE_H}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      aria-hidden
    >
      {/* head */}
      <rect x={2} y={2} width={4} height={4} fill="currentColor" />
      {/* shoulder/arm reaching forward into the ball */}
      <rect x={4} y={6} width={10} height={2} fill="currentColor" />
      {/* torso */}
      <rect x={2} y={8} width={4} height={4} fill="currentColor" />
      {/* legs splayed -- back leg planted further down the slope */}
      <rect x={2} y={12} width={2} height={6} fill="currentColor" />
      <rect x={6} y={12} width={2} height={6} fill="currentColor" />
      {/* ball */}
      <circle
        cx={SPRITE_BALL_X}
        cy={SPRITE_BALL_Y}
        r={BALL_RADIUS}
        fill="currentColor"
      />
    </svg>
  );
}
