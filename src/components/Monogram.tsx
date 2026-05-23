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
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
// can pin the sprite's position by the ball, not the corner. ball
// is now the dominant element -- diameter 20, ~bigger than the
// person figure on its left
const SPRITE_W = 32;
const SPRITE_H = 24;
const SPRITE_BALL_X = 22;
const SPRITE_BALL_Y = 12;
const BALL_RADIUS = 10;

// physics rates -- per second. dt is applied at frame time so the
// game runs at the same pace regardless of monitor refresh
const CLIMB_RATE = 0.18;      // t units / sec under full grip
const GRIP_DECAY = 0.13;      // grip lost / sec while holding
const GRIP_RECOVER = 0.55;    // grip regained / sec when released
const GRAVITY = 0.32;         // t units / sec sliding back
// slip prob per second = SLIP_K * t^3. cube (vs square) concentrates
// the failure window near the top -- 0.9 is occasionally reachable
// but the last 10% stays punishing. at t=0.5 -> ~0.06/s. at t=0.9
// -> ~0.36/s. at t=1.0 -> 0.5/s
const SLIP_K = 0.5;
// when slip fires, ball rolls under acceleration -- gravity-style
// pickup of speed -- rather than teleporting to t=0. accel is in
// t-units/sec^2. at t=0.5 the slide takes ~0.4s; at t=0.9 ~0.55s
const SLIP_ACCEL = 6;

// mercy cap. hold w for this long without releasing and the ball
// snaps to the top -- sisyphus pays off only if you commit. 7 min
const HARD_SUCCESS_HOLD_MS = 7 * 60 * 1000;
// after winning, pause this long before the two choice buttons
// appear above the sprite -- gives the moment room to land
const CHOICE_DELAY_MS = 3000;
// if the user doesn't pick within this window after the buttons
// reveal, default to `return to your beginnings`
const CHOICE_TIMEOUT_MS = 15000;

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

