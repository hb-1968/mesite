// the void after the fracture. white field, no status bar, no footer.
// six gothic dialogue boxes deliver Maestrul Umbrelor's monologue, one
// click at a time. submitting the 6th box (input) triggers a transition:
// the box shrinks to a square shadow, a white sprite rises from it with
// a vertical blur trail, an eclipse expands from the shadow until it
// covers the viewport, and the touhou-style arena materializes from
// within the black -- distorted ground + arena box + placeholder sprite
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { Hole2Game } from './hole2/Hole2Game';
import { WinScreen } from './hole2/WinScreen';
import { LoseScreen } from './hole2/LoseScreen';
import { PauseOverlay } from './hole2/PauseOverlay';
import { AdminPanel } from './hole2/AdminPanel';
import type { Hole2EngineHandle, Hole2Quality, Hole2Tier } from './hole2/engine';

const BOX_W = 320;
const BOX_H = 110;

// the box visual -- 320x110 pixel-art png authored by hunter. served
// from public/ via BASE_URL so the same path works for the /portfolio/
// project build and the dev server. used as the border for every box
// in the pile
const BORDER_URL = `${import.meta.env.BASE_URL}evildialoge.png`;
// arena assets. all served from public/ via BASE_URL. ?v= query is a
// cache-buster -- bump when hunter swaps the source file so browsers
// don't keep serving a stale cached version. (vite hashes assets in
// src/ but doesn't hash files in public/, so cache-busting is manual)
const ARENA_ASSET_VERSION = 'v3';
const ARENA_GROUND_URL = `${import.meta.env.BASE_URL}backgroundfinal.png?${ARENA_ASSET_VERSION}`;
const ARENA_BOX_URL    = `${import.meta.env.BASE_URL}evilbox.png?${ARENA_ASSET_VERSION}`;
const SPRITE_URL       = `${import.meta.env.BASE_URL}sprite.png?${ARENA_ASSET_VERSION}`;

// per-character typewriter delay. pauses inside lines extend this on
// their own timeline
const CHAR_MS = 32;

// scramble effect tuning. each newly-revealed char doesn't snap to its
// final value -- it cycles random chars for a brief window (CYCLE_BUFFER
// chars beyond the typed cursor are visible-but-scrambled, re-rolled at
// SCRAMBLE_TICK_MS). matches the heuristic effect on projects entries
const CYCLE_BUFFER = 8;
const SCRAMBLE_TICK_MS = 55;
const SCRAMBLE_CHARS = '!@#$%^&*-=+/\\<>{}[]|ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const randChar = () => SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
const isStructural = (c: string) => c === ' ' || c === '\n' || c === '\t';

type Dir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
type TextStyle = 'red' | 'gothic-red';
type Segment =
  | { type: 'text'; text: string; style?: TextStyle }
  | { type: 'pause'; ms: number }
  // click-pause splits a line into chunks. text accumulates across
  // chunks (prior chunks stay on screen) but the typewriter halts at
  // each click-pause until the user clicks past it
  | { type: 'click-pause' };
type Line = ReadonlyArray<Segment>;
type Chunk = ReadonlyArray<Segment>;

// walk a line and produce one chunk per click-pause-separated run.
// chunks 0..N-1 are rendered fully revealed once the user advances
// past them; the current chunk gets typewriter treatment
function splitClickPauses(line: Line): Chunk[] {
  const chunks: Segment[][] = [[]];
  for (const seg of line) {
    if (seg.type === 'click-pause') {
      chunks.push([]);
    } else {
      chunks[chunks.length - 1].push(seg);
    }
  }
  return chunks;
}
type DialogueContent = {
  kind: 'dialogue';
  speaker?: string;
  lines: ReadonlyArray<Line>;
  // align=center centers the text horizontally inside the box (used
  // for the Maestrul name moment). huge stretches the line(s) to fill
  // the box at a large font size (used for "What has you?")
  align?: 'left' | 'center';
  huge?: boolean;
};
type InputContent = {
  kind: 'input';
  prompt: string;
};
type BoxContent = DialogueContent | InputContent;
type BoxData = {
  id: number;
  dir: Dir;
  ox: number;
  oy: number;
  rot: number;
  floatPhase: number;
  content: BoxContent;
};

// 6 boxes. content per box matches the storyboard exactly; pause
// segments break up the typewriter for dramatic beats
const BOXES: ReadonlyArray<BoxData> = [
  {
    id: 0, dir: 'S', ox: 2, oy: 0, rot: -1.5, floatPhase: -400,
    content: {
      kind: 'dialogue',
      speaker: '???',
      lines: [
        [
          { type: 'text', text: '. . . I am surprised,' },
          { type: 'click-pause' },
          { type: 'text', text: ' shocked even . . .' }
        ],
        [{ type: 'text', text: 'I know not your cause to pry so far -- perhaps you are of digital blood-bound.' }],
        [{ type: 'text', text: 'I care not.' }]
      ]
    }
  },
  {
    id: 1, dir: 'NE', ox: 14, oy: -8, rot: 2.5, floatPhase: -1700,
    content: {
      kind: 'dialogue',
      speaker: '???',
      lines: [[
        { type: 'text', text: 'Me? ' },
        { type: 'text', text: 'I am the negative.', style: 'red' }
      ]]
    }
  },
  {
    id: 2, dir: 'NW', ox: -12, oy: 6, rot: -3.0, floatPhase: -2900,
    content: {
      kind: 'dialogue',
      speaker: '???',
      lines: [[
        { type: 'text', text: 'Boy,' },
        { type: 'pause', ms: 1500 },
        { type: 'text', text: ' oh,' },
        { type: 'pause', ms: 1500 },
        { type: 'text', text: ' boy,' },
        { type: 'pause', ms: 1500 },
        { type: 'text', text: ' where do I even begin? I did it again, if you know the voice -- ' },
        { type: 'pause', ms: 1500 },
        { type: 'text', text: ' then I solemnly deliver that final closure robbed of you by your false reality.' }
      ]]
    }
  },
  {
    id: 3, dir: 'SE', ox: 18, oy: -14, rot: 4.0, floatPhase: -900,
    content: {
      kind: 'dialogue',
      align: 'center',
      lines: [[
        { type: 'text', text: 'For the rest of you rabble so placid uninformed: I am' },
        { type: 'pause', ms: 2000 },
        { type: 'text', text: ' Maestrul Umbrelor', style: 'gothic-red' },
        { type: 'text', text: ', and ' },
        { type: 'text', text: 'I am the entropical end.', style: 'red' }
      ]]
    }
  },
  {
    id: 4, dir: 'W', ox: -18, oy: 10, rot: -2.0, floatPhase: -3600,
    content: {
      kind: 'dialogue',
      huge: true,
      lines: [[{ type: 'text', text: 'WHAT HAS YOU?' }]]
    }
  },
  {
    id: 5, dir: 'N', ox: 6, oy: -20, rot: 3.0, floatPhase: -2200,
    content: {
      kind: 'input',
      prompt: 'your response:'
    }
  }
];

type Status = 'pending' | 'active' | 'shattered';

// ---- typewriter compile ---------------------------------------------
// flatten a Line into a sequence of timed character reveals. each
// element of the schedule is the cumulative ms at which one more
// character becomes visible. pauses just stretch the gap between
// adjacent reveals
type Reveal = { atMs: number };
function compileLine(line: Line): Reveal[] {
  const out: Reveal[] = [];
  let t = 0;
  for (const seg of line) {
    if (seg.type === 'pause') {
      t += seg.ms;
    } else if (seg.type === 'text') {
      for (const _ch of seg.text) {
        out.push({ atMs: t });
        t += CHAR_MS;
      }
    }
    // click-pause is removed by splitClickPauses before reaching here;
    // ignore if any sneaks through
  }
  return out;
}

// any gap between consecutive reveals that's notably larger than the
// per-character typing gap is treated as a pause. used by the click
// handler to decide whether to advance or block
const PAUSE_THRESHOLD_MS = CHAR_MS * 3;

