// renders a string in the custom 5x11 pixel typeface with path-joins
// between letters. join only fires at the baseline (row 8) when both
// adjacent edges are filled there. no bridge mid-word = tighter joiner.
// '|' = explicit word break (default joiner width, no bridge).
import { useEffect, useRef } from 'react';
import { glyphOf, GRID_W, GRID_H, type Glyph } from '../lib/typeface';

// bottom of x-height -- the only row where joins fire
const BASELINE_ROW = 8;

// tighter joiner when no bridge -- keeps the word from looking monospaced
const TIGHT_JOINER = 1;

// '|' in input = explicit word break (no glyph, default joiner, no bridge)
const WORD_BREAK = '|';

function bridges(prev: Glyph, next: Glyph): boolean {
  return !!prev[BASELINE_ROW][GRID_W - 1] && !!next[BASELINE_ROW][0];
}

function joinerWidthFor(
  prevCh: string,
  nextCh: string,
  baseWidth: number,
  isWordBreak: boolean
): number {
  if (prevCh === ' ' || nextCh === ' ') return baseWidth;
  if (baseWidth <= TIGHT_JOINER) return baseWidth;
  // word break keeps the full gap on purpose
  if (isWordBreak) return baseWidth;
  return bridges(glyphOf(prevCh), glyphOf(nextCh)) ? baseWidth : TIGHT_JOINER;
}

// strip '|' and ' ' markers, record where word breaks land. space and
// '|' act the same -- no glyph, default joiner, no bridge. keeps cmds
// like "ls projects/" or "history --since 2024" tight (space = kerning
// between words, not a 5-col BLANK).
function tokenize(text: string): { chars: string[]; wordBreakAfter: Set<number> } {
  const chars: string[] = [];
  const wordBreakAfter = new Set<number>();
  for (const ch of Array.from(text)) {
    if (ch === WORD_BREAK || ch === ' ') {
      if (chars.length > 0) wordBreakAfter.add(chars.length - 1);
    } else {
      chars.push(ch);
    }
  }
  return { chars, wordBreakAfter };
}

type Props = {
  text: string;
  cellSize?: number;
  color?: string;
  /** Columns of empty gap between letters, where the join bridges are
   *  drawn. Default 2 — readable but tight. */
  joinerCols?: number;
  className?: string;
  ariaLabel?: string;
  decorative?: boolean;
  /** If true, cells fill in sequentially along a snake path through
   *  the wordmark — like the shape is being grown by a Snake game. */
  animate?: boolean;
  /** Delay (ms) before the first cell appears. Used to chain multiple
   *  Wordmarks so they animate one after the other. */
  animationStartMs?: number;
  // ms between cells. default 32 (~30 cells/sec)
  cellDelayMs?: number;
  // bump to replay -- changes restart every cell's CSS anim from frame 0
  playKey?: number;
};

// snake walker: step to an adjacent filled cell, prefer the last
// direction so straight strokes stay straight. when stuck, jump to the
// nearest unvisited cell. branching letters (t, k, etc.) end up with a
// few short jumps -- fine for animation, jumps are invisible at speed.

type Cell = readonly [number, number]; // [col, row]
const DIRS: Cell[] = [
  [1, 0],   // right
  [0, 1],   // down
  [-1, 0],  // left
  [0, -1]   // up
];

function computeSnakePath(grid: boolean[][]): Cell[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return [];

  const total = grid.reduce(
    (n, row) => n + row.reduce((m, on) => m + (on ? 1 : 0), 0),
    0
  );
  if (total === 0) return [];

  const visited: boolean[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(false)
  );

  // start at the top-left-most filled cell
  let start: Cell | null = null;
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]) { start = [c, r] as const; break outer; }
    }
  }
  if (!start) return [];

  const path: Cell[] = [];
  let cur: Cell = start;
  let lastDir: Cell | null = null;
  visited[cur[1]][cur[0]] = true;
  path.push(cur);

  while (path.length < total) {
    // try the last direction first -- favors straight strokes
    const last = lastDir;
    const tryOrder: Cell[] = last
      ? [last, ...DIRS.filter((d) => d[0] !== last[0] || d[1] !== last[1])]
      : DIRS;

    let moved = false;
    for (const [dx, dy] of tryOrder) {
      const nc = cur[0] + dx;
      const nr = cur[1] + dy;
      if (
        nc >= 0 && nc < cols && nr >= 0 && nr < rows &&
        grid[nr][nc] && !visited[nr][nc]
      ) {
        cur = [nc, nr] as const;
        visited[nr][nc] = true;
        path.push(cur);
        lastDir = [dx, dy] as const;
        moved = true;
        break;
      }
    }

    if (moved) continue;

    // stuck -- jump to the nearest unvisited cell
    let nearest: Cell | null = null;
    let bestDist = Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c] || visited[r][c]) continue;
        const d = Math.abs(c - cur[0]) + Math.abs(r - cur[1]);
        if (d < bestDist) {
          bestDist = d;
          nearest = [c, r] as const;
        }
      }
    }
    if (!nearest) break;
    cur = nearest;
    visited[nearest[1]][nearest[0]] = true;
    path.push(nearest);
    lastDir = null;
  }

  return path;
}