// typing this while phase=idle && !rewarded skips the maze
const BYPASS_CODE = 'uninet';
// personal shortcut -- typing this from the hero (phase=idle) routes
// straight to #hole regardless of game state
const HOLE_CODE = 'maestrul';
// buffer holds the last N letters where N = the longer code, so
// either trigger can land via endsWith
const KEY_BUFFER_LEN = Math.max(BYPASS_CODE.length, HOLE_CODE.length);

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
  | 'sisyphus-active'
  | 'sisyphus-won';

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
  // continuous-hold tracking for the 7-min mercy cap. set on the
  // leading edge of a W keydown, cleared on keyup. when the elapsed
  // crosses HARD_SUCCESS_HOLD_MS, succeededRef flips and the player
  // snaps to t=1 regardless of slip pressure
  const continuousHoldStartRef = useRef<number | null>(null);
  const succeededRef = useRef(false);
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

  // choice buttons reveal CHOICE_DELAY_MS after entering sisyphus-won
  const [showChoice, setShowChoice] = useState(false);

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
    continuousHoldStartRef.current = null;
    succeededRef.current = false;
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
        // only stamp the start on the leading edge -- key repeat
        // fires onDown every ~30ms, we don't want to keep resetting
        if (!holdingRef.current) {
          holdingRef.current = true;
          continuousHoldStartRef.current = performance.now();
        }
      }
    }
    function onUp(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup' || k === ' ') {
        holdingRef.current = false;
        continuousHoldStartRef.current = null;
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      holdingRef.current = false;
      continuousHoldStartRef.current = null;
    };
  }, [phase]);

  // --- bypass keyboard ---
  // listen while we're idle. tracks last N keys; two recognized
  // codes:
  //   `uninet`   -> skip the maze (only fires if not already rewarded)
  //   `maestrul` -> hidden personal shortcut, routes straight to /hole
  // each letter keypress also bumps flashKey so the `hunter` overlay
  // pulses -- cheap visual cue that the keyboard is hot
  useEffect(() => {
    if (phase !== 'idle') return;
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      // only ascii letters count. avoids polluting the buffer with
      // arrow keys, shift, etc when user is just navigating
      if (k.length !== 1 || !/[a-zA-Z]/.test(k)) return;
      const ch = k.toLowerCase();
      bufferRef.current = (bufferRef.current + ch).slice(-KEY_BUFFER_LEN);
      setFlashKey(fk => fk + 1);
      // maestrul -- personal shortcut to the hole, fires regardless
      // of rewarded state. endsWith because the buffer may carry
      // unrelated trailing chars from prior keystrokes
      if (bufferRef.current.endsWith(HOLE_CODE)) {
        bufferRef.current = '';
        window.location.hash = 'hole';
        return;
      }
      // uninet -- only useful before the maze is solved
      if (!rewarded && bufferRef.current.endsWith(BYPASS_CODE)) {
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

      // 7-min mercy cap: if W has been held unbroken for the full
      // window, snap to the top and transition to the win celebration
      if (
        holdingRef.current &&
        continuousHoldStartRef.current != null &&
        !succeededRef.current &&
        now - continuousHoldStartRef.current >= HARD_SUCCESS_HOLD_MS
      ) {
        succeededRef.current = true;
        t = 1;
        slipRef.current.active = false;
        slipRef.current.velocity = 0;
        ballTRef.current = t;
        setBallT(t);
        // re-fire hill paint as a victory beat, then advance phase --
        // the next render cleans up this loop
        setHillKey(k => k + 1);
        setPhase('sisyphus-won');
        return;
      }

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

      // stochastic slip check -- only when not already slipping AND
      // not in the post-success grace window. chance per sec scales
      // with t^3 so it's tame on the lower slope and disproportionate
      // near the top
      if (!slipRef.current.active && !succeededRef.current) {
        const slipPerSec = SLIP_K * t * t * t;
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
  // 45s into sisyphus, swap in the ambient iframe. music cuts the
  // moment phase leaves sisyphus-active -- including when the 7-min
  // mercy cap flips us into sisyphus-won. silence is part of the
  // win payoff
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
    };
  }, [phase]);

  // reset everything sisyphus-specific. shared by the two won-state
  // exit paths (button click + auto-default)
  function returnToBeginnings() {
    setPhase('idle');
    setShowChoice(false);
    ballTRef.current = 0;
    setBallT(0);
    gripRef.current = 1;
    holdingRef.current = false;
    slipRef.current.active = false;
    slipRef.current.velocity = 0;
    continuousHoldStartRef.current = null;
    succeededRef.current = false;
  }

  function seeHowFarTheHoleGoes() {
    // route change unmounts monogram, which cleans up all the state
    // we'd otherwise reset by hand
    window.location.hash = 'hole';
  }

  // --- sisyphus victory: stage 1 - reveal choice ---
  // 3s pause so the win lands before any UI demands a decision
  useEffect(() => {
    if (phase !== 'sisyphus-won') {
      setShowChoice(false);
      return;
    }
    const reveal = window.setTimeout(() => {
      setShowChoice(true);
    }, CHOICE_DELAY_MS);
    return () => window.clearTimeout(reveal);
  }, [phase]);

  // --- sisyphus victory: stage 2 - auto-default ---
  // 15s after the buttons appear, fall back to "return to beginnings"
  // if the user hasn't picked
  useEffect(() => {
    if (phase !== 'sisyphus-won' || !showChoice) return;
    const t = window.setTimeout(returnToBeginnings, CHOICE_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [phase, showChoice]);

  // cleanup any pending timers on unmount
  useEffect(() => () => {
    clearArmTimer();
    if (winTimer.current != null) {
      window.clearTimeout(winTimer.current);
      winTimer.current = null;
    }
  }, []);

  const showMazeOverlay = phase === 'maze-active' || phase === 'maze-won';
  // hill + ball stay rendered through the win celebration so the
  // payoff isn't cut to black at the moment of victory
  const inSisyphus =
    phase === 'sisyphus-active' || phase === 'sisyphus-won';

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
          <HillStage
            hillKey={hillKey}
            ballT={ballT}
            choice={
              phase === 'sisyphus-won' && showChoice ? (
                <div className="monogram__choice">
                  <button
                    type="button"
                    className="monogram__choice-btn"
                    onClick={returnToBeginnings}
                  >
                    return to your beginnings
                  </button>
                  <button
                    type="button"
                    className="monogram__choice-btn"
                    onClick={seeHowFarTheHoleGoes}
                  >
                    see how far the hole really goes
                  </button>
                </div>
              ) : null
            }
          />
          {phase === 'sisyphus-active' && (
            <div className="monogram__hint" aria-hidden>
              hold w · esc
            </div>
          )}
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
// silhouette appears first and the body refines under it.
// `choice` slot lets the victory buttons live in the same coordinate
// space as the sprite so they can anchor above it
function HillStage({
  hillKey,
  ballT,
  choice
}: {
  hillKey: number;
  ballT: number;
  choice?: ReactNode;
}) {
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

  // roll angle (deg) -- derived from horizontal position so the ball
  // visibly rotates with motion. circumference = 2*pi*r so full
  // rotation = ~62.8 px of rolling. forward-then-back motion winds
  // the angle back, mirroring how a real ball would roll
  const rollAngle =
    (ballCenterX / (2 * Math.PI * BALL_RADIUS)) * 360;

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
      <SisyphusSprite x={spriteX} y={spriteY} rollAngle={rollAngle} />
      {choice}
    </div>
  );
}

// pixel-art silhouette: person on the left, ball on the right.
// person rects use currentColor (amber-hi via CSS). the ball is
// amber-hi outer + a bg-deep half-fill clipped to the ball outline;
// rotating that fill on rollAngle makes the roll visible -- a
// uniform amber circle wouldn't show rotation at all
function SisyphusSprite({
  x,
  y,
  rollAngle
}: {
  x: number;
  y: number;
  rollAngle: number;
}) {
  // unique id per render so the clipPath doesn't collide across SVGs
  const clipId = useId();
  return (
    <svg
      className="monogram__sprite"
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      width={SPRITE_W}
      height={SPRITE_H}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <circle
            cx={SPRITE_BALL_X}
            cy={SPRITE_BALL_Y}
            r={BALL_RADIUS}
          />
        </clipPath>
      </defs>

      {/* head */}
      <rect x={3} y={3} width={4} height={4} fill="currentColor" />
      {/* shoulder/arm reaching forward into the ball */}
      <rect x={5} y={8} width={9} height={2} fill="currentColor" />
      {/* torso */}
      <rect x={3} y={10} width={4} height={4} fill="currentColor" />
      {/* legs splayed -- back leg planted further down the slope */}
      <rect x={3} y={14} width={2} height={6} fill="currentColor" />
      <rect x={7} y={14} width={2} height={6} fill="currentColor" />

      {/* ball: amber-hi outer disc, then a rotating bg-deep half
          clipped to the ball outline so the dark side spins visibly
          as the ball rolls */}
      <circle
        cx={SPRITE_BALL_X}
        cy={SPRITE_BALL_Y}
        r={BALL_RADIUS}
        fill="currentColor"
      />
      <g
        clipPath={`url(#${clipId})`}
        transform={`rotate(${rollAngle} ${SPRITE_BALL_X} ${SPRITE_BALL_Y})`}
      >
        <rect
          x={SPRITE_BALL_X - BALL_RADIUS}
          y={SPRITE_BALL_Y}
          width={BALL_RADIUS * 2}
          height={BALL_RADIUS}
          fill="var(--bg-deep)"
        />
      </g>
    </svg>
  );
}
