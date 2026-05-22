// 6 SVG animations, one per project. each is scroll-scrubbed off the
// --progress var on its [data-progress] parent. children opt into
// sub-ranges with inline --d (start) and --span (duration).
// the bigger 3 (Benchmark/OLS/GMM) annotate the actual datasets and
// results from the underlying work; the others stay closer to sketch.
import './animations.css';
import type { CSSProperties } from 'react';

type Props = { slug: string };

const v = (d: number, span?: number): CSSProperties => {
  const out: Record<string, string | number> = { '--d': d };
  if (span !== undefined) out['--span'] = span;
  return out as CSSProperties;
};

export function ProjectAnimation({ slug }: Props) {
  switch (slug) {
    case 'prame-melanoma':      return <PrameAttention />;
    case 'package-tracking':    return <PackageTrack />;
    case 'iconograph':          return <Iconograph />;
    case 'pathology-benchmark': return <BenchmarkVisual />;
    case 'gmm-rp':              return <GmmEM />;
    case 'ols-poly':            return <OlsPolyFit />;
    default:                    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. PRAME / attention — same idea, slightly enriched (tile rows label,
 *    attention region marker, slide label).
 * ──────────────────────────────────────────────────────────────────────── */
function PrameAttention() {
  const cells = Array.from({ length: 36 });
  const attention = new Set([14, 15, 16, 20, 21, 22, 26, 27, 28]);
  return (
    <div className="anim anim--prame anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="WSI attention demo">
        <text x="20" y="22" className="anim-title">whole-slide attention</text>
        <text x="20" y="38" className="anim-sub">UNI features · attention-MIL</text>

        <g transform="translate(20 60)">
          {cells.map((_, i) => {
            const x = (i % 6) * 64;
            const y = Math.floor(i / 6) * 36;
            const att = attention.has(i);
            const d = (i / 36) * 0.45;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={56}
                height={32}
                className={`prame-tile ${att ? 'prame-tile--att' : ''}`}
                style={v(d, 0.25)}
              />
            );
          })}
        </g>

        <circle className="prame-bloom" cx="240" cy="170" r="64" />

        <g className="prame-pill">
          <rect x="356" y="14" width="108" height="22" rx="3" />
          <text x="410" y="29" textAnchor="middle">PRAME+ · p=0.94</text>
        </g>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. Package tracking — wider canvas, longer rail.
 * ──────────────────────────────────────────────────────────────────────── */
function PackageTrack() {
  const stations: Array<{ x: number; d: number; label: string }> = [
    { x:  40, d: 0.10, label: 'ordered' },
    { x: 180, d: 0.35, label: 'shipped' },
    { x: 300, d: 0.60, label: 'in transit' },
    { x: 440, d: 0.85, label: 'delivered' }
  ];
  return (
    <div className="anim anim--track anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="shipment progress demo">
        <text x="20" y="22" className="anim-title">tracking pipeline</text>
        <text x="20" y="38" className="anim-sub">extension → SQLite → 17Track → Calendar</text>

        <line x1="40" y1="160" x2="440" y2="160" className="track-rail" />
        <line x1="40" y1="160" x2="440" y2="160" className="track-fill track-fill--long" />
        {stations.map((s) => (
          <g key={s.x} className="track-station" style={v(s.d, 0.08)}>
            <circle cx={s.x} cy="160" r="9" />
          </g>
        ))}
        <g className="track-pkg track-pkg--long">
          <rect x="-14" y="-14" width="28" height="28" rx="3" />
          <line x1="-14" y1="0" x2="14" y2="0" />
          <line x1="0" y1="-14" x2="0" y2="14" />
        </g>
        <g className="track-labels">
          {stations.map((s) => (
            <text key={s.label} x={s.x} y="200" textAnchor="middle">{s.label}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. Iconograph — bigger grid + source label.
 * ──────────────────────────────────────────────────────────────────────── */
function Iconograph() {
  const HB = new Set([
    0, 6, 12, 18, 24, 30,
    13, 14, 15, 16,
    2, 8, 20, 26, 32,
    4, 5, 10, 11, 17, 22, 23, 28, 29, 34, 35
  ]);
  const cells = Array.from({ length: 36 });
  return (
    <div className="anim anim--icon anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="logo decomposition demo">
        <text x="20" y="22" className="anim-title">six-stage decomposition</text>
        <text x="20" y="38" className="anim-sub">smooth → pixel quantize → monogram</text>

        <circle cx="120" cy="160" r="80" className="icon-source" />
        <g className="icon-grid icon-grid--large" transform="translate(240 80)">
          {cells.map((_, i) => {
            const col = i % 6;
            const row = Math.floor(i / 6);
            const inHB = HB.has(i);
            const d = 0.45 + (i / 36) * 0.25;
            return (
              <rect
                key={i}
                x={col * 28}
                y={row * 28}
                width={24}
                height={24}
                rx={1}
                className={`icon-cell ${inHB ? 'icon-cell--mono' : 'icon-cell--abs'}`}
                style={v(d, 0.2)}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. Benchmark — tall single-panel AUC bars. The earlier ROC + bars
 *    side-by-side was unreadable at the project-card scale. This version
 *    drops the ROC and gives each bar room to breathe.
 * ──────────────────────────────────────────────────────────────────────── */
function BenchmarkVisual() {
  type Model = { name: string; auc: number; ci: [number, number]; cls: string };
  const models: Model[] = [
    { name: 'UNI',        auc: 0.917, ci: [0.902, 0.931], cls: 'm-uni'    },
    { name: 'ResNet-50',  auc: 0.890, ci: [0.872, 0.906], cls: 'm-resnet' },
    { name: 'DINO ViT-B', auc: 0.878, ci: [0.859, 0.895], cls: 'm-dino'   }
  ];

  // Bar scale: AUC 0.80..0.95 → x 130..460
  const xMin = 130;
  const xMax = 460;
  const range = 0.15;
  const xFor = (auc: number) => xMin + ((auc - 0.80) / range) * (xMax - xMin);
  const barLen = (auc: number) => xFor(auc) - xMin;

  return (
    <div className="anim anim--benchmark anim--bench-tall" aria-hidden="true">
      <svg viewBox="0 0 480 360" role="img" aria-label="MHIST AUC benchmark">
        <text x="20" y="28" className="anim-title-lg">AUC · linear probe · MHIST</text>
        <text x="20" y="48" className="anim-sub-lg">
          5-fold stratified · pretraining quality at frozen features
        </text>

        {/* Bars */}
        {models.map((m, i) => {
          const cy = 96 + i * 78;
          const len = barLen(m.auc);
          const xLo = xFor(m.ci[0]);
          const xHi = xFor(m.ci[1]);
          return (
            <g key={m.name}>
              {/* Model name (large, on its own line above the bar) */}
              <text x={20} y={cy - 10} className="bench-name">{m.name}</text>

              {/* Bar rail */}
              <line x1={xMin} y1={cy} x2={xMax} y2={cy} className="ax" />
              {/* Bar — scroll-driven via stroke-dashoffset */}
              <line
                x1={xMin} y1={cy}
                x2={xMin + len} y2={cy}
                className={`bench-bar ${m.cls}`}
                style={{
                  ...v(0.20 + i * 0.12, 0.50),
                  ['--len' as string]: len
                } as CSSProperties}
              />
              {/* Confidence-interval whisker, faded in after the bar settles */}
              <g style={v(0.72 + i * 0.05, 0.2)}>
                <line x1={xLo} y1={cy - 9} x2={xLo} y2={cy + 9} className="ci-line" />
                <line x1={xHi} y1={cy - 9} x2={xHi} y2={cy + 9} className="ci-line" />
                <line x1={xLo} y1={cy} x2={xHi} y2={cy} className="ci-line" />
              </g>
              {/* Large AUC value — counter-animates from 0 → m.auc */}
              <text
                x={20}
                y={cy + 22}
                className={`bench-value ${m.cls}`}
                data-counter={m.auc}
                data-counter-precision={3}
              >
                0.000
              </text>
              {/* 95% CI label below the value */}
              <text x={92} y={cy + 22} className="bench-ci">
                95% CI [{m.ci[0].toFixed(3)}, {m.ci[1].toFixed(3)}]
              </text>
            </g>
          );
        })}

        {/* x-axis ticks */}
        <line x1={xMin} y1={336} x2={xMax} y2={336} className="ax-ref" />
        <text x={xMin}  y={350} className="ax-tick">0.80</text>
        <text x={(xMin + xMax) / 2} y={350} textAnchor="middle" className="ax-tick">AUC</text>
        <text x={xMax}  y={350} textAnchor="end" className="ax-tick">0.95</text>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 5. OLS / Polynomial — y = 1 + 2x + x³ scatter, three OLS fits.
 *    Numbers match Hunter's CS365 Task 4: deg-1 R² 0.843, deg-2 R² 0.996,
 *    deg-3 R² 1.000.
 * ──────────────────────────────────────────────────────────────────────── */
function OlsPolyFit() {
  // Plot region in svg coords. x in [0, 10] → [50, 450]. y in [-50, 1150] → [240, 30].
  const X0 = 50, Y0 = 30, W = 400, H = 210;
  const yMax = 1150;
  const xs = (x: number) => X0 + (x / 10) * W;
  const ys = (y: number) => Y0 + H - (y / yMax) * H;

  // Truth: y = 1 + 2x + x^3
  const truth: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const x = (i / 40) * 10;
    truth.push([x, 1 + 2 * x + x * x * x]);
  }

  // Noisy scatter — small jitter applied deterministically (no random per render).
  const jitter = [-18, 14, -22, 9, 12, -7, 20, -16, 4, 22, -10, 18];
  const scatter: [number, number][] = jitter.map((j, i) => {
    const x = 0.5 + i * (9 / 11);
    const y = 1 + 2 * x + x * x * x + j;
    return [x, y];
  });

  // OLS fits (rough but in the right shape):
  //   deg-1 — line through the bulk: y ≈ -200 + 110 x.   R² 0.843
  //   deg-2 — quadratic: y ≈ -25 + 5 x + 10 x²          R² 0.996
  //   deg-3 — perfect: y = 1 + 2x + x³                  R² 1.000
  const fitPath = (f: (x: number) => number) => {
    let p = '';
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * 10;
      const y = f(x);
      const yC = Math.max(-200, Math.min(yMax + 100, y));
      p += (i === 0 ? 'M ' : ' L ') + xs(x) + ' ' + ys(yC);
    }
    return p;
  };
  const linFit  = fitPath((x) => -200 + 110 * x);
  const quadFit = fitPath((x) => -25 + 5 * x + 10 * x * x);
  const cubFit  = fitPath((x) => 1 + 2 * x + x * x * x);

  // Truth path (dotted), drawn from the same generator
  let truthPath = '';
  for (let i = 0; i < truth.length; i++) {
    const [x, y] = truth[i];
    truthPath += (i === 0 ? 'M ' : ' L ') + xs(x) + ' ' + ys(y);
  }

  return (
    <div className="anim anim--ols anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="polynomial regression demo">
        <text x="20" y="22" className="anim-title">polynomial OLS · true: y = 1 + 2x + x³</text>
        <text x="20" y="38" className="anim-sub">fits at degrees 1 / 2 / 3 (cubic ground truth)</text>

        {/* axes */}
        <line x1={X0} y1={Y0} x2={X0} y2={Y0 + H} className="ax" />
        <line x1={X0} y1={Y0 + H} x2={X0 + W} y2={Y0 + H} className="ax" />
        <text x={X0 - 6} y={Y0 + 4} textAnchor="end" className="ax-tick">{yMax}</text>
        <text x={X0 - 6} y={Y0 + H + 4} textAnchor="end" className="ax-tick">0</text>
        <text x={X0 + W} y={Y0 + H + 14} textAnchor="end" className="ax-tick">x = 10</text>

        {/* truth — dotted ground reference */}
        <path d={truthPath} className="ols-truth" style={v(0.0, 0.15)} />

        {/* scatter */}
        {scatter.map(([x, y], i) => (
          <circle
            key={i}
            cx={xs(x)}
            cy={ys(y)}
            r="3.4"
            className="ols-pt"
            style={v((i / scatter.length) * 0.18, 0.18)}
          />
        ))}

        {/* Three fits drawing in sequence */}
        <path d={linFit}  className="ols-fit ols-fit--1" style={v(0.20, 0.20)} />
        <path d={quadFit} className="ols-fit ols-fit--2" style={v(0.42, 0.22)} />
        <path d={cubFit}  className="ols-fit ols-fit--3" style={v(0.66, 0.22)} />

        {/* Legend — just names, no diagnostic numbers */}
        <g className="ols-legend" transform="translate(310 60)">
          <g style={v(0.40, 0.10)}>
            <line x1="0" y1="0" x2="20" y2="0" className="ols-fit ols-fit--1 swatch" />
            <text x="28" y="4" className="legend">linear</text>
          </g>
          <g style={v(0.62, 0.10)} transform="translate(0 18)">
            <line x1="0" y1="0" x2="20" y2="0" className="ols-fit ols-fit--2 swatch" />
            <text x="28" y="4" className="legend">quadratic</text>
          </g>
          <g style={v(0.84, 0.10)} transform="translate(0 36)">
            <line x1="0" y1="0" x2="20" y2="0" className="ols-fit ols-fit--3 swatch" />
            <text x="28" y="4" className="legend">cubic</text>
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 6. GMM EM — three components, points by cluster, EM ellipses converge
 *    from wrong init to fitted state alongside dotted true ellipses.
 * ──────────────────────────────────────────────────────────────────────── */
function GmmEM() {
  // Data-space bounds, then svg mapping
  const X0 = 50, Y0 = 60, W = 400, H = 180;
  const xMin = 0, xMax = 10, yMin = 0, yMax = 10;
  const xs = (x: number) => X0 + ((x - xMin) / (xMax - xMin)) * W;
  const ys = (y: number) => Y0 + H - ((y - yMin) / (yMax - yMin)) * H;

  // Three well-separated true clusters (cf. Dataset 2 in CS365 HW3).
  type Cluster = {
    cx: number; cy: number;
    rx: number; ry: number;
    rot: number;          // visual rotation degrees
    cls: 'a' | 'b' | 'c';
    pts: [number, number][];
  };

  // Deterministic jittered points around each center.
  const ring = (cx: number, cy: number, rx: number, ry: number, n: number, seed: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      // Pseudo-random offsets (deterministic via seed)
      const ang = (i * 2.3 + seed) * 1.7;
      const r = 0.4 + ((seed * 13 + i * 7) % 11) * 0.07;
      out.push([cx + Math.cos(ang) * rx * r, cy + Math.sin(ang) * ry * r]);
    }
    return out;
  };

  const clusters: Cluster[] = [
    { cx: 2.0, cy: 3.0, rx: 0.9, ry: 0.8, rot: 0,   cls: 'a', pts: ring(2.0, 3.0, 1.0, 0.9, 14, 1) },
    { cx: 6.5, cy: 5.5, rx: 1.2, ry: 0.7, rot: -22, cls: 'b', pts: ring(6.5, 5.5, 1.3, 0.8, 16, 5) },
    { cx: 4.0, cy: 8.0, rx: 0.9, ry: 1.0, rot: 20,  cls: 'c', pts: ring(4.0, 8.0, 1.0, 1.1, 14, 9) }
  ];

  // Wrong initial positions for the EM ellipses (used by transform interpolation
  // in CSS via --d0x/--d0y/--scale0 vars).
  const initOffsets = {
    a: { dx:  60, dy: -40, s: 1.7 },
    b: { dx: -55, dy:  35, s: 1.7 },
    c: { dx:  40, dy:  45, s: 1.7 }
  };

  return (
    <div className="anim anim--gmm anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="EM convergence demo">
        <text x="20" y="22" className="anim-title">EM · 3-component GMM · dataset 2</text>
        <text x="20" y="38" className="anim-sub">solid = EM estimate · dotted = true · LL = −3.7 / sample</text>

        {/* points by cluster */}
        {clusters.flatMap((c) =>
          c.pts.map(([x, y], i) => (
            <circle
              key={`${c.cls}-${i}`}
              cx={xs(x)}
              cy={ys(y)}
              r="3"
              className={`gmm-pt2 gmm-pt2--${c.cls}`}
              style={v(((c.cls === 'a' ? 0 : c.cls === 'b' ? 0.06 : 0.12)) + (i / 16) * 0.18, 0.2)}
            />
          ))
        )}

        {/* true ellipses (dotted) — appear early, fade in */}
        {clusters.map((c) => (
          <ellipse
            key={`true-${c.cls}`}
            cx={xs(c.cx)}
            cy={ys(c.cy)}
            rx={(c.rx / (xMax - xMin)) * W}
            ry={(c.ry / (yMax - yMin)) * H}
            transform={`rotate(${c.rot} ${xs(c.cx)} ${ys(c.cy)})`}
            className={`gmm-true gmm-true--${c.cls}`}
            style={v(0.10, 0.20)}
          />
        ))}

        {/* EM-estimated ellipses (solid) — converge from wrong init */}
        {clusters.map((c) => {
          const off = initOffsets[c.cls];
          return (
            <ellipse
              key={`em-${c.cls}`}
              cx={xs(c.cx)}
              cy={ys(c.cy)}
              rx={(c.rx / (xMax - xMin)) * W}
              ry={(c.ry / (yMax - yMin)) * H}
              transform={`rotate(${c.rot} ${xs(c.cx)} ${ys(c.cy)})`}
              className={`gmm-em gmm-em--${c.cls}`}
              style={{
                ...v(0.35, 0.55),
                ['--ox' as string]: off.dx,
                ['--oy' as string]: off.dy,
                ['--scale0' as string]: off.s
              } as CSSProperties}
            />
          );
        })}

        {/* Iteration ticker + LL value */}
        <g transform="translate(360 230)" className="gmm-readout">
          <text x="0" y="0" className="ax-label">iteration</text>
          <text x="120" y="0" textAnchor="end" className="ax-tick gmm-iter">7 / 7</text>
        </g>
      </svg>
    </div>
  );
}