function composeWordmark(text: string, joinerCols: number): boolean[][] {
  const { chars, wordBreakAfter } = tokenize(text);
  if (chars.length === 0) return Array.from({ length: GRID_H }, () => []);

  // precompute start col for each glyph (joiners vary in width)
  const starts: number[] = [];
  let col = 0;
  for (let i = 0; i < chars.length; i++) {
    starts.push(col);
    col += GRID_W;
    if (i < chars.length - 1) {
      col += joinerWidthFor(
        chars[i],
        chars[i + 1],
        joinerCols,
        wordBreakAfter.has(i)
      );
    }
  }
  const totalCols = col;

  const grid: boolean[][] = Array.from(
    { length: GRID_H },
    () => Array(totalCols).fill(false)
  );

  chars.forEach((ch, i) => {
    const glyph = glyphOf(ch);
    const startCol = starts[i];

    // place letter
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        if (glyph[r][c]) grid[r][startCol + c] = true;
      }
    }

    // baseline-rail bridge into the next letter's gap
    if (i < chars.length - 1) {
      const nextCh = chars[i + 1];
      if (ch === ' ' || nextCh === ' ') return;

      const wordBreakHere = wordBreakAfter.has(i);
      const jw = joinerWidthFor(ch, nextCh, joinerCols, wordBreakHere);
      if (jw <= 0) return;

      const nextGlyph = glyphOf(nextCh);
      const joinStart = startCol + GRID_W;

      // no bridge across word breaks even if letters would align
      if (!wordBreakHere && bridges(glyph, nextGlyph)) {
        for (let j = 0; j < jw; j++) {
          grid[BASELINE_ROW][joinStart + j] = true;
        }
      }
    }
  });

  return grid;
}

export function Wordmark({
  text,
  cellSize = 4,
  color = 'currentColor',
  joinerCols = 2,
  className,
  ariaLabel,
  decorative,
  animate = false,
  animationStartMs = 0,
  cellDelayMs = 32,
  playKey
}: Props) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const initialRender = useRef(true);

  // replay on playKey bump (skip initial -- CSS anim fires at mount).
  // drop the class, force reflow, re-add. browser tears down + restarts
  // all the cell animations with the existing --snake-delay vars intact
  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (!animate) return;
    const root = rootRef.current;
    if (!root) return;
    root.classList.remove('wordmark--snake');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    root.offsetWidth; // sync reflow
    root.classList.add('wordmark--snake');
  }, [playKey, animate]);

  const grid = composeWordmark(text, joinerCols);
  const totalCols = grid[0]?.length ?? 0;
  if (totalCols === 0) return null;

  // when animating, compute snake path -- each cell gets its path index
  let pathIndex: (number | null)[][] | null = null;
  if (animate) {
    const path = computeSnakePath(grid);
    pathIndex = Array.from({ length: grid.length }, () =>
      Array<number | null>(totalCols).fill(null)
    );
    path.forEach(([c, r], i) => {
      pathIndex![r][c] = i;
    });
  }

  const rootClassName = animate
    ? (className ? `${className} wordmark--snake` : 'wordmark--snake')
    : className;

  return (
    <span
      ref={rootRef}
      className={rootClassName}
      style={{
        display: 'inline-grid',
        gridTemplateColumns: `repeat(${totalCols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${GRID_H}, ${cellSize}px)`,
        gap: 0,
        width: `${totalCols * cellSize}px`,
        height: `${GRID_H * cellSize}px`,
        lineHeight: 0,
        verticalAlign: 'baseline'
      }}
      aria-label={decorative ? undefined : (ariaLabel ?? text)}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
    >
      {grid.map((row, r) =>
        row.map((on, c) => {
          if (!animate) {
            return (
              <span
                key={`${r}-${c}`}
                style={{ background: on ? color : 'transparent' }}
              />
            );
          }
          if (!on) {
            return <span key={`${r}-${c}`} style={{ background: 'transparent' }} />;
          }
          const idx = pathIndex![r][c] ?? 0;
          const delay = animationStartMs + idx * cellDelayMs;
          return (
            <span
              key={`${r}-${c}`}
              data-on="true"
              style={{
                // CSS does the work. duration = 2x cell delay so the
                // head-flash phase = 1 stride -> only one cell is "head"
                ['--snake-color' as string]: color,
                ['--snake-delay' as string]: `${delay}ms`,
                ['--snake-duration' as string]: `${cellDelayMs * 2}ms`
              }}
            />
          );
        })
      )}
    </span>
  );
}