// true when the next character won't be revealed for a while -- i.e.
// the line is currently sitting in a pause. clicks during a pause do
// not advance
function isInPause(sched: Reveal[], typed: number): boolean {
  if (typed >= sched.length) return false;
  const prev = typed === 0 ? 0 : sched[typed - 1].atMs;
  return (sched[typed].atMs - prev) > PAUSE_THRESHOLD_MS;
}

// smallest reveal index > current typed where a pause sits just before
// it. setTyped to this index reveals everything up to (but not past)
// the next pause boundary. the natural setTimeout chain then handles
// the pause itself
function nextPauseBoundary(sched: Reveal[], typed: number): number {
  for (let i = typed + 1; i < sched.length; i++) {
    if (sched[i].atMs - sched[i - 1].atMs > PAUSE_THRESHOLD_MS) {
      return i;
    }
  }
  return sched.length;
}

// ---- debris ---------------------------------------------------------
function seeded(seed: number, ...indices: number[]): number {
  let s = seed * 73 + 1;
  for (const i of indices) s = (s * 31 + i * 17 + 1) & 0x7fffffff;
  s = (s ^ (s >>> 15)) * 0x2c1b3c6d;
  s = (s ^ (s >>> 12)) * 0x297a2d39;
  s = (s ^ (s >>> 15)) >>> 0;
  return s / 0xffffffff;
}

type Debris = {
  px: number; py: number;
  dx: number; dy: number;
  rot: number; delay: number; size: number;
};
function generateDebris(seed: number): Debris[] {
  const COLS = 8;
  const ROWS = 4;
  const out: Debris[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = ((c + 0.5) / COLS) * 100 + (seeded(seed, c, r, 0) - 0.5) * 8;
      const py = ((r + 0.5) / ROWS) * 100 + (seeded(seed, c, r, 1) - 0.5) * 12;
      const dx0 = px - 50;
      const dy0 = py - 50;
      const len = Math.max(1, Math.hypot(dx0, dy0));
      const flyDist = 40 + seeded(seed, c, r, 2) * 80;
      const dx = (dx0 / len) * flyDist;
      const dy = (dy0 / len) * flyDist + 18 + seeded(seed, c, r, 3) * 22;
      out.push({
        px, py, dx, dy,
        rot: (seeded(seed, c, r, 4) - 0.5) * 720,
        delay: seeded(seed, c, r, 5) * 90,
        size: 3 + Math.floor(seeded(seed, c, r, 6) * 3)
      });
    }
  }
  return out;
}

// ---- save user response ---------------------------------------------
// write to localStorage as an append-only log, then offer the user a
// .txt download of just-the-message. doubles as a way for someone
// running the dev server locally to collect what people typed
function saveResponse(text: string) {
  try {
    const key = 'hole2-responses';
    const log = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ at: string; text: string }>;
    log.push({ at: new Date().toISOString(), text });
    localStorage.setItem(key, JSON.stringify(log));
  } catch { /* localStorage may be disabled -- ignore */ }
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hole2-response-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { /* download may be blocked -- ignore */ }
}

// ---- background music ------------------------------------------------
// two tracks:
//   dialogue -- plays during the 6-box monologue. uses the yt iframe
//   api so it can start on the first dialogue-advance click (not the
//   iframe itself) and stop on submit. seamless loop via the ended
//   state event since the loop playerVar is unreliable when the api
//   controls the player.
//   boss -- ALSO uses the api now. previously a plain autoplay iframe,
//   but the track is synced to boss phases so the engine's pause has
//   to freeze the music in lockstep. pauseVideo() preserves position;
//   the old autoplay+loop URL approach can't pause-then-resume cleanly
const DIALOGUE_VIDEO_ID = 'jmc5QshPKo8';
const BOSS_VIDEO_ID     = 'libw4NyO4LY';
// (the post-victory finis-hit + popup video IDs live in WinScreen now;
// WinScreen runs its own state machine + yt players for the victory
// sequence rather than piggybacking on useHole2Music)

// load the yt iframe api once -- subsequent hole2 mounts reuse it.
// module-level promise dedupes parallel loads. exported so WinScreen
// can wait for YT.Player before constructing its own players for the
// finis-hit sting (no need to re-fetch the api script in that file)
let ytApiPromise: Promise<void> | null = null;
export function loadYouTubeApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve();
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
  return ytApiPromise;
}

