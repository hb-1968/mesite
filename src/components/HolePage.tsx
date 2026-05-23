// the hole. cinematic frame -- a heavily distorted sunrise plate
// behind the sisyphus silhouette and a dialogue bar that fills with a
// running line of dots once sisyphus walks in. click anywhere on the
// frame to fracture the cinematic: dots freeze, pixelated cracks draw
// out from center, warning modal asks YES / NO.
//   NO  -> page fades to black, lands on home
//   YES -> cracks grow further to the frame edges, white explosion
//          fills the viewport, page lands on #hole2 (pure white void)
// the photo itself lives at public/hole-bg.jpg; without it the filter
// stack still renders against a fallback sky gradient. status bar
// strips down to END YOURSELF on this route; on #hole2 the bar is gone.

import { useState, useEffect, useRef } from 'react';

// 16:9 scene at pixel-art res. crisp edges keep the sisyphus rects
// honest even as the photo behind goes painterly
const FRAME_W = 320;
const FRAME_H = 180;

// vite serves public/ under BASE_URL, so this works for /portfolio/
// project pages and would still work if the site ever moved to a
// user-page repo
const BG_URL = `${import.meta.env.BASE_URL}hole-bg.jpg`;
// looped ambience underneath the cinematic. lives in public/ like the
// photo plate. autoplay is best-effort -- if the browser blocks it,
// the first frame click (the fracture gesture) kicks it off
const AMBIENCE_URL = `${import.meta.env.BASE_URL}hole-ambience.ogg`;

// sisyphus sprite -- decoded cell-for-cell from spritefix.png. 18x24
// native, five skin tones (A darkest -> E lightest) + body black.
// regenerate via the python in outputs/render_sprite_v2.py if hunter
// drops a new spritefix.png
const SISYPHUS = [
  '..................',
  '.......DEEEE......',
  '......BDEEDDE.....',
  '......BCEDDDE.....',
  '.....BBCDCCDE.....',
  '.....ABCCCCCD.....',
  '.....ABBCCCCD.....',
  '......ABBBCCB.....',
  '......ABBBBBA.....',
  '......#AAAAA......',
  '......######......',
  '......######......',
  '...###########....',
  '...############...',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..',
  '..##############..'
];

const SISY_W = SISYPHUS[0].length;
const SISY_H = SISYPHUS.length;
const SPRITE_SCALE = 4;

const SISY_DX = Math.round(FRAME_W / 2 - (SISY_W * SPRITE_SCALE) / 2 - 36);
const SISY_DY = FRAME_H - SISY_H * SPRITE_SCALE - 4;

// palette pulled all the way onto the orange-amber axis -- the v2 gold
// tones still read yellow against the photo's sun. widening the R-to-G
// gap and clamping blue lower gives each tone a thicker amber bite:
// shadows are burnt sienna, highlights are warm peach-amber, nothing
// reads cream or pale gold anymore. five tones, darkest A -> brightest E
const PALETTE: Record<string, string> = {
  '#': '#0A0608',
  'A': '#7A4220',
  'B': '#A0602C',
  'C': '#C47A38',
  'D': '#DC9554',
  'E': '#ECB874'
};

// stage machine for the fracture sequence:
//   live      -- nothing happened yet
//   fractured -- click landed, dots frozen, cracks drawn, warning up
//   exit-no   -- user chose no, fading to black -> home
//   exit-yes  -- user chose yes, cracks extending to edges -> white -> hole2
type Stage = 'live' | 'fractured' | 'exit-no' | 'exit-yes';

// helper -- queue an html-element class change that survives this
// component unmounting (because the page is about to swap, and the
// overlay needs to outlive the unmount)
const setHtmlClass = (cls: string, on: boolean) => {
  document.documentElement.classList.toggle(cls, on);
};

