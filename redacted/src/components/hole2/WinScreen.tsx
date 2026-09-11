// pixel-art fireworks + gothic victory caption, then a scripted
// post-caption sequence:
//   phase 'caption'  -- 3s of plain caption while the bursts shower
//   phase 'flash'    -- red flashing ellipse drawn over the word FINIS,
//                        finis-hit sting fires (yt audio, hidden iframe).
//                        the sting's ended-state advances to 'popup'
//   phase 'popup'    -- the full victory video plays as a visible iframe
//                        covering the caption block. 12s later we force
//                        the route back to the main portfolio page
//
// state lives entirely inside this component -- Hole2Page only stops
// the boss music + flips victory=true. the two yt players are built
// against the iframe api at the moments they're needed and torn down
// on unmount so a hash-away cleans up properly
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { loadYouTubeApi } from '../Hole2Page';

type Burst = {
  id: number;
  x: number;
  y: number;
  hue: number;
  shards: ReadonlyArray<{ dx: number; dy: number }>;
  delay: number;
};

const SHARD_COUNT = 14;
const BURST_MS = 520;
const MAX_BURSTS = 18;
const HUES = [44, 12, 350, 28, 200, 280, 130, 60];

// short sting played behind the FINIS flash. yt id from
// https://youtu.be/9iyae89H2iM
const FINIS_HIT_VIDEO_ID = '9iyae89H2iM';
// full victory track shown as a visible iframe overlay once the sting
// concludes. yt id from https://youtu.be/y6B3hsWgEC4
const VICTORY_FULL_VIDEO_ID = 'y6B3hsWgEC4';

const CAPTION_TO_FLASH_MS = 3000;   // plain caption beat before the flash
const POPUP_TO_RETURN_MS  = 12000;  // 12s of popup video then force return

type Phase = 'caption' | 'flash' | 'popup';

function makeShards(seed: number): Burst['shards'] {
  const out: Burst['shards'][number][] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const baseAngle = (i / SHARD_COUNT) * Math.PI * 2;
    const jitter = ((Math.sin(seed * 13 + i * 7) + 1) / 2 - 0.5) * 0.35;
    const angle = baseAngle + jitter;
    const dist = 14 + ((Math.sin(seed * 31 + i * 5) + 1) / 2) * 16;
    out.push({
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist
    });
  }
  return out;
}

function makeBurst(id: number, delay: number = 0): Burst {
  const seed = (id * 73 + 17) >>> 0;
  return {
    id,
    x: 18 + ((Math.sin(seed * 11) + 1) / 2) * 64,
    y: 14 + ((Math.sin(seed * 29) + 1) / 2) * 46,
    hue: HUES[id % HUES.length],
    shards: makeShards(seed),
    delay
  };
}