// hook returns stable play/pause/stop refs + the dom id for the host
// element. play() can be called before the api is ready -- intent is
// queued and fired on onReady. pause() freezes at the current position
// (used for engine pause -- the boss music is synced to boss phases so
// freezing in lockstep is load-bearing). stop() suppresses the loop
// restart so the track doesn't resume after a manual stop
function useHole2Music(videoId: string) {
  // player instance + small bits of state held in refs so they don't
  // trigger re-renders on every transition
  const playerRef = useRef<{
    playVideo?: () => void;
    pauseVideo?: () => void;
    stopVideo?: () => void;
    seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    getCurrentTime?: () => number;
    destroy?: () => void;
  } | null>(null);
  const readyRef = useRef(false);
  // wantPlayRef -- has the user asked for playback? used for the loop-
  // on-ended restart. pause() leaves this true so the loop restart
  // still fires if the track happens to end while paused (unlikely
  // but harmless). pausedRef -- are we currently paused? gates the
  // loop-restart logic so a pause doesn't immediately get auto-resumed
  const wantPlayRef = useRef(false);
  const pausedRef = useRef(false);
  const [containerId] = useState(() => `hole2-yt-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled) return;
      const w = window as unknown as { YT?: { Player: new (id: string, opts: unknown) => unknown } };
      const el = document.getElementById(containerId);
      if (!el || !w.YT?.Player) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      playerRef.current = new w.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          disablekb: 1,
          iv_load_policy: 3,
          playsinline: 1
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            // user already clicked while the api was loading -- kick
            // playback now. still counts as inside the gesture flow on
            // most browsers since the iframe was mounted in response
            if (wantPlayRef.current) {
              try { playerRef.current?.playVideo?.(); } catch { /* ignore */ }
            }
          },
          onStateChange: (e: { data?: number }) => {
            // state 0 = ended. restart for seamless loop, but only if
            // the user hasn't explicitly stopped (submit / rend) and
            // isn't currently paused (otherwise we'd auto-resume the
            // moment a paused track happened to end-of-buffer).
            // seekTo(0) before playVideo guarantees the loop even when
            // the api's "ended -> play restarts from 0" behavior gets
            // flaky (it does on some embeds); without seek, the
            // victory track would sit on the end frame and not loop
            if (e?.data === 0 && wantPlayRef.current && !pausedRef.current) {
              try {
                playerRef.current?.seekTo?.(0, true);
                playerRef.current?.playVideo?.();
              } catch { /* ignore */ }
            }
            // state 1 = playing. if we asked for pause but the player
            // flipped back to playing on its own -- happens on tabs
            // that have been backgrounded long enough for YT's
            // internal buffer/recovery logic to kick the video back
            // alive -- re-issue pauseVideo() so the pause sticks.
            // without this the engine stays paused (overlay still up)
            // but the boss track quietly resumes in the background
            if (e?.data === 1 && pausedRef.current) {
              try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
            }
          }
        }
      }) as typeof playerRef.current;
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
      readyRef.current = false;
      wantPlayRef.current = false;
    };
  }, [videoId, containerId]);

  const play = useCallback(() => {
    wantPlayRef.current = true;
    pausedRef.current = false;
    if (readyRef.current) {
      try { playerRef.current?.playVideo?.(); } catch { /* ignore */ }
    }
  }, []);
  // pauseVideo preserves currentTime; resume picks up where it left off
  // -- critical for the boss track which is phase-synced
  const pause = useCallback(() => {
    pausedRef.current = true;
    if (readyRef.current) {
      try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
    }
  }, []);
  const resume = useCallback(() => {
    pausedRef.current = false;
    if (wantPlayRef.current && readyRef.current) {
      try { playerRef.current?.playVideo?.(); } catch { /* ignore */ }
    }
  }, []);
  const stop = useCallback(() => {
    wantPlayRef.current = false;
    pausedRef.current = false;
    try { playerRef.current?.stopVideo?.(); } catch { /* ignore */ }
  }, []);
  // restart -- seek back to 0 and play. used on fight reset (death or
  // dev `r`) so the phase-synced boss track lines up with the fresh
  // phase 1. seekTo is preferred over stop+play because stopVideo
  // unloads the buffer + the subsequent play has a brief silence gap
  const restart = useCallback(() => {
    wantPlayRef.current = true;
    pausedRef.current = false;
    if (readyRef.current) {
      try {
        playerRef.current?.seekTo?.(0, true);
        playerRef.current?.playVideo?.();
      } catch { /* ignore */ }
    }
  }, []);
  // seek -- absolute jump to a target time, gated on a minimum delta so
  // near-no-op seeks (timer-driven phase advances where the music is
  // already at the target) don't trigger a re-buffer hitch. used by
  // the phase-sync hook: engine fires PHASE_START_S[n] on every setPhase
  // and we seek the boss track to that, so an early-drained boss bar
  // (or admin/dev scrub) warps the music forward to stay aligned with
  // the fight. drops silently if the player isn't ready yet -- the
  // boot-time setPhase(1) lands in this case and the music just starts
  // at 0 naturally
  const seek = useCallback((seconds: number, opts?: { minDeltaSec?: number }) => {
    // eslint-disable-next-line no-console
    console.log('[hole2-sync] seek called', { seconds, ready: readyRef.current, hasPlayer: !!playerRef.current });
    if (!readyRef.current) return;
    const minDelta = opts?.minDeltaSec ?? 1.0;
    try {
      const cur = playerRef.current?.getCurrentTime?.() ?? 0;
      const delta = Math.abs(cur - seconds);
      // eslint-disable-next-line no-console
      console.log('[hole2-sync] seek gate', { cur, target: seconds, delta, minDelta, willSeek: delta >= minDelta });
      if (delta < minDelta) return;
      playerRef.current?.seekTo?.(seconds, true);
      // eslint-disable-next-line no-console
      console.log('[hole2-sync] seekTo issued', seconds);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[hole2-sync] seek threw', err);
    }
  }, []);

  return { play, pause, resume, stop, restart, seek, containerId };
}

// ---- phase machine for the post-submit transition --------------------
// dialogue: the 6-box monologue (the existing state machine).
// rising:   input box shrinks to a square shadow; white sprite rises
//           from it with a vertical blur trail.
// eclipsing: a dark circle expands from the shadow until it covers the
//           viewport. sprite stays visible above.
// arena:    black field, distorted backgroundfinal as ground, evilbox
//           overlay arena, placeholder sprite inside. final state for
//           now; bullet-hell mechanics are a later beat.
type Phase = 'dialogue' | 'rising' | 'eclipsing' | 'arena';
const RISE_MS    = 1500;  // box shrink + sprite rise duration
const ECLIPSE_MS = 1100;  // eclipse expansion duration
const ECLIPSE_OVERLAP_MS = 300; // eclipse begins this much before rise ends
// arena-ready timing -- the box's spin-grow finishes around 5000ms
// after phase=arena. the HUD, BEGIN box, and player placeholder all
// fade in / appear once this fires
const ARENA_READY_MS = 5000;

// ---- perf tier resolution -------------------------------------------
// quality is the user preference; resolveTier turns it into a concrete
// rendering tier that drives data-perf on the stage (which gates the
// visual-only CSS perf rules). 'auto' defers to detectTier -- a static
// device heuristic, fleshed out in Phase 3; for now reduced-motion
// users get low, everyone else high. explicit picks pass straight
// through. NOTE: tiers only change visuals -- never gameplay
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function detectTier(): Hole2Tier {
  if (prefersReducedMotion()) return 'low';
  return 'high';
}
function resolveTier(quality: Hole2Quality): Hole2Tier {
  if (quality === 'low' || quality === 'med' || quality === 'high') return quality;
  return detectTier();
}
function readQualityPref(): Hole2Quality {
  try {
    const q = localStorage.getItem('hole2-quality');
    if (q === 'low' || q === 'med' || q === 'high' || q === 'auto') return q;
  } catch { /* localStorage may be disabled -- ignore */ }
  return 'auto';
}

// ---- main component -------------------------------------------------
export function Hole2Page() {
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [lineIdx, setLineIdx] = useState(0);
  // chunkIdx tracks position within a line when click-pauses split it.
  // lines without click-pauses still have chunkIdx=0 (one chunk total)
  const [chunkIdx, setChunkIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<Phase>('dialogue');
  // arena-ready flips true once the box has finished spinning in -- HUD
  // fades in, BEGIN box + player placeholder appear. lifted out of
  // TransitionAndArena so the page-level overlay can read it too
  const [arenaReady, setArenaReady] = useState(false);
  // begun flips on the first click of the BEGIN box. boss-track starts
  // and the player placeholder slides into the arena box. once true,
  // the begin box dissolves; the boss-fight engine mounts + takes over
  const [begun, setBegun] = useState(false);
  // victory flips when the engine fires onVictory -- player drained the
  // boss bar in PHASE_MAX. mounting WinScreen kicks the fireworks +
  // hard-cuts the boss track in favor of the victory loop so the
  // sustained boss-phase music doesn't keep playing under the win caption
  const [victory, setVictory] = useState(false);
  // defeated flips when the engine fires onDefeat -- final-phase timer
  // expired without the player draining the bar. mounts LoseScreen
  // (DARKNESS RISES). cleared by handleFightReset on the dev `r` path
  // so a second attempt can re-trigger the overlay
  const [defeated, setDefeated] = useState(false);
  const handleDefeat = useCallback(() => setDefeated(true), []);

  // perf tiering. perfQuality is the persisted preference; perfTier is
  // the resolved concrete tier rendered as data-perf on the stage, which
  // gates the visual-only CSS perf rules. React is the single source of
  // truth -- the BEGIN-screen toggle + AdminPanel route changes through
  // handlePerfChange, and the engine's Phase-3 auto-downgrade fires it
  // with a forcedTier (drops visuals without overwriting the 'auto' pref)
  const [perfQuality, setPerfQuality] = useState<Hole2Quality>(() => readQualityPref());
  const [perfTier, setPerfTier] = useState<Hole2Tier>(() => resolveTier(readQualityPref()));
  const handlePerfChange = useCallback((quality: Hole2Quality, forcedTier?: Hole2Tier) => {
    if (forcedTier) {
      // Phase-3 runtime downgrade -- drop the visual tier, keep the pref
      setPerfTier(forcedTier);
      return;
    }
    setPerfQuality(quality);
    setPerfTier(resolveTier(quality));
    try { localStorage.setItem('hole2-quality', quality); } catch { /* ignore */ }
  }, []);

  // dialogue bg music -- needs the yt iframe api because the playback
  // trigger (first dialogue-advance click) isn't on the iframe itself
  const { play: playDialogueMusic, stop: stopDialogueMusic, containerId: dialogueMusicHostId } =
    useHole2Music(DIALOGUE_VIDEO_ID);

  // boss bg music -- previously a plain autoplay iframe, but the track
  // is synced to boss phases so the engine's pause has to freeze it in
  // lockstep. moved onto the yt iframe api so pauseVideo/playVideo
  // preserves position; play() fires inside the BEGIN click handler
  // (user gesture), pause/resume fire on engine pause-change
  const {
    play: playBossMusic,
    pause: pauseBossMusic,
    resume: resumeBossMusic,
    stop: stopBossMusic,
    restart: restartBossMusic,
    seek: seekBossMusic,
    containerId: bossMusicHostId
  } = useHole2Music(BOSS_VIDEO_ID);

  // (the old useHole2Music(VICTORY_VIDEO_ID) call lived here. WinScreen
  // now owns the post-victory audio + popup video sequence; Hole2Page
  // just stops the boss track on victory and steps out of the way)

  // hard-cut the boss track + flip the victory flag. WinScreen runs the
  // rest of the victory sequence (3s silent caption -> finis-hit sting
  // -> popup video -> forced hash return) from here on its own
  const handleVictory = useCallback(() => {
    setVictory(true);
    stopBossMusic();
  }, [stopBossMusic]);

  // paused mirrors the engine's pause state. flipped via the engine's
  // onPauseChange callback so React re-renders the overlay in lockstep.
  // the boss track is phase-synced -- freezing the engine without
  // freezing the music would drift them apart on every pause, so
  // pauseBossMusic / resumeBossMusic land here too. declared AFTER the
  // music hook so the refs exist when handlePauseChange closes over them
  const [paused, setPaused] = useState(false);
  const handlePauseChange = useCallback((p: boolean) => {
    setPaused(p);
    if (p) pauseBossMusic();
    else   resumeBossMusic();
  }, [pauseBossMusic, resumeBossMusic]);

  // fight-reset handler -- engine fires this when the player dies or
  // presses the dev `r` key, and resetFight runs. boss music is phase-
  // synced so restarting it from the top keeps the track aligned with
  // the fresh phase 1. also clears the win/loss overlays so a fresh
  // attempt isn't haunted by a stale DARKNESS RISES / VICTORY screen.
  // (WinScreen unmounts when victory flips false, which destroys its
  // own yt players + clears the popup iframe automatically)
  const handleFightReset = useCallback(() => {
    restartBossMusic();
    setVictory(false);
    setDefeated(false);
  }, [restartBossMusic]);

  // phase-change handler -- engine fires this on every setPhase with
  // the canonical song-time (PHASE_START_S[n]) the new phase should
  // begin at. seek the boss track to that point so the music stays
  // synced with the fight even when a phase ends early (boss bar
  // drained ahead of the timer) or gets scrubbed via admin/dev keys.
  // the seek itself gates on a small delta inside useHole2Music, so
  // natural timer advances (where the music is already at the target)
  // don't hitch -- only desync-worthy jumps actually move the playhead
  const handlePhaseChange = useCallback((newPhase: number, canonicalSongSec: number) => {
    // eslint-disable-next-line no-console
    console.log('[hole2-sync] handlePhaseChange received', { newPhase, canonicalSongSec });
    // diagnostic kill-switch -- set window.__skipSeek = true in the
    // console to disable music seek entirely. lets us test whether the
    // seek itself is what's destabilizing phase advances
    if ((window as unknown as { __skipSeek?: boolean }).__skipSeek) {
      // eslint-disable-next-line no-console
      console.log('[hole2-sync] seek SKIPPED via window.__skipSeek');
      return;
    }
    seekBossMusic(canonicalSongSec);
  }, [seekBossMusic]);

  // admin panel -- unlocks the FIRST time the player types "lehrer"
  // inside the arena. engine pushes an api handle through the callback;
  // we hold it in a ref + flip a state flag so the panel mounts. once
  // unlocked it stays unlocked for the rest of the session
  const adminApiRef = useRef<Hole2EngineHandle | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const handleAdminUnlock = useCallback((api: Hole2EngineHandle) => {
    adminApiRef.current = api;
    setAdminUnlocked(true);
  }, []);

  // arena-ready timer -- mirrors the box spin-grow finish at ~5000ms
  // after entering arena phase. resets if we ever leave (shouldn't
  // happen mid-fight, but safe)
  useEffect(() => {
    if (phase !== 'arena') {
      setArenaReady(false);
      return;
    }
    const t = window.setTimeout(() => setArenaReady(true), ARENA_READY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  // when the input form is submitted, kick off the transition cascade.
  // each timer schedules the next phase change; cleanup cancels any
  // pending ones if the component unmounts mid-transition. also cuts
  // the dialogue bg music -- the rising/eclipse/arena beats want silence
  // until BEGIN kicks in the boss-track
  const startTransition = useCallback(() => {
    stopDialogueMusic();
    setPhase('rising');
    const t1 = window.setTimeout(() => setPhase('eclipsing'), RISE_MS - ECLIPSE_OVERLAP_MS);
    const t2 = window.setTimeout(() => setPhase('arena'),
      RISE_MS - ECLIPSE_OVERLAP_MS + ECLIPSE_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [stopDialogueMusic]);

  // begin handler -- click on the BEGIN box. flips begun (drives CSS
  // for player-enter + begin-box fade, mounts the engine + boss music).
  // playBossMusic() fires inside the click handler so yt autoplay policy
  // accepts the user gesture
  const handleBegin = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (begun) return;
    playBossMusic();
    setBegun(true);
  }, [begun, playBossMusic]);

  // reset typewriter state when activeIdx flips
  useEffect(() => {
    setLineIdx(0);
    setChunkIdx(0);
    setTyped(0);
  }, [activeIdx]);

  // compile the CURRENT chunk's schedule. when a line has click-pauses
  // we treat each click-paused run as its own typewriter pass, prior
  // chunks stay rendered fully revealed
  const schedule = useMemo<Reveal[] | null>(() => {
    if (activeIdx < 0) return null;
    const c = BOXES[activeIdx].content;
    if (c.kind !== 'dialogue') return null;
    const line = c.lines[lineIdx];
    if (!line) return null;
    const chunks = splitClickPauses(line);
    const chunk = chunks[chunkIdx];
    return chunk ? compileLine(chunk) : null;
  }, [activeIdx, lineIdx, chunkIdx]);

  // drive typewriter one character at a time. each tick waits the delta
  // between consecutive schedule entries -- pauses become long gaps.
  // huge boxes (the "WHAT HAS YOU?" strike treatment) bypass the
  // typewriter and reveal the whole line at once -- the visual entry
  // is the crack-strike animation in CSS, not a character build-up
  useEffect(() => {
    if (!schedule) return;
    const content = activeIdx >= 0 ? BOXES[activeIdx].content : null;
    if (content?.kind === 'dialogue' && content.huge) {
      if (typed < schedule.length) setTyped(schedule.length);
      return;
    }
    if (typed >= schedule.length) return;
    const prevAt = typed === 0 ? 0 : schedule[typed - 1].atMs;
    const nextAt = schedule[typed].atMs;
    const t = window.setTimeout(() => setTyped((n) => n + 1), Math.max(0, nextAt - prevAt));
    return () => window.clearTimeout(t);
  }, [schedule, typed, activeIdx]);

  const handleStageClick = useCallback(() => {
    // any click after submit is a no-op until the arena settles. once
    // in arena phase, future bullet-hell controls take over (later beat)
    if (phase !== 'dialogue') return;
    if (activeIdx < 0) {
      // first click on the white field -- kick the bg music. yt
      // autoplay policy requires this be inside a user gesture, which
      // a click handler satisfies
      playDialogueMusic();
      setActiveIdx(0);
      return;
    }
    const content = BOXES[activeIdx].content;
    if (content.kind === 'input') return;

    const line = content.lines[lineIdx];
    if (!line) return;
    const chunks = splitClickPauses(line);
    const chunk = chunks[chunkIdx];
    if (!chunk) return;
    const sched = compileLine(chunk);

    if (typed < sched.length) {
      // currently sitting in a timed pause -- unskippable
      if (isInPause(sched, typed)) return;
      // typing through a block. skip to the next pause boundary
      setTyped(nextPauseBoundary(sched, typed));
      return;
    }

    // current chunk done -- advance to next chunk in same line first.
    // chunks accumulate (prior text stays on screen via DialogueBody)
    if (chunkIdx < chunks.length - 1) {
      setChunkIdx((n) => n + 1);
      setTyped(0);
      return;
    }

    // line done -- advance to next line, reset chunk + typed
    if (lineIdx < content.lines.length - 1) {
      setLineIdx((n) => n + 1);
      setChunkIdx(0);
      setTyped(0);
      return;
    }

    // last line done -- advance to next box. shatter cascade fires
    // via the data-status flip
    setActiveIdx((idx) => Math.min(idx + 1, BOXES.length - 1));
  }, [activeIdx, lineIdx, chunkIdx, typed, playDialogueMusic]);

  // handler for the REND YOURSELF bail option. plain hash flip -- no
  // NavTransition curtain. hole2 -> main is a hard cut, the white void
  // just snaps back to the home page. both music tracks get stopped
  // explicitly so the audio doesn't bleed past the unmount; the engine
  // (if running) dies with the Hole2Game unmount that follows
  const handleEndYourself = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stopDialogueMusic();
    stopBossMusic();
    window.location.hash = '';
  }, [stopDialogueMusic, stopBossMusic]);

  return (
    <section
      className="hole2-stage"
      aria-label="hole2"
      onClick={handleStageClick}
      data-phase={phase}
      data-arena-ready={arenaReady ? 'true' : 'false'}
      data-begun={begun ? 'true' : 'false'}
      data-perf={perfTier}
    >
      {/* hidden yt iframe host for the dialogue track -- positioned
          off-screen via css. the iframe itself can't be zero-sized or
          display:none or browsers refuse audio playback, so we keep
          it laid out + transparent */}
      <div
        id={dialogueMusicHostId}
        className="hole2-music-host"
        aria-hidden="true"
      />
      {/* boss-track iframe host -- always mounted so the yt iframe api
          can attach. playBossMusic() inside handleBegin counts as the
          user gesture for autoplay. pause/resume on engine pause keeps
          the phase-synced track aligned with the fight */}
      <div
        id={bossMusicHostId}
        className="hole2-music-host"
        aria-hidden="true"
      />
      {/* (the post-victory yt players are mounted inside WinScreen --
          a hidden host for the finis-hit sting + a visible iframe for
          the popup video. nothing to host at the page level) */}

      <div className="hole2-pile">
        {BOXES.map((b, i) => {
          const status: Status =
            i < activeIdx ? 'shattered' :
            i === activeIdx ? 'active' :
            'pending';
          return (
            <DialogueInstance
              key={b.id}
              box={b}
              status={status}
              lineIdx={i === activeIdx ? lineIdx : 0}
              chunkIdx={i === activeIdx ? chunkIdx : 0}
              typed={i === activeIdx ? typed : 0}
              lineDone={i === activeIdx && schedule !== null && typed >= schedule.length}
              onSubmit={startTransition}
            />
          );
        })}
      </div>

      {/* REND YOURSELF only while still in dialogue phase. once the
          transition kicks in, the bail goes away with the rest */}
      {activeIdx >= 5 && phase === 'dialogue' && (
        <button
          type="button"
          className="hole2-end"
          onClick={handleEndYourself}
        >
          REND YOURSELF
        </button>
      )}

      {/* transition + arena overlay -- mounted once the submit fires.
          phase data-attr drives all the CSS state transitions. arenaReady
          is read from the page-level state so the begin box + player
          placeholder can coordinate with the HUD fade-in. begun lifts
          in so the pre-BEGIN HUD preview unmounts the moment the
          engine takes over with the real one */}
      {phase !== 'dialogue' && (
        <TransitionAndArena phase={phase} arenaReady={arenaReady} begun={begun} />
      )}

      {/* begin box + player placeholder -- both mount during arena
          phase. begin uses the same evildialoge.png border as the
          dialogue boxes so it visually belongs to the page. once the
          user clicks BEGIN, data-begun on the stage triggers the
          begin-box fade-out animation in CSS -- so we keep the element
          mounted (a click guard on the handler covers the double-click
          case) rather than unmounting and killing the animation
          mid-flight. player is a placeholder using sprite.png (swap for
          a dedicated asset later) */}
      {phase === 'arena' && !begun && (
        <>
          <HolePlayer />
          <BeginBox onBegin={handleBegin} />
        </>
      )}

      {/* live boss-fight engine. mounts only after BEGIN -- the prior
          arena setup (ground, box spin, boss-sprite rise) has settled
          by then. unmounts cleanly on hash navigation away from hole2 */}
      {phase === 'arena' && begun && (
        <Hole2Game
          onVictory={handleVictory}
          onPauseChange={handlePauseChange}
          onAdminUnlock={handleAdminUnlock}
          onFightReset={handleFightReset}
          onDefeat={handleDefeat}
          onPhaseChange={handlePhaseChange}
          onPerfChange={handlePerfChange}
        />
      )}

      {/* admin panel -- floats over the arena. only mounts after the
          player types "lehrer". gives them visual access to phase /
          output / damage toggles without needing the hb1968 keyboard
          shortcut path */}
      {adminUnlocked && adminApiRef.current && (
        <AdminPanel api={adminApiRef.current} />
      )}

      {/* pause overlay -- mounts when engine pauses (Escape or
          document.visibilitychange -> hidden). engine handles the
          actual freeze; this layer just tells the player what
          happened + what key resumes it */}
      {paused && <PauseOverlay />}

      {/* pixel-art fireworks + gothic caption. mounts once and stays
          up; the user navigates away via REND or the hash menu */}
      {victory && <WinScreen />}
      {/* DARKNESS RISES -- pixel-column shadow rise + gothic caption.
          mounts once when the final-phase timer expires without
          victory. cleared on fight reset (dev `r`) so the player can
          try again */}
      {defeated && !victory && <LoseScreen />}
    </section>
  );
}

// ---- begin box ------------------------------------------------------
// gothic dialogue-style call-to-action at the bottom of the arena.
// reuses DialogueBox for the evildialoge.png border so it sits in the
// same visual family as the monologue boxes. click fires onBegin (boss
// track + player-enter cascade); the box itself fades out via the
// stage's data-begun attribute
function BeginBox({ onBegin }: { onBegin: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="hole2-begin"
      onClick={onBegin}
      role="button"
      tabIndex={0}
      aria-label="begin"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBegin(e as unknown as React.MouseEvent);
        }
      }}
    >
      <div className="hole2-begin__float">
        <DialogueBox />
        <div className="hole2-begin__body">
          <span className="hole2-begin__label">begin</span>
        </div>
      </div>
    </div>
  );
}

// ---- player placeholder ---------------------------------------------
// pre-BEGIN preview of where the player will stand inside the arena.
// uses the SAME PNG sprite the engine renders (player-idle.png) so
// the visual snap on BEGIN is invisible -- placeholder and engine
// player are pixel-identical
const HOLE2_PLAYER_IDLE_URL = `${import.meta.env.BASE_URL}player-idle.png`;
function HolePlayer() {
  return (
    <div className="hole2-player" aria-hidden="true">
      <img
        className="hole2-player__body"
        src={HOLE2_PLAYER_IDLE_URL}
        alt=""
        draggable={false}
        aria-hidden="true"
        style={{ imageRendering: 'pixelated' as any }}
      />
    </div>
  );
}

// the rising sprite + eclipse + arena reveal sequence. one big overlay
// element; CSS phases drive each layer's appearance via data-phase on
// the parent stage. once the arena box has finished spinning in
// (~ARENA_READY_MS after entering arena phase) the hud fades in. the
// figure inside is the BOSS -- the player placeholder + begin box live
// at the page level alongside this overlay
function TransitionAndArena({
  phase,
  arenaReady,
  begun
}: {
  phase: Phase;
  arenaReady: boolean;
  begun: boolean;
}) {
  return (
    <div className="hole2-transition" data-phase={phase} aria-hidden="true">
      {/* square shadow -- sits at bottom-center where the input box was.
          this is the vanishing point. on eclipse it grows into the full
          black field */}
      <div className="hole2-shadow" />
      {/* eclipse -- expanding black circle anchored at the shadow. CSS
          scales it from radius 0 to viewport-cover */}
      <div className="hole2-eclipse" />
      {/* sprite -- the cleaned thebrothersforsplyce sprite. rises from
          the shadow on phase rising, settles at the top of the rise,
          then drops into the arena box's lower third. trail is a
          vertical blur after-image during the climb. this is the BOSS,
          not the player */}
      <div className="hole2-sprite">
        <div className="hole2-sprite__trail" />
        <img
          className="hole2-sprite__body"
          src={SPRITE_URL}
          alt=""
          aria-hidden="true"
        />
      </div>
      {/* arena layer -- materializes after the eclipse covers the
          viewport. distorted ground + box + sprite-in-arena */}
      <div className="hole2-arena">
        <svg
          className="hole2-arena__filter-defs"
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute' }}
        >
          <defs>
            {/* same posterize-warm chain as hole-bg, retuned slightly
                cooler for the arena's darker register */}
            <filter id="hole2-ground-filter" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.018 0.022" numOctaves="2" seed="11" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" result="warped" />
              <feGaussianBlur in="warped" stdDeviation="1.6" result="blurred" />
              <feComponentTransfer in="blurred" result="post">
                <feFuncR type="discrete" tableValues="0.04 0.12 0.24 0.42 0.62 0.85" />
                <feFuncG type="discrete" tableValues="0.04 0.10 0.20 0.36 0.56 0.78" />
                <feFuncB type="discrete" tableValues="0.04 0.08 0.16 0.28 0.42 0.62" />
              </feComponentTransfer>
              <feColorMatrix
                in="post"
                type="matrix"
                values="
                  1.06 0.04 0    0 -0.04
                  0    0.92 0    0 -0.04
                  0    0    0.78 0 -0.04
                  0    0    0    1  0"
              />
            </filter>
          </defs>
        </svg>
        {/* inner ground stack -- below the projectile slot. the
            background image is decomposed into two mask layers; this
            inner half holds the focal core (the eye + immediate halo)
            with a short outward fade. projectiles render above this,
            so anything in the central play area shows against the
            ground as backdrop. blurred underlay sits below the sharp
            layer to halo the edges without softening the center */}
        <img
          className="hole2-arena__ground-blur"
          src={ARENA_GROUND_URL}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <img
          className="hole2-arena__ground"
          src={ARENA_GROUND_URL}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* projectile slot -- bullet-hell entities mount here. empty
            until the gameplay layer ports back from /testbed. by DOM
            order it sits above the inner ground + below the outer
            ground + box, so the upper-mask layers clip any projectile
            that drifts outside the focal core */}
        <div className="hole2-arena__projectiles" aria-hidden="true" />
        {/* outer ground stack -- above the projectile slot. same source
            image, masked to be transparent across the focal core (so
            projectiles in the play area aren't double-covered) and
            opaque across the halo band. projectiles that fly past the
            box edge get hidden behind this layer rather than escaping
            visibly into the black void */}
        <img
          className="hole2-arena__ground-blur hole2-arena__ground-blur--outer"
          src={ARENA_GROUND_URL}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <img
          className="hole2-arena__ground hole2-arena__ground--outer"
          src={ARENA_GROUND_URL}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* darken vignette -- transparent in the upper-mid focus area,
            ramps to black at the edges, multiply-blended into everything
            beneath. sits above BOTH the inner and outer ground stacks
            (and projectiles) so the gaussian rim reads as a single
            darkening pass over the full image -- otherwise the outer
            ground's rim band would overlay the vignette and flip the
            apparent direction (rim brighter than center). projectiles
            inherit the vignette too, which dims them subtly at the
            edges of the play area */}
        <div className="hole2-arena__ground-darken" aria-hidden="true" />
        {/* arena box -- evilbox.png if hunter has dropped it, fallback
            border rect otherwise. sized to 70% of viewport height.
            sits above the outer mask + darken, so its border is the
            topmost frame for the arena */}
        <img
          className="hole2-arena__box"
          src={ARENA_BOX_URL}
          alt=""
          aria-hidden="true"
          onError={(e) => {
            // placeholder fallback: hide the broken img, css shows a
            // bordered rect in its place via the parent's :has rule
            const el = e.currentTarget as HTMLImageElement;
            el.style.display = 'none';
            el.parentElement?.setAttribute('data-box-missing', 'true');
          }}
        />
        <div className="hole2-arena__box-fallback" />
        {/* pre-BEGIN HUD preview -- engine HUD shape (top lane health
            bar + timer, right column with GLOBE LVL / LIGHT ELEMENTAL /
            LIFE / CONTROLS) at default values. unmounts on BEGIN so the
            engine's identically-shaped + identically-classed HUD takes
            over without a visible style change */}
        {!begun && <ArenaHud ready={arenaReady} />}
      </div>
    </div>
  );
}

// arena hud -- pre-BEGIN preview. uses the engine's .hud class shape
// (top lane: thin health bar + timer right; right column: GLOBE LVL +
// LIGHT ELEMENTAL + LIFE + CONTROLS) so the moment BEGIN flips and
// Hole2Game mounts with the engine HUD, the visual is identical and
// the transition is seamless. wrapped in .hole2-game so the css
// variables (--hud-fg, fonts, etc.) scoped to that wrapper resolve.
// no ids -- the engine queries by id and we don't want a conflict
// before unmount completes
function ArenaHud({ ready }: { ready: boolean }) {
  return (
    <div
      className="hole2-game"
      data-ready={ready ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="hud">
        {/* now-playing strip preview -- same static ost title as the
            live hud so BEGIN doesn't visibly snap the label */}
        <div className="hud__track">
          <div className="hud__track-cd" aria-hidden="true">
            <div className="hud__track-cd-face" />
            <div className="hud__track-cd-hole" />
          </div>
          <div className="hud__track-name">
            Phantom Dance -ouster - Oblivion (CODE ZTS LABEL)
          </div>
        </div>
        {/* top lane -- thin health bar + timer right. health at 100%,
            timer shows the phase-1 cap (52s = 00:52) the engine will
            count down from, so BEGIN doesn't visibly snap the timer */}
        <div className="hud__top">
          <div className="hud__health">
            <div className="hud__health-fill" style={{ width: '100%' }} />
          </div>
          <div className="hud__timer">00:52</div>
        </div>

        {/* right-edge column. matches the engine layout 1:1: GLOBE LVL
            (pip 1 active), LIGHT ELEMENTAL (all 3), LIFE (all 5),
            CONTROLS legend */}
        <div className="hud__column">
          <div className="hud__label">GLOBE<br />LVL</div>
          <div className="hud__outputs">
            <span className="hud__pip" data-active="true" />
            <span className="hud__pip" />
            <span className="hud__pip" />
            <span className="hud__pip" />
            <span className="hud__pip" />
          </div>
          <div className="hud__label">LIGHT<br />ELEMENTAL</div>
          <div className="hud__bombs">
            <span className="hud__pip hud__pip--bomb" data-active="true" />
            <span className="hud__pip hud__pip--bomb" data-active="true" />
            <span className="hud__pip hud__pip--bomb" data-active="true" />
          </div>
          <div className="hud__label">LIFE</div>
          <div className="hud__hits">
            <span className="hud__pip hud__pip--hit" data-active="true" />
            <span className="hud__pip hud__pip--hit" data-active="true" />
            <span className="hud__pip hud__pip--hit" data-active="true" />
            <span className="hud__pip hud__pip--hit" data-active="true" />
            <span className="hud__pip hud__pip--hit" data-active="true" />
          </div>
          <div className="hud__label">CONTROLS</div>
          <div className="hud__controls">
            <div className="hud__ctrl">
              <kbd>WASD</kbd> / <kbd>&larr;&uarr;&darr;&rarr;</kbd> move
            </div>
            <div className="hud__ctrl"><kbd>Shift</kbd> clutch</div>
            <div className="hud__ctrl"><kbd>Z</kbd> fire</div>
            <div className="hud__ctrl"><kbd>X</kbd> bomb</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DialogueInstance({
  box,
  status,
  lineIdx,
  chunkIdx,
  typed,
  lineDone,
  onSubmit
}: {
  box: BoxData;
  status: Status;
  lineIdx: number;
  chunkIdx: number;
  typed: number;
  lineDone: boolean;
  onSubmit: () => void;
}) {
  const debris = useMemo(() => generateDebris(box.id), [box.id]);

  const style = {
    '--final-x': `${box.ox}px`,
    '--final-y': `${box.oy}px`,
    '--final-rot': `${box.rot}deg`,
    '--float-phase': `${box.floatPhase}ms`,
    zIndex: box.id + 1
  } as CSSProperties;

  return (
    <div
      className="hole2-dialogue"
      data-dir={box.dir}
      data-status={status}
      style={style}
    >
      <div className="hole2-dialogue__float">
        <DialogueBox />
        {box.content.kind === 'dialogue' && box.content.huge ? (
          // huge boxes own the SVG rendering -- letters + cracks live
          // in one coordinate system so the cracks visibly emerge from
          // each letter. the html body div is suppressed entirely
          <HugeStrike />
        ) : (
          <div
            className="hole2-dialogue__body"
            data-align={box.content.kind === 'dialogue' ? (box.content.align ?? 'left') : 'left'}
          >
            {box.content.kind === 'dialogue' ? (
              <DialogueBody
                content={box.content}
                lineIdx={lineIdx}
                chunkIdx={chunkIdx}
                typed={typed}
                lineDone={lineDone}
                visible={status === 'active'}
              />
            ) : (
              <InputBody
                prompt={box.content.prompt}
                visible={status === 'active'}
                onSubmit={onSubmit}
              />
            )}
          </div>
        )}
      </div>
      <div className="hole2-shatter" aria-hidden="true">
        {debris.map((d, i) => (
          <span
            key={i}
            className="hole2-debris"
            style={{
              left: `${d.px}%`,
              top: `${d.py}%`,
              width: d.size,
              height: d.size,
              '--debris-dx': `${d.dx}px`,
              '--debris-dy': `${d.dy}px`,
              '--debris-rot': `${d.rot}deg`,
              '--debris-delay': `${d.delay}ms`
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function DialogueBody({
  content,
  lineIdx,
  chunkIdx,
  typed,
  lineDone,
  visible
}: {
  content: DialogueContent;
  lineIdx: number;
  chunkIdx: number;
  typed: number;
  lineDone: boolean;
  visible: boolean;
}) {
  // tick increments every SCRAMBLE_TICK_MS to re-roll the cycling chars
  // sitting in the buffer past the typed cursor. only ticks while we're
  // mid-line; stops once lineDone fires (no more chars to cycle)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!visible || lineDone) return;
    const id = window.setInterval(() => setTick((t) => t + 1), SCRAMBLE_TICK_MS);
    return () => window.clearInterval(id);
  }, [visible, lineDone, lineIdx, chunkIdx]);

  const line = content.lines[lineIdx];
  if (!visible || !line) return null;
  const chunks = splitClickPauses(line);

  // walk chunks 0..chunkIdx. prior chunks render fully locked (the
  // user already clicked past them); the current chunk has the cycling
  // buffer behavior:
  //   charPos < typed              -> locked (final char)
  //   typed <= charPos < typed+BUF -> cycling (random, re-rolled each tick)
  //   charPos >= typed + BUF       -> hidden (not rendered)
  const elems: React.ReactNode[] = [];
  let key = 0;
  for (let ci = 0; ci <= chunkIdx && ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const isCurrent = ci === chunkIdx;
    let charPos = 0;
    for (const seg of chunk) {
      if (seg.type === 'pause' || seg.type === 'click-pause') continue;
      const text = seg.text;
      let output = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (!isCurrent || charPos < typed) {
          output += ch;                                 // locked
        } else if (charPos < typed + CYCLE_BUFFER) {
          output += isStructural(ch) ? ch : randChar(); // cycling
        }
        // else: hidden -- don't append, but advance charPos so the
        // next segment's chars still index correctly
        charPos++;
      }
      if (output) {
        const cls =
          seg.style === 'gothic-red' ? 'hole2-text hole2-text--gothic-red' :
          seg.style === 'red'         ? 'hole2-text hole2-text--red' :
          'hole2-text';
        elems.push(<span key={key++} className={cls}>{output}</span>);
      }
    }
  }

  return (
    <>
      {content.speaker && (
        <div className="hole2-dialogue__speaker">{content.speaker}:</div>
      )}
      <div className="hole2-dialogue__text">
        {elems}
        {lineDone && <span className="hole2-dialogue__caret" aria-hidden="true">▼</span>}
      </div>
    </>
  );
}

function InputBody({
  prompt,
  visible,
  onSubmit: onSubmitTransition
}: {
  prompt: string;
  visible: boolean;
  onSubmit: () => void;
}) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // focus the textarea once the box lands
  useEffect(() => {
    if (visible && !submitted) {
      const t = window.setTimeout(() => taRef.current?.focus(), 600);
      return () => window.clearTimeout(t);
    }
  }, [visible, submitted]);

  if (!visible) return null;

  const onSubmit = (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (submitted) return;
    const text = value.trim();
    if (!text) return;
    saveResponse(text);
    setSubmitted(true);
    // notify the parent to start the rising-sprite -> eclipse -> arena
    // transition. small delay so the user briefly sees the saved
    // confirmation before the box starts shrinking
    window.setTimeout(() => onSubmitTransition(), 350);
  };

  return (
    <form
      className="hole2-input"
      onClick={(e) => e.stopPropagation()}
      onSubmit={onSubmit}
    >
      <div className="hole2-dialogue__speaker">{prompt}</div>
      {submitted ? (
        <div className="hole2-input__done">saved. ({value.length} chars)</div>
      ) : (
        <>
          <textarea
            ref={taRef}
            className="hole2-input__field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="..."
            rows={3}
            spellCheck={false}
          />
          <button
            type="submit"
            className="hole2-input__submit"
            onClick={onSubmit}
            disabled={!value.trim()}
          >
            submit
          </button>
        </>
      )}
    </form>
  );
}

// ---- huge strike: pixel-art letters + per-letter crack origins ------
// "WHAT HAS YOU?" rendered as pixel-art glyphs (each letter is its own
// 5x7 grid scaled up 4x). cracks emanate outward from each individual
// letter rather than from a single central point -- the strike pattern
// is chaotic, with directions varied per letter

const GLYPHS: Record<string, ReadonlyArray<string>> = {
  W: [
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#.#.#',
    '##.##',
    '.#.#.'
  ],
  H: [
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#'
  ],
  A: [
    '..#..',
    '.#.#.',
    '#...#',
    '#####',
    '#...#',
    '#...#',
    '#...#'
  ],
  T: [
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..'
  ],
  S: [
    '.####',
    '#....',
    '#....',
    '.###.',
    '....#',
    '....#',
    '####.'
  ],
  Y: [
    '#...#',
    '#...#',
    '.#.#.',
    '..#..',
    '..#..',
    '..#..',
    '..#..'
  ],
  O: [
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.###.'
  ],
  U: [
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.###.'
  ],
  '?': [
    '.###.',
    '#...#',
    '....#',
    '...#.',
    '..#..',
    '.....',
    '..#..'
  ]
};

const GLYPH_PX_W = 5;          // glyph native pixel width
const GLYPH_PX_H = 7;          // glyph native pixel height
const PIXEL_SCALE = 4;         // each grid cell = 4x4 svg units
const GLYPH_W = GLYPH_PX_W * PIXEL_SCALE;   // 20
const GLYPH_H = GLYPH_PX_H * PIXEL_SCALE;   // 28
const LETTER_GAP = 4;          // svg units between letters within a word
const WORD_GAP   = 16;         // svg units between words

const TEXT = 'WHAT HAS YOU?';

// pre-compute the x position of each glyph + its crack cells. each
// non-space glyph gets a sequence of 4x4 cells (matching the letter
// pixel resolution) that walks outward from a letter pixel
type GlyphLayout = {
  ch: string;
  x: number;
  crackCells: ReadonlyArray<[number, number]>;
};

const TEXT_Y = Math.floor((BOX_H - GLYPH_H) / 2);

// crack cell paths -- each entry is the list of 4x4 cell positions
// (absolute svg coords) for one glyph's crack. cell 0 is adjacent to
// (touching) a filled letter pixel so the crack visibly originates from
// the text. branches near the origin add depth; the path then walks
// outward in stairstep to the box edge. all cells render at the same
// 4x4 resolution as the letter pixels
const CRACK_CELLS_BY_GLYPH: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  // 0: W -> up-left from top-left pixel (18, 41)
  [[18,37],[14,37],[22,37],[14,33],[10,33],[10,29],[6,29],[6,25],[2,21],[-2,17],[-2,13],[-2,9]],
  // 1: H1 -> straight up from top-left pixel (42, 41)
  [[42,37],[46,37],[38,37],[42,33],[46,29],[42,25],[46,21],[42,17],[46,13],[42,9],[42,5],[42,1]],
  // 2: A1 -> down-left from bottom-left pixel (66, 65)
  [[66,69],[62,69],[70,69],[62,73],[58,73],[58,77],[54,81],[50,85],[46,89],[42,93],[38,97],[34,101]],
  // 3: T -> straight down from bottom-middle pixel (98, 65)
  [[98,69],[94,69],[102,69],[98,73],[94,77],[98,81],[94,85],[98,89],[94,93],[98,97],[98,101],[98,105]],
  // 4: H2 -> up-right from top-right pixel (142, 41)
  [[142,37],[146,37],[138,37],[146,33],[150,33],[150,29],[154,29],[158,25],[162,21],[166,17],[170,13],[174,9]],
  // 5: A2 -> straight down from bottom-left pixel (150, 65)
  [[150,69],[146,69],[154,69],[150,73],[154,73],[150,77],[154,81],[150,85],[154,89],[150,93],[154,97],[150,101]],
  // 6: S -> down-right from bottom-near-right pixel (186, 65)
  [[186,69],[182,69],[190,69],[190,73],[194,77],[198,81],[202,85],[206,89],[210,93],[214,97],[218,101],[222,105]],
  // 7: Y -> straight up from top-left pixel (210, 41)
  [[210,37],[214,37],[206,37],[210,33],[214,29],[210,25],[214,21],[210,17],[214,13],[210,9],[210,5],[210,1]],
  // 8: O -> straight down from bottom-left-of-bowl pixel (238, 65)
  [[238,69],[242,69],[234,69],[238,73],[242,73],[238,77],[242,81],[238,85],[242,89],[238,93],[242,97],[238,101]],
  // 9: U -> up-right from top-right pixel (274, 41)
  [[274,37],[270,37],[278,37],[278,33],[282,29],[286,29],[290,25],[294,21],[298,17],[302,13],[306,9],[310,5]],
  // 10: ? -> right from right-edge pixel (298, 49)
  [[302,49],[302,45],[302,53],[306,49],[310,53],[314,49],[314,45],[318,49],[322,53]]
];

function layoutText(): GlyphLayout[] {
  const out: GlyphLayout[] = [];
  let cursor = 0;
  const positions: Array<{ ch: string; x: number } | null> = [];
  let firstGlyph = true;
  for (const ch of TEXT) {
    if (ch === ' ') {
      cursor += WORD_GAP;
      positions.push(null);
      firstGlyph = true;
      continue;
    }
    if (!firstGlyph) cursor += LETTER_GAP;
    positions.push({ ch, x: cursor });
    cursor += GLYPH_W;
    firstGlyph = false;
  }
  // centering offset
  const totalW = cursor;
  const offset = Math.floor((BOX_W - totalW) / 2);

  // walk positions, attach the matching crack cell path. positions
  // here are pre-baked to the offset above so any drift in the layout
  // math would require updating CRACK_CELLS_BY_GLYPH (the absolute
  // coords assume offset = 18)
  let crackIdx = 0;
  for (const p of positions) {
    if (!p) continue;
    const absX = p.x + offset;
    const cells = CRACK_CELLS_BY_GLYPH[crackIdx++] ?? [];
    out.push({ ch: p.ch, x: absX, crackCells: cells });
  }
  return out;
}

const LAYOUT = layoutText();

// flatten each glyph's pixel grid into absolute-coord rect cells, so
// the renderer can map straight to <rect> nodes
function glyphCells(ch: string, originX: number, originY: number): Array<[number, number]> {
  const grid = GLYPHS[ch];
  if (!grid) return [];
  const out: Array<[number, number]> = [];
  grid.forEach((row, ry) => {
    [...row].forEach((cell, rx) => {
      if (cell === '#') {
        out.push([originX + rx * PIXEL_SCALE, originY + ry * PIXEL_SCALE]);
      }
    });
  });
  return out;
}

// per-pair stagger (letter + its crack appear together). cell stagger
// is finer -- each successive crack cell ticks in after the previous
const PAIR_STAGGER_MS = 70;
const CELL_STAGGER_MS = 24;
const STRIKE_BASE_DELAY_MS = 720;

function HugeStrike() {
  return (
    <svg
      className="hole2-strike"
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* crack cells -- 4x4 rects matching the letter pixel resolution,
          walking outward from each letter. per-cell delay = pair delay
          for that letter + cell index * cell stagger. the first cell of
          each crack is adjacent to a filled letter pixel, so the chain
          visibly emerges from the text rather than from a generic
          radial origin */}
      {LAYOUT.flatMap((g, glyphIdx) => {
        const base = STRIKE_BASE_DELAY_MS + glyphIdx * PAIR_STAGGER_MS;
        return g.crackCells.map((cell, cellIdx) => (
          <rect
            key={`c-${glyphIdx}-${cellIdx}`}
            className="hole2-strike__crack-cell"
            x={cell[0]}
            y={cell[1]}
            width={PIXEL_SCALE}
            height={PIXEL_SCALE}
            fill="#fff"
            style={{ '--cell-delay': `${base + cellIdx * CELL_STAGGER_MS}ms` } as CSSProperties}
          />
        ));
      })}
      {/* letters -- each glyph wrapped in a group so per-letter strike
          animations apply independently. cells render as 4x4 white
          rects, same resolution as the cracks. fades in at the same
          delay as its crack's first cell so the letter and its crack
          appear together */}
      {LAYOUT.map((g, glyphIdx) => {
        const cells = glyphCells(g.ch, g.x, TEXT_Y);
        return (
          <g
            key={`g-${glyphIdx}`}
            className="hole2-strike__letter"
            style={{ '--letter-delay': `${STRIKE_BASE_DELAY_MS + glyphIdx * PAIR_STAGGER_MS}ms` } as CSSProperties}
          >
            {cells.map(([x, y], idx) => (
              <rect
                key={idx}
                x={x}
                y={y}
                width={PIXEL_SCALE}
                height={PIXEL_SCALE}
                fill="#fff"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function DialogueBox() {
  return (
    <svg
      className="hole2-dialogue__svg"
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* the entire box visual is hunter's evildialoge.png -- black body
          + white border pattern in one image. preserveAspectRatio=none
          stretches the image to fill the viewBox exactly (no centering
          margins). image-rendering: pixelated keeps the upscaled edges
          crisp at any css size */}
      <image
        href={BORDER_URL}
        x="0"
        y="0"
        width={BOX_W}
        height={BOX_H}
        preserveAspectRatio="none"
        style={{ imageRendering: 'pixelated' }}
      />
    </svg>
  );
}
