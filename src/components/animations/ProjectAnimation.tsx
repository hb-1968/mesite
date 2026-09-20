// one SVG animation per project, scroll-scrubbed off the --progress var on
// its [data-progress] parent. children opt into sub-ranges with inline --d
// (start) and --span (duration); scrub off --eased, not --local.
//
// every one of these is built on real artifacts from the underlying repos --
// TCGA-SKCM attention heatmaps, MHIST ROC curves, the SST talk figures, the
// iconograph stage strip and its own parse_shape() output. nothing here is a
// sketch of what the work might look like.
import './animations.css';
import type { CSSProperties } from 'react';
import contour from '../../data/iconContour.json';

type Props = { slug: string };

const v = (d: number, span?: number): CSSProperties => {
  const out: Record<string, string | number> = { '--d': d };
  if (span !== undefined) out['--span'] = span;
  return out as CSSProperties;
};

// public/ assets resolved against vite BASE so the same paths work for
// /portfolio/ on gh-pages and / locally
const BASE = import.meta.env.BASE_URL;
const PR = `${BASE}projects/prame/`;
const BE = `${BASE}projects/bench/`;
const ST = `${BASE}projects/sst/`;
const IC = `${BASE}projects/icon/`;

export function ProjectAnimation({ slug }: Props) {
  switch (slug) {
    case 'prame-melanoma':        return <PrameAttention />;
    case 'package-tracking':      return <PackageTrack />;
    case 'iconograph':            return <Iconograph />;
    case 'pathology-benchmark':   return <BenchmarkVisual />;
    case 'sst-tracking':          return <SstTracking />;
    case 'reasoning-topologies':  return <ReasoningChannels />;
    default:                      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * 7. SST / one-shot tracking -- the actual four-panel run from
 *    docs/talk/figures: labeled support, its mask, the unlabeled query,
 *    and what the tracker propagates. Panels land left-to-right in the
 *    order the method sees them, then the displacement quartiles fade in
 *    underneath -- those are the real numbers behind corr = -0.866.
 * ──────────────────────────────────────────────────────────────────────── */
function SstTracking() {
  // query / prediction / ground truth are all 421x353 of the same frame, so
  // the prediction can be wiped straight over the photo -- the wipe IS the
  // mask propagating, not a decorative transition.
  const IX = 20, IY = 52, IW = 316, IH = 265;

  return (
    <div className="anim anim--sst anim--bench-tall" aria-hidden="true">
      <svg viewBox="0 0 480 360" role="img" aria-label="one-shot trait segmentation by tracking">
        <defs>
          {/* width is a CSS geometry property -- driving it off --local gives
              a hard-edged wipe rather than a cross-fade */}
          <clipPath id="sst-wipe">
            <rect x={IX} y={IY} height={IH} className="sst-wipe-rect" style={v(0.22, 0.46)} />
          </clipPath>
        </defs>

        <text x="20" y="22" className="anim-title">one-shot trait segmentation · SAM 2/3</text>
        <text x="20" y="38" className="anim-sub">
          support mask propagates across a two-frame pseudo-video
        </text>

        {/* the query photograph, full size -- this is the subject */}
        <g style={v(0.02, 0.16)} className="sst-hero">
          <image
            href={`${ST}p3_query.png`}
            x={IX} y={IY} width={IW} height={IH}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>

        {/* the propagated mask, wiped over it left to right */}
        <g clipPath="url(#sst-wipe)">
          <image
            href={`${ST}p4_prediction.png`}
            x={IX} y={IY} width={IW} height={IH}
            preserveAspectRatio="xMidYMid slice"
          />
        </g>

        {/* the moving seam, so the wipe reads as a comparison */}
        <rect
          x={IX} y={IY} width="1.5" height={IH}
          className="sst-seam"
          style={v(0.22, 0.46)}
        />
        <rect x={IX} y={IY} width={IW} height={IH} rx="2" className="sst-frame" />

        {/* label chips rather than haloed text -- a background rect reads the
            same everywhere and does not lean on paint-order support */}
        <g className="sst-chip">
          <rect x={IX + 6} y={IY + 6} width={40} height={14} rx="2" />
          <text x={IX + 12} y={IY + 16}>query</text>
        </g>
        <g className="sst-chip sst-chip--pred" style={v(0.40, 0.14)}>
          <rect x={IX + IW - 74} y={IY + 6} width={68} height={14} rx="2" />
          <text x={IX + IW - 68} y={IY + 16}>propagated</text>
        </g>

        {/* the labeled support pair, small -- reference, not the subject */}
        {[
          { src: `${ST}p1_support.png`,      label: 'support',   y: 52 },
          { src: `${ST}p2_support_mask.png`, label: 'its mask',  y: 188 }
        ].map((t, i) => (
          <g key={t.label} className="sst-ref" style={v(0.06 + i * 0.08, 0.22)}>
            <image
              href={t.src}
              x={348} y={t.y} width={112} height={112}
              preserveAspectRatio="xMidYMid meet"
            />
            <rect x={348} y={t.y} width={112} height={112} className="sst-frame" />
            <text x={348} y={t.y + 126} className="sst-cap">{t.label}</text>
          </g>
        ))}

        {/* one number, over the image, the way a product shot carries a stat */}
        <g style={v(0.62, 0.18)} className="sst-stat">
          <rect x={IX + 10} y={IY + IH - 46} width={150} height={36} rx="2" />
          <text x={IX + 20} y={IY + IH - 28} className="sst-stat-val">69.88 mIoU</text>
          <text x={IX + 20} y={IY + IH - 17} className="sst-stat-note">beetle 1-shot · +5.77 over SAM 2</text>
        </g>

        <text x={20} y={340} className="anim-sub" style={v(0.80, 0.12)}>
          butterfly splits fall to 50.8 at the far displacement quartile -- corr -0.866, n = 500
        </text>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 8. Reasoning Topologies -- the three-channel split from
 *    docs/debrief/fig/channels.svg, redrawn legibly. There is no results
 *    plot to show yet; the honest artifact is the extractor qualification,
 *    so that is what lands at the bottom.
 * ──────────────────────────────────────────────────────────────────────── */
function ReasoningChannels() {
  const channels = [
    { key: 'support',      sign: '+', note: 'supportive edges',   cls: 'ch--sup' },
    { key: 'attack',       sign: '-', note: 'contrastive edges',  cls: 'ch--att' },
    { key: 'constitutive', sign: '0', note: 'masked from prop.',  cls: 'ch--con' }
  ];

  // the qualification run against the vetted 32-unit key
  const gates = [
    { label: 'node recall',   value: '0.87'  },
    { label: 'schema conf.',  value: '31/31' },
    { label: 'quote fidelity', value: '0.94' }
  ];

  return (
    <div className="anim anim--topo" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="channelized GATv2 over framework DAGs">
        <text x="20" y="22" className="anim-title">framework DAG · channelized GATv2</text>
        <text x="20" y="38" className="anim-sub">
          stock GATv2 is provably invariant to flipping every edge&#39;s valence
        </text>

        {/* the source DAG -- typed nodes, polarity-typed edges */}
        <g style={v(0.05, 0.22)}>
          <rect x={20} y={58} width={96} height={96} className="topo-box" />
          <text x={68} y={82} textAnchor="middle" className="topo-lbl">DAG</text>
          {[[68, 100], [44, 130], [92, 130]].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={6} className="topo-node" />
          ))}
          <line x1={64} y1={106} x2={48} y2={124} className="topo-edge topo-edge--sup" />
          <line x1={72} y1={106} x2={88} y2={124} className="topo-edge topo-edge--att" />
        </g>

        {/* fan out into the three channels */}
        {channels.map((c, i) => {
          const cy = 62 + i * 40;
          return (
            <g key={c.key} style={v(0.24 + i * 0.09, 0.24)}>
              <path d={`M116 106 C 150 106, 150 ${cy + 14}, 176 ${cy + 14}`} className={`topo-wire ${c.cls}`} />
              <rect x={176} y={cy} width={150} height={28} className={`topo-chan ${c.cls}`} />
              <text x={186} y={cy + 13} className="topo-chan-name">{c.sign} {c.key}</text>
              <text x={186} y={cy + 23} className="topo-chan-note">{c.note}</text>
            </g>
          );
        })}

        {/* combine -- h = MLP([h+ || h-] || h_c) */}
        <g style={v(0.54, 0.18)}>
          {[76, 116, 156].map((cy) => (
            <path key={cy} d={`M326 ${cy} C 352 ${cy}, 352 116, 372 116`} className="topo-wire topo-wire--join" />
          ))}
          <rect x={372} y={94} width={88} height={44} className="topo-box topo-box--out" />
          <text x={416} y={112} textAnchor="middle" className="topo-lbl">combine</text>
          <text x={416} y={126} textAnchor="middle" className="topo-chan-note">sign is multiplicative</text>
        </g>

        <line x1={20} y1={182} x2={460} y2={182} className="bench-divider" style={v(0.66, 0.10)} />
        <text x={20} y={200} className="anim-sub" style={v(0.68, 0.10)}>
          extractor qualification · 122B · vLLM + xgrammar · 88 human verdicts
        </text>

        {gates.map((g, i) => (
          <g key={g.label} style={v(0.74 + i * 0.06, 0.18)}>
            <rect x={20 + i * 148} y={214} width={136} height={44} className="topo-gate" />
            <text x={88 + i * 148} y={236} textAnchor="middle" className="topo-gate-val">{g.value}</text>
            <text x={88 + i * 148} y={250} textAnchor="middle" className="topo-chan-note">{g.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. PRAME / attention -- two held-out TCGA-SKCM slides side-by-side with
 *    UNI attention heatmaps baked in. Tile grid overlays first (abstract),
 *    then dissolves to reveal the actual slides. Confidence pills land
 *    on top of each panel. The model attends to a focal tumor nest in the
 *    TP case (right side of A44O) and stays diffuse across A8GE (TN).
 * ──────────────────────────────────────────────────────────────────────── */
function PrameAttention() {
  // both panels grew to 222x214 -- the slides are the subject, so the
  // chrome gives up its margins rather than the imagery. the tile grid no
  // longer cross-fades; it wipes downward like a scan, revealing the real
  // attention pattern underneath.
  const P = [
    { id: 'tp', src: `${PR}tp_a44o_thumb.png`, x: 14,  pill: 'PRAME+ · p=0.984', sid: 'TCGA-EB-A44O · fold 4', cls: 'prame-pill--pos' },
    { id: 'tn', src: `${PR}tn_a8ge_thumb.png`, x: 244, pill: 'PRAME- · p=0.004', sid: 'TCGA-D3-A8GE · fold 1', cls: 'prame-pill--neg' }
  ];
  const IY = 44, IW = 222, IH = 214;
  const tiles = Array.from({ length: 24 });
  // tiles sitting over the high-attention nest on the TP slide
  const att = new Set([10, 11, 16, 17]);

  return (
    <div className="anim anim--prame anim--large" aria-hidden="true">
      <svg viewBox="0 0 480 280" role="img" aria-label="WSI attention demo">
        <defs>
          {P.map((q) => (
            <clipPath key={q.id} id={`prame-clip-${q.id}`}>
              <rect x={q.x} y={IY} width={IW} height={IH} rx="2" />
            </clipPath>
          ))}
          {/* the scan wipe -- height off --local, so the tile layer retracts
              upward instead of fading out */}
          <clipPath id="prame-scan">
            <rect x="0" y={IY} width="480" className="prame-scan-rect" style={v(0.16, 0.40)} />
          </clipPath>
        </defs>

        <text x="14" y="20" className="anim-title">held-out attention · UNI · TCGA-SKCM</text>
        <text x="14" y="34" className="anim-sub">attention-MIL · 5-fold CV · confidence-gated routing</text>

        {P.map((q, i) => (
          <g key={q.id} className="prame-panel" style={v(0.02 + i * 0.06, 0.18)}>
            <image
              href={q.src}
              x={q.x} y={IY} width={IW} height={IH}
              preserveAspectRatio="xMidYMid slice"
            />
            <rect x={q.x} y={IY} width={IW} height={IH} rx="2" className="prame-frame" />
          </g>
        ))}

        {/* tile overlay over the TP slide, retracted by the scan wipe */}
        <g clipPath="url(#prame-clip-tp)">
          <g clipPath="url(#prame-scan)">
            {tiles.map((_, i) => {
              const col = i % 6;
              const row = Math.floor(i / 6);
              return (
                <rect
                  key={i}
                  x={14 + col * 37}
                  y={IY + row * 53.5}
                  width={35}
                  height={51.5}
                  className={`prame-tile-ov ${att.has(i) ? 'prame-tile-ov--att' : ''}`}
                  style={v(0.02 + (i / 24) * 0.14, 0.18)}
                />
              );
            })}
          </g>
        </g>

        {/* the seam of the scan, so the retraction reads as motion */}
        <rect x="14" y={IY} width={IW} height="1.5" className="prame-scan-seam" style={v(0.16, 0.40)} />

        <circle className="prame-bloom" cx="150" cy="162" r="36" />

        {P.map((q) => (
          <g key={q.id} className={`prame-pill ${q.cls}`}>
            <rect x={q.x + 8} y={IY + 8} width={96} height={19} rx="2" />
            <text x={q.x + 56} y={IY + 21} textAnchor="middle">{q.pill}</text>
          </g>
        ))}

        {P.map((q) => (
          <text key={q.id} x={q.x} y={272} className="prame-sid">{q.sid}</text>
        ))}
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. Package tracking — wider canvas, longer rail.
 * ──────────────────────────────────────────────────────────────────────── */
function PackageTrack() {
  // real gold-label coverage over the 500-record harvested set. the email
  // bodies are Hunter's own inbox and stay out of the repo and off this
  // page -- only the aggregate ships.
  //
  // three fixed columns: label, bar, value. the track rule stops where the
  // value column starts, so a number never lands on top of a line.
  const fields = [
    { name: 'is_shipping_email', n: 500 },
    { name: 'status',            n: 122 },
    { name: 'vendor',            n: 120 },
    { name: 'products',          n: 104 },
    { name: 'carrier',           n: 88  },
    { name: 'delivery_estimate', n: 78  },
    { name: 'order_id',          n: 73  },
    { name: 'tracking_number',   n: 67  }
  ];
  const LX = 20;         // label column
  const BX = 152;        // bar column starts
  const BW = 244;        // bar column width
  const VX = 460;        // value column, right-aligned -- never overlapped
  const N = 500;
  const len = (n: number) => (n / N) * BW;
  const row = (i: number) => 84 + i * 29;

  return (
    <div className="anim anim--track anim--bench-tall" aria-hidden="true">
      <svg viewBox="0 0 480 360" role="img" aria-label="gold-label field coverage">
        <text x={LX} y="24" className="anim-title">field extraction · gold coverage</text>
        <text x={LX} y="40" className="anim-sub">
          500 harvested emails · 112 human-adjudicated
        </text>

        {/* column rule + scale, so the bars read against something */}
        <line x1={BX} y1={58} x2={BX + BW} y2={58} className="trk-axis" style={v(0.04, 0.10)} />
        <text x={BX} y={52} className="trk-scale" style={v(0.04, 0.10)}>0</text>
        <text x={BX + BW} y={52} textAnchor="end" className="trk-scale" style={v(0.04, 0.10)}>500</text>

        {fields.map((f, i) => {
          const cy = row(i);
          const l = len(f.n);
          return (
            <g key={f.name}>
              <text x={LX} y={cy + 3.5} className="trk-label">{f.name}</text>
              {/* track stops at the bar column edge, well clear of the value */}
              <line x1={BX} y1={cy} x2={BX + BW} y2={cy} className="trk-track" />
              <line
                x1={BX} y1={cy} x2={BX + l} y2={cy}
                className={`trk-bar${i === 0 ? ' trk-bar--all' : ''}`}
                style={{ ...v(0.10 + i * 0.055, 0.32), ['--len' as string]: l } as CSSProperties}
              />
              <text x={VX} y={cy + 3.5} textAnchor="end" className="trk-val"
                    style={v(0.22 + i * 0.05, 0.14)}>{f.n}</text>
            </g>
          );
        })}

        <line x1={LX} y1={322} x2={VX} y2={322} className="bench-divider" style={v(0.70, 0.10)} />
        <text x={LX} y={338} className="trk-note" style={v(0.72, 0.12)}>
          every field must be a verbatim substring of the source,
        </text>
        <text x={LX} y={350} className="trk-note" style={v(0.76, 0.12)}>
          so a hallucinating model can only return null · scored by 5-fold CV
        </text>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 3. Iconograph — bigger grid + source label.
 * ──────────────────────────────────────────────────────────────────────── */
function Iconograph() {
  // nine real frames out of testbed/story/figma.png on one shared crop, so
  // the logo sits in the same place in every stage.
  //
  // the D1 beat does NOT fade. the parse walks the boundary, so the overlay
  // walks it too -- run by run, in contour order, coloured by the type the
  // parser assigned. geometry in iconContour.json is the output of his own
  // contour_parse.parse_shape() on testbed/align/figma.png: 16 runs, 19
  // corners, no holes. not a redraw of the debug png.
  const stages = [
    { f: 's0_source',    tag: '0  source',             say: 'raw logo PNG, alpha composited over white' },
    { f: 's1_align',     tag: '1  categorize + align', say: 'sub-case detect, canvas trim, axis-align (L0)' },
    { f: 's2_classify',  tag: '3a L1 classify',        say: '8-connected components; fit ONE primitive each' },
    { f: 's3_features',  tag: '3b L2 features',        say: 'misses split into typed features; rings polar-unrolled' },
    { f: 's4_contour',   tag: '3c D1 contour-parse',   say: 'approxPolyDP, then split runs on sagitta ratio' },
    { f: 's5_csg',       tag: '3d D2/D3 CSG',          say: 'convex arc ADDs, concave arc SUBTRACTs' },
    { f: 's6_render24',  tag: '3e render R1 @24',      say: 'idealize onto the hicolor grid; cubify at T<=24' },
    { f: 's7_refine24',  tag: '4  refine @24',         say: '1-px perimeter: connect disjoint, normalize stroke' },
    { f: 's8_connect32', tag: '5  connect @32',        say: 'MST bridges open the T-joins into one stroke' }
  ];
  const TRACE = 4;   // the D1 stage index -- the one that gets the walk

  // 9 stages across nearly the whole sweep. with data-progress-scale=2.4 on
  // the card, one SLOT is roughly a third of a viewport of scroll.
  const START = 0.04, SLOT = 0.115, RAMP = 0.055;
  const at = (i: number) => START + i * SLOT;
  const win = (i: number): CSSProperties => {
    const o: Record<string, string | number> = { '--d': at(i), '--span': RAMP };
    if (i < stages.length - 1) { o['--d2'] = at(i + 1); o['--span2'] = RAMP; }
    return o as CSSProperties;
  };

  // frame aspect == the crop aspect (271x236), so preserveAspectRatio=meet
  // fits exactly and the parsed geometry registers pixel-for-pixel. get this
  // wrong and the trace floats off the silhouette.
  const IX = 20, IY = 62, IW = 262, IH = 228;
  // parse coords are fractions of that same crop
  const px = (u: number) => IX + u * IW;
  const py = (u: number) => IY + u * IH;

  const runs = contour.runs as { kind: string; convex: boolean; pts: number[][] }[];
  const corners = contour.corners as { kind: string; convex: boolean; p: number[] }[];
  const runCls = (r: { kind: string; convex: boolean }) =>
    r.kind === 'straight' ? 'd1-straight' : r.convex ? 'd1-add' : 'd1-sub';

  // the walk occupies the D1 slot; each run gets an equal share of it
  const walkStart = at(TRACE) + RAMP * 0.6;
  const walkSpan = SLOT * 0.92;
  const runWin = (i: number): CSSProperties =>
    ({ '--d': walkStart + (i / runs.length) * walkSpan,
       '--span': (walkSpan / runs.length) * 1.25 } as CSSProperties);

  const c = contour.counts as Record<string, number>;
  const tree = [
    { q: 'max chord dev  >  0.12 · chord ?', yes: 'arc', no: 'straight', n: `${c.straight} straight` },
    { q: 'signed area of run+chord  >  0 ?', yes: 'convex', no: 'concave', n: `${c.arc_convex} convex` },
    { q: 'circle rmse  <=  tol ?',           yes: 'Kasa LSQ circle', no: 'bbox ellipse', n: 'circle-first' }
  ];

  return (
    <div className="anim anim--icon anim--bench-tall" aria-hidden="true">
      <svg viewBox="0 0 480 360" role="img" aria-label="deterministic icon pipeline, stage by stage">
        <text x="20" y="22" className="anim-title">logo &#8594; icon + monogram · 9 stages</text>
        <text x="20" y="38" className="anim-sub">figma · byte-identical on re-run</text>

        {stages.map((st, i) => (
          <g key={st.f} className="icon-frame" style={{ '--d': at(i), '--span': RAMP } as CSSProperties}>
            <image href={`${IC}${st.f}.png`} x={IX} y={IY} width={IW} height={IH}
                   preserveAspectRatio="xMidYMid meet" />
          </g>
        ))}

        {/* the walk. pathLength=1 normalises every run so one dashoffset rule
            drives all of them regardless of real arc length. */}
        <g className="d1-walk" style={win(TRACE)}>
          {runs.map((r, i) => (
            <polyline
              key={i}
              className={`d1-run ${runCls(r)}`}
              pathLength={1}
              style={runWin(i)}
              points={r.pts.map((u) => `${px(u[0]).toFixed(1)},${py(u[1]).toFixed(1)}`).join(' ')}
            />
          ))}
          {corners.map((k, i) => (
            <circle
              key={i}
              className={`d1-corner ${k.convex ? 'd1-peak' : 'd1-valley'}`}
              cx={px(k.p[0])} cy={py(k.p[1])} r={2.4}
              style={runWin(Math.min(runs.length - 1, Math.floor((i / corners.length) * runs.length)))}
            />
          ))}
        </g>
        <rect x={IX} y={IY} width={IW} height={IH} rx="2" className="sst-frame" />

        {/* stage rail */}
        {stages.map((st, i) => (
          <g key={st.tag}>
            <line x1={296} y1={62 + i * 20} x2={303} y2={62 + i * 20} className="icon-tick" style={win(i)} />
            <text x={308} y={65 + i * 20} className="icon-stage" style={win(i)}>{st.tag}</text>
          </g>
        ))}
        <line x1={299.5} y1={54} x2={299.5} y2={250} className="icon-spine" />

        {/* the routing itself, lit through the D1/CSG window */}
        <g className="d1-tree" style={{ '--d': at(TRACE) - 0.01, '--span': RAMP,
                                        '--d2': at(TRACE + 2), '--span2': RAMP } as CSSProperties}>
          <text x={296} y={262} className="icon-stage d1-tree-h">per-run routing</text>
          {tree.map((t, i) => (
            <g key={t.q}>
              <text x={296} y={276 + i * 26} className="d1-q">{t.q}</text>
              <text x={302} y={286 + i * 26} className="d1-yes">Y &#8594; {t.yes}</text>
              <text x={372} y={286 + i * 26} className="d1-no">N &#8594; {t.no}</text>
            </g>
          ))}
        </g>

        {/* legend, straight out of contour_parse's own debug palette */}
        <g className="d1-legend" style={win(TRACE)}>
          {[['d1-straight', `straight ${c.straight}`], ['d1-add', `convex arc ${c.arc_convex}`],
            ['d1-sub', `concave arc ${c.arc_concave}`]].map(([cls, label], i) => (
            <g key={cls}>
              <line x1={22 + i * 88} y1={324} x2={38 + i * 88} y2={324} className={`d1-run ${cls} d1-swatch`} />
              <text x={42 + i * 88} y={327} className="icon-say d1-legend-t">{label}</text>
            </g>
          ))}
        </g>

        {stages.map((st, i) => (
          <text key={st.say} x={20} y={344} className="icon-say" style={win(i)}>{st.say}</text>
        ))}
        <text x={20} y={356} className="anim-sub" style={{ '--d': 0.84, '--span': 0.1 } as CSSProperties}>
          0.963 mean area fidelity · 30 fixtures · 0 blot defects across 60 cells
        </text>
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * 4. Benchmark -- AUC bars stacked above the actual 5-fold ROC chart
 *    pulled straight from the repo (results/cv_roc_curves.png). The bars
 *    are the headline number, the ROC underneath shows the curves the
 *    numbers come from.
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

  // bars sit in y 80..210 now, ROC panel below
  const rowY = (i: number) => 80 + i * 50;

  return (
    <div className="anim anim--benchmark anim--bench-tall" aria-hidden="true">
      <svg viewBox="0 0 480 360" role="img" aria-label="MHIST AUC benchmark">
        <text x="20" y="24" className="anim-title-lg">AUC · linear probe · MHIST</text>
        <text x="20" y="42" className="anim-sub-lg">
          5-fold stratified · pretraining quality at frozen features
        </text>

        {/* Bars -- compressed to make room for the ROC panel below */}
        {models.map((m, i) => {
          const cy = rowY(i);
          const len = barLen(m.auc);
          const xLo = xFor(m.ci[0]);
          const xHi = xFor(m.ci[1]);
          return (
            <g key={m.name}>
              <text x={20} y={cy - 6} className="bench-name">{m.name}</text>
              <line x1={xMin} y1={cy} x2={xMax} y2={cy} className="ax" />
              <line
                x1={xMin} y1={cy}
                x2={xMin + len} y2={cy}
                className={`bench-bar ${m.cls}`}
                style={{
                  ...v(0.18 + i * 0.10, 0.45),
                  ['--len' as string]: len
                } as CSSProperties}
              />
              <g style={v(0.66 + i * 0.04, 0.18)}>
                <line x1={xLo} y1={cy - 7} x2={xLo} y2={cy + 7} className="ci-line" />
                <line x1={xHi} y1={cy - 7} x2={xHi} y2={cy + 7} className="ci-line" />
                <line x1={xLo} y1={cy} x2={xHi} y2={cy} className="ci-line" />
              </g>
              <text
                x={20}
                y={cy + 18}
                className={`bench-value ${m.cls}`}
                data-counter={m.auc}
                data-counter-precision={3}
              >
                0.000
              </text>
              <text x={86} y={cy + 18} className="bench-ci">
                95% CI [{m.ci[0].toFixed(3)}, {m.ci[1].toFixed(3)}]
              </text>
            </g>
          );
        })}

        {/* x-axis ticks under the bars */}
        <line x1={xMin} y1={234} x2={xMax} y2={234} className="ax-ref" />
        <text x={xMin}  y={246} className="ax-tick">0.80</text>
        <text x={(xMin + xMax) / 2} y={246} textAnchor="middle" className="ax-tick">AUC</text>
        <text x={xMax}  y={246} textAnchor="end" className="ax-tick">0.95</text>

        {/* divider before the ROC artifact panel */}
        <line x1={20} y1={262} x2={460} y2={262} className="bench-divider" />
        <text x={20} y={278} className="anim-sub">results/cv_roc_curves.png -- 5-fold ROC with std-band</text>

        {/* the actual ROC chart from the repo -- fades in last */}
        <g className="bench-roc">
          <image
            href={`${BE}cv_roc_thumb.png`}
            x={20} y={284} width={440} height={70}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  );
}