export function WinScreen() {
  const [bursts, setBursts] = useState<ReadonlyArray<Burst>>(() => {
    return [makeBurst(0, 0), makeBurst(1, 160), makeBurst(2, 340)];
  });
  const [phase, setPhase] = useState<Phase>('caption');

  // burst shower scheduler -- unchanged from the original WinScreen.
  // keeps firing even after the caption is gone so the popup video sits
  // over a still-active background. caps at MAX_BURSTS to keep dom flat
  useEffect(() => {
    let nextId = 3;
    const id = window.setInterval(() => {
      setBursts((prev) => {
        const next = [...prev, makeBurst(nextId++, 0)];
        return next.length > MAX_BURSTS ? next.slice(next.length - MAX_BURSTS) : next;
      });
    }, BURST_MS);
    return () => window.clearInterval(id);
  }, []);

  // caption -> flash transition. 3s of plain caption read first so the
  // user clocks "VICTORY" + "FINIS" before the highlight starts
  useEffect(() => {
    if (phase !== 'caption') return;
    const id = window.setTimeout(() => setPhase('flash'), CAPTION_TO_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  // finis-hit yt player. mounted into the hidden host div the moment
  // phase=flash. when the sting hits its ended event (data===0), we
  // advance to phase=popup which unmounts this player + reveals the
  // full-video iframe.
  // IMPORTANT: yt's `new YT.Player(node, ...)` REPLACES the node it's
  // given with its own iframe element -- which detaches it from
  // react's tree. so we render an outer host (react-owned) + an inner
  // placeholder (yt eats this one). without the inner, react's
  // unmount of the outer throws NotFoundError when phase flips
  const finisHostRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finisPlayerRef = useRef<any>(null);
  useEffect(() => {
    if (phase !== 'flash') return;
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !finisHostRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.YT?.Player) return;
      // build a fresh sacrificial child for yt to replace. doing it
      // here (not in jsx) keeps react unaware of the node so the
      // replace-with-iframe doesn't desync the vdom
      const sacrificial = document.createElement('div');
      finisHostRef.current.appendChild(sacrificial);
      finisPlayerRef.current = new w.YT.Player(sacrificial, {
        videoId: FINIS_HIT_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          disablekb: 1,
          iv_load_policy: 3,
          playsinline: 1
        },
        events: {
          // playVideo on ready is belt-and-suspenders -- autoplay=1
          // should already kick playback, but mobile + some desktop
          // embeds need the explicit nudge to honor the user gesture
          // that flowed in from the BEGIN click earlier in the session
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (e: any) => { try { e.target.playVideo?.(); } catch { /* ignore */ } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            if (e?.data === 0) setPhase('popup');
          }
        }
      });
    });
    return () => {
      cancelled = true;
      try { finisPlayerRef.current?.destroy?.(); } catch { /* ignore */ }
      finisPlayerRef.current = null;
    };
  }, [phase]);

  // popup phase -- 12s wall-clock timer then force the user back to
  // the home page. we use a plain iframe (not the api) for the popup
  // because we don't need playback control, just autoplay
  useEffect(() => {
    if (phase !== 'popup') return;
    const id = window.setTimeout(() => {
      // hard hash flip -- same shape as the REND-YOURSELF bail. the
      // home page reads the empty hash + the hole2 components unmount,
      // which destroys the iframe + this WinScreen with it
      window.location.hash = '';
    }, POPUP_TO_RETURN_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  return (
    <div className="hole2-win" data-on="true" data-phase={phase} aria-hidden="true">
      <div className="hole2-win__dim" />
      <div className="hole2-win__fireworks">
        {bursts.map((b) => (
          <FireworkBurst key={b.id} burst={b} />
        ))}
      </div>
      {phase !== 'popup' && (
        <div className="hole2-win__caption">
          <div className="hole2-win__title">VICTORY</div>
          <div className="hole2-win__sub">
            <span
              className={
                phase === 'flash'
                  ? 'hole2-win__finis hole2-win__finis--flashing'
                  : 'hole2-win__finis'
              }
            >
              FINIS
            </span>
            {' -- MAESTRUL UMBRELOR FELLED'}
          </div>
          <div className="hole2-win__epitaph">
            eleven centuries of shadowmancy, undone in a single movement.
            the eclipse lifts; the void exhales. ultimately the dance
            finishes -- and the stage is, kind of, yours.
          </div>
        </div>
      )}
      {/* finis-hit sting host -- hidden off-screen. only mounted in the
          flash phase so the api re-construct + destroy lifecycle is
          tied to the phase transition */}
      {phase === 'flash' && (
        <div ref={finisHostRef} className="hole2-win__finis-host" />
      )}
      {/* popup video -- visible iframe covering where the caption was.
          plain embed (no api) since we don't need playback control.
          autoplay flag relies on the user activation that's been
          carried through the session (BEGIN click earlier) */}
      {phase === 'popup' && (
        <iframe
          className="hole2-win__popup"
          src={
            'https://www.youtube.com/embed/' + VICTORY_FULL_VIDEO_ID +
            '?autoplay=1&controls=0&modestbranding=1&rel=0&playsinline=1'
          }
          title="victory"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}

function FireworkBurst({ burst }: { burst: Burst }) {
  const shardStyles = useMemo<CSSProperties[]>(
    () =>
      burst.shards.map((s) => ({
        ['--dx' as string]: `${s.dx.toFixed(2)}vh`,
        ['--dy' as string]: `${s.dy.toFixed(2)}vh`,
        ['--hue' as string]: String(burst.hue),
        ['--delay' as string]: `${burst.delay}ms`
      })),
    [burst]
  );

  const wrapperStyle = {
    ['--x' as string]: `${burst.x.toFixed(2)}%`,
    ['--y' as string]: `${burst.y.toFixed(2)}%`,
    ['--hue' as string]: String(burst.hue),
    ['--delay' as string]: `${burst.delay}ms`
  } as CSSProperties;

  return (
    <div className="hole2-firework" style={wrapperStyle}>
      <div className="hole2-firework__flash" />
      {shardStyles.map((style, i) => (
        <div key={i} className="hole2-firework__shard" style={style} />
      ))}
    </div>
  );
}