export function HolePage() {
  const [stage, setStage] = useState<Stage>('live');

  // hold pending timers so we can cancel on unmount. exit sequences
  // use raw window.setTimeout because they need to keep running even
  // after this component unmounts (we navigate mid-sequence)
  const timersRef = useRef<number[]>([]);
  const pushTimer = (t: number) => { timersRef.current.push(t); };

  // ambience -- ref to the <audio> element so we can poke it on mount
  // and from the fracture-click fallback
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      // on unmount, just clear the in-component timers. the exit
      // sequences set further timers via window.setTimeout that
      // intentionally outlive unmount -- they tidy the html-level
      // overlay classes after navigation
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, []);

  // try to start ambience on mount. browsers fairly often block
  // gesture-less autoplay; if play() rejects, listen for the first
  // pointerdown anywhere on the document and try again. the natural
  // fracture click satisfies that
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.55;
    let cleared = false;
    const kick = () => {
      if (cleared) return;
      audio.play().catch(() => { /* still blocked -- give up quietly */ });
      cleared = true;
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('keydown', kick);
    };
    audio.play().then(() => { cleared = true; }).catch(() => {
      document.addEventListener('pointerdown', kick, { once: true });
      document.addEventListener('keydown', kick, { once: true });
    });
    return () => {
      cleared = true;
      document.removeEventListener('pointerdown', kick);
      document.removeEventListener('keydown', kick);
      // unmount cuts the audio implicitly when the element disappears,
      // but pausing first avoids a brief glitch if the browser keeps
      // the buffer warm
      audio.pause();
    };
  }, []);

  useEffect(() => {
    if (stage === 'exit-no') {
      // fade the whole page to black, then snap to home. brief blank
      // beat in between as the home page hydrates underneath
      setHtmlClass('hole-exit-black-in', true);
      pushTimer(window.setTimeout(() => {
        window.location.hash = '';
        setHtmlClass('hole-exit-black-in', false);
        setHtmlClass('hole-exit-black-out', true);
        // fire-and-forget cleanup -- this timer outlives unmount
        window.setTimeout(() => {
          setHtmlClass('hole-exit-black-out', false);
        }, 480);
      }, 620));
    } else if (stage === 'exit-yes') {
      // wait for crack extensions to reach the edges (~380ms), then
      // flash white over the viewport, then swap routes to hole2
      pushTimer(window.setTimeout(() => {
        setHtmlClass('hole-exit-white-in', true);
      }, 380));
      pushTimer(window.setTimeout(() => {
        window.location.hash = 'hole2';
        // hole2 is white too -- removing the overlay is invisible to
        // the user but lets stage interactions through afterward
        setHtmlClass('hole-exit-white-in', false);
        window.setTimeout(() => {
          // already on hole2; pseudo overlay can clear silently
        }, 200);
      }, 720));
    }
  }, [stage]);

  const handleFracture = () => {
    if (stage === 'live') setStage('fractured');
  };

  // each button only acts while the warning is up. stopPropagation so
  // the click doesn't bubble to .hole-frame
  const handleYes = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stage === 'fractured') setStage('exit-yes');
  };
  const handleNo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stage === 'fractured') setStage('exit-no');
  };

  // six jagged polylines radiating from the center of the 320x180 scene.
  // every point is an integer so crispEdges + stroke-width 2 reads as
  // pixelated stairsteps rather than smooth diagonals. the order here
  // also drives the animation cascade (delays in css go by :nth-child)
  const CRACKS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
    // upper-left
    [[160,90],[156,90],[156,86],[152,86],[150,82],[146,82],[142,78],[138,78],
     [134,72],[130,70],[124,64],[118,60],[112,54],[104,48],[96,40],[84,30],[70,18]],
    // upper-right
    [[160,90],[164,90],[164,86],[168,86],[170,82],[174,82],[178,78],[182,76],
     [188,70],[194,66],[202,58],[212,50],[224,42],[240,32],[258,22],[278,14]],
    // right
    [[160,90],[164,90],[168,88],[174,90],[180,90],[188,92],[196,90],[206,88],
     [218,90],[232,92],[248,90],[266,88],[286,90],[308,88]],
    // lower-right
    [[160,90],[164,94],[168,98],[172,100],[176,106],[182,110],[188,116],
     [196,122],[204,128],[214,134],[226,142],[240,150],[256,160],[274,170]],
    // lower-left
    [[160,90],[156,94],[152,98],[148,102],[142,108],[136,114],[128,120],
     [120,126],[110,134],[98,142],[84,152],[68,162],[50,172]],
    // left
    [[160,90],[156,90],[152,88],[146,90],[138,88],[128,90],[116,88],[102,90],
     [86,88],[68,90],[48,88],[26,90]]
  ];

  // extensions -- start at each crack's original endpoint and continue
  // off the frame edge. drawn only on YES. same order as CRACKS so the
  // cascade lines up
  const CRACK_EXTENSIONS: ReadonlyArray<ReadonlyArray<[number, number]>> = [
    [[70,18],[58,10],[44,4],[30,-4],[14,-12],[-2,-22]],
    [[278,14],[290,8],[302,2],[312,-6],[322,-14],[332,-22]],
    [[308,88],[316,90],[324,88],[332,90]],
    [[274,170],[286,176],[298,180],[310,186],[322,192]],
    [[50,172],[38,178],[24,184],[10,190],[-4,196]],
    [[26,90],[14,90],[2,88],[-10,90],[-22,88]]
  ];

  // glass shards -- spawn near each crack endpoint, fly outward as if
  // the cinematic frame is being smashed. deterministic per-shard data
  // (no Math.random) so the same shards appear on every mount.
  // FRACTURE_SHARDS fire during the initial click, EXTEND_SHARDS fire
  // when the cracks extend on YES
  type Shard = {
    x: number; y: number;
    size: number;
    dx: number; dy: number;
    rot: number;
    delay: number;
  };
  const makeShards = (
    endpoint: readonly [number, number],
    crackIdx: number,
    count: number,
    baseDelay: number
  ): Shard[] => {
    const [ex, ey] = endpoint;
    const cx = FRAME_W / 2, cy = FRAME_H / 2;
    const dx0 = ex - cx, dy0 = ey - cy;
    const dist = Math.max(1, Math.hypot(dx0, dy0));
    const ux = dx0 / dist, uy = dy0 / dist;
    const seed = crackIdx * 7 + 11;
    return Array.from({ length: count }, (_, i) => {
      const jx = ((seed + i * 13) % 9) - 4;
      const jy = ((seed * 3 + i * 7) % 9) - 4;
      // ±30deg spread off the radial-outward direction
      const angle = (((seed + i * 19) % 60) - 30) * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const fx = ux * cos - uy * sin;
      const fy = ux * sin + uy * cos;
      const flyDist = 28 + ((seed * 11 + i * 23) % 32);
      return {
        x: ex + jx,
        y: ey + jy,
        size: 1 + ((seed + i * 5) % 2),
        dx: fx * flyDist,
        dy: fy * flyDist + ((i % 3) * 4), // tiny gravity sag
        rot: ((seed + i * 37) % 720) - 360,
        delay: baseDelay + i * 22
      };
    });
  };
  const FRACTURE_SHARDS: Shard[] = CRACKS.flatMap((points, i) =>
    makeShards(points[points.length - 1] as [number, number], i, 5, 70 + i * 70)
  );
  const EXTEND_SHARDS: Shard[] = CRACK_EXTENSIONS.flatMap((points, i) =>
    makeShards(points[points.length - 1] as [number, number], i + 10, 4, i * 45)
  );

  return (
    <section className="hole-stage" aria-labelledby="hole-title">
      <h1 id="hole-title" className="sr-only">the hole -- summit cinematic</h1>

      {/* looped ambience. preload=auto so it's ready before the
          fracture click; element is hidden but stays in the DOM so
          the ref is stable */}
      <audio
        ref={audioRef}
        src={AMBIENCE_URL}
        loop
        preload="auto"
        aria-hidden="true"
      />

      {/* SVG filter defs live outside the frame so they're available to
          any element via filter: url(#id). hidden + size 0 so they don't
          take up layout space */}
      <svg
        aria-hidden="true"
        width="0"
        height="0"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <defs>
          {/* frosted-glass + posterize chain. turbulence drives a
              displacement that warps the photo, then a heavy blur sells
              the "looking through frosted glass" read, then component-
              transfer quantizes the colors into bands so it stops
              looking like a photo, then a color matrix pulls the whole
              thing toward the site's warm-amber world */}
          <filter id="hole-frost" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="18"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped"
            />
            <feGaussianBlur in="warped" stdDeviation="2.4" result="blurred" />
            <feComponentTransfer in="blurred" result="posterized">
              <feFuncR type="discrete" tableValues="0.05 0.15 0.30 0.50 0.72 0.95" />
              <feFuncG type="discrete" tableValues="0.04 0.12 0.22 0.36 0.55 0.78" />
              <feFuncB type="discrete" tableValues="0.04 0.10 0.18 0.30 0.45 0.62" />
            </feComponentTransfer>
            <feColorMatrix
              in="posterized"
              type="matrix"
              values="
                1.18 0.04 0.00 0 -0.06
                0.02 0.92 0.00 0 -0.04
                0.00 0.00 0.78 0 -0.05
                0    0    0    1  0"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="hole-frame"
        role="img"
        aria-label="sisyphus at the summit, facing a rising sun"
        data-stage={stage !== 'live' ? stage : undefined}
        onClick={handleFracture}
      >
        {/* fallback sky -- pure CSS gradient, sits under the photo so the
            frame is never blank if the image is missing */}
        <div className="hole-frame__sky" aria-hidden="true" />

        {/* the photo plate. heavy SVG filter + CSS filter chain. img
            errors hide the element silently -- gradient below carries on */}
        <img
          className="hole-frame__photo"
          src={BG_URL}
          alt=""
          aria-hidden="true"
          loading="eager"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* frost overlay -- semi-opaque, with a fine grain via SVG noise
            background. sells the "glass surface" between you and the
            scene */}
        <div className="hole-frame__frost" aria-hidden="true" />

        {/* amber tint -- multiply blend pulls the whole plate into the
            site's palette no matter what the source colors were */}
        <div className="hole-frame__tint" aria-hidden="true" />

        {/* sisyphus -- sits on top of the distorted backdrop. the
            photo's own sun does the lighting work; no foreground glare
            layer */}
        <svg
          className="hole-scene"
          viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          {/* sisyphus -- four nested groups: position (svg attr), walk-in
              (CSS x-translate from off-frame), bob (CSS y-bob during
              entrance), breathe (CSS y on a delay so it kicks in once
              the walk-in finishes). stacking on separate elements
              avoids CSS animations fighting for the same transform */}
          <g transform={`translate(${SISY_DX}, ${SISY_DY})`}>
            <g className="hole-sisy-walkin">
              <g className="hole-sisy-bob">
                <g className="hole-sisy">
                  {SISYPHUS.flatMap((row, y) =>
                    [...row].map((ch, x) => {
                      if (ch === '.') return null;
                      const fill = PALETTE[ch];
                      if (!fill) return null;
                      return (
                        <rect
                          key={`${x},${y}`}
                          x={x * SPRITE_SCALE}
                          y={y * SPRITE_SCALE}
                          width={SPRITE_SCALE}
                          height={SPRITE_SCALE}
                          fill={fill}
                        />
                      );
                    })
                  )}
                </g>
              </g>
            </g>
          </g>
        </svg>

        {/* dialogue bar -- starts empty, fills with dots once sisyphus
            arrives, then scrolls indefinitely. two stacked animations:
            outer .fill is a one-time slide-in (delay = walkin time),
            inner .scroll is the infinite loop that takes over after
            .fill parks. click on .hole-frame freezes both via
            data-fractured=true */}
        <div className="hole-dialogue" aria-label="dialogue">
          <div className="hole-dialogue__inner">
            <div className="hole-dialogue__viewport" aria-hidden="true">
              <div className="hole-dialogue__fill">
                <div className="hole-dialogue__scroll">
                  {/* periodic dot row, 200% of viewport width. seamless
                      loop because the pattern repeats every cell --
                      translateX(-50%) lands on the same visual state as
                      translateX(0) */}
                  <div className="hole-dialogue__row">
                    {'. '.repeat(160)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* fracture cracks -- separate svg layer over the whole frame.
            each polyline has pathLength=1 so the stroke-dashoffset
            animation works regardless of actual path length. cracks
            (initial) and extensions (drawn only on YES) live in their
            own groups so nth-child resets per group */}
        <svg
          className="hole-cracks"
          viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <g className="hole-cracks__primary">
            {CRACKS.map((points, i) => (
              <polyline
                key={i}
                className="hole-crack"
                points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                pathLength="1"
                fill="none"
                stroke="#fff5dc"
                strokeWidth="2"
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            ))}
          </g>
          <g className="hole-cracks__extend">
            {CRACK_EXTENSIONS.map((points, i) => (
              <polyline
                key={`ext-${i}`}
                className="hole-crack-extend"
                points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                pathLength="1"
                fill="none"
                stroke="#fff5dc"
                strokeWidth="2"
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            ))}
          </g>

          {/* glass shards -- two groups so each set runs its own
              animation. each shard carries its trajectory in inline
              custom properties; the CSS keyframe just consumes them */}
          <g className="hole-shards">
            {FRACTURE_SHARDS.map((s, i) => (
              <rect
                key={`f-${i}`}
                className="hole-shard"
                x={s.x - s.size / 2}
                y={s.y - s.size / 2}
                width={s.size}
                height={s.size}
                fill="#fff5dc"
                style={{
                  '--shard-tx': `${s.dx}px`,
                  '--shard-ty': `${s.dy}px`,
                  '--shard-rot': `${s.rot}deg`,
                  '--shard-delay': `${s.delay}ms`
                } as React.CSSProperties}
              />
            ))}
          </g>
          <g className="hole-shards hole-shards--extend">
            {EXTEND_SHARDS.map((s, i) => (
              <rect
                key={`e-${i}`}
                className="hole-shard-extend"
                x={s.x - s.size / 2}
                y={s.y - s.size / 2}
                width={s.size}
                height={s.size}
                fill="#fff5dc"
                style={{
                  '--shard-tx': `${s.dx}px`,
                  '--shard-ty': `${s.dy}px`,
                  '--shard-rot': `${s.rot}deg`,
                  '--shard-delay': `${s.delay}ms`
                } as React.CSSProperties}
              />
            ))}
          </g>
        </svg>

        {/* confirmation modal -- lands after the cracks have a head
            start. NO fades the page to black -> home. YES extends the
            cracks to the frame edges, flashes white, lands on hole2 */}
        <div className="hole-warning" role="dialog" aria-modal="true" aria-labelledby="hole-warning-title">
          <div id="hole-warning-title" className="hole-warning__title">
            {/* bangs flank the text as separate icon spans -- larger,
                hard on/off flash on a loop. aria-hidden so screen
                readers just say "ARE YOU SURE..." once */}
            <span className="hole-warning__bang" aria-hidden="true">!!</span>
            <span className="hole-warning__text">ARE YOU SURE YOU WANT TO CONTINUE?</span>
            <span className="hole-warning__bang" aria-hidden="true">!!</span>
          </div>
          <div className="hole-warning__buttons">
            <button
              type="button"
              className="hole-warning__btn"
              onClick={handleYes}
            >
              YES
            </button>
            <span className="hole-warning__sep" aria-hidden="true">|</span>
            <button
              type="button"
              className="hole-warning__btn"
              onClick={handleNo}
            >
              NO
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
