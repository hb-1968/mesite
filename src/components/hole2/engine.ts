// @ts-nocheck
// hole2 boss-fight engine. ported verbatim from /testbed/index.html with
// minimal adaptations: sfx paths use vite BASE_URL, audio + listeners +
// rAF get tracked for cleanup, and the boss-defeat-in-final-phase moment
// invokes opts.onVictory so the React layer can mount the win screen.
// the testbed remains the iteration surface; this file is the
// production mirror. types are loose on purpose -- the game is pure
// dom manipulation against unique ids and the strict TS step would just
// fight a 5500-line port

// imperative handle exposed to the admin panel. all methods write into
// the same setPhase / setOutput / state.orbDamage paths the dev keys
// use, so the panel + the keyboard shortcuts stay in sync
export type Hole2EngineHandle = {
  setPhase:        (n: number) => void;
  setOutput:       (n: number) => void;
  setOrbDamage:    (on: boolean) => void;
  getState:        () => { phase: number; output: number; orbDamage: boolean };
};

export type Hole2EngineOpts = {
  onVictory: () => void;
  // fired whenever the engine pauses or resumes. lifted by the React
  // layer to mount + unmount the pause overlay. paused = true on Escape
  // or document.visibilitychange -> hidden; paused = false on Escape
  // (manual resume). tab-out auto-pauses; tab-in does NOT auto-resume
  // (the player has to press Escape) so they don't get blindsided
  onPauseChange?: (paused: boolean) => void;
  // fired the first time the user types the admin password ("lehrer").
  // payload is the engine API handle the panel uses to drive phase /
  // output / damage from React. independent of the "hb1968" dev
  // keyboard unlock -- both can coexist, neither implies the other
  onAdminUnlock?: (api: Hole2EngineHandle) => void;
  // fired whenever the fight resets to phase 1 -- either the player
  // ran out of lives OR the dev pressed `r`. lifted by the React layer
  // to restart the boss music from the top, since the track is phase-
  // synced and would otherwise drift relative to the fresh fight
  onFightReset?: () => void;
  // fired once when the final-phase (PHASE_MAX) timer expires without
  // the player draining the boss bar. mirror of onVictory for the loss
  // condition -- the React layer mounts the DARKNESS RISES overlay
  onDefeat?: () => void;
};

export function startHole2Engine(opts: Hole2EngineOpts): () => void {
  // eslint-disable-next-line no-console
  console.log('[hole2] startHole2Engine -- new engine instance booting');
  // sfx live under /public/sfx/ in production (copied from /testbed/sfx/
  // and /testbed/ root). use BASE_URL so the same paths work for the
  // GH Pages build at /mesite/ and the dev server at /
  const SFX_BASE = (import.meta as any).env.BASE_URL + 'sfx/';

  // bookkeeping for cleanup -- removed in the returned destructor.
  // anything that outlives a single tick (listeners, audio elements,
  // rAFs, intervals) gets tracked
  const _listeners: any[] = [];
  const _audioPool: HTMLAudioElement[] = [];

  function _audio(url: string): HTMLAudioElement { const a = new Audio(url); _audioPool.push(a); return a; }

  // ---- pause / resume infra ----
  // every game-time reference (phase timers, fire intervals, immunity
  // windows, entity spawn ts) flows through _gameNow(). while paused we
  // accumulate real-time into _pauseAccum and subtract it from every
  // game-time read. result: game timestamps stay frozen across the
  // pause; on resume the world picks up exactly where it left off
  // without phases auto-advancing or fire cadence catching up
  let _paused = false;
  let _pauseStartRealT = 0;
  let _pauseAccum = 0;
  function _gameNow(): number { return performance.now() - _pauseAccum; }
  function _setPaused(p: boolean) {
    if (p === _paused) return;
    if (p) {
      _pauseStartRealT = performance.now();
      _paused = true;
      // pause all currently-playing audio; remember which ones were
      // alive so resume can restart them. .paused === false means
      // currently playing. attach a flag on the element itself
      for (const a of _audioPool) {
        try {
          if (!a.paused) {
            (a as any)._wasPlaying = true;
            a.pause();
          } else {
            (a as any)._wasPlaying = false;
          }
        } catch (_) {}
      }
    } else {
      _pauseAccum += performance.now() - _pauseStartRealT;
      _paused = false;
      for (const a of _audioPool) {
        if ((a as any)._wasPlaying) {
          try { a.play(); } catch (_) {}
          (a as any)._wasPlaying = false;
        }
      }
    }
    try { opts.onPauseChange?.(_paused); } catch (_) {}
  }


  // single source-of-truth state object. anything that drives a dom
  // update lives here; the game loop reads + writes through it. easy
  // to extend with bulletList, attackPhase, etc. when those land
  const state = {
    playerX: 0,           // px offset from arena center (horizontal)
    playerY: 0,           // px offset from default top (vertical)
    bombs:   3,
    hits:    5,
    boss:    1.0,         // 0..1 fraction
    output:  1,           // damage output level, capped at OUTPUT_MAX.
                          // 1 = center stream, 2 = V split (diagonals
                          // only), 3 = three-prong (center + V),
                          // 4 = +1 big bullet, 5 = +2 big bullets.
                          // shift tightens diagonal angle + centers
                          // big bullets ("clutch mode")
    bullets: [],          // active player bullets: { el, x, y, vx, vy, dmg } in px
    enemyBullets: [],     // shadow orbs: { el, x, y, vx, vy } in px
    globes:       [],     // collectible globes: { el, x, y, vyPx, level } in px.
                          //   spawned by setBoss when bossHealth crosses below
                          //   GLOBE_THRESHOLD; player collects to bump output level
    globeSpawnedThisPhase: false, // one-shot guard so re-crossing 15% (e.g. damage
                                  //   bouncing around the threshold) doesn't spam
                                  //   drops. reset on setPhase
    beams:        [],     // radial damage-zone beams: { el, basePolar, startT, lengthVh,
                          //   halfWidthVh, totalRotRad } -- see updateBeams
    lastFireRadialT: 0,   // ms timestamp of last phase-2 radial-beams salvo (separate
                          //   cadence from lastFireBossT which the base cross-beams uses)
    radialDir:    1,      // +1 / -1, flipped each radial cycle so successive +s rotate
                          //   opposite directions (clockwise / counter-clockwise)
    plusProjectiles: [],  // phase 3 spinning-+ projectiles: { el, spawnT, startX, startY,
                          //   targetX, targetY, lockedRotation, previewEl, beamEl } -- see
                          //   updatePlusProjectiles for the per-+ state machine
    nextPlusTossT:   0,   // ms timestamp; next + tosses when t >= this
    plusTossCount:   0,   // count of +s tossed in the current cycle (caps at PHASE_3_PLUS_COUNT).
                          //   resets at the start of each scatter section
    phase3Mode:      'scatter', // current section kind: 'scatter' | 'hop' | 'return-hop' |
                                //   'interlude' | 'climax' | 'idle'. derived from
                                //   PHASE_3_PROGRAM[sectionIdx].kind in enterSection
    sectionIdx:          0,    // cursor into PHASE_3_PROGRAM. advanced by pattern_phase3b
    sectionStartT:       0,    // ms timestamp the current section began (set in enterSection)
    programStartT:       0,    // ms timestamp the program is allowed to start. equals
                               //   phaseStartT + title-card-overlay-duration so the first
                               //   section's clock aligns with when dispatch actually begins
    currentSpot:         'TOP', // which scatter spot ('TOP'|'BL'|'BR'|'TL'|'TR') the boss is
                                //   anchored at. drives the orbit ellipse in updateBossMovement
    hopStartT:           0,    // ms timestamp the current portal hop began
    hopToSpot:           'TOP', // entry spot for the active hop
    hopApproachMs:       0,    // duration of the pre-portal approach glide (0 = instant hop)
    hopFromX:            0,    // boss position at hop entry. approach glide lerps from
    hopFromY:            0,    //   (hopFromX, hopFromY) toward (hopExitX, hopExitY)
    hopExitX:            0,    // exit portal anchor (where boss steps in). for return-hops
    hopExitY:            0,    //   this is TOP; for instant hops this is the hopFrom position
    activePortals:       [],   // active .shadow-portal els: { el, spawnT, closeT, ... }
    activeLances:        [],   // active .shadow-lance attacks: phase 5a's snarling
                               //   thorned trunks emerging from portals
    activeGates:         [],   // phase 5b gates: { spawnT, posX, posY, volleyCount,
                               //   nextVolleyT, removeAtT } -- orb turrets riding on
                               //   shadow portals around the player
    activeSwearBubbles:  [],   // phase 6 dialogue-transition projectiles -- comic
                               //   censored-curse text flying from the boss. harmless,
                               //   visual only
    lastSwearSpawnT:     0,    // ms timestamp of the last swear-bubble spawn (rate-limits)
    activeSplitCrosses:  [],   // phase 6's splitting-beam cross attacks. each entry
                               //   owns its + glyph + the recursive tree of beam segments
    nextSplitCrossT:     0,    // ms timestamp; volley scheduler fires the next cross at this
    splitCrossSpawned:   0,    // count of split crosses spawned in the current volley section
    nextCursorVolleyT:   0,    // ms timestamp; climax dispatches cursor volleys here
    climaxNextSplitT:    0,    // ms timestamp; climax dispatches split crosses here
    climaxFrontWave:     0,    // 0 / 1 / 2 -- which front-tower wave has spawned in climax
    climaxRearWave:      0,    // same for rear-tower pair
    pendingTitleCardT:   0,    // ms timestamp; updatePhase fires showTransition when t crosses
                               //   this (used for phase 6's deferred title-card overlay)
    activePuddles:       [],   // phase 7a puddle hotspots: { el, x, y, spawnT, activateT,
                               //   removeAtT, activated } -- each erupts into a lance tree
    nextPuddleT:         0,    // ms timestamp; next puddle in the spray scheduler
    nextRoamTowerT:      0,    // ms timestamp; next roaming tower spawn
    roamTowerSpawned:    0,    // count of roaming towers spawned in the current wave
    nextClimaxPuddleT:   0,    // climax sub-scheduler -- puddle cadence during the layered climax
    nextClimaxTowerT:    0,    // climax sub-scheduler -- roaming tower cadence
    maidenBoxes:         [],   // phase 7b iron-maiden -- CONCURRENT nested boxes. each
                               //   spawns at the arena boundary + telescopes inward while
                               //   rotating, so the arena reads as a series of closing
                               //   rings at consistent spacings. per box:
                               //   { el, spikeEls[], exitEl, spawnT, centerX, centerY,
                               //     startSize, endScale, shrinkDurMs, startRotRad,
                               //     rotRateRadPerSec, spikeLength, exitSide,
                               //     exitStartFrac, exitEndFrac, currentScale,
                               //     currentRotRad, collapsed, collapseT }
    nextMaidenBoxT:      0,    // ms timestamp; next nested box spawns at this
    maidenChainIdx:      0,    // running counter -- alternates rotation dir + varies
                               //   exit side across consecutive spawns
    activeSnakes:        [],   // phase 7b death-throes snakes (immortal, grid-aligned):
                               //   { headX, headY, dirRad, speed, alive, segments,
                               //     gx, gy, lastT } -- each segment is
                               //   { el, x1, y1, x2, y2, thickness, dirRad } in arena px
    snakeGrid:           null, // 12x12 Int16Array of trail-density per cell
    snakeGridCfg:        null, // { cols, rows, cellW, cellH, originX, originY, thickness } cached
    nextSnakeTrickleT:   0,    // ms timestamp; next continuous-spawn prong fires when t >= this
    activeProgram:       [],   // current section list driving pattern_phase3b. set
                               //   in setPhase per phase (PHASE_3_PROGRAM, PHASE_4_PROGRAM,
                               //   PHASE_5_PROGRAM, ...). empty list = no program-driven
                               //   sections this phase
    interludeSineStartT: 0,     // ms timestamp; sine drift during interlude clocks off this
                                //   so sine(0) = (0,0) and the position lands smoothly where
                                //   the entry-glide deposited the boss
    nextInterludePlusT: 0,      // ms timestamp; next + toss during the interlude. separate
                                //   from nextPlusTossT (scatter's) since the cadences are
                                //   different (scatter is rapid-fire, interlude is sparse)
    phase3FrontSpawned: false,  // one-shot flag so front-tower spawn fires once per phase entry
    phase3RearSpawned:  false,  // same for rear towers
    // hexagram beat (between return-glide + cursor-intro). each hex object holds
    // pre-baked lattice positions + the spawn time; updateHexagrams animates them
    // each frame from these (no per-orb velocity). hexCycleCount caps the loop
    hexagrams:        [],  // active hexagrams: { startT, centerX, centerY, orbs: [{el, latticeX, latticeY}] }
    hexCycleCount:    0,   // count of hexagrams already spawned this phase entry
    nextHexCycleT:    0,   // ms timestamp; next hex spawns when t >= this
    lastFireHexCrossT: 0,  // independent fire timestamp for the layered cross-beams during hex
    // cursor-intro beat (between hex + tower wind-up). 5 volleys of 3 stacked
    // teeth aimed at the player; reuses spawnTooth so the split mechanic still
    // applies -- player sees the lesson before the tower fans hit
    cursorIntroVolleyCount: 0,
    nextCursorIntroVolleyT: 0,
    towers:          [],  // active phase 3b towers
    teeth:           [],  // active phase 3b teeth -- includes all split generations
    lastFireT: 0,         // ms timestamp of last player spawn (rate-limits Z)
    bombFireLockUntilT: 0, // ms timestamp; while t < this, Z can't fire (spirit-bomb active window)
    lastFireBossT: 0,     // ms timestamp of last boss volley (per-pattern interval)
    lastFireSpiralT:    0,// independent fire timestamp for pattern_spiral. used when the
                          //   interlude climax needs spiral + crossBeams firing concurrently --
                          //   they can't share lastFireBossT or whichever fires first blocks
                          //   the other on its interval check
    lastFireCrossBeamT: 0,// same as above, for pattern_crossBeams during the climax
    immuneUntilT: 0,      // ms timestamp; while t < this, hits ignored
    bossX: 0,             // boss px offset from horizontal center
    bossY: 0,             // boss px offset from vertical default
    bossDir: 1,           // scaleX sign for .boss. written to --boss-dir
                          //   each frame; sprite flips via scaleX on .boss.
                          //   sign is the OPPOSITE of horizontal motion --
                          //   left-move shows the right-facing sprite + vice
                          //   versa (intentional swap, see updateBossDir)
                          //   with a small dead-zone so a stationary
                          //   boss doesn't strobe on float jitter
    lastBossX: 0,         // previous frame's bossX, for direction delta
    lastBossY: 0,         // previous frame's bossY, for trail dy
    bossTrail: [],        // ring of past {x,y,dir} poses. trail samples
                          //   from fixed lag indices each frame. capped
                          //   at TRAIL_HISTORY_MAX so memory stays flat
    bossSpeedSmooth: 0,   // ema of |dx|+|dy|. drives --trail-strength so
                          //   the ghosts wake/sleep on motion, not on a
                          //   raw per-frame delta (which would strobe)
    phase6Theta: 0,       // rolling angle for phase 6's top-of-arena
                          //   track motion (rad). reinitialized to
                          //   pi/2 (boss at home) on phase 6 entry
    phase6LastT: 0,       // last frame timestamp for phase 6 dt
                          //   integration. when < phaseStartT the
                          //   branch detects a fresh entry + reseeds
    phase: 1,             // current phase (1..6)
    phaseStartT: _gameNow(), // ms timestamp the current phase began
    patternName: 'idle',  // active sub-pattern name (debug + cycler)
    spiralAngle: 0,       // accumulating rad for the spiraling pattern
    diagDir: -1,          // diagonal direction (-1 / +1, flipped each volley)
    crossRotation: 0,     // deg offset for phase-2 cross beams; ticks per salvo
    transitionUntilT: 0,  // ms timestamp; while t < this, phase-transition overlay is up
    bossGlide: null,      // { fromX, fromY, toX, toY, startT, durMs } or null. ease boss
                          // from prev position to new phase home during transition
    orbDamage: true,      // production -- orbs/beams damage the player on
                          // contact. dev I key still flips this off for
                          // pattern-watching (gated behind the password
                          // unlock); testbed used to default this to off
                          // for tuning, but the boss fight only works as
                          // a fight if orbs actually land
    startedAt: _gameNow(),
    victoryFired: false,
    defeatFired: false,   // mirror of victoryFired for the timer-expired
                          //   path on PHASE_MAX. once set, the loss
                          //   overlay is up + onDefeat won't refire
    devUnlocked: false,
    pressed: {
      left: false, right: false, up: false, down: false,
      z: false, shift: false
    }
  };

  const SPEED_VH_PER_SEC = 32;   // tune feel here
  const SHIFT_SPEED_MULT = 0.45; // held-shift "clutch" -- slower + precise

  // immunity window after taking a hit, in ms
  const IMMUNE_MS = 3000;
  // spirit-bomb fire-lockout. while a bomb is "active" (visual burst
  // still resolving), Z can't fire. matches the css burst duration
  // (900ms) so the lockout ends exactly when the sun fades out
  const SPIRIT_BOMB_LOCK_MS = 900;
  // bomb damage to the boss -- only applies if the boss falls within
  // the visual core's range at fire-time. raw value is small on
  // purpose ("not substantial"); phase resistance multiplies it down
  // further later in the fight. range matches the visible core at
  // peak scale (~45vh from the player). default boss-vertical is
  // ~59vh away from the player, so landing damage requires the
  // player to move up toward the boss before firing
  const SPIRIT_BOMB_DAMAGE   = 0.05;
  const SPIRIT_BOMB_RANGE_VH = 45;

  // clamp ranges -- derived from the INNER box (the playable opening
  // inside evilbox.png's ornate frame), NOT the outer image bounds.
  // pixel scan of the 320x327 source shows:
  //   outer: 316x322 (the visible image area, leaving 2px transparent rim)
  //   inner: 289x281, with borders L=12 R=15 T=21 B=20 (asymmetric --
  //     top + bottom have thicker caps than the sides)
  // at 80vh tall the outer is 80vh * 320/327 = ~78.29vh wide. scaling
  // the borders: inner_w = 71.61vh, inner_h = 69.81vh.
  //   inner-left  = -36.18vh from center (i.e. -box/2 + L)
  //   inner-right = +35.43vh from center (i.e. +box/2 - R)
  //   inner-top    = 12 + 5.22 = 17.22vh from viewport top
  //   inner-bottom = 92 - 4.97 = 87.03vh
  // default sprite top sits at 83.5vh (box-bottom - 8.5vh), sprite-h =
  // 5.5vh, so default sprite-bottom = 89vh -- ALREADY ~2vh below the
  // inner floor; max_y is negative now (player must move up to stay
  // inside the inner frame at rest). symmetric clamp picks the
  // tighter of the asymmetric left/right magnitudes
  const BOX_W_OUTER_VH = 80 * 320 / 327;        // ~78.29
  const BOX_H_OUTER_VH = 80;
  const BOX_TOP_OUTER_VH = 12;
  // border fractions sampled from evilbox.png
  const INNER_PAD_L_FRAC = 12 / 316;
  const INNER_PAD_R_FRAC = 15 / 316;
  const INNER_PAD_T_FRAC = 21 / 322;
  const INNER_PAD_B_FRAC = 20 / 322;
  const INNER_LEFT_VH   = -BOX_W_OUTER_VH / 2 + BOX_W_OUTER_VH * INNER_PAD_L_FRAC; // ~-36.18
  const INNER_RIGHT_VH  =  BOX_W_OUTER_VH / 2 - BOX_W_OUTER_VH * INNER_PAD_R_FRAC; // ~+35.43
  const INNER_TOP_VH    = BOX_TOP_OUTER_VH + BOX_H_OUTER_VH * INNER_PAD_T_FRAC;    // ~17.22
  const INNER_BOTTOM_VH = BOX_TOP_OUTER_VH + BOX_H_OUTER_VH - BOX_H_OUTER_VH * INNER_PAD_B_FRAC; // ~87.03
  // BOX_W_VH is now the INNER width (consumed by code that wants the
  // playable horizontal extent, e.g. globe spawn limits). keep the
  // outer separately for any visual code that still needs the image
  // footprint
  const BOX_W_VH    = INNER_RIGHT_VH - INNER_LEFT_VH;  // ~71.61
  const SPRITE_W_VH = 4;
  const SPRITE_H_VH = 5.5;
  // symmetric x clamp -- use the tighter of left/right magnitudes so the
  // sprite half-width fits on both sides. ~33.43vh either direction
  const MAX_X_VH = Math.min(
    Math.abs(INNER_RIGHT_VH) - SPRITE_W_VH / 2,
    Math.abs(INNER_LEFT_VH)  - SPRITE_W_VH / 2
  );
  // y range: top clamp lets sprite-top kiss the inner ceiling;
  // bottom clamp lets sprite-bottom kiss the inner floor. default top
  // sits at INNER_BOTTOM - SPRITE_H so feet rest right on the inner
  // floor at y=0 (matches the CSS .player rule, which now uses
  // -10.47vh from the outer-bottom instead of the original -8.5vh)
  const PLAYER_DEFAULT_TOP_VH = INNER_BOTTOM_VH - SPRITE_H_VH; // ~81.53
  const MIN_Y_VH = INNER_TOP_VH - PLAYER_DEFAULT_TOP_VH;                // ~-64.31
  const MAX_Y_VH = INNER_BOTTOM_VH - (PLAYER_DEFAULT_TOP_VH + SPRITE_H_VH); // 0

  // bullet stream -- output level 1 = single semi-continuous stream
  // of placeholder cubes. one bullet every FIRE_INTERVAL_MS ms while
  // z is held, traveling straight up. chip damage on boss-hitbox AABB
  // collision; bullet removed on hit OR when it leaves the arena top.
  //
  // damage scales with distance from player center to boss center
  // (vertical only -- this is touhou-style, you're always under the
  // boss). at max distance the multiplier is 0.6; up close it's 1.0.
  // tuned so a max-distance full wipe at output 1 takes ~30s assuming
  // every bullet lands (9/s * 0.6 * 0.006 = 0.0324/s -> 30.86s)
  const FIRE_INTERVAL_MS = 110;
  const BULLET_SPEED_VH_PER_SEC = 90;
  // halved from 0.006 -- point-blank output-5 clutch was wiping in
  // ~3s, too quick. big bullets are scaled by BIG_DAMAGE_MULT off
  // this same base so they take a chunk in lockstep (chunk-vs-chip
  // ratio stays the same, total DPS roughly halves)
  const BULLET_BASE_DAMAGE = 0.003;
  const DAMAGE_FALLOFF = 0.4;       // 40% drop at max distance
  const DIST_MAX_VH    = 66;        // distance (vh) at which falloff is full

  // output 2/3 diagonal spread -- the angle from straight up. shift
  // tightens it ("less spread on higher power"). 11 deg looks like
  // a clear V; 5 deg pulls the prongs closer to parallel for clutch
  const SPREAD_ANGLE_DEG       = 11;
  const SPREAD_ANGLE_DEG_SHIFT = 5;

  // output 4/5 big bullets. wide-side shots by default: spawn
  // BIG_OFFSET_VH outboard of player center AND drift outward at
  // BIG_LATERAL_VH_PER_SEC, so a centered player can't catch the
  // boss with either of them. clutch (shift) collapses both to the
  // midline (offset 0, no lateral drift) -- that's the focused-damage
  // reward. boss is only 3vh half-wide; 5.5vh offset puts each big
  // bullet 2.5vh beyond the boss edge with the player at dead center,
  // and the lateral drift widens that gap further during flight
  const BIG_OFFSET_VH          = 5.5;
  const BIG_LATERAL_VH_PER_SEC = 14;
  const BIG_SPEED_MULT         = 0.82;
  const BIG_DAMAGE_MULT        = 2.4;

  // bullet tracking. each tick the bullet's velocity rotates toward
  // the boss's current center, clamped by turnRate * dt. speed
  // magnitude is preserved -- only the direction bends. small bullets
  // turn fast enough to "home"; big bullets turn slowly so the
  // outward lateral drift still mostly wins early-flight (the
  // wide-side / clutch design still reads). when the boss is portaling
  // out the target vanishes -- bullets fly straight until it returns.
  // MAX_BULLET_LIFE_MS is a safety net so a near-miss can't orbit
  // forever; in practice most bullets hit or escape inside ~1s
  const BULLET_TURN_RATE_RAD = 4.5;
  const BIG_TURN_RATE_RAD    = 1.2;
  const MAX_BULLET_LIFE_MS   = 3000;

  // per-phase damage resistance. multiplies every player-bullet hit
  // alongside the existing title-card softening. player output ramps
  // up across phases (output 1 fires one bullet/volley; output 5 fires
  // three small + two big = ~7.8x effective) and homing tracking lands
  // most of them now, so the boss needs to resist harder as the fight
  // goes on. monotonic-decrease shape from phase 3 onward, but eased
  // -- previous curve (~0.7x per step) made phase 8 mathematically
  // unkillable inside the alotted timer even with full upgrades.
  // flattened to ~0.78x per step from phase 3 down, with the biggest
  // relief past phase 5 where output caps and the player has no
  // further scaling to compensate. phases 1 and 2 are outliers --
  // phase 1 sits above 1.0 (negative resistance, +5%) and phase 2
  // sits just under 1.0 (2.5% resistance), both so the chip dps at
  // output 1/2 can actually cross GLOBE_THRESHOLD before the timer
  // expires. index by phase (1-indexed; [0] is a sentinel that
  // should never be read)
  const PHASE_DMG_RESIST = [
    1.00,  // [0] unused
    1.05,  // phase 1 -- NEGATIVE resistance (+5% damage). output ~1 chip
           //   dps wasn't enough to cross GLOBE_THRESHOLD (0.15) inside
           //   the phase 1 timer at the prior 0.55 multiplier, so no
           //   globe could drop here. lifted to 1.05 for now -- revisit
           //   once phase 1 budget + bullet pattern density settle
    0.975, // phase 2 -- 2.5% resistance. output ~2 (V split). previously
           //   0.42, then briefly 1.00; settled here so chip dps still
           //   crosses GLOBE_THRESHOLD comfortably but the bar drains a
           //   touch slower than "no resistance at all"
    0.30,  // phase 3 -- output ~3 (three-prong). bumped from 0.32 since
           //   phase 2 got a little stiffer above and the curve wanted
           //   a corresponding nudge to keep the ramp from compressing
    0.24,  // phase 4 -- output ~4 (three-prong + 1 big)
    0.18,  // phase 5 -- output ~5 (three-prong + 2 big), OUTPUT CAP
    0.15,  // phase 6 -- past output cap; flatter ramp so DPS doesn't
    0.12,  // phase 7    collapse against the timer once globes are
    0.10,  // phase 8    all collected and there's nowhere left to grow
  ];

  const OUTPUT_MAX = 5;

  // ---- globe collection ----
  // globes drop from the boss when its health crosses below this
  // fraction (one drop per phase). player collects by overlapping the
  // globe with their sprite. each globe carries the target output level
  // it will grant, colored to match the GLOBE LVL ladder so the visual
  // previews "you're about to become level N"
  const GLOBE_THRESHOLD       = 0.15;
  const GLOBE_VY_VH_PER_SEC   = 18;    // downward drift speed (vh per sec)
  const GLOBE_PICKUP_VH       = 2.2;   // player-center to globe-center pickup radius
  const GLOBE_DESPAWN_PAD_VH  = 4;     // grace below box bottom before culling
  // per-level color, matches the GLOBE LVL pip ladder. index 0 = level 1
  const GLOBE_COLORS = ['#2ee85a', '#4aa3ff', '#b46cff', '#ffd84e', '#ffffff'];

  // ---- boss / phase config ----
  // phase 1 lasts 52s; after that we don't yet have phase 2 patterns
  // wired so the boss just falls quiet. that's intentional during the
  // current planning beat
  const PHASE_1_DURATION_MS = 52000;

  // boss-zero hook -- when player damage takes health to 0, force the
  // next phase. the transition overlay duration is drawn out (longer
  // than a normal timer-driven phase change) so the defeat moment
  // reads as earned, not just "the boss died, next bar appears." used
  // via the opts.durationMs override on setPhase
  const BOSS_DEFEAT_TRANSITION_MS = 3800;

  // boss vh-anchored geometry. boss center vertical sits at 22vh (top
  // 17vh + half-height 5vh). these are used by the orb spawners
  const BOSS_CENTER_Y_VH = 22;

  // shadow-orb speed + sizes per pattern. tunable
  const ORB_SPEED_DIAGONAL_VH = 34;
  const ORB_SPEED_WEDGE_VH    = 42;
  const ORB_SPEED_SPIRAL_VH   = 28;

  // diagonal pattern -- 5-orb row per volley, alternating left/right
  const DIAGONAL_INTERVAL_MS  = 760;
  const DIAGONAL_ANGLE_DEG    = 32;
  const DIAGONAL_COUNT        = 5;
  const DIAGONAL_SPACING_VH   = 2.0;

  // wedge pattern -- 5-orb cone, tight spread, aimed at player
  const WEDGE_INTERVAL_MS     = 680;
  const WEDGE_SPREAD_DEG      = 18;
  const WEDGE_COUNT           = 5;

  // spiral pattern -- continuous rotating pair
  const SPIRAL_INTERVAL_MS    = 110;
  const SPIRAL_STEP_RAD       = 0.62;

  // phase 2 -- cross beams. fires 4-direction beam salvos from a
  // centered boss; each beam splits in two inward on first contact
  // with the inner border. slight rotation per salvo keeps things
  // from settling into a static cross
  const CROSS_BEAM_INTERVAL_MS = 1400;
  const CROSS_BEAM_SPEED_VH    = 40;
  const CROSS_BEAM_ROT_STEP    = 22.5; // deg per salvo

  // phase 2 layered -- radial damage-zone beams + matching orb spray.
  // additive on top of the base cross-beam move (doesn't replace it).
  // kicks in PHASE_2_RADIAL_START_MS into the phase, then cycles every
  // RADIAL_BEAM_INTERVAL_MS. each cycle spawns 4 straight beams from
  // boss center along the cardinals (forms a + to the box edges); they
  // persist as hazards for RADIAL_BEAM_LIFE_MS, rotate RADIAL_BEAM_ROT_DEG
  // over that lifetime, then fade. spray orbs spawn the same instant +
  // are explicitly culled at the same lifetime mark so they disappear
  // alongside the beams (rather than depending on flight time to exit)
  const PHASE_2_RADIAL_START_MS = 8000;
  const RADIAL_BEAM_INTERVAL_MS = 5200;  // bumped to keep cycle gap roughly the same now that life is longer
  const RADIAL_BEAM_LIFE_MS     = 3500;
  const RADIAL_BEAM_FADE_MS     = 240;   // fade-out lead-in before remove
  const RADIAL_BEAM_ROT_DEG     = 20;
  const RADIAL_BEAM_LENGTH_VH   = 78;    // long enough to clear the inner box from boss center
  const RADIAL_BEAM_WIDTH_VH    = 3.4;   // wide enough to read as a damage zone, not a laser
  const RADIAL_SPRAY_COUNT      = 14;
  const RADIAL_SPRAY_SPEED_VH   = 30;

  // phase 3 opener -- SHADOW SCATTER. boss orbits the arena on a wide
  // ellipse at rapid speed; while orbiting, tosses 12 spinning +
  // projectiles outward. each + flies outward via easeOutCubic
  // (rapid-slowdown shape), settles at a random target inside the box,
  // locks its rotation, pauses briefly, then telegraphs a thin cross
  // for 2s before firing wider primary cross beams as damage zones.
  // beams are narrower than phase 2's radial beams (which are 3.4vh)
  // bounds reminder -- boss default rect is top:17vh, height:10vh,
  // half-width:3vh, centered horizontally. inner box is 12-92vh
  // vertical, ~+-39vh horizontal half-width. so X amp <= ~36, Y amp <= 5
  // (limiting factor is the top edge: 17 - amp >= 12 -> amp <= 5)
  const PHASE_3_ELLIPSE_X_VH    = 20;     // half-width of orbit; leaves ~16vh margin on each side
  const PHASE_3_ELLIPSE_Y_VH    = 4;      // half-height of orbit; keeps boss top off the inner box edge
  const PHASE_3_ELLIPSE_FREQ_HZ = 0.7;    // rapid; cycle every ~1.43s
  // + projectiles
  const PHASE_3_PLUS_COUNT             = 12;
  const PHASE_3_PLUS_TOSS_INTERVAL_MS  = 130;   // so all 12 spawn in ~1.56s
  const PHASE_3_PLUS_SETTLE_MS         = 1500;  // toss-to-settled lerp duration
  const PHASE_3_PLUS_PREVIEW_DELAY_MS  = 500;   // post-settle pause before telegraph
  const PHASE_3_PLUS_PREVIEW_MS        = 2000;  // "about another 2 seconds" telegraph
  const PHASE_3_PLUS_BEAM_LIFE_MS      = 1600;
  // + visual + collision
  const PHASE_3_PLUS_SIZE_VH           = 2.6;   // bounding box of the spinning glyph
  const PHASE_3_PLUS_SPIN_DPS          = 760;   // degrees-per-second during flight
  const PHASE_3_PLUS_BEAM_WIDTH_VH     = 2.4;   // primary firing beam thickness
  const PHASE_3_PLUS_PREVIEW_WIDTH_VH  = 0.5;   // preview telegraph thickness
  const PHASE_3_PLUS_BEAM_LENGTH_VH    = 110;   // long enough that bars span the box
                                                 //   from any settled position
  // target placement -- ring around arena center (vh distance)
  const PHASE_3_TARGET_RADIUS_MIN_VH   = 16;
  const PHASE_3_TARGET_RADIUS_MAX_VH   = 32;
  const PHASE_3_TARGET_EDGE_MARGIN_VH  = 4;     // keep targets away from the box border

  // phase 3 STURMSZENE -- TWELVEFOLD VOLLEY. program-driven sequence of
  // sections (scatter, hop, interlude, climax). each scatter cycle
  // tosses 12 +s, each hop portals the boss to the next spot, the
  // interlude is a reused phase-1 throwback breather, the climax is
  // the spiral + crossbeam finishing flurry. drives the phase 3
  // operatic structure: wave 1 -> breather -> wave 2 -> closer
  //
  // "array activated" = time-from-cycle-start to when the LAST + in
  // that cycle enters its firing window. last + spawns at
  // (PLUS_COUNT-1) * TOSS_INTERVAL = 1430ms after cycle start, then
  // takes (SETTLE + PREVIEW_DELAY + PREVIEW) = 4000ms before its beam
  // ignites. so a cycle is "activated" 5430ms after it began -- the
  // scatter section's natural duration
  const PHASE_3_PLUS_BURST_MS    = (PHASE_3_PLUS_COUNT - 1) * PHASE_3_PLUS_TOSS_INTERVAL_MS;
  const PHASE_3_PLUS_ACTIVATE_MS = PHASE_3_PLUS_SETTLE_MS + PHASE_3_PLUS_PREVIEW_DELAY_MS + PHASE_3_PLUS_PREVIEW_MS;
  const PHASE_3_CYCLE_ACTIVATED_MS = PHASE_3_PLUS_BURST_MS + PHASE_3_PLUS_ACTIVATE_MS; // 5430

  // scatter spots -- the 5 positions the boss visits across the phase.
  // vh offsets from the boss's default home (which sits centered
  // horizontally, at BOSS_CENTER_Y_VH=22 from viewport top). TOP uses
  // the larger orbit ellipse (cycle 1's existing motion); the four
  // corners use a smaller local ellipse so the orbit stays inside the
  // box with the boss half-width (3vh) + ellipse half-axes (5vh)
  // landing 2vh inside the box half-w (~39vh)
  const PHASE_3_SCATTER_SPOTS = {
    TOP: { x:   0, y:   0 },
    BL:  { x: -29, y:  58 },
    BR:  { x:  29, y:  58 },
    TL:  { x: -29, y:   0 },
    TR:  { x:  29, y:   0 }
  };
  // smaller local ellipse for the 4 corner spots. same rapid frequency
  // as the TOP orbit (PHASE_3_ELLIPSE_FREQ_HZ) so all 6 scatter cycles
  // read as the same orbital toss, just anchored differently
  const PHASE_3_CORNER_ELLIPSE_X_VH = 5;
  const PHASE_3_CORNER_ELLIPSE_Y_VH = 2.5;

  // portal hop -- exit portal opens at hopExitX/Y, boss fades into it,
  // brief transit, then entry portal opens at the destination + boss
  // fades back in. instant hops (approachMs=0) open the portal at the
  // boss's current position; return-hops glide back to TOP first over
  // approachMs, then open the portal at TOP. the return is the
  // explicit "returning to the top" beat between waves
  const PHASE_3_PORTAL_OUT_MS      = 380;
  const PHASE_3_PORTAL_TRANSIT_MS  = 140;
  const PHASE_3_PORTAL_IN_MS       = 380;
  const PHASE_3_HOP_PORTAL_MS = PHASE_3_PORTAL_OUT_MS + PHASE_3_PORTAL_TRANSIT_MS + PHASE_3_PORTAL_IN_MS; // 900
  const PHASE_3_RETURN_APPROACH_MS = 600;   // return-hop glide-to-TOP duration

  // phase 3 program -- ordered list of sections. each entry has a
  // kind, a per-kind spot, and a duration. pattern_phase3b walks this
  // cursor; enterSection initializes per-kind state on each step.
  // total program runtime ~72.7s, plus the 2s title-card overlay at
  // phase entry -> ~74.7s used out of the 77s phase 3 budget, leaving
  // ~2.3s of headroom before the auto-advance to phase 4
  //
  // structure: wave 1 (3 cycles at TOP/BL/BR) -> return -> interlude
  // -> wave 2 (2 cycles at TL/TR) -> return + recall -> cycle 6 at
  // TOP -> climax. the recall + cycle 6 puts the boss back at TOP for
  // a final scatter before the closing spiral
  const PHASE_3_PROGRAM = [
    { kind: 'scatter',    spot: 'TOP', durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // wave 1 -- cycle 1
    { kind: 'hop',        spot: 'BL',  durMs: PHASE_3_HOP_PORTAL_MS },
    { kind: 'scatter',    spot: 'BL',  durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // cycle 2
    { kind: 'hop',        spot: 'BR',  durMs: PHASE_3_HOP_PORTAL_MS },
    { kind: 'scatter',    spot: 'BR',  durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // cycle 3
    { kind: 'return-hop', spot: 'TOP', durMs: PHASE_3_RETURN_APPROACH_MS + PHASE_3_HOP_PORTAL_MS },
    { kind: 'interlude',  spot: 'TOP', durMs: 15000 },                                // breather
    { kind: 'hop',        spot: 'TL',  durMs: PHASE_3_HOP_PORTAL_MS },               // wave 2
    { kind: 'scatter',    spot: 'TL',  durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // cycle 4
    { kind: 'hop',        spot: 'TR',  durMs: PHASE_3_HOP_PORTAL_MS },
    { kind: 'scatter',    spot: 'TR',  durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // cycle 5
    { kind: 'return-hop', spot: 'TOP', durMs: PHASE_3_RETURN_APPROACH_MS + PHASE_3_HOP_PORTAL_MS },
    { kind: 'scatter',    spot: 'TOP', durMs: PHASE_3_CYCLE_ACTIVATED_MS },          // cycle 6 at TOP
    { kind: 'climax',     spot: 'TOP', durMs: 18500 }                                 // closer
  ];

  // phase 3 interlude -- the breather between waves. glide back to
  // (0,0) over the first second, then reused phase-1 diagonal + wedge
  // patterns at tighter cadence + + trios riding on top. climax is
  // now its own program section, so the interlude is just diag + wedge
  const PHASE_3_INTERLUDE_GLIDE_MS     = 900;    // brief return-to-center before sine starts
  const PHASE_3_INTERLUDE_DIAG_END_MS  = 7000;   // diagonal -> wedge handoff (section-relative)
  const PHASE_3_INTERLUDE_END_MS       = 15000;  // matches the program section's durMs.
                                                  // diag 7s + wedge 8s
  // ramped-density overrides for the phase-1 patterns reused in the
  // interlude. tighter than phase-1's cadence so the pad reads as
  // "almost as busy as scatter" rather than "phase-1 throwback"
  const PHASE_3_INTERLUDE_DIAGONAL_INTERVAL_MS = 500;  // phase-1 default is 760
  const PHASE_3_INTERLUDE_WEDGE_INTERVAL_MS    = 450;  // phase-1 default is 680
  // + tosses come in trios -- three simultaneous spawns per cycle,
  // each picking its own random target inside the box. spread out so
  // the total + load over the 15s interlude is ~3 trios = 9 +s
  // overlapping at various stages
  const PHASE_3_INTERLUDE_PLUS_TRIO_COUNT  = 3;
  const PHASE_3_INTERLUDE_PLUS_INTERVAL_MS = 4500;

  // hexagram beat -- phase 4's entire spell. lattice anchored on the
  // arena vertical midline (NOT on the boss -- boss sits at ~22vh
  // from top, player lives at ~85-89vh, so a boss-anchored hex with
  // a box-respecting outer radius can't reach the player). centering
  // on the arena lets the down-vertex land in the player's territory
  // with side vertices still inside the box half-width. orbs sit on
  // the two interlocking triangles' edges; the lattice rotates slowly,
  // each orb drifts outward as the star expands. layered underneath:
  // phase 2's cross beams still fire from the boss, so the layered
  // read is "boss casts up top, star is drawn in the field below."
  // telescoping: each new hex spawns small at center BEFORE the
  // previous fades, so at peak there are ~3 concurrent rotating stars
  // overlapping at staggered expansion stages. successive hexes
  // alternate rotation direction so the layers don't fuse into one
  // rigid lattice
  //
  // sized to fill phase 4's 24s budget on its own (the splitting/tooth
  // moves -- cursor-intro + tower barrage -- got shelved further out):
  // 5 cycles, dur 7000, stagger 3000 = 19s of dispatch, + 2s overlay
  // = 21s used, ~3s headroom
  const PHASE_3_HEX_CYCLE_COUNT        = 5;
  const PHASE_3_HEX_CYCLE_DUR_MS       = 7000;   // each lattice's expansion arc
  const PHASE_3_HEX_CYCLE_STAGGER_MS   = 3000;   // peak concurrent = ceil(dur/stagger) = 3 lattices
  const PHASE_3_HEX_ORBS_PER_EDGE      = 6;      // total = 6 edges * this = 36 per hex
  // arena vertical anchor -- box is 12-92vh, center sits at 52vh.
  // matches the +-projectile target ring center used in spawnPlusProjectile
  const PHASE_3_HEX_ANCHOR_Y_VH        = 52;
  const PHASE_3_HEX_INNER_R_VH         = 4;      // starting vertex distance from center (small for dramatic expansion)
  // outer radius hits the player at max-down position. anchor at 52vh
  // + radius 37vh = down-vertex at 89vh, which is the player center
  // when they hug the floor. side vertices at 37 * cos(30°) ≈ 32vh
  // from arena center, inside the 39vh box half-width
  const PHASE_3_HEX_OUTER_R_VH         = 37;
  const PHASE_3_HEX_ROT_RATE_DPS       = 15;     // halved from 30 -- bigger lattice + the precision-dodge framing
  const PHASE_3_HEX_FADE_MS            = 350;    // fade-in + fade-out lead-in
  const PHASE_3_HEX_CROSS_INTERVAL_MS  = 1400;   // matches CROSS_BEAM_INTERVAL_MS so it reads as p2's cross
  // total hex span -- staggered spawns + the last cycle's full lifetime
  // = (N-1) * STAGGER + DUR. drives the cursor-intro start time
  const PHASE_3_HEX_TOTAL_MS = (PHASE_3_HEX_CYCLE_COUNT - 1) * PHASE_3_HEX_CYCLE_STAGGER_MS +
                               PHASE_3_HEX_CYCLE_DUR_MS;  // 19000 -- (5-1)*3000 + 7000

  // phase 3 cursor-intro beat -- boss is still planted, fires 5 volleys
  // of 3 cursors stacked tight on the player's vector. stacked column
  // (vs. fanned spread) so the player sees "they queue up and the lead
  // one splits before the next column lands" -- which is the lesson
  // the tower fans then exploit at higher count + width
  const PHASE_3_CURSOR_INTRO_VOLLEY_COUNT       = 5;
  const PHASE_3_CURSOR_INTRO_VOLLEY_INTERVAL_MS = 1000;
  const PHASE_3_CURSOR_INTRO_STACK_COUNT        = 3;
  const PHASE_3_CURSOR_INTRO_STACK_SPACING_VH   = 2.4;  // along firing dir, behind lead tooth
  const PHASE_3_CURSOR_INTRO_TOTAL_MS = PHASE_3_CURSOR_INTRO_VOLLEY_COUNT *
                                        PHASE_3_CURSOR_INTRO_VOLLEY_INTERVAL_MS;  // 5000

  // TOWER BARRAGE -- SHELVED to phase 4+. previously fired after the
  // interlude as a return-then-towers beat; lifted out of phase 3 so
  // TWELVEFOLD VOLLEY reads as one coherent sturmszene. the
  // implementation (spawnTower, launchTeethFromTower, updateTowers,
  // tooth split chain) is still in this file -- wire it back in via
  // a phase-4 program when that phase gets designed.
  // boss calmly returns to center, then two front towers extend from
  // either side, charge briefly, spin, and launch pronged teeth. each
  // tooth splits 3 times (1->2->4->8 teeth per original). part way
  // through, rear towers spawn at the bottom corners and repeat the
  // lifecycle
  const PHASE_3B_RETURN_DUR_MS       = 1800;
  // tower lifecycle: extend -> charge -> spin (teeth fly at start of spin) -> fade
  const TOWER_EXTEND_MS              = 700;
  const TOWER_CHARGE_MS              = 800;
  const TOWER_SPIN_MS                = 600;
  const TOWER_FADE_MS                = 400;
  const TOWER_DIAMETER_VH            = 6;      // topdown circle footprint of the tower
  const TOWER_TEETH_COUNT            = 4;      // teeth per radial salvo
  const TOWER_TEETH_ARC_DEG          = 50;     // total fan width -- teeth spread evenly across
                                               // [-arc/2, +arc/2] around the aim angle
  // teeth -- launched at tower's launchT, then split 3 times. final 8
  // teeth per original after gen 3
  const TOOTH_LAUNCH_SPEED_VH        = 26;
  const TOOTH_SPLIT_INTERVALS_MS     = [900, 700, 500];  // gen 0->1, 1->2, 2->3
  const TOOTH_SPLIT_ANGLE_DEG        = 22;     // +- per split
  const TOOTH_SPEED_FALLOFF          = 0.84;   // speed multiplier per split (slows progressively)
  // tooth bounding box -- roughly square so the cursor silhouette
  // (clip-path on .tooth) has room for both arrowhead and tail. tip
  // sits at the local +x edge; rotation aligns it with velocity
  const TOOTH_LENGTH_VH              = 2.4;
  const TOOTH_WIDTH_VH               = 2.4;

  // phase 4 program -- TBD. phase 3 ends at 2:46 with a portal
  // boss-exit; phase 4's actual content hasn't been designed yet, so
  // the program is empty + the boss stays hidden until phase 5a
  // opens with the lance ambush
  const PHASE_4_PROGRAM = [];

  // phase 5a -- SHADOW LANCE. boss is still gone (kept on guard since
  // the 2:46 exit), but two portal-borne lance attacks ambush the
  // player. lances are thorny trunks with snarling branches that
  // reach for the player at spawn-time. emerges from a portal at the
  // anchor, holds, dissolves. music cuts in from silence at 3:11
  // (sound layer is owner of the player, this just shapes the visual
  // cadence). 5a's program covers 18s total: 6s ambush + 7s silence
  // + 5s second ambush. boss disappears again at 3:29 -- after the
  // second lance dissolves, the boss + hud stay hidden until whatever
  // phase 5b becomes (currently empty / undefined)
  // lance now spawns at the player's position (their shadow becomes
  // the danger). a sprite-attached telegraph appears first, oriented
  // at the incoming angle; the player gets ~800ms to read + dodge.
  // when the telegraph clears, the lance materializes at the player's
  // CURRENT position (so moving during the telegraph displaces the
  // attack). the tree recurses through warped-triangle segments
  // forking left/right perpendicular-ish to each parent
  const PHASE_5_LANCE_TELEGRAPH_MS     = 800;
  const PHASE_5_LANCE_GROW_MS          = 320;
  const PHASE_5_LANCE_DISSOLVE_MS      = 700;
  const PHASE_5_LANCE_PORTAL_OPEN_MS   = 320;   // portal expands on the same beat the lance grows
  const PHASE_5_LANCE_ROOT_LENGTH_VH   = 20;
  const PHASE_5_LANCE_ROOT_WIDTH_VH    = 3.6;
  const PHASE_5_LANCE_BRANCH_DEPTH     = 2;     // root + 2 levels = 1+2+4 = 7 segments
  const PHASE_5_LANCE_BRANCH_SCALE     = 0.62;  // each child's length = parent * scale
  const PHASE_5_LANCE_BRANCH_W_SCALE   = 0.72;  // each child's width = parent * scale
  const PHASE_5_LANCE_PERP_JITTER_RAD  = 0.45;  // ~26deg jitter off perpendicular
  const PHASE_5_LANCE_PLAYER_BIAS      = 0.30;  // 30% pull toward player from pure perpendicular
  const PHASE_5_LANCE_ATTACH_MIN       = 0.40;  // child attaches at 40-85% along parent
  const PHASE_5_LANCE_ATTACH_MAX       = 0.85;

  // phase 5b -- GATE STORM. boss still hidden + no formal phase title
  // (continues the suspension that opened with 5a's lance ambush).
  // shadow portals scatter onto a gaussian ring around the player,
  // each acting as an orb turret -- two volleys of two densely-packed
  // 3-orb lines aimed where the player is at each volley. each gate
  // dies after the second volley + a brief close. spawn cadence is
  // probabilistic -- holds approximately 4 active at any moment
  // (occasionally 3 or 5 because the spawn roll is random)
  const PHASE_5B_GATE_LIFETIME_MS      = 1900;
  const PHASE_5B_GATE_OPEN_MS          = 280;
  const PHASE_5B_GATE_CLOSE_MS         = 420;
  const PHASE_5B_GATE_FIRST_VOLLEY_MS  = 480;   // first volley fires this long after gate opens
  const PHASE_5B_GATE_VOLLEY_INTERVAL_MS = 700; // delay between volley 1 + volley 2
  const PHASE_5B_GATE_VOLLEY_COUNT     = 2;
  const PHASE_5B_RING_RADIUS_VH        = 22;    // mean distance from player
  const PHASE_5B_RING_SIGMA_VH         = 3;     // gaussian-ish variance
  const PHASE_5B_RING_MARGIN_VH        = 4;     // keep gates away from box edges
  const PHASE_5B_LINES_PER_VOLLEY      = 2;     // 2 densely-packed lines per volley
  const PHASE_5B_LINE_FAN_DEG          = 16;    // angular spread between the 2 lines
  const PHASE_5B_ORBS_PER_LINE         = 3;     // 3 orbs per line, stacked behind the leader
  const PHASE_5B_ORB_STACK_VH          = 1.4;   // spacing along firing dir between stacked orbs
  const PHASE_5B_ORB_SPEED_VH          = 26;
  const PHASE_5B_GATE_TARGET_COUNT     = 4;
  const PHASE_5B_GATE_MAX_COUNT        = 5;     // hard cap; brief overshoot allowed
  const PHASE_5B_GATE_SPAWN_PROB_UNDER = 0.12;  // P(spawn) per frame when active < target
  const PHASE_5B_GATE_SPAWN_PROB_AT    = 0.025; // P(spawn) per frame when active == target

  const PHASE_5_PROGRAM = [
    { kind: 'lance',      dirRad: -Math.PI / 2,     durMs: 6000 },   // 3:11 -- from below
    { kind: 'idle',                                 durMs: 7000 },   // 3:17 -- silence
    { kind: 'lance',      dirRad: -3 * Math.PI / 4, durMs: 5000 },   // 3:24 -- from lower-right diagonal
    { kind: 'idle',                                 durMs: 6000 },   // 3:29 -- between 5a and 5b
    { kind: 'gate-storm',                           durMs: 21000 }   // 3:35 -- 5b runs to 3:56
  ];

  // phase 6 SPLIT-CROSS mechanic -- the + projectile from phase 3, but
  // its 4 cardinal beams aren't static cardinal lines anymore. each
  // beam grows from the cross center, then SPLITS at its tip into 2
  // children at +/- angle. children grow + split again. solid black
  // segments throughout (same shadow register as the lances + portals).
  // collision is per-segment tilted rect, so the player has to weave
  // the gaps in a recursive fork tree
  const PHASE_6_SPLIT_SETTLE_MS     = 1300;   // + flies from boss to target via easeOutCubic
  const PHASE_6_SPLIT_SPIN_DPS      = 760;    // degrees/sec spin while in flight
  const PHASE_6_SPLIT_PREVIEW_MS    = 900;    // brief telegraph before beams ignite
  const PHASE_6_SPLIT_GROW_MS       = 380;    // each segment's scale-in
  const PHASE_6_SPLIT_HOLD_MS       = 380;    // post-grow hold before next-gen split (or final fade)
  const PHASE_6_SPLIT_FADE_MS       = 360;
  const PHASE_6_SPLIT_DEPTH         = 2;      // root + 2 child generations = 3 levels per arm
  const PHASE_6_SPLIT_ANGLE_DEG     = [32, 26]; // split half-angle at depth 0 + 1
  const PHASE_6_SPLIT_LENGTH_VH     = [26, 16, 10]; // segment length per generation (vh)
  const PHASE_6_SPLIT_WIDTH_VH      = 1.8;    // beam thickness, narrower than phase 3's cross
  // target ring around arena center for the + landing position
  const PHASE_6_SPLIT_TARGET_R_MIN_VH = 12;
  const PHASE_6_SPLIT_TARGET_R_MAX_VH = 24;

  // phase 6 boss MOVEMENT -- track around the top of the arena. a
  // shallow horizontal ellipse anchored so the boss starts at home
  // (top-middle) and circles UPWARD + over: center sits one RY above
  // home, so the loop hangs in the top portion of the box. speed is
  // |cos(theta)|-modulated so the boss whips around the left + right
  // corners (max |x|, where theta is near 0 or pi) and drifts slowly
  // across the top + bottom of the loop (where motion is mostly
  // horizontal -- the "middle of the sweep"). gates on transitionUntilT
  // so the boss holds at home during the 6s swear-bubble shower; the
  // track only kicks in once the program begins
  const PHASE_6_TRACK_RX_VH         = 18;     // ellipse horizontal half-axis (vh)
  const PHASE_6_TRACK_RY_VH         = 2.4;    // ellipse vertical half-axis (vh) -- shallow
  const PHASE_6_TRACK_OMEGA_BASE    = 0.55;   // rad/s base angular speed (un-modulated)
  const PHASE_6_TRACK_SPEED_K       = 1.6;    // |cos(theta)| weight on speed
                                              //   mod. peak = base*(1+k),
                                              //   floor = base*1. avg ω ≈
                                              //   base*(1+k*2/π) ≈ 1.11 rad/s,
                                              //   ≈ 5.7s per lap

  // phase 6 program -- 4:02 - 4:52, total 50s of dispatch + ~2s
  // headroom before phase 6's 58s window expires at 4:54. opens with
  // the new split-cross beam tree as a single-pattern intro so the
  // mechanic reads; then reuses the shelved cursor-intro + tower
  // barrage; alternates back through split-crosses + closes on a
  // climax that layers all three on top of each other
  const PHASE_6_VOLLEY_INTERVAL_MS  = 2500;   // gap between staggered split-cross spawns
  // climax cadence -- opens with a HEAVIER split-cross barrage that
  // ramps down to the steady rate over CLIMAX_RAMP_MS. heavy + steady
  // are the interval bounds; the per-frame dispatch lerps between
  // them as the section progresses
  const PHASE_6_CLIMAX_SPLIT_FAST_MS = 950;   // initial heavy cadence
  const PHASE_6_CLIMAX_SPLIT_MS      = 2200;  // steady-state cadence (eased to)
  const PHASE_6_CLIMAX_RAMP_MS       = 4000;  // ramp duration from FAST -> steady
  const PHASE_6_CLIMAX_CURSOR_MS     = 1100;  // climax fires a cursor volley every this many ms
  // climax tower waves -- two full pairs through the climax. first
  // front at section start, first rear at +REAR_DELAY, then a second
  // front + rear pair so the closer doesn't peter out
  const PHASE_6_CLIMAX_REAR_DELAY_MS  = 2500;   // first rear after first front
  const PHASE_6_CLIMAX_FRONT2_T_MS    = 6500;   // second front-tower wave
  const PHASE_6_CLIMAX_REAR2_T_MS     = 9000;   // second rear-tower wave
  const PHASE_6_PROGRAM = [
    { kind: 'split-cross-volley', count: 3, durMs: 8000 },   // 4:02 -- intro the splitting beams
    { kind: 'cursor-volley',                durMs: 6000 },   // 4:10 -- stacked cursor teeth
    { kind: 'tower-barrage',                durMs: 8000 },   // 4:16 -- front + rear towers
    { kind: 'split-cross-volley', count: 4, durMs: 9000 },   // 4:24 -- escalated split crosses
    { kind: 'cursor-volley',                durMs: 6500 },   // 4:33 -- another teeth round
    { kind: 'climax',                       durMs: 12500 }   // 4:39.5 -- everything layered
  ];

  // phase 7a KADENZ -- SOVEREIGN UMBRA. introduces two stacked mechanics:
  //   - towers as projectiles: spawn at an edge, walk straight
  //     across the arena while firing their teeth on the normal
  //     lifecycle. wave 2 fires shadow orbs instead of teeth for
  //     variety while the player learns the dodge
  //   - omnidirectional puddle spray: dark hotspots scatter across
  //     the arena floor. each puddle activates ~1.6s later into the
  //     same recursive bolt-tree lance as 5a, WITHOUT a portal +
  //     without the player-sprite telegraph (the puddle IS the cue).
  //     slightly slower activation than 5a's player-anchored lance
  //     since the spray covers the whole field
  const PHASE_7A_TOWER_SPEED_VH       = 12;     // vh/sec horizontal walk
  const PHASE_7A_TOWER_LIFETIME_MS    = 5600;   // walks long enough to cross then fade
  const PHASE_7A_TOWER_SPAWN_GAP_MS   = 1400;   // gap between staggered tower spawns in a wave
  const PHASE_7A_PUDDLE_RADIUS_VH     = 4;      // puddle visual half-size
  const PHASE_7A_PUDDLE_PULSE_MS      = 600;    // each puddle's pulse cadence
  const PHASE_7A_PUDDLE_ACTIVATE_MS   = 1600;   // delay from puddle spawn to lance eruption
  const PHASE_7A_PUDDLE_FADE_MS       = 400;
  const PHASE_7A_PUDDLE_LANCE_DUR_MS  = 3200;   // total lance lifetime from eruption
  const PHASE_7A_PUDDLE_INTERVAL_MS   = 380;    // gap between puddle spawns in a wave
  const PHASE_7A_PUDDLE_DENSE_MS      = 240;    // tighter cadence for the dense wave
  // hotspot ring -- puddles spawn at a random angle around the boss
  // / arena center, with a radius range that covers most of the box.
  // clamped to the inner box so puddles never fall outside the arena
  const PHASE_7A_PUDDLE_RING_MIN_VH   = 4;
  const PHASE_7A_PUDDLE_RING_MAX_VH   = 36;
  // phase 7a boss MOVEMENT -- gentle tight oscillation around home.
  // small lissajous (x at base ω, y at 2x) so the boss traces a
  // tiny figure-8 / flat-oval blend, alive-but-anchored. amplitude
  // is intentionally small -- the spatial threat in 7a is the roaming
  // towers + puddle spray, not the boss position; the boss just
  // breathes through the middle while everything else does the work.
  // closed-form on elapsedSec since there's no per-frame integration
  // needed (no path-curvature speed-modulation like phase 6)
  const PHASE_7A_OSC_AMP_X_VH       = 2.2;
  const PHASE_7A_OSC_AMP_Y_VH       = 1.0;
  const PHASE_7A_OSC_OMEGA          = 2 * Math.PI * 0.22; // ~1.38 rad/s, ~4.5s per x cycle
  const PHASE_7A_OSC_PHASE          = Math.PI / 6;        // y phase offset -- keeps the
                                                          //   figure from collapsing to a
                                                          //   straight line at t=0

  // phase 7a runs 4:56 -> 5:46 = 50s. with the 2s title-card overlay
  // at entry, programmed content fits in 48s + ~0s headroom. sections
  // tightened from the original 60s plan
  const PHASE_7_PROGRAM = [
    // 4:58 -- two roaming towers (standard tooth payload)
    { kind: 'tower-roam-wave',  count: 2, variant: 'teeth', durMs:  9000 },
    // 5:07 -- puddle-lance intro at the comfortable cadence
    { kind: 'puddle-lance-wave', interval: PHASE_7A_PUDDLE_INTERVAL_MS, durMs: 10000 },
    // 5:17 -- escalated roaming towers, orb payload for variety
    { kind: 'tower-roam-wave',  count: 3, variant: 'orbs',  durMs:  9000 },
    // 5:26 -- denser puddle spray
    { kind: 'puddle-lance-wave', interval: PHASE_7A_PUDDLE_DENSE_MS,    durMs: 10000 },
    // 5:36 -- climax: both layered, towers walking + puddles spraying
    { kind: 'phase7a-climax',                                           durMs:  8000 }
    // ends at 5:44, leaving 2s headroom into the 5:46 phase 8 boundary
  ];

  // phase 7b TODESREIGEN + UNTERGANG -- SHADE'S EMBRACE + DEATHTHROES. the pair of ultimates.
  //   shade's embrace: in lore a sphere of shadow that wraps the
  //     player and pries them apart from inside, like an iron maiden
  //     -- "embrace" carries the iron-maiden idiom + the vampire-
  //     fiction term for being claimed. gameplay-side it's expressed
  //     as CONCURRENT nested telescoping rotating boxes (the closing
  //     rings stand in for the sphere's interior tightening; the
  //     spikes are what pries you apart).
  //     a new box spawns every SPAWN_INTERVAL at the arena boundary
  //     + immediately starts shrinking + rotating. spawn interval is
  //     smaller than shrink duration, so multiple boxes are alive at
  //     once -- the arena reads as ~3-4 closing rings at consecutive
  //     spacings. each box has one exit slot range on a random edge;
  //     player reads the rotation of each ring + positions so the
  //     spike strip sweeping past them is the gap, not a blade.
  //     consecutive boxes alternate rotation direction + flip exit
  //     side, so the chain of escapes isn't a single repeating motion.
  //     survivable -- player outpaces the shrink, and a hit by one
  //     ring is one damage hit, not a chain-end
  //   deaththroes: snake-curve trails seek the player + multiply over
  //     time, like a hilbert curve filling space. each snake stops
  //     when its head hits a trail (own or another). leading snakes
  //     into self-collision is the only escape -- if the boss isn't
  //     killed by the timer, the arena fills entirely
  //
  // boss is hittable + the hud stays visible across BOTH spells, so
  // damage dealt in shade's embrace persists into deaththroes
  // (same boss, same phase 8 health bar)
  const PHASE_7B_MAIDEN_DUR_MS        = 25000;
  const PHASE_7B_SNAKE_DUR_MS         = 24000;
  // shade's embrace nested-box pacing. boxes spawn at SPAWN_INTERVAL_MS
  // and live for SHRINK_MS each; SHRINK / SPAWN gives the concurrent
  // ring count (here ~3-4). startSize is set per spawn to the arena
  // dimensions so each new ring forms at the arena boundary
  const PHASE_7B_MAIDEN_BOX_END_SCALE        = 0.04;  // shrinks to near-zero, then vanishes
  const PHASE_7B_MAIDEN_BOX_SHRINK_MS        = 6800;  // life of one box
  const PHASE_7B_MAIDEN_BOX_SPAWN_INTERVAL_MS = 1700; // ~4 concurrent rings
  const PHASE_7B_MAIDEN_BOX_ROT_RAD_PER_S    = 0.32;  // ~18 deg/s base rotation
  const PHASE_7B_MAIDEN_BOX_EXIT_FRAC        = 0.22;  // exit gap span as fraction of edge
  const PHASE_7B_MAIDEN_SPIKE_WIDTH_VH       = 3.0;   // along-edge width (un-scaled)
  const PHASE_7B_MAIDEN_SPIKE_LENGTH_VH      = 4.0;   // perpendicular length (un-scaled)
  const PHASE_7B_MAIDEN_BOX_COLLAPSE_MS      = 280;   // fade window for a vanishing box
  // deaththroes snake pacing. movement is GRID-ALIGNED -- each snake
  // walks straight at constant speed, only deciding to turn when its
  // head crosses into a new cell of a 14x14 grid covering the inner
  // box. each turn picks the neighbor cell with the LOWEST trail
  // density (the AVOIDANCE POLICY), so the emergent pattern reads as
  // a hilbert / lawn-mower fill spreading across the arena.
  //
  // snakes are IMMORTAL -- they don't self-kill on contact. player
  // contact damages the player, not the snake. trail thickness =
  // max(cellW, cellH) (set in initSnakeGrid) so every cell a snake
  // passes through gets filled border-to-border with NO surviving
  // gap at the arena edge. tuned so the 4 prongs from boss saturate
  // the 144-cell grid in ~22s of practical filling, fitting the 24s
  // section budget. the board "clears" right as the timer expires
  const PHASE_7B_SNAKE_SPEED_VH       = 9;        // slower so the rapid trickle doesn't blow
                                                   //   past the 24s budget; constant pop-in is
                                                   //   the headline feature now, not raw fill
  const PHASE_7B_SNAKE_THICKNESS_VH   = 1.6;      // fallback only -- initSnakeGrid overrides
                                                   //   with cellW (filling the cell fully)
  const PHASE_7B_SNAKE_GRID_CELLS     = 12;       // 12x12 = 144 cells, cells ~6.5vh wide
  const PHASE_7B_SNAKE_FORWARD_BONUS  = 0.4;      // tiebreak weight that prefers continuing
                                                   //   straight (so snakes commit to lanes when
                                                   //   neighbor fillness ties)
  // 4 prong directions for the initial snake spawn from the boss.
  // cardinals so the spread is symmetric across the arena -- the N
  // prong reflexes off the ceiling quickly, the others have room
  const PHASE_7B_SNAKE_PRONG_DIRS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  // continuous trickle -- after the initial 4, one extra prong spawns
  // from the boss every TRICKLE_MS in a random cardinal. CONSTANT
  // POP-IN is the design goal: a new snake every ~500ms with a
  // generous cap so the field stays dense, and the spirit bomb
  // explicitly does NOT clear them (snakes are the inevitability
  // of the deaththroes, not a clearable hazard)
  const PHASE_7B_SNAKE_TRICKLE_MS     = 500;
  const PHASE_7B_SNAKE_MAX_COUNT      = 16;

  // phase 7b boss MOVEMENT -- still, but hovering. zero horizontal
  // drift, tiny vertical bob in y so the boss reads as alive rather
  // than pasted in. faster freq than 7a's oscillation -- this is a
  // breath, not a sway, and the contrast with the closing rings + the
  // multiplying snake-curves benefits from the boss looking rooted
  const PHASE_7B_HOVER_AMP_VH       = 0.65;
  const PHASE_7B_HOVER_OMEGA        = 2 * Math.PI * 0.35; // ~2.2 rad/s, ~2.85s per breath

  const PHASE_8_PROGRAM = [
    { kind: 'iron-maiden', durMs: PHASE_7B_MAIDEN_DUR_MS },  // 5:48 -> 6:13
    { kind: 'snake-curve', durMs: PHASE_7B_SNAKE_DUR_MS }    // 6:13 -> 6:37 (~2s headroom to 6:39)
  ];

  // default duration of the title-card-style transition overlay --
  // per-phase entries in PHASE_CAPTIONS can override
  const PHASE_TRANSITION_DEFAULT_MS = 2000;

  // per-phase boss "home" position in vh, relative to default. null
  // means the phase owns its own per-frame movement (eg p1 sine). on
  // setPhase, the boss glides from its current px position to this
  // home over the transition window
  const BOSS_PHASE_TARGETS_VH = {
    1: null,                // p1 -- sine + bob, no fixed home
    2: { x: 0, y: 6 },      // p2 -- center, slightly below midline
    3: null,
    4: null,
    5: null,
    6: { x: 0, y: 0 },      // p6 -- boss reappears at default home (top center)
    7: { x: 0, y: 0 },      // p7a -- hold at home while towers roam + puddles spray
    8: { x: 0, y: 0 }       // p7b -- hold at home (content TBD)
  };

  // canonical fight timestamps per phase (seconds from fight start).
  // setPhase rewinds state.startedAt so the hud timer reads the
  // canonical clock for whatever phase you jumped to. matches the
  // planning doc (project_maestrul-fight.md)
  const PHASE_START_S = {
    1: 0,
    2: 55,    // 0:55
    3: 91,    // 1:31
    4: 166,   // 2:46 -- phase 3 closes with the portal exit
    5: 191,   // 3:11 -- phase 5a opens with the lance-from-behind ambush
              //   (music suddenly cuts in from silence)
    6: 236,   // 3:56 -- boss reappears at home, formal phase 6
    7: 296,   // 4:56 -- phase 7a opens (engine phase 7)
              //   moving towers + omnidirectional puddle lances
    8: 346,   // 5:46 -- phase 7b opens (engine phase 8)
              //   pair of ultimates -- content TBD
    9: 399    // 6:39 -- end-of-fight sentinel for phase 8's duration cap.
              //   no phase 9 actually exists; the auto-advance guard
              //   (state.phase < PHASE_MAX) prevents setPhase(9)
  };

  // per-phase duration cap in ms, derived from PHASE_START_S diffs so
  // the canonical start times stay the single source of truth. when
  // elapsed phase time crosses this, updatePhase calls setPhase(n+1).
  // boss-zero is the other half of the doc rule ("transitions fire
  // when EITHER health hits zero OR the timer expires") and lives on
  // the damage path. phase 6 has no successor wired yet -- cap is
  // null, so it runs open-ended until manually stepped via ]
  const PHASE_DURATION_MS = (() => {
    const out = {};
    const ks = Object.keys(PHASE_START_S).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i], next = ks[i + 1];
      out[k] = next != null ? (PHASE_START_S[next] - PHASE_START_S[k]) * 1000 : null;
    }
    return out;
  })();

  // easing helpers for the boss glide
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);

  // boss hitbox -- AABB derived from the .boss css. boss sits at
  // top: 17vh, height: 10vh, centered horizontally, width: 6vh. these
  // get converted to px each frame against window.innerWidth/Height
  const BOSS_HALF_W_VH = 3;
  const BOSS_TOP_VH    = 17;
  const BOSS_BOTTOM_VH = 27;

  const playerEl  = document.getElementById('player');
  const bossEl    = document.getElementById('boss');
  const trailEl   = document.getElementById('boss-trail');
  // afterimage ghost sprites in dom order [lag1, lag2, lag3]. each gets
  // its own --ax/--ay/--ad each frame; --trail-strength lives on the
  // container so the gate is a single write
  const trailGhostEls = trailEl
    ? Array.from(trailEl.querySelectorAll('.boss__afterimage')) as HTMLElement[]
    : [];
  const bulletsEl = document.getElementById('bullets');
  const orbsEl    = document.getElementById('orbs');
  const beamsEl   = document.getElementById('beams');
  const hudEl     = document.getElementById('hud');
  const playerTelegraphEl = document.getElementById('player-lance-telegraph');
  const debugEl   = document.getElementById('debug');

  // snake-spawn sfx -- short umise_038 clip, preloaded so playback
  // is instant on the rapid (500ms) trickle. cloneNode gives each
  // overlapping spawn its own playback head; the base element stays
  // as the cached buffer source. .play() rejects silently before the
  // first user gesture so the promise is swallowed
  const snakeSpawnSfx = _audio(SFX_BASE + 'snake-spawn.ogg');
  snakeSpawnSfx.preload = 'auto';
  snakeSpawnSfx.volume  = 0.38;
  function playSnakeSpawn() {
    const a = snakeSpawnSfx.cloneNode(true);
    // cloneNode doesn't carry the .volume IDL prop -- have to copy it
    a.volume = snakeSpawnSfx.volume;
    a.play().catch(() => {});
  }
  // lance-skewer sfx -- umise_058. fires when a shadow lance tree
  // materializes (telegraph → growing transition for player-anchored
  // lances, eruption moment for puddle-anchored ones). same cloneNode
  // pattern so back-to-back lances overlap cleanly
  const lanceSkewerSfx = _audio(SFX_BASE + 'lance-skewer.ogg');
  lanceSkewerSfx.preload = 'auto';
  lanceSkewerSfx.volume  = 0.47;
  function playLanceSkewer() {
    const a = lanceSkewerSfx.cloneNode(true);
    a.volume = lanceSkewerSfx.volume;
    a.play().catch(() => {});
  }
  // boss-defeat sfx -- umise_055. fires the moment the player drains
  // the bar to zero (the >0 -> 0 edge inside setBoss, which is also
  // what kicks the phase advance). no pool -- this can only fire on
  // phase boundaries, and never twice back-to-back. single instance
  // with a currentTime rewind in case a phase scrub triggers it again
  const BOSS_DEFEAT_SFX_URL = SFX_BASE + 'boss-defeat.ogg';
  const bossDefeatSfx = _audio(BOSS_DEFEAT_SFX_URL);
  bossDefeatSfx.preload = 'auto';
  bossDefeatSfx.volume  = 0.55;
  function playBossDefeat() {
    try { bossDefeatSfx.currentTime = 0; } catch (_) {}
    const p = bossDefeatSfx.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
  // tower-summon sfx -- umise_060. fires inside spawnTower so every
  // tower variant (front / rear / roaming / climax-wave) gets the
  // same audible cue at extend-start
  const towerSummonSfx = _audio(SFX_BASE + 'tower-summon.ogg');
  towerSummonSfx.preload = 'auto';
  towerSummonSfx.volume  = 0.15;
  function playTowerSummon() {
    const a = towerSummonSfx.cloneNode(true);
    a.volume = towerSummonSfx.volume;
    a.play().catch(() => {});
  }

  // tooth-split sfx -- umise_046. fires at every subdivision moment in
  // the tower-tooth split chain (gen 0->1, 1->2, 2->3). plays at the
  // split itself, not at parent-spawn, so the audible cue tracks the
  // mechanic the player actually has to read.
  // 0.05 was per-play but the binary chain layers 1+2+4 = 7 plays per
  // tower in quick succession, and multiple towers fire simultaneously
  // -- effective volume crested over the cross-beam cue and drowned
  // it out. dropped to 0.012 so stacked plays cap around 0.08 even
  // at worst case, leaving headroom for the cross-beam at 0.15
  const toothSplitSfx = _audio(SFX_BASE + 'tooth-split.ogg');
  toothSplitSfx.preload = 'auto';
  toothSplitSfx.volume  = 0.012;
  function playToothSplit() {
    const a = toothSplitSfx.cloneNode(true);
    a.volume = toothSplitSfx.volume;
    a.play().catch(() => {});
  }

  // split-cross / plus toss sfx -- umise_075. fires at every +-glyph
  // toss site: phase 6's spawnSplitCross (recursive bolt-tree variant)
  // and phase 3's spawnPlusProjectile (preview-then-cross variant). same
  // toss-time cue regardless of which AOE pays out at settle
  const splitCrossSfx = _audio(SFX_BASE + 'split-cross.ogg');
  splitCrossSfx.preload = 'auto';
  splitCrossSfx.volume  = 0.15;
  function playSplitCross() {
    const a = splitCrossSfx.cloneNode(true);
    a.volume = splitCrossSfx.volume;
    a.play().catch(() => {});
  }

  // plus AOE-fire sfx -- umise_072. specific to the phase 3 plus
  // projectile variant; fires when the preview cross gives way to the
  // primary firing cross (createPlusBeam). phase 6's split-cross uses a
  // recursive bolt-tree instead and is handled elsewhere
  const plusFireSfx = _audio(SFX_BASE + 'plus-fire.ogg');
  plusFireSfx.preload = 'auto';
  plusFireSfx.volume  = 0.15;
  function playPlusFire() {
    const a = plusFireSfx.cloneNode(true);
    a.volume = plusFireSfx.volume;
    a.play().catch(() => {});
  }

  // phase 6 split-cross activation sfx -- umise_074. the initial AOE
  // ignition: preview clears + 4 root segments spawn. branching-AOE
  // cues for the recursive depth-1/2/3 splits are pending and will
  // layer on top of this root activation
  const splitActivateSfx = _audio(SFX_BASE + 'split-activate.ogg');
  splitActivateSfx.preload = 'auto';
  splitActivateSfx.volume  = 0.16;
  function playSplitActivate() {
    const a = splitActivateSfx.cloneNode(true);
    a.volume = splitActivateSfx.volume;
    a.play().catch(() => {});
  }

  // phase 6 split-cross branching sfx -- umise_073. fires at each
  // depth tier of the recursive bolt tree (depth 0->1, 1->2, 2->3).
  // gated per-cross via C.branchSfxMaxDepth so it fires once per tier
  // rather than once per parent segment (which would chord into 4/8/16
  // stacked plays)
  const splitBranchSfx = _audio(SFX_BASE + 'split-branch.ogg');
  splitBranchSfx.preload = 'auto';
  splitBranchSfx.volume  = 0.14;
  function playSplitBranch() {
    const a = splitBranchSfx.cloneNode(true);
    a.volume = splitBranchSfx.volume;
    a.play().catch(() => {});
  }

  // radial-beam sfx -- umise_057. one cue per radial-beam volley
  // (phase 2 large rotating + cross). called once inside
  // pattern_radialBeams, not per-beam, so the cue reads as the volley
  // itself rather than 4 stacked plays
  const radialBeamSfx = _audio(SFX_BASE + 'radial-beam.ogg');
  radialBeamSfx.preload = 'auto';
  radialBeamSfx.volume  = 0.26;
  function playRadialBeam() {
    const a = radialBeamSfx.cloneNode(true);
    a.volume = radialBeamSfx.volume;
    a.play().catch(() => {});
  }
  const timerEl   = document.getElementById('timer');
  const healthFill = document.getElementById('health-fill');
  const bombFlash  = document.getElementById('bomb-flash');
  const spiritBomb = document.getElementById('spirit-bomb');
  const bombPips   = document.querySelectorAll('#bombs-row   .hud__pip');
  const hitPips    = document.querySelectorAll('#hits-row    .hud__pip');
  const outputPips = document.querySelectorAll('#outputs-row .hud__pip');
  const transitionEl   = document.getElementById('phase-transition');
  const transCaptionEl = document.getElementById('phase-transition-caption');
  const transSubEl     = transitionEl.querySelector('.phase-transition__sub');

  // setOutput -- single source of truth for cycling/setting the
  // output level. clamps to [1..OUTPUT_MAX] and lights the OUTPUT pip
  // column (matches bombs/hits convention: pips 0..n-1 active, n..max-1
  // dark). called from the 1..5 keyboard handler -- the top-left toggle
  // button is gone, the in-arena pip column is the indicator now
  function setOutput(n) {
    if (n < 1) n = 1;
    if (n > OUTPUT_MAX) n = OUTPUT_MAX;
    state.output = n;
    outputPips.forEach((el, i) => el.setAttribute('data-active', i < n ? 'true' : 'false'));
    // mirror the active pip color onto the player hitbox so the hitbox
    // tracks the output level (green at 1, ramping to white at 5).
    // reading --pip-color off the pip itself means the nth-child rules
    // above stay the single source for the actual colors -- no duplicate
    // palette in js to drift out of sync
    const activePip = outputPips[n - 1];
    if (activePip) {
      const pipColor = getComputedStyle(activePip).getPropertyValue('--pip-color').trim();
      if (pipColor) playerEl.style.setProperty('--hitbox-color', pipColor);
    }
  }

  // ---- phase transition overlay ----
  // show the movement title with caption+sub text. removing + re-adding
  // data-show in two ticks restarts the sweep animation if the overlay
  // was already visible
  function showTransition(caption, sub, durationMs) {
    if (!transitionEl) {
      // eslint-disable-next-line no-console
      console.warn('[hole2] showTransition: transitionEl missing');
      return;
    }
    // captions are trusted (PHASE_CAPTIONS constants) so innerHTML
    // is safe here -- needed to render multi-line titles (eg phase
    // 7b's "TODESREIGEN -- SHADE'S EMBRACE<br>UNTERGANG -- DEATHTHROES")
    if (transCaptionEl) transCaptionEl.innerHTML = caption;
    if (transSubEl)     transSubEl.textContent   = sub || '';
    // restart trick -- clear then set on next frame
    transitionEl.removeAttribute('data-show');
    void transitionEl.offsetWidth; // force reflow
    transitionEl.setAttribute('data-show', 'true');
    state.transitionUntilT = _gameNow() + durationMs;
    // eslint-disable-next-line no-console
    console.log('[hole2] showTransition:', caption, 'for', durationMs, 'ms');
  }
  function hideTransition() {
    transitionEl.removeAttribute('data-show');
    state.transitionUntilT = 0;
  }

  // phase 3 -> phase 4 exit visual. fires at 2:46. a shadow portal
  // opens at the boss's current position; the boss fades into it +
  // stays hidden through the rest of phase 4 (program is empty until
  // phase 4's intent gets designed). the HUD (health bar + timer)
  // hides on the same beat so there's no orphaned "0 hp left" / "0:00"
  // remnant sitting on screen while the boss is gone.
  // transitionUntilT drives the dispatch pause across the exit window
  // phase 6 transition -- 3:56 to 4:02. portal entry brings the boss
  // back in the first ~1.5s; the full 6s window is then filled with
  // a dialogue-box projectile shower of DIE-repeat text that flies
  // from the boss across the arena. nothing in this transition damages
  // the player -- it's visual chatter to mark the formal return. phase
  // 6's actual mechanics begin once the transition window clears.
  // (internal naming still says "swear" -- it was a censored-swear
  // barrage originally; the bubbles + state field + css class kept
  // the name when the text flipped to DIE-repeats)
  const PHASE_6_ENTRY_MS      = 1500;   // portal-entry visual length
  const PHASE_6_TRANSITION_MS = 6000;   // total dialogue-shower window (3:56 -> 4:02)
  // deferred title card -- the movement title slides in 4s into
  // the phase 6 entry so the long dialogue opening still gets a
  // formal DUETT announcement, with the card hitting peak as
  // the shower dies down and finishing at 4:02 when the
  // program begins
  const PHASE_6_TITLE_DELAY_MS = 4000;
  const PHASE_6_TITLE_DUR_MS   = 2000;
  // DIE-repeat shower. each bubble is "DIE" stamped 2-5 times in a
  // row -- e.g. "DIEDIE", "DIEDIEDIEDIE". the visual swarm comes from
  // the existing per-bubble rotation + fan + scatter; the text itself
  // stays uniform so the rage reads as one chant repeated across the
  // shower rather than per-bubble novelty
  const PHASE_6_SWEAR_WORD        = 'DIE';
  const PHASE_6_SWEAR_REPEAT_MIN  = 2;
  const PHASE_6_SWEAR_REPEAT_MAX  = 5;
  const PHASE_6_SWEAR_INTERVAL_MS = 110;  // rapid -- new bubble every ~110ms
  const PHASE_6_SWEAR_LIFE_MS     = 1800;
  const PHASE_6_SWEAR_SPEED_VH    = 38;   // projectile pace, not float
  const PHASE_6_SWEAR_TILT_DEG    = 14;   // max rotation per bubble (static, no spin)
  const PHASE_6_SWEAR_SCATTER_VH  = 6;    // spawn jitter around boss center
  const PHASE_6_SWEAR_FAN_DEG     = 95;   // half-fan of aim spread (0 = straight down,
                                            //   95 covers most of the lower hemisphere)

  // build one bubble's text -- "DIE" repeated 2-5 times. picked at
  // spawn so the swarm has visible length variety even though every
  // bubble shouts the same word
  function generateSwearText() {
    const reps = PHASE_6_SWEAR_REPEAT_MIN +
                 Math.floor(Math.random() * (PHASE_6_SWEAR_REPEAT_MAX - PHASE_6_SWEAR_REPEAT_MIN + 1));
    return PHASE_6_SWEAR_WORD.repeat(reps);
  }

  // spawn one swear bubble near the boss aimed downward into the
  // player's half of the arena. travels like a projectile (straight
  // line, single fan of directions clustered around +y). lives
  // PHASE_6_SWEAR_LIFE_MS, then fades out + culls. tracked in
  // state.activeSwearBubbles + updated each tick
  function spawnSwearBubble(t) {
    const vh = window.innerHeight / 100;
    const speed = PHASE_6_SWEAR_SPEED_VH * vh;
    // spawn near boss center with scatter -- the bubbles read as
    // erupting from the boss's mouth/general region
    const bc = bossCenterPx();
    const offX = (Math.random() - 0.5) * 2 * PHASE_6_SWEAR_SCATTER_VH * vh;
    const offY = (Math.random() - 0.5) * 2 * PHASE_6_SWEAR_SCATTER_VH * vh;
    const sx = bc.x + offX;
    const sy = bc.y + offY;
    // velocity -- aim into the lower hemisphere (toward the player
    // half). polar 0 = +x right, pi/2 = +y down. range:
    // [pi/2 - fan, pi/2 + fan] keeps every bubble heading downward
    // (just with horizontal spread). reads as a barrage rather than
    // an omni-explosion
    const fanRad = PHASE_6_SWEAR_FAN_DEG * Math.PI / 180;
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 2 * fanRad;
    const speedMult = 0.85 + Math.random() * 0.30;
    const vx = Math.cos(angle) * speed * speedMult;
    const vy = Math.sin(angle) * speed * speedMult;
    const rotDeg = (Math.random() - 0.5) * 2 * PHASE_6_SWEAR_TILT_DEG;

    const el = document.createElement('div');
    el.className = 'swear-bubble';
    el.style.left = sx + 'px';
    el.style.top  = sy + 'px';
    el.style.setProperty('--swear-rot', rotDeg + 'deg');
    el.textContent = generateSwearText();
    beamsEl.appendChild(el);
    requestAnimationFrame(() => el.setAttribute('data-on', 'true'));

    state.activeSwearBubbles.push({
      el, x: sx, y: sy, vx, vy,
      spawnT: t,
      removeAtT: t + PHASE_6_SWEAR_LIFE_MS,
      leaving: false
    });
  }

  // per-frame: spawn new bubbles during the phase 6 transition window
  // (transitionUntilT > t while phase === 6), advance existing bubbles
  // by their velocity, fade them out near end-of-life, cull at removeAtT
  function updateSwearBubbles(t, dt) {
    // spawn cadence -- only while the transition is up
    if (state.phase === 6 && t < state.transitionUntilT &&
        t - state.lastSwearSpawnT >= PHASE_6_SWEAR_INTERVAL_MS) {
      spawnSwearBubble(t);
      state.lastSwearSpawnT = t;
    }
    if (state.activeSwearBubbles.length === 0) return;
    for (let i = state.activeSwearBubbles.length - 1; i >= 0; i--) {
      const S = state.activeSwearBubbles[i];
      S.x += S.vx * dt;
      S.y += S.vy * dt;
      S.el.style.left = S.x + 'px';
      S.el.style.top  = S.y + 'px';
      if (!S.leaving && t >= S.removeAtT - 220) {
        S.el.setAttribute('data-leaving', 'true');
        S.leaving = true;
      }
      if (t >= S.removeAtT) {
        S.el.remove();
        state.activeSwearBubbles.splice(i, 1);
      }
    }
  }

  // wipe every active swear bubble -- used on reset + phase changes
  function clearSwearBubbles() {
    for (const S of state.activeSwearBubbles) S.el.remove();
    state.activeSwearBubbles.length = 0;
    state.lastSwearSpawnT = 0;
  }

  // puddle-spray sfx -- round-robin pool so overlapping spawns in the
  // dense + climax sub-phases don't cut each other off. browsers gate
  // autoplay until the first user gesture, so the .play() promise may
  // reject silently on the very first puddle; that's fine -- the
  // player has already clicked something by phase 7a in practice
  const PUDDLE_SFX_URL  = SFX_BASE + 'puddle-spray.ogg';
  const PUDDLE_SFX_POOL = 8;
  const PUDDLE_SFX_VOL  = 0.47;
  const puddleSfxPool = [];
  let   puddleSfxIdx  = 0;
  for (let i = 0; i < PUDDLE_SFX_POOL; i++) {
    const a = _audio(PUDDLE_SFX_URL);
    a.preload = 'auto';
    a.volume  = PUDDLE_SFX_VOL;
    puddleSfxPool.push(a);
  }
  function playPuddleSpray() {
    const a = puddleSfxPool[puddleSfxIdx];
    puddleSfxIdx = (puddleSfxIdx + 1) % PUDDLE_SFX_POOL;
    try { a.currentTime = 0; } catch (_) {}
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // iron-maiden ring formation pop -- one play per ring spawn,
  // fired when the box flips from forming -> active. small pool
  // since spawns are ~1.7s apart but the clip can outlast that,
  // so two consecutive pops may overlap briefly
  const SPIKE_POP_SFX_URL  = SFX_BASE + 'spike-pop.ogg';
  const SPIKE_POP_SFX_POOL = 4;
  const SPIKE_POP_SFX_VOL  = 0.47;
  const spikePopSfxPool = [];
  let   spikePopSfxIdx  = 0;
  for (let i = 0; i < SPIKE_POP_SFX_POOL; i++) {
    const a = _audio(SPIKE_POP_SFX_URL);
    a.preload = 'auto';
    a.volume  = SPIKE_POP_SFX_VOL;
    spikePopSfxPool.push(a);
  }
  function playSpikePop() {
    const a = spikePopSfxPool[spikePopSfxIdx];
    spikePopSfxIdx = (spikePopSfxIdx + 1) % SPIKE_POP_SFX_POOL;
    try { a.currentTime = 0; } catch (_) {}
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // ---- phase 7a -- omnidirectional puddle spray + roaming towers -----
  // each puddle is a hotspot painted on the arena floor that pulses
  // for ~1.6s then erupts into the recursive bolt-tree lance from
  // phase 5a (without the portal + without the player-sprite
  // telegraph -- the puddle IS the cue). lance direction is biased
  // toward the player's position at eruption-time so dodging means
  // moving away from each hotspot before it lights
  function spawnPuddle(t) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    const arenaCy = 52 * vh;
    // random angle around arena center; gaussian-ish radius
    const ang = Math.random() * 2 * Math.PI;
    const r01 = (Math.random() + Math.random()) - 1;
    const baseR = (PHASE_7A_PUDDLE_RING_MIN_VH + PHASE_7A_PUDDLE_RING_MAX_VH) / 2;
    const spanR = (PHASE_7A_PUDDLE_RING_MAX_VH - PHASE_7A_PUDDLE_RING_MIN_VH) / 2;
    const distVh = baseR + r01 * spanR;
    let px = cx + Math.cos(ang) * distVh * vh;
    let py = arenaCy + Math.sin(ang) * distVh * vh;
    const ib = getInnerBoxPx();
    const m  = PHASE_7A_PUDDLE_RADIUS_VH * vh + 2 * vh;
    px = Math.max(ib.l + m, Math.min(ib.r - m, px));
    py = Math.max(ib.t + m, Math.min(ib.b - m, py));
    const el = document.createElement('div');
    el.className = 'shadow-puddle';
    el.style.left = px + 'px';
    el.style.top  = py + 'px';
    el.style.width  = (PHASE_7A_PUDDLE_RADIUS_VH * 2 * vh) + 'px';
    el.style.height = (PHASE_7A_PUDDLE_RADIUS_VH * vh * 1.25) + 'px';
    beamsEl.appendChild(el);
    requestAnimationFrame(() => el.setAttribute('data-on', 'true'));
    // splat sfx -- fires the instant the puddle lands on the arena.
    // the eruption later (eruptLanceFromPuddle) is a separate beat;
    // keep that one silent for now so the spray reads as one cue
    playPuddleSpray();
    state.activePuddles.push({
      el,
      x: px, y: py,
      spawnT: t,
      activateT: t + PHASE_7A_PUDDLE_ACTIVATE_MS,
      removeAtT: t + PHASE_7A_PUDDLE_ACTIVATE_MS + PHASE_7A_PUDDLE_FADE_MS,
      activated: false
    });
  }

  // erupt a lance from a puddle. reuses buildLanceTree (the same
  // recursive bolt-tree shape as phase 5a's lance) but anchored at
  // the puddle position. no telegraph + no portal; the puddle's
  // pulse already served as the cue. lance direction is biased
  // toward the player's current position so the snarl bites them
  function eruptLanceFromPuddle(x, y, t) {
    const vh = window.innerHeight / 100;
    const ph = getPlayerHitboxPx();
    const pcx = (ph.l + ph.r) / 2;
    const pcy = (ph.t + ph.b) / 2;
    // dir from puddle toward player -- the trunk grows up at the
    // player, branches snarl outward
    const dirRad = Math.atan2(pcy - y, pcx - x);
    const container = document.createElement('div');
    container.className = 'shadow-lance';
    beamsEl.appendChild(container);
    const segments = [];
    buildLanceTree(container, x, y, dirRad,
                   PHASE_5_LANCE_ROOT_LENGTH_VH * vh,
                   PHASE_5_LANCE_ROOT_WIDTH_VH  * vh,
                   PHASE_5_LANCE_BRANCH_DEPTH,
                   segments,
                   pcx, pcy);
    playLanceSkewer();
    // push lance record in the 'growing' stage -- skip telegraph
    // since the puddle was the warning. dissolveAtT + removeAtT
    // line up with PHASE_7A_PUDDLE_LANCE_DUR_MS
    state.activeLances.push({
      stage: 'growing',
      spawnT: t,
      telegraphEndT: t,
      dirRad,
      containerEl: container,
      segments,
      activeFromT: t + PHASE_5_LANCE_GROW_MS,
      dissolveAtT: t + PHASE_7A_PUDDLE_LANCE_DUR_MS - PHASE_5_LANCE_DISSOLVE_MS,
      removeAtT:   t + PHASE_7A_PUDDLE_LANCE_DUR_MS,
      telegraphReleasedT: 0,
      faded: false
    });
  }

  // per-frame: trigger eruption when puddles cross their activateT,
  // fade + cull the puddle elements after eruption
  function updatePuddles(t) {
    if (state.activePuddles.length === 0) return;
    for (let i = state.activePuddles.length - 1; i >= 0; i--) {
      const P = state.activePuddles[i];
      if (!P.activated && t >= P.activateT) {
        eruptLanceFromPuddle(P.x, P.y, t);
        P.el.setAttribute('data-erupting', 'true');
        P.activated = true;
      }
      if (t >= P.removeAtT) {
        P.el.remove();
        state.activePuddles.splice(i, 1);
      }
    }
  }

  function clearPuddles() {
    for (const P of state.activePuddles) P.el.remove();
    state.activePuddles.length = 0;
    state.nextPuddleT = 0;
  }

  // roaming tower -- spawns at one arena edge with a horizontal
  // velocity, walking straight across while firing its normal
  // teeth lifecycle. side picks left/right at random; the tower
  // walks toward the opposite edge. variant 'orbs' swaps the
  // tooth payload for a shadow-orb fan when launchTeethFromTower
  // would normally fire
  function spawnRoamingTower(t, variant) {
    const vh = window.innerHeight / 100;
    const speedPx = PHASE_7A_TOWER_SPEED_VH * vh;
    const ib = getInnerBoxPx();
    // alternate sides per spawn for visual variety
    const side = Math.random() < 0.5 ? -1 : 1;
    const anchorX = (side < 0 ? ib.l + 4 * vh : ib.r - 4 * vh);
    // y range -- avoid the player's hugging-floor zone + the
    // top edge. middle two thirds of the arena vertically
    const yMin = ib.t + 12 * vh;
    const yMax = ib.b - 18 * vh;
    const anchorY = yMin + Math.random() * (yMax - yMin);
    const velX = -side * speedPx;
    const velY = 0;
    // reuse spawnTower with opts to override the anchor + velocity
    spawnTower('roaming-' + variant, t, {
      anchorX, anchorY,
      extendDirRad: 0,         // no fixed extend dir; topdown circle
      velX, velY,
      variant,                 // 'teeth' | 'orbs' -- read by launch logic
      lifetimeMs: PHASE_7A_TOWER_LIFETIME_MS
    });
  }

  // ---- phase 7b -- shade's embrace (concurrent telescoping rings) ----
  // spawnMaidenBox pushes ONE new ring onto state.maidenBoxes. the
  // section scheduler fires this at SPAWN_INTERVAL_MS so 3-4 rings
  // are alive concurrently at consecutive scales -- the arena reads
  // as a stack of closing frames at consistent spacings. each ring
  // starts at the arena box dimensions + telescopes inward toward
  // zero; rotation + exit-side variation keep adjacent rings from
  // becoming a single repeating motion
  function spawnMaidenBox(t) {
    const vh = window.innerHeight / 100;
    const ib = getInnerBoxPx();
    const centerX = (ib.l + ib.r) / 2;
    const centerY = (ib.t + ib.b) / 2;

    // start size = the arena box. take the larger of W/H so the ring
    // reaches the arena edge on at least one axis; the other axis
    // overhangs by ~1vh, clipped by arena overflow
    const startSize    = Math.max(ib.r - ib.l, ib.b - ib.t);
    const spikeWidth   = PHASE_7B_MAIDEN_SPIKE_WIDTH_VH  * vh;
    const spikeLength  = PHASE_7B_MAIDEN_SPIKE_LENGTH_VH * vh;
    const endScale     = PHASE_7B_MAIDEN_BOX_END_SCALE;

    // alternate rotation direction + exit side across consecutive
    // spawns so adjacent nested rings don't all spin the same way
    const chainIdx     = state.maidenChainIdx || 0;
    const rotSign      = (chainIdx % 2 === 0) ? 1 : -1;
    const rotRateRadPerSec = PHASE_7B_MAIDEN_BOX_ROT_RAD_PER_S * rotSign;
    const startRotRad      = Math.random() * Math.PI * 2;
    // pick exitSide off the previous one so two adjacent rings
    // never share the same exit side (forces player to reposition)
    const prevExit = state.lastMaidenExitSide;
    let exitSide   = Math.floor(Math.random() * 4);
    if (prevExit != null && exitSide === prevExit) {
      exitSide = (exitSide + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    // gap centred on each edge with slight random jitter
    const exitCenterFrac = 0.5 + (Math.random() - 0.5) * 0.18;
    const exitFrac       = PHASE_7B_MAIDEN_BOX_EXIT_FRAC;
    const exitStartFrac  = exitCenterFrac - exitFrac / 2;
    const exitEndFrac    = exitCenterFrac + exitFrac / 2;

    // container -- positioned with its centre at (centerX, centerY)
    // so rotate + scale pivot on the arena centre. width/height set
    // here are the UN-scaled size; live transform scales them
    const el = document.createElement('div');
    el.className = 'maiden-box';
    el.style.left   = (centerX - startSize / 2) + 'px';
    el.style.top    = (centerY - startSize / 2) + 'px';
    el.style.width  = startSize + 'px';
    el.style.height = startSize + 'px';
    el.style.transform = 'rotate(' + startRotRad + 'rad) scale(1)';
    // start in 'forming' stage -- container at opacity 0, spikes at
    // scale 0 anchored to the wall. js promotes to 'active' after a
    // forced reflow, which fires the scale-out + fade-in transitions
    el.setAttribute('data-stage', 'forming');

    // shadow trails -- one per wall, projecting inward via gradient.
    // appended FIRST so spikes render on top in dom order
    for (const trailSide of ['top', 'right', 'bottom', 'left']) {
      const trail = document.createElement('div');
      trail.className = 'maiden-box__trail maiden-box__trail--' + trailSide;
      el.appendChild(trail);
    }

    // slot layout per edge. continuous coverage -- adjacent spikes
    // touch -- so the safe interior reads as a clean inset rectangle
    const slotsPerEdge = Math.max(8, Math.floor(startSize / spikeWidth));
    const slotPitch    = startSize / slotsPerEdge;
    const exitStartSlot = Math.floor(exitStartFrac * slotsPerEdge);
    const exitEndSlot   = Math.ceil (exitEndFrac   * slotsPerEdge);

    const spikeEls = [];
    // perimeter-sweep stagger -- delay each spike's formation by
    // its position around the box, plus a touch of jitter so the
    // sweep doesn't read as metronomic
    let perimIdx = 0;
    // edges: 0=top, 1=right, 2=bottom, 3=left
    for (let edge = 0; edge < 4; edge++) {
      const isExitEdge = (edge === exitSide);
      const sideClass = (edge === 0 ? 'top' : edge === 1 ? 'right' : edge === 2 ? 'bottom' : 'left');
      for (let slot = 0; slot < slotsPerEdge; slot++) {
        if (isExitEdge && slot >= exitStartSlot && slot < exitEndSlot) continue;
        const slotCenter = (slot + 0.5) * slotPitch;
        const spike = document.createElement('div');
        spike.className = 'maiden-box__spike maiden-box__spike--' + sideClass;
        spike.style.transitionDelay = (perimIdx * 5 + Math.random() * 18) + 'ms';
        perimIdx++;
        let lPx, tPx, wPx, hPx;
        if (edge === 0) {
          lPx = slotCenter - spikeWidth / 2;  tPx = 0;
          wPx = spikeWidth;                   hPx = spikeLength;
        } else if (edge === 1) {
          lPx = startSize - spikeLength;      tPx = slotCenter - spikeWidth / 2;
          wPx = spikeLength;                  hPx = spikeWidth;
        } else if (edge === 2) {
          lPx = slotCenter - spikeWidth / 2;  tPx = startSize - spikeLength;
          wPx = spikeWidth;                   hPx = spikeLength;
        } else {
          lPx = 0;                            tPx = slotCenter - spikeWidth / 2;
          wPx = spikeLength;                  hPx = spikeWidth;
        }
        spike.style.left   = lPx + 'px';
        spike.style.top    = tPx + 'px';
        spike.style.width  = wPx + 'px';
        spike.style.height = hPx + 'px';
        el.appendChild(spike);
        spikeEls.push(spike);

        // per-spike wake -- a flat triangular afterimage of the spike
        // pinned in the same lane (same x + width as the spike) and
        // extending outward past the container bounds. wide base
        // sits on the spike's wall edge so the wake reads as a
        // direct continuation of the blade silhouette, tapering +
        // fading to a tip at the outer end
        const wake = document.createElement('div');
        wake.className = 'maiden-box__trail-spike maiden-box__trail-spike--' + sideClass;
        const wakeLen = startSize * 0.22;
        let wL, wT, wW, wH;
        if (edge === 0) {        // top -- extends UP past the container
          wL = lPx;              wT = -wakeLen;
          wW = spikeWidth;       wH = wakeLen;
        } else if (edge === 1) { // right -- extends RIGHT past the container
          wL = startSize;        wT = tPx;
          wW = wakeLen;          wH = spikeWidth;
        } else if (edge === 2) { // bottom -- extends DOWN past the container
          wL = lPx;              wT = startSize;
          wW = spikeWidth;       wH = wakeLen;
        } else {                  // left -- extends LEFT past the container
          wL = -wakeLen;         wT = tPx;
          wW = wakeLen;          wH = spikeWidth;
        }
        wake.style.left   = wL + 'px';
        wake.style.top    = wT + 'px';
        wake.style.width  = wW + 'px';
        wake.style.height = wH + 'px';
        el.appendChild(wake);
      }
    }

    // exit marker -- a thin glow along the missing slot range to
    // help the player read the gap when the box is at a wonky
    // rotation. lives on the same edge as the gap, perpendicular
    // size matches a spike's perpendicular extent so it lines up
    const exitEl = document.createElement('div');
    exitEl.className = 'maiden-box__exit';
    const gapPxStart = exitStartSlot * slotPitch;
    const gapPxEnd   = exitEndSlot   * slotPitch;
    const gapLenPx   = gapPxEnd - gapPxStart;
    if (exitSide === 0) {
      exitEl.style.left = gapPxStart + 'px';
      exitEl.style.top  = '0px';
      exitEl.style.width  = gapLenPx + 'px';
      exitEl.style.height = (spikeLength * 0.6) + 'px';
    } else if (exitSide === 1) {
      exitEl.style.left = (startSize - spikeLength * 0.6) + 'px';
      exitEl.style.top  = gapPxStart + 'px';
      exitEl.style.width  = (spikeLength * 0.6) + 'px';
      exitEl.style.height = gapLenPx + 'px';
    } else if (exitSide === 2) {
      exitEl.style.left = gapPxStart + 'px';
      exitEl.style.top  = (startSize - spikeLength * 0.6) + 'px';
      exitEl.style.width  = gapLenPx + 'px';
      exitEl.style.height = (spikeLength * 0.6) + 'px';
    } else {
      exitEl.style.left = '0px';
      exitEl.style.top  = gapPxStart + 'px';
      exitEl.style.width  = (spikeLength * 0.6) + 'px';
      exitEl.style.height = gapLenPx + 'px';
    }
    el.appendChild(exitEl);

    beamsEl.appendChild(el);
    // commit the 'forming' state into layout so the upcoming class
    // change fires real transitions (without a reflow read the
    // browser collapses both states into one paint, no animation)
    void el.offsetWidth;
    el.setAttribute('data-stage', 'active');
    // pop sound -- fires right as the spike scaleY/X transitions
    // kick off, so the audio + the visible pop land together
    playSpikePop();

    state.maidenBoxes.push({
      el, spikeEls, exitEl,
      spawnT: t,
      centerX, centerY,
      startSize, endScale,
      shrinkDurMs: PHASE_7B_MAIDEN_BOX_SHRINK_MS,
      startRotRad, rotRateRadPerSec,
      spikeWidth, spikeLength,
      exitSide, exitStartFrac, exitEndFrac,
      currentScale: 1,
      currentRotRad: startRotRad,
      collapsed: false,
      collapseT: 0
    });
    state.lastMaidenExitSide = exitSide;
    state.maidenChainIdx = chainIdx + 1;
  }

  // per-frame -- walk every active ring through its transform +
  // collision pass. damage uses takeDamage's immunity gate so two
  // overlapping ring strips on one frame still cost only one hit.
  // no explicit escape event -- the chain is implicit: each ring's
  // spike strip sweeps past the player exactly once during shrink;
  // line up with the gap and the strip misses
  function updateMaidenBox(t, dt) {
    const boxes = state.maidenBoxes;
    if (!boxes.length) return;
    const p = getPlayerHitboxPx();
    const pcx = (p.l + p.r) / 2;
    const pcy = (p.t + p.b) / 2;
    const immune = t < state.immuneUntilT;
    let damagedThisFrame = false;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];

      // collapsing -- transform frozen + container faded; remove
      // once the fade completes so the dom stays bounded
      if (box.collapsed) {
        if (t - box.collapseT >= PHASE_7B_MAIDEN_BOX_COLLAPSE_MS) {
          box.el.remove();
          boxes.splice(i, 1);
        }
        continue;
      }

      const elapsed = t - box.spawnT;
      const k = Math.min(1, elapsed / box.shrinkDurMs);
      // LINEAR shrink so consecutive rings stay evenly spaced; with
      // an ease the older rings would warp away from the spacing
      // grid set by the spawn interval
      const currentScale  = lerp(1, box.endScale, k);
      const currentRotRad = box.startRotRad + (elapsed / 1000) * box.rotRateRadPerSec;
      box.currentScale  = currentScale;
      box.currentRotRad = currentRotRad;
      box.el.style.transform = 'rotate(' + currentRotRad + 'rad) scale(' + currentScale + ')';

      if (k >= 1) {
        // shrunk past endScale -- just vanish. no damage here; the
        // spike strip already swept past at full size
        box.collapsed = true;
        box.collapseT = t;
        box.el.setAttribute('data-stage', 'collapsing');
        continue;
      }

      // box-local coords -- needed by BOTH the damage check and the
      // escape check, so compute unconditionally
      const relX = pcx - box.centerX;
      const relY = pcy - box.centerY;
      const cos  = Math.cos(-currentRotRad);
      const sin  = Math.sin(-currentRotRad);
      const lx   = relX * cos - relY * sin;
      const ly   = relX * sin + relY * cos;

      const halfPx      = (box.startSize / 2) * currentScale;
      const spikeLenS   = box.spikeLength      * currentScale;
      const gapMinLocal = (box.exitStartFrac - 0.5) * box.startSize * currentScale;
      const gapMaxLocal = (box.exitEndFrac   - 0.5) * box.startSize * currentScale;

      // escape -- player has crossed past the exit edge through the
      // gap range. dismiss THIS ring (others keep closing). runs
      // before damage check so a brushing-through escape doesn't
      // also count as a hit
      let escaped = false;
      if (box.exitSide === 0 && ly < -halfPx && lx >= gapMinLocal && lx <= gapMaxLocal) escaped = true;
      if (box.exitSide === 1 && lx >  halfPx && ly >= gapMinLocal && ly <= gapMaxLocal) escaped = true;
      if (box.exitSide === 2 && ly >  halfPx && lx >= gapMinLocal && lx <= gapMaxLocal) escaped = true;
      if (box.exitSide === 3 && lx < -halfPx && ly >= gapMinLocal && ly <= gapMaxLocal) escaped = true;
      if (escaped) {
        box.collapsed = true;
        box.collapseT = t;
        box.el.setAttribute('data-stage', 'collapsing');
        continue;
      }

      // skip collision once we've already damaged this frame
      if (damagedThisFrame || immune || !state.orbDamage || state.hits <= 0) continue;

      let inSpikeStrip = false;
      if (ly > -halfPx && ly < -halfPx + spikeLenS && lx > -halfPx && lx < halfPx) {
        const isExit = (box.exitSide === 0 && lx >= gapMinLocal && lx <= gapMaxLocal);
        if (!isExit) inSpikeStrip = true;
      }
      if (ly < halfPx && ly > halfPx - spikeLenS && lx > -halfPx && lx < halfPx) {
        const isExit = (box.exitSide === 2 && lx >= gapMinLocal && lx <= gapMaxLocal);
        if (!isExit) inSpikeStrip = true;
      }
      if (lx > -halfPx && lx < -halfPx + spikeLenS && ly > -halfPx && ly < halfPx) {
        const isExit = (box.exitSide === 3 && ly >= gapMinLocal && ly <= gapMaxLocal);
        if (!isExit) inSpikeStrip = true;
      }
      if (lx < halfPx && lx > halfPx - spikeLenS && ly > -halfPx && ly < halfPx) {
        const isExit = (box.exitSide === 1 && ly >= gapMinLocal && ly <= gapMaxLocal);
        if (!isExit) inSpikeStrip = true;
      }
      if (inSpikeStrip) {
        takeDamage(t);
        damagedThisFrame = true;
      }
    }
  }

  function clearMaidenBox() {
    for (const box of state.maidenBoxes) box.el.remove();
    state.maidenBoxes.length  = 0;
    state.nextMaidenBoxT      = 0;
    state.maidenChainIdx      = 0;
    state.lastMaidenExitSide  = null;
  }

  // ---- phase 7b -- deaththroes (snake-curve) -------------------------
  // each snake is a head + a list of trail SEGMENTS. moves the head
  // forward by speed * dt; the current segment's div extends to track
  // the head. periodically the snake decides to turn 90 degrees (with
  // a bias toward the player's direction). dies when the head crosses
  // any segment of any snake (own or another). periodically splits
  // into a child snake at the head with a perpendicular direction
  // grid setup -- covers the inner box with 12x12 cells. each cell
  // stores a trail-density count so direction picking can prefer
  // the least-filled neighbor (the lawn-mower / hilbert behaviour)
  function initSnakeGrid() {
    const ib = getInnerBoxPx();
    const N = PHASE_7B_SNAKE_GRID_CELLS;
    const cellW = (ib.r - ib.l) / N;
    const cellH = (ib.b - ib.t) / N;
    state.snakeGridCfg = {
      cols: N, rows: N,
      cellW, cellH,
      originX: ib.l, originY: ib.t,
      // trail thickness = max cell dimension so the segment's
      // perpendicular extent covers the cell in both axes. closes the
      // border gap (the leftmost cell's trail reaches to the box edge
      // instead of stopping cellW/2 short)
      thickness: Math.max(cellW, cellH)
    };
    state.snakeGrid = new Int16Array(N * N);
  }
  function snakeCellAt(x, y) {
    const cfg = state.snakeGridCfg;
    if (!cfg) return null;
    return {
      gx: Math.floor((x - cfg.originX) / cfg.cellW),
      gy: Math.floor((y - cfg.originY) / cfg.cellH)
    };
  }
  // out-of-bounds returns a sentinel high value so direction picking
  // never chooses to leave the box
  function snakeFillness(gx, gy) {
    const cfg = state.snakeGridCfg;
    if (!cfg) return 100;
    if (gx < 0 || gx >= cfg.cols || gy < 0 || gy >= cfg.rows) return 100;
    return state.snakeGrid[gy * cfg.cols + gx];
  }
  function snakeIncrement(gx, gy) {
    const cfg = state.snakeGridCfg;
    if (!cfg) return;
    if (gx < 0 || gx >= cfg.cols || gy < 0 || gy >= cfg.rows) return;
    state.snakeGrid[gy * cfg.cols + gx]++;
  }
  // pick the best next direction at a cell boundary. candidates =
  // forward + perpendicular-left + perpendicular-right (no u-turn).
  // less-filled neighbor wins; forward gets a small bonus so the
  // snake commits to a lane rather than dithering on ties
  function chooseSnakeDirection(snake) {
    const dirs = [
      snake.dirRad,                  // forward
      snake.dirRad + Math.PI / 2,
      snake.dirRad - Math.PI / 2
    ];
    let bestDir = snake.dirRad;
    let bestScore = -Infinity;
    for (let i = 0; i < dirs.length; i++) {
      const d = dirs[i];
      const dx = Math.round(Math.cos(d));
      const dy = Math.round(Math.sin(d));
      const ngx = snake.gx + dx;
      const ngy = snake.gy + dy;
      const fill = snakeFillness(ngx, ngy);
      const score = -fill + (i === 0 ? PHASE_7B_SNAKE_FORWARD_BONUS : 0);
      if (score > bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }
    return bestDir;
  }
  function spawnSnake(t, originX, originY, dirRad) {
    if (!state.snakeGridCfg) initSnakeGrid();
    const cell = snakeCellAt(originX, originY) || { gx: 0, gy: 0 };
    const snake = {
      headX: originX,
      headY: originY,
      dirRad,
      gx: cell.gx, gy: cell.gy,
      speed: PHASE_7B_SNAKE_SPEED_VH * (window.innerHeight / 100),
      // immortal -- the self-kill mechanic was removed so the
      // arena actually fills. alive flag kept on the record in
      // case future tuning wants it back
      alive: true,
      segments: [],
      lastT: t
    };
    startSnakeSegment(snake, originX, originY);
    snakeIncrement(snake.gx, snake.gy);
    state.activeSnakes.push(snake);
    playSnakeSpawn();
    return snake;
  }

  // start a new trail segment from (x, y) in the snake's current
  // direction. div is appended with width=0 + transform set; the
  // updater extends width as the head walks
  function startSnakeSegment(snake, x, y) {
    const vh = window.innerHeight / 100;
    // thickness from the grid cfg -- max(cellW, cellH) so the trail
    // fully fills the cells it passes through (no border gap left
    // for the player to hide in)
    const cfg = state.snakeGridCfg;
    const thickness = cfg ? cfg.thickness
                          : PHASE_7B_SNAKE_THICKNESS_VH * vh;
    const el = document.createElement('div');
    el.className = 'snake-segment';
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.width  = '0px';
    el.style.height = thickness + 'px';
    el.style.marginTop = (-thickness / 2) + 'px';
    const cssDeg = snake.dirRad * 180 / Math.PI;
    el.style.transform = 'rotate(' + cssDeg + 'deg)';
    beamsEl.appendChild(el);
    snake.segments.push({
      el,
      x1: x, y1: y,
      x2: x, y2: y,   // tip end -- updated each frame
      thickness,
      dirRad: snake.dirRad
    });
  }

  // per-frame: walk every alive snake forward, extend its current
  // segment, decide to turn / split when timers cross. run collision
  // for head-vs-any-segment + player-vs-any-segment
  function updateSnakes(t) {
    if (state.activeSnakes.length === 0) return;
    const vh = window.innerHeight / 100;
    const ib = getInnerBoxPx();
    const ph = getPlayerHitboxPx();
    const pcx = (ph.l + ph.r) / 2;
    const pcy = (ph.t + ph.b) / 2;
    const immune = t < state.immuneUntilT;
    // first pass -- walk each alive head forward + update current segment.
    // turns are GRID-ALIGNED: a turn decision happens only when the head
    // crosses into a new cell, picking the least-filled neighbor (forward
    // / perpendicular). emergent pattern reads as a hilbert / lawn-mower
    // fill of the arena
    for (const snake of state.activeSnakes) {
      if (!snake.alive) continue;
      const dt = Math.max(0, Math.min(0.064, (t - snake.lastT) / 1000));
      snake.lastT = t;
      snake.headX += Math.cos(snake.dirRad) * snake.speed * dt;
      snake.headY += Math.sin(snake.dirRad) * snake.speed * dt;
      // extend current segment to track new head
      const seg = snake.segments[snake.segments.length - 1];
      seg.x2 = snake.headX;
      seg.y2 = snake.headY;
      seg.el.style.width = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) + 'px';
      // grid cell crossing -- if the head moved into a new cell, mark
      // it + decide whether to turn. clamp the head back if the new
      // cell is out of bounds (forces a turn into the box)
      const cell = snakeCellAt(snake.headX, snake.headY);
      if (cell && (cell.gx !== snake.gx || cell.gy !== snake.gy)) {
        const cfg = state.snakeGridCfg;
        const outOfBox = cell.gx < 0 || cell.gx >= cfg.cols ||
                         cell.gy < 0 || cell.gy >= cfg.rows;
        if (outOfBox) {
          // pull the head back into the previous cell so the segment
          // doesn't render outside the box, then force a turn
          snake.headX -= Math.cos(snake.dirRad) * snake.speed * dt;
          snake.headY -= Math.sin(snake.dirRad) * snake.speed * dt;
          seg.x2 = snake.headX;
          seg.y2 = snake.headY;
          seg.el.style.width = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) + 'px';
          // try a perpendicular direction -- the chooser will avoid
          // out-of-bounds via the fillness sentinel. same cell-center
          // snap as the normal turn path so the edge rows/cols get
          // full coverage when forced-turning along a wall
          const tentativeDir = chooseSnakeDirection(snake);
          if (tentativeDir !== snake.dirRad) {
            snake.dirRad = tentativeDir;
            const cfg = state.snakeGridCfg;
            if (Math.abs(Math.cos(tentativeDir)) > 0.5) {
              snake.headY = cfg.originY + (snake.gy + 0.5) * cfg.cellH;
            } else {
              snake.headX = cfg.originX + (snake.gx + 0.5) * cfg.cellW;
            }
            startSnakeSegment(snake, snake.headX, snake.headY);
          }
        } else {
          // new cell inside the box -- record entry + mark density
          snake.gx = cell.gx;
          snake.gy = cell.gy;
          snakeIncrement(snake.gx, snake.gy);
          // decide next direction; if it differs from current, SNAP
          // the head onto the current cell's center axis perpendicular
          // to the NEW direction. without the snap, the trail sits on
          // the cell boundary, leaving the outer half of each row/col
          // uncovered -- the corner gap the player was hiding in
          const nextDir = chooseSnakeDirection(snake);
          if (nextDir !== snake.dirRad) {
            snake.dirRad = nextDir;
            const cfg = state.snakeGridCfg;
            if (Math.abs(Math.cos(nextDir)) > 0.5) {
              snake.headY = cfg.originY + (snake.gy + 0.5) * cfg.cellH;
            } else {
              snake.headX = cfg.originX + (snake.gx + 0.5) * cfg.cellW;
            }
            startSnakeSegment(snake, snake.headX, snake.headY);
          }
        }
      }
    }
    // (snakes are IMMORTAL by design -- no head-vs-segment kill loop.
    // they keep walking + filling forever. the avoidance policy in
    // chooseSnakeDirection naturally steers them toward unfilled cells.
    // when the grid saturates they walk over already-laid trails,
    // increasing density but no longer expanding the visible danger)
    // player-vs-segment damage (every snake is alive, every segment is hot)
    if (state.orbDamage && !immune && state.hits > 0) {
      for (const snake of state.activeSnakes) {
        let hit = false;
        for (const seg of snake.segments) {
          if (pointNearSegment(pcx, pcy,
                               seg.x1, seg.y1, seg.x2, seg.y2,
                               seg.thickness / 2 + 0.6 * vh)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          takeDamage(t);
          break;
        }
      }
    }
    // continuous trickle -- after the initial 4 prongs, one extra
    // prong spawns from the boss every TRICKLE_MS in a random
    // cardinal. caps at MAX_COUNT so the late-section additions
    // close the last unfilled corridors right around the 24s mark
    // without saturating early
    if (state.phase3Mode === 'snake-curve' &&
        state.activeSnakes.length < PHASE_7B_SNAKE_MAX_COUNT &&
        t >= state.nextSnakeTrickleT) {
      const bc = bossCenterPx();
      const d = PHASE_7B_SNAKE_PRONG_DIRS[
        Math.floor(Math.random() * PHASE_7B_SNAKE_PRONG_DIRS.length)];
      spawnSnake(t, bc.x, bc.y, d);
      state.nextSnakeTrickleT = t + PHASE_7B_SNAKE_TRICKLE_MS;
    }
  }

  // perpendicular distance from point (px, py) to segment (x1,y1)-(x2,y2)
  // returns true if the distance is within tol px
  function pointNearSegment(px, py, x1, y1, x2, y2, tol) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-3) {
      const ex = px - x1, ey = py - y1;
      return Math.hypot(ex, ey) < tol;
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy) < tol;
  }

  function clearSnakes() {
    for (const snake of state.activeSnakes) {
      for (const seg of snake.segments) seg.el.remove();
    }
    state.activeSnakes.length = 0;
    state.snakeGrid          = null;
    state.snakeGridCfg       = null;
    state.nextSnakeTrickleT  = 0;
  }

  // spirit-bomb wipe -- pulls every segment + nulls the grid so the
  // field reads as cleared, then immediately spawns the 4 cardinal
  // prongs from the boss again. trickle clock resets so the steady
  // continuous-spawn picks back up on its normal cadence. only does
  // anything during phase 8's snake-curve section -- a no-op elsewhere
  function wipeSnakesForBomb(t) {
    if (state.activeSnakes.length === 0 && !state.snakeGridCfg) return;
    clearSnakes();
    if (state.phase === 8 && state.phase3Mode === 'snake-curve') {
      const bc = bossCenterPx();
      for (const d of PHASE_7B_SNAKE_PRONG_DIRS) {
        spawnSnake(t, bc.x, bc.y, d);
      }
      state.nextSnakeTrickleT = t + PHASE_7B_SNAKE_TRICKLE_MS;
    }
  }

  // ---- phase 6 -- splitting-beam cross --------------------------------
  // spawn one splitting cross at a random target inside the box. each
  // cross goes telegraph -> fire -> recursive split -> hold -> fade.
  // collision lives on each spawned segment (tilted rect, same math as
  // the lance segments). the cross's + glyph stays visible at the
  // center as the trees fork outward from it, marking the source
  function spawnSplitCross(t) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    const arenaCy = 52 * vh; // box vertical center
    // boss center is where the cross is TOSSED from -- matches the
    // phase-3 + projectile flow visually
    const bc = bossCenterPx();
    const startX = bc.x;
    const startY = bc.y;
    // random target on a ring around arena center, clamped inside
    const ang = Math.random() * 2 * Math.PI;
    const rVh = PHASE_6_SPLIT_TARGET_R_MIN_VH +
                Math.random() * (PHASE_6_SPLIT_TARGET_R_MAX_VH - PHASE_6_SPLIT_TARGET_R_MIN_VH);
    let tx = cx + Math.cos(ang) * rVh * vh;
    let ty = arenaCy + Math.sin(ang) * rVh * vh;
    const ib = getInnerBoxPx();
    const m = 6 * vh;
    tx = Math.max(ib.l + m, Math.min(ib.r - m, tx));
    ty = Math.max(ib.t + m, Math.min(ib.b - m, ty));
    const lockedRotation = Math.random() * Math.PI / 2;

    // + glyph at the BOSS position to start (it flies to target).
    // updateSplitCrosses lerps left/top each frame during the flying
    // stage, then locks at target + spawns the preview cross
    const sz = 2.6 * vh;
    const el = document.createElement('div');
    el.className = 'spinning-plus';
    el.style.width  = sz + 'px';
    el.style.height = sz + 'px';
    el.style.left   = startX + 'px';
    el.style.top    = startY + 'px';
    el.style.transform = 'translate(-50%, -50%)';
    const hBar = document.createElement('div');
    hBar.className = 'spinning-plus__bar spinning-plus__bar--h';
    const vBar = document.createElement('div');
    vBar.className = 'spinning-plus__bar spinning-plus__bar--v';
    el.appendChild(hBar);
    el.appendChild(vBar);
    beamsEl.appendChild(el);

    // schedule lifecycle. settleT = + arrives at target + locks.
    // fireT = preview ends + root beams ignite. each depth ignites
    // GROW_MS + HOLD_MS later so the tree builds outward in waves
    const settleT    = t + PHASE_6_SPLIT_SETTLE_MS;
    const fireT      = settleT + PHASE_6_SPLIT_PREVIEW_MS;
    const splitStep  = PHASE_6_SPLIT_GROW_MS + PHASE_6_SPLIT_HOLD_MS;
    const lastBornT  = fireT + PHASE_6_SPLIT_DEPTH * splitStep;
    const fadeAtT    = lastBornT + PHASE_6_SPLIT_GROW_MS + PHASE_6_SPLIT_HOLD_MS;
    const removeAtT  = fadeAtT + PHASE_6_SPLIT_FADE_MS + 60;

    state.activeSplitCrosses.push({
      el,
      previewEl: null,       // created when stage transitions to 'preview'
      startX, startY,        // boss position at spawn (flight start)
      tx, ty, lockedRotation,
      spawnT: t,
      settleT,
      fireT,
      stage: 'flying',
      segments: [],
      fadeAtT,
      removeAtT,
      faded: false,
      // highest depth that has triggered the branch sfx. starts at -1
      // so the first split (depth 0 -> children at depth 1) fires once.
      // subsequent siblings at the same parent-depth are gated out
      branchSfxMaxDepth: -1
    });
    // umise_075 -- toss-time cue. single call site covers both phase 3
    // split-cross-volley and phase 6 climax dispatch since both funnel
    // through here
    playSplitCross();
  }

  // build one beam segment element at (originX,originY) growing in
  // dirRad. returns the segment record (pushed into the cross's
  // segments array). collision uses originX/Y/dirRad/length/width
  function makeSplitBeamSegment(originX, originY, dirRad, depth, t) {
    const vh = window.innerHeight / 100;
    const len = PHASE_6_SPLIT_LENGTH_VH[depth] * vh;
    const wid = PHASE_6_SPLIT_WIDTH_VH * vh;
    const el = document.createElement('div');
    el.className = 'split-beam';
    el.style.left   = originX + 'px';
    el.style.top    = originY + 'px';
    el.style.width  = wid + 'px';
    el.style.height = len + 'px';
    el.style.marginLeft = (-wid / 2) + 'px';
    // local "up" of the rect = dirRad direction. css rotate 0 = up
    const cssDeg = (dirRad * 180 / Math.PI) + 90;
    const initT  = 'translate(-50%, -100%) rotate(' + cssDeg + 'deg) scaleY(0)';
    const grownT = 'translate(-50%, -100%) rotate(' + cssDeg + 'deg) scaleY(1)';
    el.style.transform = initT;
    beamsEl.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = grownT;
    });
    return {
      el,
      originX, originY, dirRad,
      length: len, width: wid,
      depth,
      bornT: t,
      grownT: t + PHASE_6_SPLIT_GROW_MS,
      // each segment becomes hittable after grow and stops being
      // hittable when the cross enters its fade window
      activeFromT: t + PHASE_6_SPLIT_GROW_MS,
      // tip position (where the next-gen children sprout from)
      tipX: originX + Math.cos(dirRad) * len,
      tipY: originY + Math.sin(dirRad) * len,
      hasSplit: false
    };
  }

  // per-frame tick for every active split cross. drives stage
  // transitions (preview -> firing -> done), spawns root beams +
  // recursive children at the right times, runs collision, fades
  // + culls
  function updateSplitCrosses(t) {
    if (state.activeSplitCrosses.length === 0) return;
    const p = getPlayerHitboxPx();
    const pcx = (p.l + p.r) / 2;
    const pcy = (p.t + p.b) / 2;
    const immune = t < state.immuneUntilT;
    const splitStep = PHASE_6_SPLIT_GROW_MS + PHASE_6_SPLIT_HOLD_MS;
    const vh = window.innerHeight / 100;
    for (let i = state.activeSplitCrosses.length - 1; i >= 0; i--) {
      const C = state.activeSplitCrosses[i];

      // flying -> preview: + flies from boss center to target via
      // easeOutCubic with a continuous spin. on arrival the + locks
      // at the target rotation + the preview cross spawns
      if (C.stage === 'flying') {
        const age = t - C.spawnT;
        const k = Math.min(1, age / PHASE_6_SPLIT_SETTLE_MS);
        const e = easeOutCubic(k);
        const x = lerp(C.startX, C.tx, e);
        const y = lerp(C.startY, C.ty, e);
        C.el.style.left = x + 'px';
        C.el.style.top  = y + 'px';
        if (t < C.settleT) {
          const spinDeg = (age / 1000) * PHASE_6_SPLIT_SPIN_DPS;
          C.el.style.transform = 'translate(-50%, -50%) rotate(' + spinDeg + 'deg)';
        } else {
          // settled -- lock at target + locked rotation
          const deg = C.lockedRotation * 180 / Math.PI;
          C.el.style.left = C.tx + 'px';
          C.el.style.top  = C.ty + 'px';
          C.el.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
          // spawn the preview cross at the target
          const previewLen = PHASE_6_SPLIT_LENGTH_VH[0] * vh * 2;
          const previewEl = document.createElement('div');
          previewEl.className = 'split-preview';
          previewEl.style.left   = C.tx + 'px';
          previewEl.style.top    = C.ty + 'px';
          previewEl.style.width  = previewLen + 'px';
          previewEl.style.height = previewLen + 'px';
          previewEl.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
          const pBarH = document.createElement('div');
          pBarH.className = 'split-preview__bar split-preview__bar--h';
          pBarH.style.height = (PHASE_6_SPLIT_WIDTH_VH * vh) + 'px';
          const pBarV = document.createElement('div');
          pBarV.className = 'split-preview__bar split-preview__bar--v';
          pBarV.style.width = (PHASE_6_SPLIT_WIDTH_VH * vh) + 'px';
          previewEl.appendChild(pBarH);
          previewEl.appendChild(pBarV);
          beamsEl.appendChild(previewEl);
          requestAnimationFrame(() => previewEl.setAttribute('data-on', 'true'));
          C.previewEl = previewEl;
          C.stage = 'preview';
        }
        continue; // skip the rest until next frame
      }

      // preview -> firing: spawn the 4 root beams at fireT
      if (C.stage === 'preview' && t >= C.fireT) {
        if (C.previewEl) { C.previewEl.remove(); C.previewEl = null; }
        const cardinals = [0, 90, 180, 270];
        for (const baseDeg of cardinals) {
          const dirRad = (baseDeg * Math.PI / 180) + C.lockedRotation;
          const seg = makeSplitBeamSegment(C.tx, C.ty, dirRad, 0, t);
          C.segments.push(seg);
        }
        C.stage = 'firing';
        // umise_074 -- one activation cue per cross (not per root
        // segment). depth-1/2/3 branch cues will layer on top when
        // those audio files arrive
        playSplitActivate();
      }

      // for each segment that has grown but not yet split, if it's
      // not at terminal depth + enough time has passed, spawn its
      // children at the tip
      if (C.stage === 'firing' && !C.faded) {
        for (let s = 0; s < C.segments.length; s++) {
          const seg = C.segments[s];
          if (!seg.hasSplit && seg.depth < PHASE_6_SPLIT_DEPTH &&
              t >= seg.grownT + PHASE_6_SPLIT_HOLD_MS) {
            const halfAng = PHASE_6_SPLIT_ANGLE_DEG[seg.depth] * Math.PI / 180;
            for (const sign of [-1, +1]) {
              const childDir = seg.dirRad + sign * halfAng;
              const child = makeSplitBeamSegment(seg.tipX, seg.tipY, childDir, seg.depth + 1, t);
              C.segments.push(child);
            }
            seg.hasSplit = true;
            // umise_073 -- one cue per tier per cross. siblings sharing
            // a depth share a single play; sequential depths fire as a
            // cadence (depth 0->1, 1->2, 2->3)
            const newDepth = seg.depth + 1;
            if (newDepth > C.branchSfxMaxDepth) {
              C.branchSfxMaxDepth = newDepth;
              playSplitBranch();
            }
          }
        }
      }

      // collision -- every grown, non-faded segment is hittable
      if (state.orbDamage && !immune && state.hits > 0 && !C.faded) {
        for (const seg of C.segments) {
          if (t < seg.activeFromT) continue;
          const dirX = Math.cos(seg.dirRad);
          const dirY = Math.sin(seg.dirRad);
          const perpX = -dirY;
          const perpY =  dirX;
          const dx = pcx - seg.originX;
          const dy = pcy - seg.originY;
          const along  = dx * dirX  + dy * dirY;
          const across = dx * perpX + dy * perpY;
          if (along >= 0 && along <= seg.length && Math.abs(across) < seg.width / 2) {
            takeDamage(t);
            break;
          }
        }
      }

      // fade phase -- all segments fade together at fadeAtT
      if (!C.faded && t >= C.fadeAtT) {
        for (const seg of C.segments) seg.el.setAttribute('data-fading', 'true');
        if (C.el) C.el.style.transition = 'opacity 360ms ease-out';
        if (C.el) C.el.style.opacity = '0';
        C.faded = true;
      }

      // remove -- pull all segments + the + glyph
      if (t >= C.removeAtT) {
        for (const seg of C.segments) seg.el.remove();
        if (C.el) C.el.remove();
        if (C.previewEl) C.previewEl.remove();
        state.activeSplitCrosses.splice(i, 1);
      }
    }
  }

  function clearSplitCrosses() {
    for (const C of state.activeSplitCrosses) {
      for (const seg of C.segments) seg.el.remove();
      if (C.el) C.el.remove();
      if (C.previewEl) C.previewEl.remove();
    }
    state.activeSplitCrosses.length = 0;
    state.nextSplitCrossT  = 0;
    state.nextCursorVolleyT = 0;
    state.climaxNextSplitT = 0;
  }

  // phase 6 entry visual -- counterpart to firePortalExit. opens a
  // shadow portal at the boss's home position, fades the boss back in
  // from hidden, closes the portal. boss has been gone since 2:46;
  // this is the formal return at 3:56. transitionUntilT spans the
  // whole 6s dialogue-transition window so dispatch stays paused
  // while the portal-entry + swear-shower play
  function firePortalEntry(t) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    // teleport boss to the home position before the fade-in begins
    // (it was hidden + likely off-center after phase 3's climax)
    const home = BOSS_PHASE_TARGETS_VH[6];
    state.bossX = (home ? home.x : 0) * vh;
    state.bossY = (home ? home.y : 0) * vh;
    bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
    bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
    // flush the afterimage trail buffer -- this is a hard snap from
    // wherever phase 3's climax left the boss, so the ghost lag indices
    // would otherwise interpolate a long line back to that position
    resetBossTrail();
    const px = cx + state.bossX;
    const py = BOSS_CENTER_Y_VH * vh + state.bossY;
    // portal opens, holds while boss fades in, then closes
    spawnPortal(px, py, 320, PHASE_6_ENTRY_MS - 320 - 520, 520, t);
    // fade boss from hidden -> visible via data-portaling="in", then
    // clear the attribute when the fade window closes
    bossEl.setAttribute('data-portaling', 'in');
    window.setTimeout(() => {
      bossEl.removeAttribute('data-portaling');
    }, 520);
    // transition window covers the full 6s -- the swear-bubble shower
    // (updateSwearBubbles) fills the time between when the portal
    // entry resolves (~1.5s in) and phase 6's actual program begins
    // (at t + PHASE_6_TRANSITION_MS)
    state.transitionUntilT = t + PHASE_6_TRANSITION_MS;
  }

  const PHASE_4_EXIT_MS = 1400;
  function firePortalExit(t) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    const px = cx + state.bossX;
    const py = BOSS_CENTER_Y_VH * vh + state.bossY;
    // oversized shadow portal at the boss position. open + hold +
    // close adds up to PHASE_4_EXIT_MS so the portal fades just as
    // the transition window clears
    spawnPortal(px, py, 280, PHASE_4_EXIT_MS - 280 - 520, 520, t);
    bossEl.setAttribute('data-portaling', 'out');
    // hide the hud on the same beat -- the fade keyframe runs over
    // 600ms (see .hud[data-vanished="true"])
    hudEl.setAttribute('data-vanished', 'true');
    // lock the boss to hidden after the fade-out window closes
    window.setTimeout(() => {
      bossEl.setAttribute('data-portaling', 'hidden');
    }, 600);
    state.transitionUntilT = t + PHASE_4_EXIT_MS;
  }

  // ---- setPhase ----
  // single mutator for phase changes. resets the phase clock, clears
  // stale orbs + cycler state, fires the phase-2 transition overlay
  // when applicable. clamps to [1..6] silently
  const PHASE_MIN = 1, PHASE_MAX = 8;
  // per-phase transition config -- caption text + sub text + duration.
  // an empty caption means no overlay fires for that phase entry.
  // durationMs falls back to PHASE_TRANSITION_DEFAULT_MS when missing.
  //
  // titles are named off german opera movements -- not decorative.
  // maestrul umbrelor is a 1100-year-old vampire shadowmancer + ex-
  // general who spent centuries as the elusive shadow, not the front
  // antagonist. after the actual main villain dies, he machinates for
  // hundreds of years before stepping onto the stage himself. the
  // hole2 fight IS that long-delayed debut performance, which is why
  // every phase reads as a movement of his opera. wagnerian register
  // matches: this is the world-ending finale of a centuries-ripened
  // plan, not a generic boss check.
  //
  // each movement name fits the phase's character + tracks his
  // escalating claim to the stage:
  //   arie = the centuries-delayed first declaration
  //   sturmszene = the veteran-general's resurfaced battle tactics
  //   duett = late anathema -- the centuries-deferred denunciation
  //     he finally voices
  //   kadenz = sovereign umbra -- the shadowmancer crowns himself,
  //     umbra as instrument and dominion
  //   todesreigen + untergang = the pair of finale movements --
  //     the death round-dance of the spike-cage trap, then the
  //     downfall as the snake-curves close the world
  const PHASE_CAPTIONS = {
    // ouverture -- the curtain rises. first sustained declaration of
    // the movement; the fight officially begins here so the title
    // lands as the opening flourish
    1: { caption: 'OUVERTURE -- THE STAGE OPENS', sub: 'phase 1', durationMs: 1500 },
    2: { caption: 'ARIE -- FOURFOLD ECHO',         sub: 'phase 2', durationMs: 1500 },
    3: { caption: 'STURMSZENE -- TWELVEFOLD VOLLEY',       sub: 'phase 3', durationMs: 2000 },
    // intermezzo -- the boss has stepped through the portal. brief
    // diegetic silence; the title announces play has crossed the
    // curtain into the wings. only fires on forced entries (admin /
    // boss-defeat clear); natural flow skips in favor of the
    // firePortalExit visual
    4: { caption: 'INTERMEZZO -- THE WINGS',       sub: 'phase 4', durationMs: 1500 },
    // stille -- the silent ambush. shadow-lances reach for the player
    // from the dark while the boss stays hidden. the title is the
    // held breath between phrases, the absence of music itself
    5: { caption: 'STILLE -- THE HELD BREATH',     sub: 'phase 5', durationMs: 1500 },
    // phase 6 caption is the duet beat -- the dialogue-transition
    // swears read as a back-and-forth voice exchange against the
    // boss's split beams. fires via deferred showTransition 4s into
    // phase 6 entry (after the swear shower peaks). rename in place
    // when the actual title is decided
    6: { caption: 'DUETT -- LATE ANATHEMA',        sub: 'phase 6', durationMs: PHASE_6_TITLE_DUR_MS },
    // phase 7a + 7b -- the penultimate + ultimate stretches. each
    // half is its own movement. as maestrul claims dominance the
    // titles escalate: sovereign umbra is him crowning himself in
    // shadow, then todesreigen + untergang carry the world toward
    // its end
    7: { caption: 'KADENZ -- SOVEREIGN UMBRA',     sub: 'phase 7a', durationMs: 2000 },
    // 7b stacks two movement titles on the overlay (the <br> is
    // rendered via showTransition's innerHTML path -- it's the only
    // entry that uses it). todesreigen = SHADE'S EMBRACE (in lore, a
    // sphere of shadow that wraps the player and pries them apart
    // from inside, like an iron maiden -- "embrace" carries the
    // iron-maiden idiom + the vampire-fiction term for being claimed.
    // gameplay-side, that lore is expressed as a death round-dance of
    // wheeling spike-cages escalating in from the arena walls);
    // untergang = DEATHTHROES (the downfall, snake-curves multiplying
    // like a hilbert curve until the arena ends)
    8: { caption: "TODESREIGEN -- SHADE'S EMBRACE<br>UNTERGANG -- DEATHTHROES", sub: 'phase 7b', durationMs: 2400 }
  };
  // opts.durationMs -- override the transition duration for this entry
  // (eg the drawn-out boss-defeat transition). when omitted, falls back
  // to PHASE_CAPTIONS[n].durationMs and then to PHASE_TRANSITION_DEFAULT_MS
  function setPhase(n, opts) {
    // eslint-disable-next-line no-console
    console.log('[hole2] setPhase ->', n, 'force=', !!(opts && opts.forceTitleCard), 'from phase', state.phase);
    if (n < PHASE_MIN) n = PHASE_MIN;
    if (n > PHASE_MAX) n = PHASE_MAX;
    const now = _gameNow();
    state.phase = n;
    state.phaseStartT   = now;
    state.lastFireBossT = 0;
    state.lastFireSpiralT    = 0;
    state.lastFireCrossBeamT = 0;
    state.spiralAngle   = 0;
    state.diagDir       = -1;
    state.crossRotation = 0;
    state.patternName   = 'idle';
    // boss health refills on every phase boundary -- timer-driven
    // and defeat-driven alike. before, only the setBoss zero-edge
    // path refilled, so a phase ending by timer (the default) left
    // the bar stuck at whatever the player had whittled it down to.
    // sole exception: phase 7 -> 8 (engine 7 = 7a KADENZ, engine 8 =
    // 7b TODESREIGEN + UNTERGANG). the two halves share one
    // boss + one bar across the final movement, so entering phase 8
    // carries the player's chip damage forward instead of refilling.
    // no defeat-edge guard needed here -- the fight is tuned so even
    // ideal play (stationary, max output, point-blank dps) doesn't
    // zero the bar until ~20s before phase 8 ends, so the defeat path
    // out of phase 7 is unreachable. don't add a state.boss <= 0
    // fallback unless the dps math actually shifts
    if (n !== 8) {
      state.boss = 1.0;
      healthFill.style.width = '100%';
    }
    // rewind the fight clock so the hud timer reads the canonical
    // start-of-phase time. running R then jumping forward feels right
    const startS = PHASE_START_S[n] != null ? PHASE_START_S[n] : 0;
    state.startedAt = now - startS * 1000;
    // wipe stale orbs + beams + +s + towers + teeth so the new phase
    // starts clean. also reset phase 3 sub-mode + one-shot flags so
    // jumping back to phase 3 via ] replays the full 3a -> 3b sequence
    for (const o of state.enemyBullets) o.el.remove();
    state.enemyBullets.length = 0;
    clearBeams();
    clearPlusProjectiles();
    clearTowers();
    clearTeeth();
    clearHexagrams();
    clearGlobes();
    state.globeSpawnedThisPhase = false;
    state.phase3Mode = 'scatter';
    state.sectionIdx = 0;
    state.currentSpot    = 'TOP';
    state.hopStartT      = 0;
    state.hopToSpot      = 'TOP';
    state.hopApproachMs  = 0;
    state.hopExitX = 0;  state.hopExitY = 0;
    state.hopFromX = 0;  state.hopFromY = 0;
    state.hopExitSpawned  = false;
    state.hopTeleported   = false;
    state.hopEntrySpawned = false;
    clearPortals();
    bossEl.removeAttribute('data-portaling');
    state.interludeSineStartT = 0;
    state.nextInterludePlusT  = 0;
    state.phase3FrontSpawned = false;
    state.phase3RearSpawned  = false;
    state.hexCycleCount = 0;
    state.nextHexCycleT = 0;
    state.lastFireHexCrossT = 0;
    state.cursorIntroVolleyCount = 0;
    state.nextCursorIntroVolleyT = 0;
    // clear any stale pending title card from a prior phase. the
    // n === 6 branch below may set this back to a real timestamp;
    // resetting here first ensures other phases don't inherit a
    // dangling fire-time from a setPhase that got jumped past
    state.pendingTitleCardT = 0;
    // overlay -- only phases with a non-empty caption get one
    const cap = PHASE_CAPTIONS[n];
    const dur = (opts && opts.durationMs)
                || (cap && cap.durationMs)
                || PHASE_TRANSITION_DEFAULT_MS;
    // program clock starts when the title-card overlay clears (for
    // phases that fire one). before this, updatePhase's
    // transitionUntilT early-return halts the program walker
    const usesTitleCard = (n === 3 || n === 7 || n === 8);
    state.programStartT  = now + (usesTitleCard ? dur : 0);
    state.sectionStartT  = state.programStartT;
    // opts.forceTitleCard -- bypass the per-phase special branches
    // (firePortalExit / hidden-boss ambush / deferred-DUETT) and always
    // fire the standard showTransition path. used by the admin panel
    // and the dev [ / ] keybinds where the user is explicitly jumping
    // and wants the visible movement title to land each time. natural
    // timer-driven advancement still gets the bespoke per-phase visuals
    const force = !!(opts && opts.forceTitleCard);

    // phase 4 entry -- the portal exit. boss must disappear regardless
    // of how phase 4 was entered (natural timer / boss-defeat clear /
    // admin force). firePortalExit owns the portal animation + the
    // bossEl data-portaling state + the HUD vanish. forced entries
    // ALSO get the title card layered on top (see the force+cap block
    // below). phase 5 same -- always hide the boss for the ambush
    if (n === 4) {
      hideTransition();
      firePortalExit(now);
    } else if (n === 5) {
      // silent ambush -- boss stays hidden through phase 5a's lances
      // and 5b's gates. forced entry still hides the boss; the title
      // card stacks on top below
      hideTransition();
      bossEl.setAttribute('data-portaling', 'hidden');
    } else if (n === 6 && !force) {
      // boss formally returns at 3:56. portal opens at the home
      // position, boss fades back in from hidden, swear shower runs
      // across the full transition window. movement title slides in
      // 4s later via pendingTitleCardT
      hideTransition();
      firePortalEntry(now);
      state.pendingTitleCardT = now + PHASE_6_TITLE_DELAY_MS;
    } else if (cap && cap.caption) {
      // standard movement title-card path -- phases 2/3/6/7/8 + the
      // new phase 1 OUVERTURE caption
      showTransition(cap.caption, cap.sub, dur);
    } else if (force) {
      // forced + no caption -- generic fallback
      showTransition('PHASE ' + n, 'phase ' + n, dur);
    } else {
      hideTransition();
    }
    // forced entries into phase 4 / 5 ALSO fire the title card on top
    // of the portal/ambush visuals. firePortalExit already ran above
    // and set up bossEl + hudEl; the title card stacks as an extra
    // overlay so admin clicks + boss-defeat clears get the named
    // movement banner. transitionUntilT takes the max so the longer
    // window wins (firePortalExit uses PHASE_4_EXIT_MS=1400; cap dur
    // is typically 1500)
    if ((n === 4 || n === 5) && force && cap && cap.caption) {
      const cardUntilT = now + dur;
      showTransition(cap.caption, cap.sub, dur);
      if (state.transitionUntilT < cardUntilT) state.transitionUntilT = cardUntilT;
    }
    // hud stays vanished through phase 4 AND phase 5 -- boss is gone
    // across both, no health to track, no on-screen sense in showing
    // the timer. firePortalExit already set data-vanished for phase 4;
    // phase 5 needs it set here. always cleared on other phases
    if (n !== 4 && n !== 5) {
      hudEl.removeAttribute('data-vanished');
    } else {
      hudEl.setAttribute('data-vanished', 'true');
    }
    // wire the active program -- pattern_phase3b (advanceProgram)
    // walks state.activeProgram. each phase points at its own list;
    // phases with no program (1, 2) get an empty list so the walker
    // is a no-op there
    state.activeProgram = (n === 3 ? PHASE_3_PROGRAM
                         : n === 4 ? PHASE_4_PROGRAM
                         : n === 5 ? PHASE_5_PROGRAM
                         : n === 6 ? PHASE_6_PROGRAM
                         : n === 7 ? PHASE_7_PROGRAM
                         : n === 8 ? PHASE_8_PROGRAM
                         :           []);
    // phase 5 starts immediately -- no overlay, so programStartT IS
    // phase start. phase 3 uses the overlay delay (set earlier).
    // phase 6 has a 6s dialogue-transition window before the program
    // begins -- shift programStartT so section 0 fires at 4:02, not
    // at the 3:56 phase-start
    if (n === 5) {
      state.programStartT = now;
      state.sectionStartT = now;
    } else if (n === 6) {
      state.programStartT = now + PHASE_6_TRANSITION_MS;
      state.sectionStartT = state.programStartT;
    }
    clearLances();
    clearGates();
    clearSwearBubbles();
    clearSplitCrosses();
    clearPuddles();
    clearMaidenBox();
    clearSnakes();
    // initialize the first section -- the advance walker only fires
    // enterSection on idx -> idx+1 transitions, so without this call
    // section 0's per-kind setup (eg spawnShadowLance for phase 5's
    // lance section) would never run + the first section would be
    // skipped entirely. for sections like scatter the setup is
    // redundant with the manual state writes above; for sections like
    // lance it's load-bearing
    if (state.activeProgram.length > 0) {
      enterSection(0, state.programStartT);
    }
    // boss glide -- ALWAYS ease from current position into the new
    // phase's home. testbed used to skip the glide for phases without
    // a fixed home in BOSS_PHASE_TARGETS_VH (phase 1 sine, phase 3
    // scatter, phase 4 portal hidden, phase 5 ambush hidden), causing
    // the boss to snap-teleport to whatever steady-state computed at
    // t=0. now every phase change glides through. fallback target is
    // (0, 0) which lines up cleanly with:
    //   p1 sine at sin(0) = (0, 0)
    //   p3 scatter at sectionStart (TOP spot, ~near center)
    //   p4 / p5 hidden boss (invisible but position is consistent)
    // phase-specific motion takes over once the glide completes
    const home = BOSS_PHASE_TARGETS_VH[n] || { x: 0, y: 0 };
    const vh = window.innerHeight / 100;
    state.bossGlide = {
      fromX: state.bossX,
      fromY: state.bossY,
      toX:   home.x * vh,
      toY:   home.y * vh,
      startT: now,
      durMs:  dur
    };
  }

  // current phase's damage resistance with a safe fallback. shared
  // by updateBullets + flashBomb so the bomb's incidental damage
  // scales the same way regular bullet damage does
  function getPhaseResist() {
    return PHASE_DMG_RESIST[state.phase] != null
      ? PHASE_DMG_RESIST[state.phase]
      : PHASE_DMG_RESIST[PHASE_DMG_RESIST.length - 1];
  }

  // helpers -- mutate state + sync the dom in one place each. this
  // way new mechanics call into setX() rather than poking the dom
  function setBombs(n) {
    state.bombs = Math.max(0, Math.min(3, n));
    bombPips.forEach((el, i) => el.setAttribute('data-active', i < state.bombs ? 'true' : 'false'));
  }
  function setHits(n) {
    state.hits = Math.max(0, Math.min(5, n));
    hitPips.forEach((el, i) => el.setAttribute('data-active', i < state.hits ? 'true' : 'false'));
  }
  function setBoss(p) {
    const prev = state.boss;
    state.boss = Math.max(0, Math.min(1, p));
    healthFill.style.width = (state.boss * 100).toFixed(2) + '%';
    // globe drop -- fires once per phase when bossHealth crosses below
    // GLOBE_THRESHOLD. skipped at max output (no tier to upgrade to)
    // and during the boss-zero phase advance below (where the refill
    // to 1.0 would otherwise re-arm the threshold on next damage)
    if (prev >= GLOBE_THRESHOLD && state.boss < GLOBE_THRESHOLD &&
        !state.globeSpawnedThisPhase && state.output < OUTPUT_MAX) {
      spawnGlobe(state.output + 1);
      state.globeSpawnedThisPhase = true;
    }
    // boss-zero edge -- fire the defeat sfx + force the next phase
    // with a drawn-out transition. guarded on the actual >0 -> 0
    // transition so the refill assignment below doesn't re-enter
    // this branch. sfx plays on every clear including phase 8 (the
    // actual fight-end), since the user-facing moment is the bar
    // emptying, not the phase advance per se. at the last phase
    // there's no successor; setPhase clamps, so we skip the advance
    // call to avoid re-entering the same phase + replaying its
    // overlay on every subsequent bullet
    if (prev > 0 && state.boss <= 0) {
      playBossDefeat();
      // PORT: notify React layer that the final boss has been dropped
      if (state.phase >= PHASE_MAX && !state.victoryFired) {
        state.victoryFired = true;
        try { opts.onVictory(); } catch (_) {}
      }
      if (state.phase < PHASE_MAX) {
        // setPhase refills boss health for us now, so no explicit
        // state.boss = 1.0 write needed here -- the >0 -> 0 guard
        // above is what kept the old direct write from re-entering.
        // forceTitleCard so the cleared-phase moment always gets a
        // visible movement-title overlay, including for phases 4/5/6
        // where the natural-flow path would skip it. clearing a phase
        // is an earned beat -- the title card is the reward
        setPhase(state.phase + 1, {
          durationMs: BOSS_DEFEAT_TRANSITION_MS,
          forceTitleCard: true
        });
      }
    }
  }

  // ---- globe spawn / update / collect helpers ----
  // spawnGlobe(targetLevel) -- create a globe at boss center, colored
  // for the level the player will become after collection
  const globesEl = document.getElementById('globes');
  function spawnGlobe(targetLevel) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2 + state.bossX;
    const cy = BOSS_CENTER_Y_VH * vh + state.bossY;
    const el = document.createElement('div');
    el.className = 'globe';
    el.style.setProperty('--globe-color', GLOBE_COLORS[targetLevel - 1] || '#fff');
    el.style.left = cx + 'px';
    el.style.top  = cy + 'px';
    el.setAttribute('data-spawning', 'true');
    globesEl.appendChild(el);
    // clear the spawn anim attr once the keyframe completes; without
    // this a later data-collecting on the same node would race the
    // residual spawn anim
    window.setTimeout(() => el.removeAttribute('data-spawning'), 340);
    state.globes.push({
      el,
      x: cx,
      y: cy,
      vyPx: GLOBE_VY_VH_PER_SEC * vh,
      level: targetLevel
    });
  }

  // updateGlobes(dt) -- per-frame drift + collect + cull. called from
  // the main tick loop alongside updateBullets / updateEnemyBullets.
  // pickup is a circular radius around the player center so the player
  // only has to graze the globe to collect (forgiving on purpose --
  // GLOBE LVL is a reward, not a precision challenge)
  function updateGlobes(dt) {
    const list = state.globes;
    if (list.length === 0) return;
    const vh = window.innerHeight / 100;
    // arena inner box spans 12..92vh. cull past 92 + a pad so the globe
    // visibly exits the bottom edge before disappearing
    const cullPx = (92 + GLOBE_DESPAWN_PAD_VH) * vh;
    // player visual center -- sprite top is at 83.5vh (default), sprite
    // is 5.5vh tall, so center sits at 86.25vh + playerY
    const cxP = window.innerWidth / 2 + state.playerX;
    const cyP = 86.25 * vh + state.playerY;
    const pickupPx = GLOBE_PICKUP_VH * vh;
    const pickupSq = pickupPx * pickupPx;
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      // collect on overlap
      const dx = g.x - cxP;
      const dy = g.y - cyP;
      if (dx*dx + dy*dy <= pickupSq) {
        collectGlobe(g, i);
        continue;
      }
      // drift downward; cull past the box bottom
      g.y += g.vyPx * dt;
      if (g.y > cullPx) {
        g.el.remove();
        list.splice(i, 1);
        continue;
      }
      g.el.style.top = g.y + 'px';
    }
  }

  // collectGlobe -- pop animation, splice out, defer dom removal until
  // the keyframe finishes, then bump output level. setOutput clamps,
  // so a redundant grab past OUTPUT_MAX is a safe no-op (shouldn't
  // happen anyway -- the spawn guard skips when the player is maxed)
  function collectGlobe(g, idx) {
    g.el.setAttribute('data-collecting', 'true');
    state.globes.splice(idx, 1);
    window.setTimeout(() => g.el.remove(), 260);
    setOutput(g.level);
  }

  // clearGlobes -- wipe all active globes immediately. called from
  // setPhase so a phase advance doesn't leave stale drops mid-flight
  function clearGlobes() {
    for (const g of state.globes) g.el.remove();
    state.globes.length = 0;
  }
  // spirit bomb -- "light elemental" trigger. anchored at the
  // player's current position, expanding sun visual + wipes every
  // active enemy projectile (orbs, beams, +s, towers, teeth,
  // hexagrams) + grants iframes for the bomb window. snakes are
  // EXEMPT -- the deaththroes trails are an inevitability of
  // phase 7b, not a clearable hazard; dodging through gaps is the
  // only response. bomb-flash keeps firing too as a quick screen
  // tint under the sun -- adds energy to the moment without
  // dominating it. cost (one bomb pip) is consumed by the X handler
  // before calling
  function flashBomb() {
    // brief white tint -- underlays the sun
    bombFlash.setAttribute('data-on', 'true');
    setTimeout(() => bombFlash.setAttribute('data-on', 'false'), 90);

    // anchor the 200vh-square sun so its center sits on the player.
    // player center is (window.innerWidth/2 + state.playerX, 81vh +
    // state.playerY); subtract 100vh to translate to the element's
    // top-left
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2 + state.playerX;
    const cy = 81 * vh + state.playerY;
    spiritBomb.style.left = (cx - 100 * vh) + 'px';
    spiritBomb.style.top  = (cy - 100 * vh) + 'px';
    // restart the css animation: toggle off, force a reflow, toggle
    // on. without the reflow the attribute change is coalesced and
    // the burst keyframe won't replay on rapid re-fire
    spiritBomb.setAttribute('data-on', 'false');
    void spiritBomb.offsetWidth;
    spiritBomb.setAttribute('data-on', 'true');

    // wipe every enemy projectile pool. mirrors the per-phase reset
    // calls inside setPhase. shadow orbs live in state.enemyBullets;
    // the rest are owned by their helpers. snakes (phase 7b
    // deaththroes) are deliberately NOT wiped -- they're immortal
    // and the bomb cannot clear them
    for (const o of state.enemyBullets) o.el.remove();
    state.enemyBullets.length = 0;
    clearBeams();
    clearPlusProjectiles();
    clearTowers();
    clearTeeth();
    clearHexagrams();

    // bomb-window iframes -- touhou convention, matches IMMUNE_MS
    // so the duration reads consistent with a normal hit-iframe.
    // bombFireLockUntilT runs shorter (matches the css burst) so the
    // player can resume firing once the sun fades, even though the
    // iframes carry a bit longer
    const nowMs = _gameNow();
    state.immuneUntilT      = nowMs + IMMUNE_MS;
    state.bombFireLockUntilT = nowMs + SPIRIT_BOMB_LOCK_MS;

    // incidental boss damage. only lands if the boss is within the
    // visual core's range and not mid-portal. raw value is small
    // and gets multiplied by phase resistance, so the bomb stays
    // a defensive tool first and a damage source second
    const bossPortaling = bossEl.getAttribute('data-portaling');
    const bossHidden = bossPortaling === 'hidden' || bossPortaling === 'out';
    if (!bossHidden && state.boss > 0) {
      const bossCx = window.innerWidth / 2 + state.bossX;
      const bossCy = BOSS_CENTER_Y_VH * vh + state.bossY;
      const distVh = Math.hypot((bossCx - cx) / vh, (bossCy - cy) / vh);
      if (distVh <= SPIRIT_BOMB_RANGE_VH) {
        setBoss(state.boss - SPIRIT_BOMB_DAMAGE * getPhaseResist());
      }
    }
  }

  // input -- arrows + WASD for movement (state.pressed integrates in
  // the tick). z is also held-state for firing (the tick handles the
  // rate-limited spawn). x and h are one-shot
  function _wlisten(name, fn, opts2) { window.addEventListener(name, fn, opts2); _listeners.push([name, fn, opts2]); }

  // dev-keybind password lock. the testbed-era convenience keys (output
  // tier 1..5, force-hit H, orb-damage toggle I, phase scrub [ + ],
  // full reset R) let casual visitors trivially bypass the fight. they
  // stay reachable for hunter via a typed unlock phrase -- "hb1968" --
  // matched against a rolling 8-char buffer. on unlock the boss + hud
  // briefly tick a [dev] tag so it's clear the cheat layer is live
  const DEV_PASSWORD   = 'hb1968';
  const ADMIN_PASSWORD = 'lehrer';
  // single rolling buffer sized to the longer of the two passwords so
  // either suffix match still resolves correctly
  const PASS_BUF_LEN = Math.max(DEV_PASSWORD.length, ADMIN_PASSWORD.length);
  let _devBuf = '';
  let _devToastUntilT = 0;
  let _adminUnlocked = false;
  // mirror the engine's per-frame state into a shape the admin panel
  // wants. polled via getState on the api handle. function declarations
  // (setPhase/setOutput) are hoisted so this object can reference them
  // even though they're defined further down in the engine body
  const _adminApi: Hole2EngineHandle = {
    // forceTitleCard so every admin jump shows the movement-title
    // overlay (including for phases 1/4/5 where the natural-flow path
    // would skip it). admin is for testing, so the user wants to SEE
    // each transition land visibly
    setPhase:     (n) => { try { setPhase(n, { forceTitleCard: true }); } catch (_) {} },
    setOutput:    (n) => { try { setOutput(n); } catch (_) {} },
    setOrbDamage: (on) => { state.orbDamage = !!on; },
    getState:     () => ({
      phase:     state.phase,
      output:    state.output,
      orbDamage: !!state.orbDamage
    })
  };
  function _isDev() { return !!state.devUnlocked; }
  function _showDevToast(msg) {
    try {
      const el = document.getElementById('debug');
      if (el) {
        // dev unlocks the .debug readout permanently for the session;
        // the toast hijacks the same slot for ~1.8s, gated by
        // _devToastUntilT in the tick so the per-frame readout pauses
        // long enough for the message to be readable
        el.textContent = msg;
        (el as HTMLElement).style.display = 'block';
        _devToastUntilT = _gameNow() + 1800;
      }
    } catch (_) {}
  }

  _wlisten('keydown', (e) => {
    const k = e.key.toLowerCase();
    // Escape toggles pause regardless of state -- highest-priority key
    // since the player needs an out for tab-switching / phone-call
    // interruptions. doesn't preventDefault so browser-level escape
    // (exit fullscreen, etc.) still works alongside
    if (k === 'escape') {
      _setPaused(!_paused);
      return;
    }
    // while paused, swallow movement / fire / dev keys so a held key
    // doesn't surface state changes invisibly. also clear pressed
    // state so the moment after resume isn't a phantom hold-down
    if (_paused) {
      state.pressed.left = state.pressed.right = false;
      state.pressed.up   = state.pressed.down  = false;
      state.pressed.z    = state.pressed.shift = false;
      return;
    }
    if (k === 'arrowleft'  || k === 'a') { state.pressed.left  = true; e.preventDefault(); }
    if (k === 'arrowright' || k === 'd') { state.pressed.right = true; e.preventDefault(); }
    if (k === 'arrowup'    || k === 'w') { state.pressed.up    = true; e.preventDefault(); }
    if (k === 'arrowdown'  || k === 's') { state.pressed.down  = true; e.preventDefault(); }
    if (k === 'z')                       { state.pressed.z     = true; e.preventDefault(); }
    if (k === 'shift')                   { state.pressed.shift = true; e.preventDefault(); }

    // password buffer -- track recent character keys (length 1) and
    // check if the tail matches either password. runs even when
    // modifiers are held; we only care about the typed sequence
    if (k.length === 1) {
      _devBuf = (_devBuf + k).slice(-PASS_BUF_LEN);
      // hb1968 -- keyboard shortcut unlock
      if (!state.devUnlocked &&
          _devBuf.slice(-DEV_PASSWORD.length) === DEV_PASSWORD) {
        state.devUnlocked = true;
        _showDevToast('[dev unlocked] -- 1..5 globe lvl, H hit, I immunity, [ ] phase, R reset');
      }
      // lehrer -- visual admin panel unlock. fires the onAdminUnlock
      // callback ONCE with an api handle the React panel uses to
      // drive phase / output / damage
      if (!_adminUnlocked &&
          _devBuf.slice(-ADMIN_PASSWORD.length) === ADMIN_PASSWORD) {
        _adminUnlocked = true;
        try { opts.onAdminUnlock?.(_adminApi); } catch (_) {}
      }
    }

    if (k === 'x' && state.bombs > 0) {
      // spirit bomb -- consume one + visual flash. explicitly does
      // NOT touch the phase 8 snake-curve field: the deaththroes
      // snakes are an inevitability of that section, not a clearable
      // hazard. dodging the gaps is the only response, and the
      // 500ms trickle keeps the field popping in regardless
      setBombs(state.bombs - 1);
      flashBomb();
    }

    // ---- dev-only keys -- gated on the password ----
    // GLOBE LVL switches, force-hit, orb-damage toggle, phase scrub,
    // and full reset are all banned for casual viewers. typing the
    // password (DEV_PASSWORD above) inside the arena flips _isDev()
    if (_isDev()) {
      // number keys 1..OUTPUT_MAX as quick GLOBE LVL switches
      if (k.length === 1 && k >= '1' && k <= String(OUTPUT_MAX)) {
        setOutput(parseInt(k, 10));
      }
      if (k === 'h' && state.hits > 0) {
        // debug -- force a hit. fires the same takeDamage path the
        // boss-overlap collision uses, so pop + respawn + i-frames all
        // run as if a real bullet landed
        takeDamage(_gameNow());
      }
      if (k === 'i') {
        // dev -- toggle orb damage on/off. off lets us read the patterns
        // without dying through them
        state.orbDamage = !state.orbDamage;
        _showDevToast('[dev] orb damage: ' + (state.orbDamage ? 'ON' : 'off'));
      }
      // dev -- jump between phases. brackets feel natural for prev/next.
      // forceTitleCard so the movement-title overlay always lands -- same
      // reasoning as the admin panel: explicit jumps want visible
      // confirmation, not a silent state swap
      if (k === '[') setPhase(state.phase - 1, { forceTitleCard: true });
      if (k === ']') setPhase(state.phase + 1, { forceTitleCard: true });
      if (k === 'r') {
        // full reset, same path the lives-expire flow takes. handles
        // bombs/hits/boss/output, player position, immunity, bullets,
        // fight clock, and the per-phase wipe via setPhase(1)
        resetFight();
      }
    }
  });
  _wlisten('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft'  || k === 'a') state.pressed.left  = false;
    if (k === 'arrowright' || k === 'd') state.pressed.right = false;
    if (k === 'arrowup'    || k === 'w') state.pressed.up    = false;
    if (k === 'arrowdown'  || k === 's') state.pressed.down  = false;
    if (k === 'z')                       state.pressed.z     = false;
    if (k === 'shift')                   state.pressed.shift = false;
  });

  // auto-pause on tab-out. tab-in does NOT auto-resume -- the player
  // chooses when to come back via Escape. otherwise switching to a
  // chat tab for a beat would cost lives the player never saw coming.
  // also clear pressed state so a held key from before tab-out doesn't
  // surface on resume
  function _onVisibility() {
    if (document.hidden && !_paused) {
      state.pressed.left = state.pressed.right = false;
      state.pressed.up   = state.pressed.down  = false;
      state.pressed.z    = state.pressed.shift = false;
      _setPaused(true);
    }
  }
  document.addEventListener('visibilitychange', _onVisibility);
  // track for cleanup -- _listeners holds window listeners, but the
  // tear-down loop accepts the same name/fn/opts triple. document
  // gets its own entry so destroy can route correctly
  _listeners.push(['_doc_visibilitychange', _onVisibility, undefined]);

  // low-level spawn -- add a single bullet at (x,y) with velocity
  // (vx,vy), damage dmg, optional big visual. all the per-output
  // patterns funnel through this. turnRate is the homing curve cap
  // in rad/sec; big bullets get a much lower rate so they still drift
  // wide. spawnedAt powers the max-lifetime prune
  function spawnBulletAt(x, y, vx, vy, dmg, big) {
    const el = document.createElement('div');
    el.className = big ? 'bullet bullet--big' : 'bullet';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    bulletsEl.appendChild(el);
    const turnRate = big ? BIG_TURN_RATE_RAD : BULLET_TURN_RATE_RAD;
    state.bullets.push({
      el, x, y, vx, vy, dmg, turnRate,
      spawnedAt: _gameNow()
    });
  }

  // per-output volley. fired once per FIRE_INTERVAL_MS while z held.
  // structure per level:
  //   1: center bullet
  //   2: V split (two diagonals, no center)
  //   3: three-prong (center + two diagonals)
  //   4: three-prong + 1 big bullet
  //   5: three-prong + 2 big bullets
  // shift tightens the diagonals + centers the big bullets on the
  // player's midline (instead of offset to the sides)
  function fireVolley() {
    const vh = window.innerHeight / 100;
    const cx = (window.innerWidth / 2) + state.playerX;
    const cy = (81 * vh) + state.playerY;
    const speed = BULLET_SPEED_VH_PER_SEC * vh;
    const lvl = state.output;
    const clutch = state.pressed.shift;

    // distance falloff -- same as before, applied to base damage
    const playerCenterYVh = 85 + state.playerY / vh;
    const distVh = Math.abs(playerCenterYVh - 22);
    const distT  = Math.min(1, distVh / DIST_MAX_VH);
    const distMult = 1 - DAMAGE_FALLOFF * distT;
    const baseDmg  = BULLET_BASE_DAMAGE * distMult;

    // center bullet -- present at levels 1, 3, 4, 5 (NOT 2, that's
    // the pure V)
    if (lvl === 1 || lvl >= 3) {
      spawnBulletAt(cx, cy, 0, -speed, baseDmg, false);
    }
    // diagonals (V) -- present at levels 2, 3, 4, 5
    if (lvl >= 2) {
      const angDeg = clutch ? SPREAD_ANGLE_DEG_SHIFT : SPREAD_ANGLE_DEG;
      const ang = angDeg * Math.PI / 180;
      const sx = Math.sin(ang) * speed;
      const sy = -Math.cos(ang) * speed;
      spawnBulletAt(cx, cy, -sx, sy, baseDmg, false);
      spawnBulletAt(cx, cy,  sx, sy, baseDmg, false);
    }
    // big bullets -- 4 adds the left of the pair, 5 adds the right.
    // non-clutch: wide spawn offset PLUS outward lateral velocity, so
    // they fan further apart as they travel and can't be repositioned
    // onto the boss without giving up the other shots. clutch: both
    // spawn at center with no lateral drift, focused dead-on
    const bigDmg     = baseDmg * BIG_DAMAGE_MULT;
    const bigSpeed   = speed   * BIG_SPEED_MULT;
    const bigOffPx   = BIG_OFFSET_VH * vh;
    const bigDriftPx = BIG_LATERAL_VH_PER_SEC * vh;
    if (lvl >= 4) {
      const off = clutch ? 0 : -bigOffPx;
      const vx  = clutch ? 0 : -bigDriftPx;
      spawnBulletAt(cx + off, cy, vx, -bigSpeed, bigDmg, true);
    }
    if (lvl >= 5) {
      const off = clutch ? 0 :  bigOffPx;
      const vx  = clutch ? 0 :  bigDriftPx;
      spawnBulletAt(cx + off, cy, vx, -bigSpeed, bigDmg, true);
    }
  }

  // damage scalar applied to all player bullets while the title-card
  // transition overlay is up. boss reads as effectively-shielded during
  // declarations -- player can still chip but not cheese a phase by
  // dumping output through the cinematic. 0.05 = 5% damage = 20x
  // reduction, the touhou idiom translated into a soft cap
  const PHASE_TRANSITION_DAMAGE_MULT = 0.05;

  // tick once -- advance every bullet, check boss-hitbox AABB, prune
  // hits + escapes. damage is applied via setBoss so the dom bar
  // syncs. the data-hit flash is a tiny visual ack while we're tuning
  let hitFlashClearId = 0;
  function updateBullets(dt, t) {
    if (state.bullets.length === 0) return;
    const vh = window.innerHeight / 100;
    // boss bounds account for current bossX/bossY so player bullets
    // still register hits while the boss is gliding or sine-drifting
    const bossCxPx    = window.innerWidth / 2 + state.bossX;
    const bossLeftPx  = bossCxPx - BOSS_HALF_W_VH * vh;
    const bossRightPx = bossCxPx + BOSS_HALF_W_VH * vh;
    const bossTopPx   = BOSS_TOP_VH    * vh + state.bossY;
    // during the title-card overlay (transitionUntilT > t) every bullet
    // hit applies only a fraction of its damage. flagged once per tick
    // so the per-bullet path stays a single multiply
    const inTransition = t != null && t < state.transitionUntilT;
    // phase resistance composes with title-card softening. resolved
    // via getPhaseResist so the same fallback applies wherever phase
    // resist is read (updateBullets + flashBomb)
    const dmgMult = (inTransition ? PHASE_TRANSITION_DAMAGE_MULT : 1) * getPhaseResist();
    // boss isn't damageable while it's mid-portal (data-portaling set
    // to 'out' or 'hidden'). lets the portal-flash exit + the hop
    // transit windows pass without rogue damage going through to a
    // shape that visually isn't there. 'in' (fading back in) still
    // takes damage so the player isn't blocked from picking up where
    // they left off
    const bossPortaling = bossEl.getAttribute('data-portaling');
    const bossHidden = bossPortaling === 'hidden' || bossPortaling === 'out';
    const bossBotPx   = BOSS_BOTTOM_VH * vh + state.bossY;
    const exitTopPx   = 10 * vh;  // bullets that pass this line are gone
    // boss center in px for the homing target. only valid when the
    // boss is actually onscreen; during portal-out we skip the curve
    // and let bullets fly straight (no target to steer toward)
    const bossCyPx = BOSS_CENTER_Y_VH * vh + state.bossY;
    const nowMs = t != null ? t : _gameNow();
    let hitThisTick = false;
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      // homing curve -- rotate velocity toward boss center, clamped
      // by turnRate * dt. preserves speed magnitude so bullets don't
      // accelerate. skipped when boss is hidden (portal-out) or dead;
      // also skipped if the bullet is essentially on the target
      if (!bossHidden && state.boss > 0 && b.turnRate > 0) {
        const tx = bossCxPx - b.x;
        const ty = bossCyPx - b.y;
        const td = Math.hypot(tx, ty);
        if (td > 1) {
          const speed = Math.hypot(b.vx, b.vy);
          const curAng = Math.atan2(b.vy, b.vx);
          const desAng = Math.atan2(ty, tx);
          // shortest signed angular delta in [-pi, pi]
          let dAng = desAng - curAng;
          if (dAng >  Math.PI) dAng -= 2 * Math.PI;
          if (dAng < -Math.PI) dAng += 2 * Math.PI;
          const maxTurn = b.turnRate * dt;
          const turn = Math.max(-maxTurn, Math.min(maxTurn, dAng));
          const newAng = curAng + turn;
          b.vx = Math.cos(newAng) * speed;
          b.vy = Math.sin(newAng) * speed;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // collision: AABB. bullet's center vs boss rect. per-bullet
      // damage was set at spawn from distance falloff
      if (b.x >= bossLeftPx && b.x <= bossRightPx &&
          b.y >= bossTopPx  && b.y <= bossBotPx) {
        if (state.boss > 0) setBoss(state.boss - b.dmg * dmgMult);
        b.el.remove();
        state.bullets.splice(i, 1);
        hitThisTick = true;
        continue;
      }
      // escaped past the arena top OR horizontally outside the
      // viewport -- prune. diagonals + collapsed bigs can exit sides.
      // also age-prune any bullet older than MAX_BULLET_LIFE_MS so
      // a near-miss that gets caught in a slow curve can't orbit
      if (b.y < exitTopPx ||
          b.x < -10 || b.x > window.innerWidth + 10 ||
          nowMs - b.spawnedAt > MAX_BULLET_LIFE_MS) {
        b.el.remove();
        state.bullets.splice(i, 1);
        continue;
      }
      b.el.style.left = b.x + 'px';
      b.el.style.top  = b.y + 'px';
    }
    if (hitThisTick) {
      bossEl.setAttribute('data-hit', 'true');
      clearTimeout(hitFlashClearId);
      hitFlashClearId = setTimeout(() => bossEl.setAttribute('data-hit', 'false'), 90);
    }
  }

  // take one hit + start i-frames. respawn the player at the spawn
  // origin (playerX = playerY = 0) and play a short "pop" effect on
  // the svg so the moment of damage reads visually before the flicker
  // takes over. called from collision checks (and any future damage
  // source like enemy bullets)
  let popClearId = 0;
  let resetPendingId = 0;
  function takeDamage(t) {
    if (t < state.immuneUntilT) return;
    if (state.hits <= 0) return;
    // damage toggle -- when state.orbDamage is false, the player is
    // invincible to EVERY damage source (orbs, boss-overlap, lances,
    // maiden spikes, snake segments, beams, ...). previously this flag
    // only gated some paths, which surfaced as "the toggle doesn't
    // actually make me invincible" when admin flipped it off mid-fight.
    // gating at takeDamage covers all callers in one place
    if (!state.orbDamage) return;
    setHits(state.hits - 1);
    state.immuneUntilT = t + IMMUNE_MS;
    // respawn to initial spawn area
    state.playerX = 0;
    state.playerY = 0;
    // pop effect -- 220ms animation, then clear the flag so it can
    // re-trigger on the next damage
    playerEl.setAttribute('data-popped', 'true');
    clearTimeout(popClearId);
    popClearId = setTimeout(() => playerEl.setAttribute('data-popped', 'false'), 220);
    // lives expired -- run the full reset back to phase 1 / fight
    // start ("begin"). small delay so the pop + flicker beat reads
    // before the world snaps back. guarded id so back-to-back hits
    // at 0 (shouldn't happen because of the <=0 early-return above,
    // but defensive) don't stack multiple resets
    if (state.hits <= 0) {
      clearTimeout(resetPendingId);
      resetPendingId = setTimeout(() => resetFight(), 700);
    }
  }

  // resetFight -- full state reset back to phase 1 / fight start.
  // shared between R and the lives-expire path so both go through the
  // same single source of truth. clears active drops + transient
  // animation flags so nothing carries over from the prior run.
  // also fires onFightReset so the React layer can restart the boss
  // music from the top -- the track is phase-synced + drifts if it
  // keeps playing into a fresh phase 1
  function resetFight() {
    // eslint-disable-next-line no-console
    console.log('[hole2] resetFight fired -- state.hits was', state.hits, 'state.phase was', state.phase);
    setBombs(3); setHits(5); setBoss(1); setOutput(1);
    state.playerX = 0;
    state.playerY = 0;
    state.immuneUntilT = 0;
    for (const b of state.bullets) b.el.remove();
    state.bullets.length = 0;
    state.startedAt = _gameNow();
    // clear the end-state latches so a fresh fight can re-fire either
    // overlay. without this, a defeat -> dev `r` -> next-attempt path
    // would silently fail to mount DARKNESS RISES a second time
    state.victoryFired = false;
    state.defeatFired = false;
    playerEl.setAttribute('data-immune', 'false');
    playerEl.setAttribute('data-popped', 'false');
    setPhase(1);
    try { opts.onFightReset?.(); } catch (_) {}
  }

  // helper -- player torso hitbox bounds in px. used by both the
  // boss-overlap check and the per-orb collision sweep. constants
  // mirror the css: .player is 4vh wide x 5.5vh tall, anchored at
  // top: box-bottom - 8.5vh = 83.5vh. .player__hitbox is left:28%,
  // width:44%, top:32%, height:36% relative to that 4x5.5 box (the
  // pcts grew when the viewBox shrank from 16x24 -> 16x22, leaving
  // the world-space rect on the same torso pixels)
  function getPlayerHitboxPx() {
    const vh = window.innerHeight / 100;
    const playerCxPx  = window.innerWidth / 2 + state.playerX;
    const playerTopPx = 83.5 * vh + state.playerY;
    const hbHalfWPx   = (0.22 * 4)   * vh; // 0.88vh half-width (44%/2 of 4vh)
    const hbTopOffPx  = (0.32 * 5.5) * vh; // 1.76vh from sprite top
    const hbHPx       = (0.36 * 5.5) * vh; // 1.98vh tall
    return {
      l: playerCxPx - hbHalfWPx,
      r: playerCxPx + hbHalfWPx,
      t: playerTopPx + hbTopOffPx,
      b: playerTopPx + hbTopOffPx + hbHPx
    };
  }

  // player-vs-boss collision -- if the green torso hitbox overlaps
  // the boss hitbox AND the player is not in i-frames, take damage.
  function checkPlayerBossCollision(t) {
    if (t < state.immuneUntilT) return;
    const vh = window.innerHeight / 100;
    const p = getPlayerHitboxPx();
    // boss hitbox in px -- accounts for current boss x/y offset since
    // boss now moves under updateBossMovement
    const bossCxPx    = window.innerWidth / 2 + state.bossX;
    const bossLeftPx  = bossCxPx - BOSS_HALF_W_VH * vh;
    const bossRightPx = bossCxPx + BOSS_HALF_W_VH * vh;
    const bossTopPx   = BOSS_TOP_VH    * vh + state.bossY;
    const bossBotPx   = BOSS_BOTTOM_VH * vh + state.bossY;
    if (p.r >= bossLeftPx && p.l <= bossRightPx &&
        p.b >= bossTopPx  && p.t <= bossBotPx) {
      takeDamage(t);
    }
  }

  // inner-box bounds in px -- orbs vanish once they cross this. boss
  // and player both live inside this rect; orb pruning happens here
  // rather than at viewport edges (so they don't visibly fly past the
  // arena outline). uses the asymmetric inner-frame opening of
  // evilbox.png so projectiles get clipped right at the evilbox border
  function getInnerBoxPx() {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    return {
      l: cx + INNER_LEFT_VH * vh,
      r: cx + INNER_RIGHT_VH * vh,
      t: INNER_TOP_VH    * vh,
      b: INNER_BOTTOM_VH * vh
    };
  }

  // ---- shadow orbs (boss-fired bullets) -----------------------------
  // orb fire sfx -- pooled + rate-limited. EVERY orb-firing site in
  // the game routes through spawnShadowOrb, so this single hook covers
  // them all. the rate limit collapses synchronous batches (pair
  // splits, fan sprays, radial bursts -- all spawned in the same
  // frame) into one play, which matches hunter's "pairs trigger it
  // once" -- a batch reads as one fire event. spaced solo orbs
  // (tower drip, gate volleys at >ORB_SFX_MIN_GAP_MS intervals) each
  // still get their own cue
  const ORB_SFX_URL         = SFX_BASE + 'orb.ogg';
  const ORB_SFX_POOL        = 4;
  const ORB_SFX_VOL         = 0.19;   // dialed down -- orbs fire often
  const ORB_SFX_MIN_GAP_MS  = 60;     // batch dedupe window
  const orbSfxPool = [];
  let   orbSfxIdx  = 0;
  let   lastOrbSfxT = -Infinity;
  for (let i = 0; i < ORB_SFX_POOL; i++) {
    const a = _audio(ORB_SFX_URL);
    a.preload = 'auto';
    a.volume  = ORB_SFX_VOL;
    orbSfxPool.push(a);
  }
  function playOrbSfx() {
    const now = _gameNow();
    if (now - lastOrbSfxT < ORB_SFX_MIN_GAP_MS) return;
    lastOrbSfxT = now;
    const a = orbSfxPool[orbSfxIdx];
    orbSfxIdx = (orbSfxIdx + 1) % ORB_SFX_POOL;
    try { a.currentTime = 0; } catch (_) {}
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // opts: { isBeam, bounceCount, cycleEndT }. beam orbs split into 2
  // inward-angled orbs when they first cross the inner border (phase
  // 2's patchouli-style cross beams); the splits inherit bounceCount=1
  // and just despawn when they leave the inner box. cycleEndT (ms
  // absolute) is the explicit-cull deadline used by the phase-2
  // radial spray so its orbs disappear with the beams rather than
  // depending on flight time to clear the box
  function spawnShadowOrb(x, y, vx, vy, opts) {
    // universal fire cue -- rate-limited so a pair/fan/spray collapses
    // to one play. spaced solo orbs still each get their cue
    playOrbSfx();
    const isBeam      = !!(opts && opts.isBeam);
    const bounceCount = (opts && opts.bounceCount) || 0;
    const cycleEndT   = (opts && opts.cycleEndT)   || 0;
    const big         = !!(opts && opts.big);
    const el = document.createElement('div');
    el.className = 'shadow-orb' +
      (isBeam ? ' shadow-orb--beam' : '') +
      (big    ? ' shadow-orb--big'  : '');
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    // beams render as elongated rectangles oriented along velocity
    if (isBeam) {
      const ang = Math.atan2(vy, vx);
      el.style.transform = 'translate(-50%, -50%) rotate(' + (ang + Math.PI / 2) + 'rad)';
    }
    // hitR -- per-orb collision radius in px. default orbs stay point-
    // tested (0); big variant gets ~1.2vh so the hitbox roughly matches
    // the .shadow-orb--big visual (2.4vh diameter)
    const vhPx = window.innerHeight / 100;
    const hitR = big ? 1.2 * vhPx : 0;
    orbsEl.appendChild(el);
    state.enemyBullets.push({ el, x, y, vx, vy, isBeam, bounceCount, cycleEndT, hitR });
  }

  // beam first-bounce -- spawn 2 inward-angled split orbs at +-45 deg
  // from the inward direction (i.e. the velocity flipped 180 deg).
  // split orbs inherit bounceCount=1 and don't split further
  function splitBeamInward(b) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 1) return;
    const outwardAng = Math.atan2(b.vy, b.vx);
    const inwardAng  = outwardAng + Math.PI;
    const splitOff   = (45 * Math.PI) / 180;
    // shave a little off the split speed so the secondaries read as
    // weaker scatter than the original beam
    const splitSpeed = speed * 0.78;
    for (const s of [-1, 1]) {
      const a = inwardAng + s * splitOff;
      spawnShadowOrb(b.x, b.y, Math.cos(a) * splitSpeed, Math.sin(a) * splitSpeed,
                     { isBeam: true, bounceCount: 1 });
    }
  }

  // advance every orb, prune at the inner box, check overlap with the
  // player torso hitbox. on overlap, route through takeDamage (which
  // handles i-frame check, pop, respawn). orb is consumed on hit
  function updateEnemyBullets(dt, t) {
    if (state.enemyBullets.length === 0) return;
    const p  = getPlayerHitboxPx();
    const ib = getInnerBoxPx();
    const immune = t < state.immuneUntilT;
    for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
      const b = state.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // cycle-end cull -- spray orbs from the phase-2 radial pattern
      // disappear together with their parent beams, regardless of
      // whether they've cleared the box yet
      if (b.cycleEndT > 0 && t >= b.cycleEndT) {
        b.el.remove();
        state.enemyBullets.splice(i, 1);
        continue;
      }
      // inner-box escape -- orb is gone the moment it crosses. for
      // beam-type orbs that haven't split yet, trigger the split-back
      // before removing
      const outside = b.x < ib.l || b.x > ib.r || b.y < ib.t || b.y > ib.b;
      if (outside) {
        if (b.isBeam && b.bounceCount === 0) splitBeamInward(b);
        b.el.remove();
        state.enemyBullets.splice(i, 1);
        continue;
      }
      // hit -- only if orb damage is enabled AND player not immune.
      // while state.orbDamage is false the orbs pass through harmless
      // (visible but no consume + no damage), which is what we want
      // while tuning patterns without dying every 2 seconds.
      // b.hitR expands the rect overlap by the orb's radius so big-
      // variant orbs hit at their visual size, not as a center point
      const r = b.hitR || 0;
      if (state.orbDamage && !immune && state.hits > 0 &&
          b.x + r >= p.l && b.x - r <= p.r &&
          b.y + r >= p.t && b.y - r <= p.b) {
        takeDamage(t);
        b.el.remove();
        state.enemyBullets.splice(i, 1);
        continue;
      }
      b.el.style.left = b.x + 'px';
      b.el.style.top  = b.y + 'px';
    }
  }

  // ---- boss movement + attack patterns ------------------------------
  // boss center in px, accounting for current bossX/bossY offsets
  function bossCenterPx() {
    const vh = window.innerHeight / 100;
    return {
      x: window.innerWidth / 2 + state.bossX,
      y: BOSS_CENTER_Y_VH * vh + state.bossY
    };
  }

  // flip --boss-dir based on the sign of the per-frame bossX delta.
  // small dead-zone keeps facing stable when the boss is holding still;
  // float jitter on a "hold" branch would otherwise flip the sprite
  // every frame. called from every site that writes state.bossX.
  // sign is inverted on purpose -- sprite faces opposite its motion,
  // so the left-move + right-move appearances are swapped relative to
  // the naive mapping
  function updateBossDir() {
    const dx = state.bossX - state.lastBossX;
    if (Math.abs(dx) > 0.05) {
      state.bossDir = dx >= 0 ? -1 : 1;
    }
    state.lastBossX = state.bossX;
    bossEl.style.setProperty('--boss-dir', state.bossDir);
  }

  // touhou-style afterimage trail. each frame:
  //   1. push the current pose onto state.bossTrail (newest at index 0)
  //   2. ema the per-frame speed so a held boss reads as still
  //   3. sample fixed lag indices for each ghost; write its pose vars
  //   4. set --trail-strength on the container -- a single gate that
  //      fades all three ghosts together based on smoothed speed
  // teleport (portal hop) is handled by resetBossTrail() at the snap
  // site -- without it we'd draw a long ghost line across the jump
  const TRAIL_LAG_FRAMES = [9, 20, 32]; // ~150 / 333 / 533 ms at 60fps
  const TRAIL_HISTORY_MAX = 34;
  const TRAIL_SPEED_FLOOR = 0.18;       // lower floor so even the gentle phase-1
                                        //   sine apex still shows a faint trail
  const TRAIL_SPEED_CEIL  = 3.4;        // phase 1's steady-state sine peak (~3px/
                                        //   frame on a ~1000px viewport) now pegs
                                        //   close to full alpha after the ema mix
  function updateBossTrail() {
    const buf = state.bossTrail;
    // push newest pose at the front; trim tail
    buf.unshift({ x: state.bossX, y: state.bossY, dir: state.bossDir });
    if (buf.length > TRAIL_HISTORY_MAX) buf.length = TRAIL_HISTORY_MAX;
    // raw speed -- |dx|+|dy| from the previous frame. cheap, no sqrt
    const dx = state.bossX - state.lastBossX;
    const dy = state.bossY - state.lastBossY;
    state.lastBossY = state.bossY;
    const raw = Math.abs(dx) + Math.abs(dy);
    // ema mix 0.22 -- trail wakes/sleeps in ~5 frames. avoids a strobe
    // when a sine-driven phase crosses zero velocity at the apex
    state.bossSpeedSmooth = state.bossSpeedSmooth * 0.78 + raw * 0.22;
    // gate ghosts entirely when the boss is portaling/hidden -- don't
    // want a ghost crawling through empty arena during the teleport
    const portaling = bossEl ? bossEl.getAttribute('data-portaling') : null;
    let strength;
    if (portaling === 'hidden' || portaling === 'out') {
      strength = 0;
    } else {
      const s = (state.bossSpeedSmooth - TRAIL_SPEED_FLOOR) /
                (TRAIL_SPEED_CEIL - TRAIL_SPEED_FLOOR);
      strength = s < 0 ? 0 : (s > 1 ? 1 : s);
    }
    // write each ghost's pose from its lag index
    for (let i = 0; i < trailGhostEls.length; i++) {
      const lag = TRAIL_LAG_FRAMES[i] != null ? TRAIL_LAG_FRAMES[i] : 0;
      const idx = Math.min(lag, buf.length - 1);
      const sample = buf[idx];
      if (!sample) continue;
      const el = trailGhostEls[i];
      el.style.setProperty('--ax', sample.x.toFixed(2) + 'px');
      el.style.setProperty('--ay', sample.y.toFixed(2) + 'px');
      el.style.setProperty('--ad', String(sample.dir));
    }
    if (trailEl) trailEl.style.setProperty('--trail-strength', strength.toFixed(3));
  }

  // wipe the trail history to all-current-pose. called at the portal
  // teleport snap so the per-ghost lag index doesn't sample the pre-
  // teleport position and draw a long line across the arena
  function resetBossTrail() {
    const buf = state.bossTrail;
    buf.length = 0;
    for (let i = 0; i < TRAIL_HISTORY_MAX; i++) {
      buf.push({ x: state.bossX, y: state.bossY, dir: state.bossDir });
    }
    state.bossSpeedSmooth = 0;
    state.lastBossY = state.bossY;
  }

  // boss movement -- branches in this order:
  //   1. active glide animation (set by setPhase on phase change) --
  //      eases from prev position to the new phase's home over the
  //      transition window
  //   2. per-phase steady-state movement (p1 sine, p2 hold, ...)
  function updateBossMovement(t) {
    const vh = window.innerHeight / 100;
    // active glide -- ease from src to dst, clear when complete
    if (state.bossGlide) {
      const g = state.bossGlide;
      const k = Math.min(1, (t - g.startT) / g.durMs);
      const e = easeOutCubic(k);
      state.bossX = lerp(g.fromX, g.toX, e);
      state.bossY = lerp(g.fromY, g.toY, e);
      if (k >= 1) state.bossGlide = null;
      bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
      bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
      updateBossDir();
      return;
    }
    // steady state per phase
    const elapsedSec = (t - state.phaseStartT) / 1000;
    if (state.phase === 1) {
      const xAmpVh = 22, yAmpVh = 1.4;
      const xFreq  = 0.14, yFreq = 0.36;
      const xVh = Math.sin(elapsedSec * 2 * Math.PI * xFreq) * xAmpVh;
      const yVh = Math.sin(elapsedSec * 2 * Math.PI * yFreq) * yAmpVh;
      state.bossX = xVh * vh;
      state.bossY = yVh * vh;
    } else if (state.phase === 2) {
      // hold at the phase-2 home (slightly below center, no drift)
      const tgt = BOSS_PHASE_TARGETS_VH[2];
      state.bossX = tgt.x * vh;
      state.bossY = tgt.y * vh;
    } else if (state.phase === 3) {
      // sub-mode owns the boss's steady-state position. scatter orbits
      // a local ellipse anchored at currentSpot; hop / return-hop are
      // driven by updatePortalHop (this branch is a no-op for them);
      // interlude / climax glide+drift via the bossGlide branch above
      // and the phase-1 sine here
      if (state.phase3Mode === 'scatter') {
        // TOP uses the original wider ellipse; corner spots use the
        // smaller local ellipse so the orbit stays inside the box at
        // the corner anchors. all clock off sectionStartT so the
        // cycle's first + spawns from the same orbital phase
        const cycleSec = Math.max(0, (t - state.sectionStartT) / 1000);
        const w = 2 * Math.PI * PHASE_3_ELLIPSE_FREQ_HZ;
        const spot = PHASE_3_SCATTER_SPOTS[state.currentSpot];
        const ax = spot.x * vh;
        const ay = spot.y * vh;
        const ex = (state.currentSpot === 'TOP' ? PHASE_3_ELLIPSE_X_VH : PHASE_3_CORNER_ELLIPSE_X_VH) * vh;
        const ey = (state.currentSpot === 'TOP' ? PHASE_3_ELLIPSE_Y_VH : PHASE_3_CORNER_ELLIPSE_Y_VH) * vh;
        state.bossX = ax + Math.cos(cycleSec * w) * ex;
        state.bossY = ay + Math.sin(cycleSec * w) * ey;
      } else if (state.phase3Mode === 'hop' || state.phase3Mode === 'return-hop') {
        // portal hop -- boss position is driven by updatePortalHop
        // each frame. nothing to do here; just leave bossX/Y untouched
      } else if (state.phase3Mode === 'climax') {
        // boss holds wherever cycle 6's orbit left it -- the closing
        // spiral fires from the orb's current center, so a stationary
        // hold reads cleanly without a snap-to-(0,0). updateBossMovement
        // leaves bossX/Y alone here
      } else if (state.phase3Mode === 'interlude') {
        // phase-1-style slow sine, but clocked off interludeSineStartT
        // so sine(0) = (0,0) -- continuous with where the entry-glide
        // dropped the boss. if the glide is still active, the earlier
        // bossGlide branch has already returned; this only runs once
        // the glide has cleared
        const sineSec = (t - state.interludeSineStartT) / 1000;
        if (sineSec >= 0) {
          const xAmpVh = 22, yAmpVh = 1.4;
          const xFreq  = 0.14, yFreq = 0.36;
          state.bossX = Math.sin(sineSec * 2 * Math.PI * xFreq) * xAmpVh * vh;
          state.bossY = Math.sin(sineSec * 2 * Math.PI * yFreq) * yAmpVh * vh;
        }
      }
    } else if (state.phase === 6) {
      // phase 6 -- top-of-arena TRACK MOTION. while the dialogue-
      // transition window is still up (portal entry + swear shower),
      // boss holds at home so the swear bubbles have a stationary
      // anchor. once the program begins, the boss circles upward into
      // a shallow ellipse: fast at the left + right corners, slow
      // across the top + bottom of the loop. integrates theta per
      // frame because dθ/dt depends on theta itself (|cos|-modulated)
      if (t < state.transitionUntilT) {
        state.bossX = 0;
        state.bossY = 0;
        // hold the seed so the first post-window frame starts at home
        state.phase6Theta = Math.PI / 2;
        state.phase6LastT = t;
      } else {
        const rx = PHASE_6_TRACK_RX_VH * vh;
        const ry = PHASE_6_TRACK_RY_VH * vh;
        // fresh entry -- reseed integration state. phase6LastT < the
        // current phaseStartT means we haven't ticked this phase yet
        // (or someone scrubbed via [ ])
        if (state.phase6LastT < state.phaseStartT) {
          state.phase6Theta = Math.PI / 2;  // boss at home (bottom of loop)
          state.phase6LastT = t;
        }
        const dt = Math.min(0.064, (t - state.phase6LastT) / 1000);
        state.phase6LastT = t;
        const speed = PHASE_6_TRACK_OMEGA_BASE *
                      (1 + PHASE_6_TRACK_SPEED_K * Math.abs(Math.cos(state.phase6Theta)));
        state.phase6Theta += speed * dt;
        // ellipse center one ry ABOVE home (negative y in screen),
        // so the path goes from (0,0)=home at θ=π/2 up + around
        state.bossX = rx * Math.cos(state.phase6Theta);
        state.bossY = -ry + ry * Math.sin(state.phase6Theta);
      }
    } else if (state.phase === 7) {
      // phase 7a KADENZ -- gentle tight lissajous around home. x runs
      // at base ω, y at 2x ω with a small phase offset, tracing a
      // small figure-8-ish wobble. closed-form so no integration state
      const ax = PHASE_7A_OSC_AMP_X_VH * vh;
      const ay = PHASE_7A_OSC_AMP_Y_VH * vh;
      const w  = PHASE_7A_OSC_OMEGA;
      state.bossX = ax * Math.sin(w * elapsedSec);
      state.bossY = ay * Math.sin(2 * w * elapsedSec + PHASE_7A_OSC_PHASE);
    } else if (state.phase === 8) {
      // phase 7b TODESREIGEN + UNTERGANG -- still in x, tiny breath
      // in y. boss reads as rooted while the rings close + the snakes
      // multiply around it
      state.bossX = 0;
      state.bossY = PHASE_7B_HOVER_AMP_VH * vh *
                    Math.sin(PHASE_7B_HOVER_OMEGA * elapsedSec);
    }
    bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
    bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
    updateBossDir();
  }

  // diagonal arrays -- row of orbs fired at a fixed angle. direction
  // (left-down vs right-down) flips each volley. boss's own drift
  // makes the resulting walls slant + offset over time. intervalMs
  // is optional -- defaults to the phase-1 cadence; phase 3's
  // interlude passes a tighter value to ramp density
  function pattern_diagonal(t, intervalMs) {
    const interval = intervalMs != null ? intervalMs : DIAGONAL_INTERVAL_MS;
    if (t - state.lastFireBossT < interval) return;
    state.lastFireBossT = t;
    state.diagDir = -state.diagDir;
    const vh = window.innerHeight / 100;
    const speed = ORB_SPEED_DIAGONAL_VH * vh;
    const angRad = (DIAGONAL_ANGLE_DEG * state.diagDir + 90) * Math.PI / 180;
    const vx = Math.cos(angRad) * speed;
    const vy = Math.sin(angRad) * speed;
    const c = bossCenterPx();
    // spawn the row PERPENDICULAR to the diagonal direction so the
    // line of orbs reads as a single wall moving at that angle
    const perpAng = angRad + Math.PI / 2;
    const px = Math.cos(perpAng), py = Math.sin(perpAng);
    const spacingPx = DIAGONAL_SPACING_VH * vh;
    for (let i = 0; i < DIAGONAL_COUNT; i++) {
      const off = (i - (DIAGONAL_COUNT - 1) / 2) * spacingPx;
      spawnShadowOrb(c.x + px * off, c.y + py * off, vx, vy);
    }
  }

  // tight cone aimed at the player's current position. lead is small
  // (no prediction); player has to weave the moving wedge. intervalMs
  // is optional -- defaults to the phase-1 cadence; interlude tightens
  // it for the ramped-density middle beat of phase 3
  function pattern_wedge(t, intervalMs) {
    const interval = intervalMs != null ? intervalMs : WEDGE_INTERVAL_MS;
    if (t - state.lastFireBossT < interval) return;
    state.lastFireBossT = t;
    const vh = window.innerHeight / 100;
    const speed = ORB_SPEED_WEDGE_VH * vh;
    const c = bossCenterPx();
    const px = window.innerWidth / 2 + state.playerX;
    const py = 85 * vh + state.playerY;
    const base = Math.atan2(py - c.y, px - c.x);
    const spread = WEDGE_SPREAD_DEG * Math.PI / 180;
    const step = spread / (WEDGE_COUNT - 1);
    for (let i = 0; i < WEDGE_COUNT; i++) {
      const a = base - spread / 2 + i * step;
      spawnShadowOrb(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed);
    }
  }

  // continuous rotating pair -- two orbs spawned on opposite radials.
  // angle accumulates state.spiralAngle each spawn so the arms wind
  // visibly. denser cadence than the diagonal volleys; reads as a
  // single sustained spiral instead of discrete walls. lastFireKey is
  // optional -- defaults to the shared lastFireBossT; the interlude
  // climax passes its own key so spiral + crossBeams can fire
  // concurrently without stepping on each other's interval check
  function pattern_spiral(t, lastFireKey) {
    const key = lastFireKey || 'lastFireBossT';
    if (t - state[key] < SPIRAL_INTERVAL_MS) return;
    state[key] = t;
    const vh = window.innerHeight / 100;
    const speed = ORB_SPEED_SPIRAL_VH * vh;
    const c = bossCenterPx();
    state.spiralAngle += SPIRAL_STEP_RAD;
    // climax-only -- bigger orbs for the phase-3 closer. phase-1 spiral
    // keeps the default size so the cycler reads the same as before
    const opts = lastFireKey === 'lastFireSpiralT' ? { big: true } : undefined;
    for (let k = 0; k < 2; k++) {
      const a = state.spiralAngle + k * Math.PI;
      spawnShadowOrb(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed, opts);
    }
  }

  // phase 2 -- cross beams. 4 cardinal directions from the centered
  // boss; each beam splits at the inner border into 2 inward orbs at
  // +-45 deg (patchouli EoSD-style). rotation offset advances each
  // salvo so successive crosses don't perfectly overlap. lastFireKey
  // is optional -- see pattern_spiral for why this exists
  function pattern_crossBeams(t, lastFireKey) {
    const key = lastFireKey || 'lastFireBossT';
    if (t - state[key] < CROSS_BEAM_INTERVAL_MS) return;
    state[key] = t;
    const vh = window.innerHeight / 100;
    const speed = CROSS_BEAM_SPEED_VH * vh;
    const c = bossCenterPx();
    const cardinals = [0, 90, 180, 270];
    for (const baseDeg of cardinals) {
      const a = (baseDeg + state.crossRotation) * Math.PI / 180;
      spawnShadowOrb(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed,
                     { isBeam: true, bounceCount: 0 });
    }
    // rotate the next salvo by CROSS_BEAM_ROT_STEP, wrapping at 90deg
    // (the cardinals are 90-symmetric so wrapping at 90 covers all
    // unique orientations)
    state.crossRotation = (state.crossRotation + CROSS_BEAM_ROT_STEP) % 90;
  }

  // spawn a single radial damage-zone beam at polar angle `polarAng`
  // (same convention as orb spawners: 0 = +x, pi/2 = +y/down). beam
  // pivots at its top end, so it extends OUTWARD from boss center.
  // css transform-origin handles the pivot; we just translate the
  // top-center to boss and rotate. updateBeams reaches in each frame
  // to update both the rotation (15deg over lifetime) and the anchor
  // (so the beam tracks the boss if it drifts at all in phase 2).
  // dir is +1 / -1 -- sign of the rotation. set per-cycle in
  // pattern_radialBeams so successive +s walk opposite directions
  function spawnRadialBeam(polarAng, t, dir) {
    const vh = window.innerHeight / 100;
    const el = document.createElement('div');
    el.className = 'radial-beam';
    el.style.width  = (RADIAL_BEAM_WIDTH_VH  * vh) + 'px';
    el.style.height = (RADIAL_BEAM_LENGTH_VH * vh) + 'px';
    const c = bossCenterPx();
    el.style.left = c.x + 'px';
    el.style.top  = c.y + 'px';
    // css rotation: 0deg = down. polar 0 = +x = css 90deg right; polar
    // pi/2 = down = css 0deg. so cssDeg = 90 - polarDeg
    const cssDeg = 90 - polarAng * 180 / Math.PI;
    el.style.transform = 'translate(-50%, 0) rotate(' + cssDeg + 'deg)';
    beamsEl.appendChild(el);
    // fade-in via the data-on attribute -- next frame so the css
    // transition has an "off" -> "on" edge to animate
    requestAnimationFrame(() => el.setAttribute('data-on', 'true'));
    state.beams.push({
      el,
      basePolar:    polarAng,
      startT:       t,
      lengthVh:     RADIAL_BEAM_LENGTH_VH,
      halfWidthVh:  RADIAL_BEAM_WIDTH_VH / 2,
      totalRotRad:  RADIAL_BEAM_ROT_DEG * Math.PI / 180 * dir,
      fadingOut:    false
    });
  }

  // accompanying orb spray -- N evenly-spaced shadow orbs spawned at
  // boss center, all firing outward. tagged with cycleEndT so they get
  // culled together with the beams (rather than depending on flight
  // time to clear the inner box). slight random base offset so two
  // cycles in a row don't strobe the identical 14 directions
  function spawnRadialSpray(t) {
    const vh = window.innerHeight / 100;
    const c = bossCenterPx();
    const speed = RADIAL_SPRAY_SPEED_VH * vh;
    const baseAng = Math.random() * 2 * Math.PI;
    const cycleEndT = t + RADIAL_BEAM_LIFE_MS;
    for (let i = 0; i < RADIAL_SPRAY_COUNT; i++) {
      const a = baseAng + i * (2 * Math.PI / RADIAL_SPRAY_COUNT);
      spawnShadowOrb(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed,
                     { cycleEndT });
    }
  }

  // phase 2 layered move -- starts at PHASE_2_RADIAL_START_MS into the
  // phase, cycles every RADIAL_BEAM_INTERVAL_MS. each cycle fires N
  // straight beams + the spray; both expire at the same lifetime mark
  // so they disappear together. cross-beams keep firing underneath
  // via pattern_crossBeams, which uses its own lastFireBossT cadence
  function pattern_radialBeams(t) {
    const phaseElapsed = t - state.phaseStartT;
    if (phaseElapsed < PHASE_2_RADIAL_START_MS) return;
    if (t - state.lastFireRadialT < RADIAL_BEAM_INTERVAL_MS) return;
    state.lastFireRadialT = t;
    // flip the rotation direction each cycle -- one + walks clockwise,
    // the next counter-clockwise. all 4 beams in a cycle share the
    // same direction so the + reads as one coordinated rotation
    state.radialDir = -state.radialDir;
    // fixed cardinals -- forms a + extending to the four edges of
    // the box. the rotation over lifetime walks the + a little
    // off-axis so it doesn't read as static. polar convention: 0=right,
    // pi/2=down, pi=left, 3pi/2=up
    const cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    for (const a of cardinals) spawnRadialBeam(a, t, state.radialDir);
    spawnRadialSpray(t);
    // umise_057 -- one cue per +, not per beam
    playRadialBeam();
  }

  // per-frame beam update: rotation, anchor tracking, fade-out lead-in,
  // lifetime cull, and collision. collision is line-segment: project
  // player center into the beam's local frame (along + perpendicular),
  // hit if along is within [0, length] AND |perp| within half-width.
  // gated on state.orbDamage just like the orb hit check so pattern
  // tuning doesn't kill the player every cycle
  function updateBeams(t) {
    if (state.beams.length === 0) return;
    const vh = window.innerHeight / 100;
    const p  = getPlayerHitboxPx();
    const c  = bossCenterPx();
    const immune = t < state.immuneUntilT;
    const pcx = (p.l + p.r) / 2;
    const pcy = (p.t + p.b) / 2;
    for (let i = state.beams.length - 1; i >= 0; i--) {
      const b = state.beams[i];
      const age = t - b.startT;
      // lifetime expiry -- pull dom + slot
      if (age >= RADIAL_BEAM_LIFE_MS) {
        b.el.remove();
        state.beams.splice(i, 1);
        continue;
      }
      // fade-out lead-in -- toggles opacity off so the css transition
      // runs while the beam is still drawable. only fired once
      if (!b.fadingOut && age >= RADIAL_BEAM_LIFE_MS - RADIAL_BEAM_FADE_MS) {
        b.el.setAttribute('data-on', 'false');
        b.fadingOut = true;
      }
      // rotation -- linear over lifetime, totals totalRotRad
      const k = age / RADIAL_BEAM_LIFE_MS;
      const polarAng = b.basePolar + b.totalRotRad * k;
      const cssDeg = 90 - polarAng * 180 / Math.PI;
      // re-anchor at boss center each frame (handles any boss drift)
      b.el.style.left = c.x + 'px';
      b.el.style.top  = c.y + 'px';
      b.el.style.transform = 'translate(-50%, 0) rotate(' + cssDeg + 'deg)';
      // collision -- skip if orb damage off or immune
      if (!state.orbDamage || immune || state.hits <= 0) continue;
      const dirX = Math.cos(polarAng);
      const dirY = Math.sin(polarAng);
      const dx = pcx - c.x;
      const dy = pcy - c.y;
      const along = dx * dirX + dy * dirY;
      const perp  = Math.abs(dx * -dirY + dy * dirX);
      const lenPx   = b.lengthVh    * vh;
      const halfWPx = b.halfWidthVh * vh;
      if (along >= 0 && along <= lenPx && perp <= halfWPx) {
        takeDamage(t);
      }
    }
  }

  // wipe every active beam -- used on reset + phase changes so the
  // arena starts clean. mirrors the enemyBullets wipe in setPhase
  function clearBeams() {
    for (const b of state.beams) b.el.remove();
    state.beams.length = 0;
    state.lastFireRadialT = 0;
  }

  // ---- phase 3 -- spinning + projectiles ----------------------------
  // spawn a single + at the boss's current orbiting position with a
  // randomly-picked target inside the inner box. the + flies outward
  // via easeOutCubic in updatePlusProjectiles (rapid initial speed,
  // exponential-feeling slowdown), then locks into place at the
  // target. lockedRotation is the orientation the cross beams will
  // fire at, randomized 0..pi/2 (cross is 4-fold symmetric so the
  // meaningful range is one quadrant)
  function spawnPlusProjectile(t) {
    const vh = window.innerHeight / 100;
    const c  = bossCenterPx();
    // target = random angle + random distance from arena center, then
    // clamped to keep it well inside the box. the "based on distance
    // from the rectangle" framing: distance is the primary knob, angle
    // is uniformly random
    const arenaCx = window.innerWidth / 2;
    const arenaCy = 52 * vh;  // box vertical center (top 12vh + half 40vh)
    const targAng = Math.random() * 2 * Math.PI;
    const distVh  = PHASE_3_TARGET_RADIUS_MIN_VH +
                    Math.random() * (PHASE_3_TARGET_RADIUS_MAX_VH - PHASE_3_TARGET_RADIUS_MIN_VH);
    let tx = arenaCx + Math.cos(targAng) * distVh * vh;
    let ty = arenaCy + Math.sin(targAng) * distVh * vh;
    const ib = getInnerBoxPx();
    const m  = PHASE_3_TARGET_EDGE_MARGIN_VH * vh;
    tx = Math.max(ib.l + m, Math.min(ib.r - m, tx));
    ty = Math.max(ib.t + m, Math.min(ib.b - m, ty));
    // locked cross axis -- random per +, kept to 0..90deg
    const lockedRotation = Math.random() * Math.PI / 2;

    const sz = PHASE_3_PLUS_SIZE_VH * vh;
    const el = document.createElement('div');
    el.className = 'spinning-plus';
    el.style.width  = sz + 'px';
    el.style.height = sz + 'px';
    el.style.left   = c.x + 'px';
    el.style.top    = c.y + 'px';
    el.style.transform = 'translate(-50%, -50%)';
    const hBar = document.createElement('div');
    hBar.className = 'spinning-plus__bar spinning-plus__bar--h';
    const vBar = document.createElement('div');
    vBar.className = 'spinning-plus__bar spinning-plus__bar--v';
    el.appendChild(hBar);
    el.appendChild(vBar);
    beamsEl.appendChild(el);

    state.plusProjectiles.push({
      el,
      spawnT:         t,
      startX:         c.x,
      startY:         c.y,
      targetX:        tx,
      targetY:        ty,
      lockedRotation,
      previewEl:      null,
      beamEl:         null
    });
    // umise_075 -- toss-time cue. phase 3 plus uses a different state
    // machine from phase 6 split-cross, so this wiring lives here too
    // (not just in spawnSplitCross)
    playSplitCross();
  }

  // build the thin preview cross at p's target position. two child
  // bars in a rotated square container so the cross can be oriented
  // along p.lockedRotation. the container's width/height = beam length
  // so the bars span fully across when set to 100% along that axis
  function createPlusPreview(p) {
    const vh = window.innerHeight / 100;
    const len = PHASE_3_PLUS_BEAM_LENGTH_VH    * vh;
    const w   = PHASE_3_PLUS_PREVIEW_WIDTH_VH  * vh;
    const c = document.createElement('div');
    c.className = 'plus-preview';
    c.style.left   = p.targetX + 'px';
    c.style.top    = p.targetY + 'px';
    c.style.width  = len + 'px';
    c.style.height = len + 'px';
    const deg = p.lockedRotation * 180 / Math.PI;
    c.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
    const h = document.createElement('div');
    h.className = 'plus-preview__bar plus-preview__bar--h';
    h.style.height = w + 'px';
    const v = document.createElement('div');
    v.className = 'plus-preview__bar plus-preview__bar--v';
    v.style.width = w + 'px';
    c.appendChild(h);
    c.appendChild(v);
    beamsEl.appendChild(c);
    requestAnimationFrame(() => c.setAttribute('data-on', 'true'));
    return c;
  }

  // build the wider primary firing cross. same structure as the
  // preview, just thicker bars + heavier opacity. collision uses the
  // p.lockedRotation + target position + beam width math (no need to
  // reach into the dom each frame for collision)
  function createPlusBeam(p) {
    const vh = window.innerHeight / 100;
    const len = PHASE_3_PLUS_BEAM_LENGTH_VH * vh;
    const w   = PHASE_3_PLUS_BEAM_WIDTH_VH  * vh;
    const c = document.createElement('div');
    c.className = 'plus-beam';
    c.style.left   = p.targetX + 'px';
    c.style.top    = p.targetY + 'px';
    c.style.width  = len + 'px';
    c.style.height = len + 'px';
    const deg = p.lockedRotation * 180 / Math.PI;
    c.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
    const h = document.createElement('div');
    h.className = 'plus-beam__bar plus-beam__bar--h';
    h.style.height = w + 'px';
    const v = document.createElement('div');
    v.className = 'plus-beam__bar plus-beam__bar--v';
    v.style.width = w + 'px';
    c.appendChild(h);
    c.appendChild(v);
    beamsEl.appendChild(c);
    requestAnimationFrame(() => c.setAttribute('data-on', 'true'));
    return c;
  }

  // per-frame update -- one state machine per +, derived from age
  // since spawn. handles flight (lerp + spin), settled (lock + face),
  // preview (telegraph cross), firing (damage beams + collision),
  // and done (cull). collision math: transform player center into the
  // beam's local frame (rotate by -lockedRotation), then a hit happens
  // if either the H bar (|ly| < halfW, |lx| < lenHalf) or V bar
  // (|lx| < halfW, |ly| < lenHalf) brackets the player
  function updatePlusProjectiles(t) {
    if (state.plusProjectiles.length === 0) return;
    const vh = window.innerHeight / 100;
    const p_hb = getPlayerHitboxPx();
    const immune = t < state.immuneUntilT;
    const pcx = (p_hb.l + p_hb.r) / 2;
    const pcy = (p_hb.t + p_hb.b) / 2;
    const previewStart = PHASE_3_PLUS_SETTLE_MS + PHASE_3_PLUS_PREVIEW_DELAY_MS;
    const firingStart  = previewStart + PHASE_3_PLUS_PREVIEW_MS;
    const doneAge      = firingStart  + PHASE_3_PLUS_BEAM_LIFE_MS;
    const halfWPx      = (PHASE_3_PLUS_BEAM_WIDTH_VH / 2) * vh;
    const lenHalfPx    = (PHASE_3_PLUS_BEAM_LENGTH_VH / 2) * vh;

    for (let i = state.plusProjectiles.length - 1; i >= 0; i--) {
      const p = state.plusProjectiles[i];
      const age = t - p.spawnT;

      // position + visual rotation
      if (age < PHASE_3_PLUS_SETTLE_MS) {
        // flying -- ease toward target, continuous spin
        const k = easeOutCubic(age / PHASE_3_PLUS_SETTLE_MS);
        const x = lerp(p.startX, p.targetX, k);
        const y = lerp(p.startY, p.targetY, k);
        const spinDeg = (age / 1000) * PHASE_3_PLUS_SPIN_DPS;
        p.el.style.left = x + 'px';
        p.el.style.top  = y + 'px';
        p.el.style.transform = 'translate(-50%, -50%) rotate(' + spinDeg + 'deg)';
      } else {
        // settled -- lock at target with the locked cross orientation
        const deg = p.lockedRotation * 180 / Math.PI;
        p.el.style.left = p.targetX + 'px';
        p.el.style.top  = p.targetY + 'px';
        p.el.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
      }

      // state transitions -- create/remove preview + beam els
      const inPreview = age >= previewStart && age < firingStart;
      const inFiring  = age >= firingStart  && age < doneAge;
      const done      = age >= doneAge;

      if (inPreview && !p.previewEl) p.previewEl = createPlusPreview(p);
      if (inFiring) {
        if (p.previewEl) { p.previewEl.remove(); p.previewEl = null; }
        if (!p.beamEl) {
          p.beamEl = createPlusBeam(p);
          // umise_072 -- fires exactly at preview->beam handoff, once
          // per +, so a trio gets a 3-stack chord which reads right
          playPlusFire();
        }
      }

      // collision while firing
      if (inFiring && p.beamEl && !immune && state.orbDamage && state.hits > 0) {
        const dx = pcx - p.targetX;
        const dy = pcy - p.targetY;
        const cs = Math.cos(-p.lockedRotation);
        const sn = Math.sin(-p.lockedRotation);
        const lx = dx * cs - dy * sn;
        const ly = dx * sn + dy * cs;
        const hHit = Math.abs(ly) < halfWPx && Math.abs(lx) < lenHalfPx;
        const vHit = Math.abs(lx) < halfWPx && Math.abs(ly) < lenHalfPx;
        if (hHit || vHit) takeDamage(t);
      }

      if (done) {
        p.el.remove();
        if (p.previewEl) p.previewEl.remove();
        if (p.beamEl)    p.beamEl.remove();
        state.plusProjectiles.splice(i, 1);
      }
    }
  }

  // toss schedule -- one + every PHASE_3_PLUS_TOSS_INTERVAL_MS until
  // PHASE_3_PLUS_COUNT is hit. each + spawns at the boss's current
  // orbiting position so the toss reads as emerging from the boss
  function pattern_phase3Scatter(t) {
    if (state.plusTossCount >= PHASE_3_PLUS_COUNT) return;
    if (t < state.nextPlusTossT) return;
    spawnPlusProjectile(t);
    state.plusTossCount++;
    state.nextPlusTossT = t + PHASE_3_PLUS_TOSS_INTERVAL_MS;
  }

  // wipe every active + + preview + beam. mirrors clearBeams; called
  // from setPhase so phase jumps land on a fresh field
  function clearPlusProjectiles() {
    for (const p of state.plusProjectiles) {
      p.el.remove();
      if (p.previewEl) p.previewEl.remove();
      if (p.beamEl)    p.beamEl.remove();
    }
    state.plusProjectiles.length = 0;
    state.nextPlusTossT = 0;
    state.plusTossCount = 0;
  }

  // ---- phase 3b -- tower barrage ------------------------------------
  // per-kind anchor + extension direction. directions use the same
  // polar convention as orbs (0 = +x right, pi/2 = +y down)
  function getTowerSpec(kind) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    switch (kind) {
      case 'front-left':
        // flanks the boss at the same vertical line (BOSS_CENTER_Y_VH).
        // y=14 used to put the circle half-above the box top edge (12vh)
        // once the 6vh-diameter circle landed -- moving it down here
        // keeps the whole disk inside the inner box AND aligns the front
        // pair horizontally with the boss it's flanking
        return { anchorX: cx - 18 * vh, anchorY: BOSS_CENTER_Y_VH * vh, extendDirRad: Math.PI / 2 };
      case 'front-right':
        return { anchorX: cx + 18 * vh, anchorY: BOSS_CENTER_Y_VH * vh, extendDirRad: Math.PI / 2 };
      case 'rear-left':
        // bottom-left, slightly inward of the literal corner so the
        // perpendicular tooth launch has travel room on both sides
        // (at the true corner, half the teeth fly straight into the
        // wall and despawn immediately)
        return { anchorX: cx - 26 * vh, anchorY: 86 * vh, extendDirRad: -Math.PI / 2 };
      case 'rear-right':
        return { anchorX: cx + 26 * vh, anchorY: 86 * vh, extendDirRad: -Math.PI / 2 };
    }
    return null;
  }

  // create a tower at the named anchor. topdown circle -- pivot at
  // center, scale animates from 0 to 1 during the extend window via
  // the css transition. extendDirRad no longer drives a visual
  // rotation (circles are rotationally symmetric); it's kept on the
  // record because launchTeethFromTower still uses it as the axis
  // along which teeth are placed + perpendicular to which they fly
  function spawnTower(kind, t, opts) {
    // opts can override spec-derived anchor / extendDir + add a
    // velocity (for phase 7a's roaming towers) + a payload variant
    // ('teeth' or 'orbs') + an extended lifetime that pushes the
    // launch out so the tower can walk before firing
    const spec = getTowerSpec(kind);
    const anchorX = (opts && opts.anchorX != null) ? opts.anchorX
                  : (spec ? spec.anchorX : 0);
    const anchorY = (opts && opts.anchorY != null) ? opts.anchorY
                  : (spec ? spec.anchorY : 0);
    const extendDir = (opts && opts.extendDirRad != null) ? opts.extendDirRad
                    : (spec ? spec.extendDirRad : -Math.PI / 2);
    if (!spec && !(opts && opts.anchorX != null)) return;
    const velX = (opts && opts.velX) || 0;
    const velY = (opts && opts.velY) || 0;
    const variant = (opts && opts.variant) || 'teeth';
    const vh = window.innerHeight / 100;
    const diameterPx = TOWER_DIAMETER_VH * vh;
    const el = document.createElement('div');
    el.className = 'tower';
    el.style.left   = anchorX + 'px';
    el.style.top    = anchorY + 'px';
    el.style.width  = diameterPx + 'px';
    el.style.height = diameterPx + 'px';
    el.style.transform = 'translate(-50%, -50%) scale(0)';
    el.style.opacity = '1';
    beamsEl.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // base lifecycle. when a custom lifetimeMs is provided (roaming
    // towers), stretch the spin+fade segment so the tower walks
    // longer before fading out -- launch still fires at the regular
    // charge boundary so the player sees an early tooth/orb burst
    const lifetimeMs = (opts && opts.lifetimeMs) || (TOWER_EXTEND_MS + TOWER_CHARGE_MS + TOWER_SPIN_MS + TOWER_FADE_MS);
    const extendDoneT = t + TOWER_EXTEND_MS;
    const chargeDoneT = extendDoneT + TOWER_CHARGE_MS;
    const spinDoneT   = t + lifetimeMs - TOWER_FADE_MS;
    const fadeDoneT   = t + lifetimeMs;
    state.towers.push({
      el, kind,
      anchorX, anchorY,
      extendDirRad: extendDir,
      velX, velY,
      variant,
      lastT: t,
      spawnT: t,
      launchT: chargeDoneT,
      spinDoneT,
      fadeDoneT,
      launched: false
    });
    // umise_060 cue at extend-start. single call site so every variant
    // (front/rear/roaming/climax-wave) gets it for free
    playTowerSummon();
  }

  // launch the teeth salvo as a radial fan aimed at the player. fan
  // width is fixed (TOWER_TEETH_ARC_DEG); the center direction snapshots
  // the player's position at launch, so the salvo locks in to where
  // the player was AT launch and doesn't re-track in flight (gives the
  // player something to dodge). each tooth spawns just at the tower's
  // circle edge and flies straight outward in its slot's direction.
  // extendDirRad on the tower record is no longer referenced -- aiming
  // is purely player-tracked
  function launchTeethFromTower(tw, t) {
    const vh = window.innerHeight / 100;
    const speed = TOOTH_LAUNCH_SPEED_VH * vh;
    // player center -- midpoint of the hitbox aabb
    const p = getPlayerHitboxPx();
    const playerCx = (p.l + p.r) / 2;
    const playerCy = (p.t + p.b) / 2;
    const aimRad = Math.atan2(playerCy - tw.anchorY, playerCx - tw.anchorX);
    const arcRad = TOWER_TEETH_ARC_DEG * Math.PI / 180;
    const spawnR = (TOWER_DIAMETER_VH / 2) * vh;
    const count  = TOWER_TEETH_COUNT;
    for (let i = 0; i < count; i++) {
      // spread teeth evenly across [-arc/2, +arc/2]. single-tooth case
      // would divide by zero -- clamp to aim direction in that edge case
      const k = count <= 1 ? 0.5 : i / (count - 1);
      const ang = aimRad - arcRad / 2 + k * arcRad;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const px = tw.anchorX + cosA * spawnR;
      const py = tw.anchorY + sinA * spawnR;
      const vx = cosA * speed;
      const vy = sinA * speed;
      spawnTooth(px, py, vx, vy, 0, t);
    }
    // launch flash on the tower
    tw.el.setAttribute('data-launch', 'true');
  }

  // spawn one tooth. gen tracks the split generation (0 = original,
  // 3 = final after all splits). nextSplitT is 0 when this tooth has
  // no further splits (gen >= 3)
  function spawnTooth(x, y, vx, vy, gen, t) {
    const vh = window.innerHeight / 100;
    const el = document.createElement('div');
    el.className = 'tooth';
    el.style.width  = (TOOTH_LENGTH_VH * vh) + 'px';
    el.style.height = (TOOTH_WIDTH_VH  * vh) + 'px';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    const ang = Math.atan2(vy, vx);
    el.style.transform = 'translate(-50%, -50%) rotate(' + (ang * 180 / Math.PI) + 'deg)';
    beamsEl.appendChild(el);
    const interval = TOOTH_SPLIT_INTERVALS_MS[gen];
    const nextSplitT = (interval != null) ? t + interval : 0;
    state.teeth.push({ el, x, y, vx, vy, gen, nextSplitT });
  }

  // per-frame: launch trigger, fade, cull. on a circle the old spin
  // rotation is invisible, so the spin window is just a hold -- the
  // launch-flash css animation carries the visual punch at launchT.
  // fade runs from spinDoneT to fadeDoneT; tower is removed on
  // fadeDoneT
  function updateTowers(t) {
    if (state.towers.length === 0) return;
    for (let i = state.towers.length - 1; i >= 0; i--) {
      const tw = state.towers[i];
      // movement -- roaming towers (phase 7a) walk across the arena
      // on their velX/velY. dt computed from the per-tower lastT
      // since updateTowers doesn't receive dt directly
      if (tw.velX || tw.velY) {
        const dt = Math.max(0, (t - tw.lastT) / 1000);
        tw.anchorX += tw.velX * dt;
        tw.anchorY += tw.velY * dt;
        tw.el.style.left = tw.anchorX + 'px';
        tw.el.style.top  = tw.anchorY + 'px';
        tw.lastT = t;
      }
      // payload launch at start of spin. variant 'orbs' fires the
      // wider shadow-orb fan instead of teeth (phase 7a's wave 2)
      if (!tw.launched && t >= tw.launchT) {
        if (tw.variant === 'orbs') {
          launchOrbsFromTower(tw, t);
        } else {
          launchTeethFromTower(tw, t);
        }
        tw.launched = true;
      }
      // fade after spin window expires
      if (t >= tw.spinDoneT) {
        const k = Math.min(1, (t - tw.spinDoneT) / TOWER_FADE_MS);
        tw.el.style.opacity = (1 - k).toFixed(3);
      }
      if (t >= tw.fadeDoneT) {
        tw.el.remove();
        state.towers.splice(i, 1);
      }
    }
  }

  // orb-fan variant of launchTeethFromTower -- spawns a wider
  // arc of shadow orbs aimed at the player. used by phase 7a's
  // wave-2 roaming towers so the payload reads differently from
  // the standard teeth (which split + fan out via their own logic)
  const PHASE_7A_ORB_FAN_COUNT     = 9;
  const PHASE_7A_ORB_FAN_ARC_DEG   = 100;
  const PHASE_7A_ORB_FAN_SPEED_VH  = 28;
  function launchOrbsFromTower(tw, t) {
    const vh = window.innerHeight / 100;
    const p = getPlayerHitboxPx();
    const playerCx = (p.l + p.r) / 2;
    const playerCy = (p.t + p.b) / 2;
    const aimRad = Math.atan2(playerCy - tw.anchorY, playerCx - tw.anchorX);
    const arcRad = PHASE_7A_ORB_FAN_ARC_DEG * Math.PI / 180;
    const speed = PHASE_7A_ORB_FAN_SPEED_VH * vh;
    const spawnR = (TOWER_DIAMETER_VH / 2) * vh;
    for (let i = 0; i < PHASE_7A_ORB_FAN_COUNT; i++) {
      const k = PHASE_7A_ORB_FAN_COUNT <= 1 ? 0.5 : i / (PHASE_7A_ORB_FAN_COUNT - 1);
      const ang = aimRad - arcRad / 2 + k * arcRad;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const px = tw.anchorX + cosA * spawnR;
      const py = tw.anchorY + sinA * spawnR;
      spawnShadowOrb(px, py, cosA * speed, sinA * speed);
    }
    tw.el.setAttribute('data-launch', 'true');
  }

  // per-frame: movement, split-on-timer, collision, out-of-bounds cull.
  // splits replace the current tooth with two new ones at +-TOOTH_SPLIT_ANGLE_DEG
  // from current direction, with speed * TOOTH_SPEED_FALLOFF
  function updateTeeth(t, dt) {
    if (state.teeth.length === 0) return;
    const vh = window.innerHeight / 100;
    const p = getPlayerHitboxPx();
    const ib = getInnerBoxPx();
    const immune = t < state.immuneUntilT;
    for (let i = state.teeth.length - 1; i >= 0; i--) {
      const ts = state.teeth[i];
      ts.x += ts.vx * dt;
      ts.y += ts.vy * dt;
      // out-of-bounds cull
      if (ts.x < ib.l || ts.x > ib.r || ts.y < ib.t || ts.y > ib.b) {
        ts.el.remove();
        state.teeth.splice(i, 1);
        continue;
      }
      // split timer
      if (ts.nextSplitT > 0 && t >= ts.nextSplitT) {
        const speed = Math.hypot(ts.vx, ts.vy) * TOOTH_SPEED_FALLOFF;
        const dirAng = Math.atan2(ts.vy, ts.vx);
        const off = TOOTH_SPLIT_ANGLE_DEG * Math.PI / 180;
        const nextGen = ts.gen + 1;
        for (const sign of [-1, +1]) {
          const a = dirAng + sign * off;
          spawnTooth(ts.x, ts.y, Math.cos(a) * speed, Math.sin(a) * speed, nextGen, t);
        }
        // umise_046 -- one cue per subdivision (not per child). gets a
        // little stacked when a wave of teeth hits their split timer in
        // the same frame, which actually reads fine as a chord
        playToothSplit();
        ts.el.remove();
        state.teeth.splice(i, 1);
        continue;
      }
      // collision -- point in player hitbox aabb
      if (state.orbDamage && !immune && state.hits > 0 &&
          ts.x >= p.l && ts.x <= p.r && ts.y >= p.t && ts.y <= p.b) {
        takeDamage(t);
        ts.el.remove();
        state.teeth.splice(i, 1);
        continue;
      }
      // position write (rotation set on spawn; velocity doesn't change in flight)
      ts.el.style.left = ts.x + 'px';
      ts.el.style.top  = ts.y + 'px';
    }
  }

  // wipe -- used on reset + phase changes
  function clearTowers() {
    for (const tw of state.towers) tw.el.remove();
    state.towers.length = 0;
  }
  function clearTeeth() {
    for (const ts of state.teeth) ts.el.remove();
    state.teeth.length = 0;
  }

  // ---- phase 3 -- hexagram (orb-lattice star of david) --------------
  // lattice: 6 outer vertices at 30+60*i deg, two interlocking triangles
  // (verts 0,2,4 + verts 1,3,5). orbs spaced evenly along each of the
  // 6 edges. positions are in unit-circumradius space; multiplied by the
  // current radius + rotated by the current angle each frame to land
  // in world coords. computed once per hex spawn (not per frame)
  function computeHexLattice(orbsPerEdge) {
    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = (30 + 60 * i) * Math.PI / 180;
      verts.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    // triangle A = vertex indices 0,2,4; triangle B = 1,3,5
    const edges = [
      [0, 2], [2, 4], [4, 0],
      [1, 3], [3, 5], [5, 1]
    ];
    const out = [];
    for (const [a, b] of edges) {
      // skip the exact endpoints (vertices) -- those would double-up
      // where edges meet at each tip. evenly-spaced interior samples
      for (let i = 0; i < orbsPerEdge; i++) {
        const k = (i + 0.5) / orbsPerEdge;
        out.push({
          x: verts[a].x + (verts[b].x - verts[a].x) * k,
          y: verts[a].y + (verts[b].y - verts[a].y) * k
        });
      }
    }
    return out;
  }

  // spawn a single hexagram anchored to ARENA vertical center (not boss
  // center -- see the constants block for why). center is snapshotted
  // so the lattice doesn't drift across the cycle. orbs use .shadow-orb
  // so they read as the same hazard family as everything else phase 3
  // throws. dir alternates per spawn (+1, -1, +1, ...) so the
  // telescoping stars counter-rotate, preventing the nested layers
  // from fusing into one rigid lattice
  function spawnHexagram(t) {
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    const cy = PHASE_3_HEX_ANCHOR_Y_VH * vh;
    const lattice = computeHexLattice(PHASE_3_HEX_ORBS_PER_EDGE);
    const orbs = [];
    for (const p of lattice) {
      const el = document.createElement('div');
      el.className = 'shadow-orb';
      el.style.opacity = '0';  // updateHexagrams fades in via age
      orbsEl.appendChild(el);
      orbs.push({ el, latticeX: p.x, latticeY: p.y });
    }
    // even-indexed hexes spin one way, odd the other. hexCycleCount
    // hasn't been incremented yet at this call site, so use it directly
    const dir = (state.hexCycleCount % 2 === 0) ? 1 : -1;
    state.hexagrams.push({
      startT:  t,
      centerX: cx,
      centerY: cy,
      dir,
      orbs
    });
  }

  // per-frame -- animate every active hexagram. rotation is age-linear;
  // radius eases from inner to outer via easeOutCubic (rapid early
  // expansion, decel toward edge -- the dodge windows shrink as the
  // lattice spreads, which reads as the spell "settling" into the field).
  // fade-in + fade-out lead-in via inline opacity. collision: orb center
  // inside the player hitbox AABB triggers takeDamage
  function updateHexagrams(t) {
    if (state.hexagrams.length === 0) return;
    const vh = window.innerHeight / 100;
    const p_hb = getPlayerHitboxPx();
    const immune = t < state.immuneUntilT;
    const innerR = PHASE_3_HEX_INNER_R_VH * vh;
    const outerR = PHASE_3_HEX_OUTER_R_VH * vh;
    for (let i = state.hexagrams.length - 1; i >= 0; i--) {
      const hex = state.hexagrams[i];
      const age = t - hex.startT;
      if (age >= PHASE_3_HEX_CYCLE_DUR_MS) {
        for (const o of hex.orbs) o.el.remove();
        state.hexagrams.splice(i, 1);
        continue;
      }
      const k = age / PHASE_3_HEX_CYCLE_DUR_MS;
      const radius = lerp(innerR, outerR, easeOutCubic(k));
      const rotRad = (age / 1000) * PHASE_3_HEX_ROT_RATE_DPS * Math.PI / 180 * hex.dir;
      const cs = Math.cos(rotRad), sn = Math.sin(rotRad);
      // fade-in + fade-out lead-in
      let opacity = 1;
      if (age < PHASE_3_HEX_FADE_MS) {
        opacity = age / PHASE_3_HEX_FADE_MS;
      } else if (age > PHASE_3_HEX_CYCLE_DUR_MS - PHASE_3_HEX_FADE_MS) {
        opacity = Math.max(0, (PHASE_3_HEX_CYCLE_DUR_MS - age) / PHASE_3_HEX_FADE_MS);
      }
      for (const o of hex.orbs) {
        const lx = o.latticeX * radius;
        const ly = o.latticeY * radius;
        const wx = hex.centerX + lx * cs - ly * sn;
        const wy = hex.centerY + lx * sn + ly * cs;
        o.el.style.left = wx + 'px';
        o.el.style.top  = wy + 'px';
        o.el.style.opacity = opacity.toFixed(3);
        if (state.orbDamage && !immune && state.hits > 0 &&
            wx >= p_hb.l && wx <= p_hb.r &&
            wy >= p_hb.t && wy <= p_hb.b) {
          takeDamage(t);
        }
      }
    }
  }

  function clearHexagrams() {
    for (const hex of state.hexagrams) {
      for (const o of hex.orbs) o.el.remove();
    }
    state.hexagrams.length = 0;
  }

  // cycle controller -- spawns up to PHASE_3_HEX_CYCLE_COUNT hexagrams,
  // telescoping (each new one spawns mid-flight of the previous, so 2-3
  // are concurrent at peak -- inner one just spawned, outer one nearly
  // fully expanded). stagger = HEX_CYCLE_STAGGER_MS. once the last hex's
  // lifetime fully elapses, state.hexagrams drains + pattern_phase3b
  // hands off to cursor-intro
  function pattern_hexagramCycle(t) {
    if (state.hexCycleCount >= PHASE_3_HEX_CYCLE_COUNT) return;
    if (t < state.nextHexCycleT) return;
    spawnHexagram(t);
    state.hexCycleCount++;
    state.nextHexCycleT = t + PHASE_3_HEX_CYCLE_STAGGER_MS;
  }

  // ---- phase 3 -- cursor intro --------------------------------------
  // 5 volleys of 3 stacked teeth, fired at the player. lead tooth at
  // boss center, the next two queued behind along the reverse-firing
  // direction so they read as a column that arrives staggered. reuses
  // spawnTooth so the existing split mechanic still applies -- the
  // player sees a single tooth become 2, 4, 8 before the next column
  // even lands
  function pattern_cursorIntro(t) {
    if (state.cursorIntroVolleyCount >= PHASE_3_CURSOR_INTRO_VOLLEY_COUNT) return;
    if (t < state.nextCursorIntroVolleyT) return;
    const vh = window.innerHeight / 100;
    const c  = bossCenterPx();
    const px = window.innerWidth / 2 + state.playerX;
    const py = 85 * vh + state.playerY;
    const ang = Math.atan2(py - c.y, px - c.x);
    const speed = TOOTH_LAUNCH_SPEED_VH * vh;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const stackPx = PHASE_3_CURSOR_INTRO_STACK_SPACING_VH * vh;
    // stack inward (toward boss) -- lead tooth at boss center, next
    // two offset backward along the firing direction so they arrive
    // queued. all three share the same velocity vector
    for (let i = 0; i < PHASE_3_CURSOR_INTRO_STACK_COUNT; i++) {
      const offX = -Math.cos(ang) * stackPx * i;
      const offY = -Math.sin(ang) * stackPx * i;
      spawnTooth(c.x + offX, c.y + offY, vx, vy, 0, t);
    }
    state.cursorIntroVolleyCount++;
    state.nextCursorIntroVolleyT = t + PHASE_3_CURSOR_INTRO_VOLLEY_INTERVAL_MS;
  }

  // portal sfx -- pooled so overlapping opens (phase 3 exit + entry
  // hops are 900ms apart, phase 5b gates open several at once around
  // the player) don't cut each other off. routed through spawnPortal
  // so every phase that opens a portal gets the cue for free
  const PORTAL_SFX_URL  = SFX_BASE + 'portal.ogg';
  const PORTAL_SFX_POOL = 6;
  const PORTAL_SFX_VOL  = 0.43;
  const portalSfxPool = [];
  let   portalSfxIdx  = 0;
  for (let i = 0; i < PORTAL_SFX_POOL; i++) {
    const a = _audio(PORTAL_SFX_URL);
    a.preload = 'auto';
    a.volume  = PORTAL_SFX_VOL;
    portalSfxPool.push(a);
  }
  function playPortalSfx() {
    const a = portalSfxPool[portalSfxIdx];
    portalSfxIdx = (portalSfxIdx + 1) % PORTAL_SFX_POOL;
    try { a.currentTime = 0; } catch (_) {}
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  // spawn a shadow portal at a viewport-space (px) anchor. lives for
  // openMs (expand) + holdMs (visible) + closeMs (collapse), then
  // self-removes. used both as the exit (boss steps in) and entry
  // (boss steps out) anchors for portal hops
  function spawnPortal(px, py, openMs, holdMs, closeMs, t) {
    // universal portal sfx -- every caller routes through here so this
    // single hook covers phase 3 hops, phase 4 exit, phase 5a lance
    // portals, phase 5b gates, phase 6 entry
    playPortalSfx();
    const el = document.createElement('div');
    el.className = 'shadow-portal';
    el.style.left = px + 'px';
    el.style.top  = py + 'px';
    el.style.transform = 'translate(-50%, -50%) scale(0) rotate(0deg)';
    beamsEl.appendChild(el);
    // expand on the next frame so the css transition has an off->on
    // edge. opacity uses its own data-on toggle so the fade ramps with
    // the scale
    requestAnimationFrame(() => {
      el.style.transition = 'transform ' + openMs + 'ms ease-out, opacity 180ms ease-out';
      el.style.transform  = 'translate(-50%, -50%) scale(1) rotate(0deg)';
      el.setAttribute('data-on', 'true');
    });
    state.activePortals.push({
      el,
      spawnT:  t,
      openMs,
      holdMs,
      closeMs,
      closeAtT: t + openMs + holdMs
    });
  }

  // per-frame: collapse portals past their hold window, cull when fully
  // closed. the collapse uses the same transition the open did, just in
  // reverse -- scale -> 0 + opacity -> 0
  function updatePortals(t) {
    if (state.activePortals.length === 0) return;
    for (let i = state.activePortals.length - 1; i >= 0; i--) {
      const p = state.activePortals[i];
      if (!p.closing && t >= p.closeAtT) {
        p.el.style.transition = 'transform ' + p.closeMs + 'ms ease-in, opacity 200ms ease-in';
        p.el.style.transform  = 'translate(-50%, -50%) scale(0) rotate(0deg)';
        p.el.removeAttribute('data-on');
        p.closing = true;
        p.removeAtT = t + p.closeMs + 80;
      }
      if (p.closing && t >= p.removeAtT) {
        p.el.remove();
        state.activePortals.splice(i, 1);
      }
    }
  }

  // wipe every active portal -- used on reset + phase changes
  function clearPortals() {
    for (const p of state.activePortals) p.el.remove();
    state.activePortals.length = 0;
  }

  // ---- phase 5a -- shadow lance --------------------------------------
  // attack staging: telegraph (shadow on the player sprite + red rim) ->
  // bolt tree (pitch-black warped-triangle segments branching
  // recursively from the player's then-current position) -> dissolve.
  // dirRad is the angle the attack is coming from -- baked into the
  // telegraph's rotation AND the root segment's growth direction.
  // each lance entry is staged via updateLances, not setTimeout, so
  // resets clean themselves up correctly
  function spawnShadowLance(dirRad, totalDurMs, t) {
    // telegraph -- show the shadow on the player sprite. css rotates
    // it by --lance-angle. mapping from dirRad (0=+x, pi/2=+y down) to
    // cssDeg: local "up" of the telegraph element corresponds to
    // dirRad=-pi/2, so cssDeg = (dirRad*180/pi) + 90
    const cssDeg = (dirRad * 180 / Math.PI) + 90;
    playerTelegraphEl.style.setProperty('--lance-angle', cssDeg + 'deg');
    playerTelegraphEl.removeAttribute('data-dissolving');
    requestAnimationFrame(() => {
      playerTelegraphEl.setAttribute('data-on', 'true');
    });

    state.activeLances.push({
      stage:           'telegraph',
      spawnT:           t,
      telegraphEndT:    t + PHASE_5_LANCE_TELEGRAPH_MS,
      dirRad,
      // these fill in once the lance materializes (stage flips to 'growing')
      containerEl:      null,
      segments:         [],
      activeFromT:      0,
      dissolveAtT:      t + totalDurMs - PHASE_5_LANCE_DISSOLVE_MS,
      removeAtT:        t + totalDurMs,
      telegraphReleasedT: 0
    });
  }

  // recursive builder -- spawns one segment at (originX, originY)
  // pointing in dirRad, then forks two child branches at random attach
  // points along it. children grow perpendicular-ish (left + right of
  // parent) with a player-position bias so the tree visibly reaches
  // for the player. segArr collects every segment for collision later
  function buildLanceTree(container, originX, originY, dirRad, length, width, depth, segArr, playerCx, playerCy) {
    const seg = document.createElement('div');
    seg.className = 'shadow-lance__segment';
    seg.style.left   = originX + 'px';
    seg.style.top    = originY + 'px';
    seg.style.width  = width  + 'px';
    seg.style.height = length + 'px';
    // translate so the segment's base is at (origin), rotate to align
    // local "up" with dirRad. scaleY(0) initially -- next frame flips
    // to scaleY(1) so the css transition grows the segment from base
    // toward tip
    const cssDeg = (dirRad * 180 / Math.PI) + 90;
    const initTransform  = 'translate(-50%, -100%) rotate(' + cssDeg + 'deg) scaleY(0)';
    const grownTransform = 'translate(-50%, -100%) rotate(' + cssDeg + 'deg) scaleY(1)';
    seg.style.transform = initTransform;
    container.appendChild(seg);
    requestAnimationFrame(() => {
      seg.style.transform = grownTransform;
    });
    segArr.push({
      el: seg,
      originX, originY, dirRad,
      length, width
    });
    if (depth <= 0) return;

    // two children per parent -- one perpendicular-left, one
    // perpendicular-right. each direction biased toward the player's
    // current position so the tree visibly reaches for them
    for (let sign = -1; sign <= 1; sign += 2) {
      const attachFrac = PHASE_5_LANCE_ATTACH_MIN +
                         Math.random() * (PHASE_5_LANCE_ATTACH_MAX - PHASE_5_LANCE_ATTACH_MIN);
      const ax = originX + Math.cos(dirRad) * length * attachFrac;
      const ay = originY + Math.sin(dirRad) * length * attachFrac;
      // near-perpendicular base direction
      const perpDir = dirRad + sign * Math.PI / 2;
      // bias: pull a fraction of the way toward the player. compute
      // the signed angular delta from perpDir to (atan2 of toPlayer)
      const toPlayer = Math.atan2(playerCy - ay, playerCx - ax);
      let delta = toPlayer - perpDir;
      // wrap to [-pi, +pi] so the bias takes the shorter rotation
      delta = ((delta % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      const jitter = (Math.random() - 0.5) * 2 * PHASE_5_LANCE_PERP_JITTER_RAD;
      const childDir = perpDir + delta * PHASE_5_LANCE_PLAYER_BIAS + jitter;
      const childLen = length * PHASE_5_LANCE_BRANCH_SCALE;
      const childWid = width  * PHASE_5_LANCE_BRANCH_W_SCALE;
      buildLanceTree(container, ax, ay, childDir, childLen, childWid, depth - 1, segArr, playerCx, playerCy);
    }
  }

  // per-frame: stage transitions (telegraph -> growing -> dissolving),
  // cull, collision against every segment in the tree
  function updateLances(t) {
    if (state.activeLances.length === 0) return;
    const vh = window.innerHeight / 100;
    const p = getPlayerHitboxPx();
    const pcx = (p.l + p.r) / 2;
    const pcy = (p.t + p.b) / 2;
    const immune = t < state.immuneUntilT;
    for (let i = state.activeLances.length - 1; i >= 0; i--) {
      const L = state.activeLances[i];

      // telegraph -> growing: snapshot CURRENT player position, build
      // the bolt tree from there. fade the telegraph out
      if (L.stage === 'telegraph' && t >= L.telegraphEndT) {
        const container = document.createElement('div');
        container.className = 'shadow-lance';
        beamsEl.appendChild(container);
        L.containerEl = container;
        buildLanceTree(container, pcx, pcy, L.dirRad,
                       PHASE_5_LANCE_ROOT_LENGTH_VH * vh,
                       PHASE_5_LANCE_ROOT_WIDTH_VH  * vh,
                       PHASE_5_LANCE_BRANCH_DEPTH,
                       L.segments,
                       pcx, pcy);
        playLanceSkewer();
        // shadow portal at the lance root -- the bolt tree emerges
        // through it. opens on the same beat the trunk starts growing,
        // holds through the active window, closes as the lance
        // dissolves. anchored at the player snapshot position (not
        // tracking the player -- the lance itself is fixed at that
        // arena coord too)
        const portalHoldMs = Math.max(0,
          L.removeAtT - t - PHASE_5_LANCE_PORTAL_OPEN_MS - PHASE_5_LANCE_DISSOLVE_MS);
        spawnPortal(pcx, pcy,
                    PHASE_5_LANCE_PORTAL_OPEN_MS,
                    portalHoldMs,
                    PHASE_5_LANCE_DISSOLVE_MS, t);
        playerTelegraphEl.setAttribute('data-dissolving', 'true');
        L.telegraphReleasedT = t;
        // hitbox engages once the segments have finished their grow
        // transition (so the player isn't damaged while branches are
        // still scaling in from scaleY=0)
        L.activeFromT = t + PHASE_5_LANCE_GROW_MS;
        L.stage = 'growing';
      }

      // clean up the telegraph attribute after its fade completes --
      // otherwise stacking lances back-to-back would inherit the
      // 'dissolving' state
      if (L.stage === 'growing' && L.telegraphReleasedT > 0 &&
          t >= L.telegraphReleasedT + 320) {
        playerTelegraphEl.removeAttribute('data-on');
        playerTelegraphEl.removeAttribute('data-dissolving');
        L.telegraphReleasedT = 0;
      }

      // growing -> dissolving: start the opacity fade on the whole
      // container. segments stay in place; just lose opacity
      if (L.stage === 'growing' && t >= L.dissolveAtT) {
        if (L.containerEl) L.containerEl.setAttribute('data-dissolving', 'true');
        L.stage = 'dissolving';
      }

      // dissolving -> remove: pull the tree + drop the entry
      if (t >= L.removeAtT) {
        if (L.containerEl) L.containerEl.remove();
        playerTelegraphEl.removeAttribute('data-on');
        playerTelegraphEl.removeAttribute('data-dissolving');
        state.activeLances.splice(i, 1);
        continue;
      }

      // collision -- only while the lance is fully grown + not yet
      // dissolving. each segment is a tilted rectangle in arena px;
      // project player center into the segment's local frame and
      // check along/across against length + half-width
      if (state.orbDamage && !immune && state.hits > 0 &&
          L.stage === 'growing' && t >= L.activeFromT) {
        for (const seg of L.segments) {
          const dirX = Math.cos(seg.dirRad);
          const dirY = Math.sin(seg.dirRad);
          const perpX = -dirY;
          const perpY =  dirX;
          const dx = pcx - seg.originX;
          const dy = pcy - seg.originY;
          const along  = dx * dirX  + dy * dirY;
          const across = dx * perpX + dy * perpY;
          if (along >= 0 && along <= seg.length && Math.abs(across) < seg.width / 2) {
            takeDamage(t);
            break;
          }
        }
      }
    }
  }

  // ---- phase 5b -- gate storm ----------------------------------------
  // spawn one gate at a random spot on a gaussian-ish ring around the
  // player. clamp to box bounds so portals don't appear past the
  // arena edge. opens with a portal animation, fires 2 volleys at
  // configured intervals, then closes
  function spawnGate(t) {
    const vh = window.innerHeight / 100;
    const ph = getPlayerHitboxPx();
    const pcx = (ph.l + ph.r) / 2;
    const pcy = (ph.t + ph.b) / 2;
    const angle = Math.random() * 2 * Math.PI;
    // average of two uniforms in [-0.5,0.5] gives a roughly triangular
    // distribution -- close enough to gaussian for the "ring with
    // some variance" feel
    const r01 = (Math.random() + Math.random()) - 1;
    const dist = (PHASE_5B_RING_RADIUS_VH + r01 * PHASE_5B_RING_SIGMA_VH) * vh;
    let gx = pcx + Math.cos(angle) * dist;
    let gy = pcy + Math.sin(angle) * dist;
    // clamp to inner box with a margin so portals don't spawn past
    // the arena edge
    const ib = getInnerBoxPx();
    const m  = PHASE_5B_RING_MARGIN_VH * vh;
    gx = Math.max(ib.l + m, Math.min(ib.r - m, gx));
    gy = Math.max(ib.t + m, Math.min(ib.b - m, gy));
    const holdMs = Math.max(0, PHASE_5B_GATE_LIFETIME_MS - PHASE_5B_GATE_OPEN_MS - PHASE_5B_GATE_CLOSE_MS);
    spawnPortal(gx, gy,
                PHASE_5B_GATE_OPEN_MS,
                holdMs,
                PHASE_5B_GATE_CLOSE_MS, t);
    state.activeGates.push({
      spawnT:      t,
      posX:        gx,
      posY:        gy,
      volleyCount: 0,
      nextVolleyT: t + PHASE_5B_GATE_FIRST_VOLLEY_MS,
      removeAtT:   t + PHASE_5B_GATE_LIFETIME_MS
    });
  }

  // fire one volley from a gate -- 2 densely-packed lines of 3 orbs.
  // each line aims at the player's CURRENT position with a small
  // angular fan between the lines, and stacks 3 orbs behind the lead
  // along the firing direction so the volley reads as two columns
  function fireGateVolley(gx, gy, t) {
    const vh = window.innerHeight / 100;
    const ph = getPlayerHitboxPx();
    const pcx = (ph.l + ph.r) / 2;
    const pcy = (ph.t + ph.b) / 2;
    const aimAngle = Math.atan2(pcy - gy, pcx - gx);
    const speed = PHASE_5B_ORB_SPEED_VH * vh;
    const fan = PHASE_5B_LINE_FAN_DEG * Math.PI / 180;
    const halfFan = fan / 2;
    const stackPx = PHASE_5B_ORB_STACK_VH * vh;
    for (let l = 0; l < PHASE_5B_LINES_PER_VOLLEY; l++) {
      const lineAngle = (PHASE_5B_LINES_PER_VOLLEY <= 1)
        ? aimAngle
        : aimAngle - halfFan + (l / (PHASE_5B_LINES_PER_VOLLEY - 1)) * fan;
      const dirX = Math.cos(lineAngle);
      const dirY = Math.sin(lineAngle);
      const vx = dirX * speed;
      const vy = dirY * speed;
      for (let i = 0; i < PHASE_5B_ORBS_PER_LINE; i++) {
        // each orb starts behind the lead along the firing direction,
        // so the line reads as a tight column moving toward the player
        const back = i * stackPx;
        const sx = gx - dirX * back;
        const sy = gy - dirY * back;
        spawnShadowOrb(sx, sy, vx, vy);
      }
    }
  }

  // per-frame: probabilistic spawn maintenance + volley dispatch +
  // cull. spawn probability is high while below the target count,
  // very low at the target (so occasional 3 / 5 active is fine, the
  // user asked for "around 4")
  function updateGateStorm(t) {
    if (state.phase3Mode !== 'gate-storm') return;
    if (state.activeGates.length < PHASE_5B_GATE_TARGET_COUNT) {
      if (Math.random() < PHASE_5B_GATE_SPAWN_PROB_UNDER) spawnGate(t);
    } else if (state.activeGates.length < PHASE_5B_GATE_MAX_COUNT) {
      if (Math.random() < PHASE_5B_GATE_SPAWN_PROB_AT) spawnGate(t);
    }
    for (let i = state.activeGates.length - 1; i >= 0; i--) {
      const G = state.activeGates[i];
      if (G.volleyCount < PHASE_5B_GATE_VOLLEY_COUNT && t >= G.nextVolleyT) {
        fireGateVolley(G.posX, G.posY, t);
        G.volleyCount++;
        G.nextVolleyT = t + PHASE_5B_GATE_VOLLEY_INTERVAL_MS;
      }
      if (t >= G.removeAtT) {
        state.activeGates.splice(i, 1);
      }
    }
  }

  // wipe gate records -- used on reset + phase changes. the portal
  // elements live in state.activePortals + clear via clearPortals
  function clearGates() {
    state.activeGates.length = 0;
  }

  // wipe every active lance -- used on reset + phase changes
  function clearLances() {
    for (const L of state.activeLances) {
      if (L.containerEl) L.containerEl.remove();
    }
    state.activeLances.length = 0;
    playerTelegraphEl.removeAttribute('data-on');
    playerTelegraphEl.removeAttribute('data-dissolving');
  }

  // per-frame driver for the portal hop. inside hop / return-hop,
  // updateBossMovement leaves bossX/Y alone; this function owns the
  // boss position writes + the data-portaling fade. four stages
  // chained from hopStartT:
  //   A approach (only if hopApproachMs > 0) -- glide from hopFromX/Y
  //     to hopExitX/Y. for return-hops this is the "return to the top"
  //     beat. for instant hops, hopApproachMs is 0 and this stage is
  //     skipped entirely
  //   B portal-out -- exit portal opens at hopExitX/Y; boss fades into
  //     the shadow via data-portaling="out"
  //   C transit -- boss teleported to entry spot and held hidden
  //   D portal-in -- entry portal opens at destination; boss fades
  //     back in via data-portaling="in"
  function updatePortalHop(t) {
    if (state.phase3Mode !== 'hop' && state.phase3Mode !== 'return-hop') return;
    const vh = window.innerHeight / 100;
    const cx = window.innerWidth / 2;
    const elapsed = t - state.hopStartT;

    const approachMs = state.hopApproachMs;
    const exitX = state.hopExitX;
    const exitY = state.hopExitY;
    const entrySpot = PHASE_3_SCATTER_SPOTS[state.hopToSpot] || PHASE_3_SCATTER_SPOTS.TOP;
    const entryX = entrySpot.x * vh;
    const entryY = entrySpot.y * vh;
    // portal anchors in viewport px. BOSS_CENTER_Y_VH is the boss's
    // default vertical home (= visual center when bossY=0), so adding
    // the per-hop Y offset gives the actual portal Y in viewport coords
    const exitPx  = cx + exitX;
    const exitPy  = BOSS_CENTER_Y_VH * vh + exitY;
    const entryPx = cx + entryX;
    const entryPy = BOSS_CENTER_Y_VH * vh + entryY;

    // stage offsets relative to hopStartT
    const tApproachEnd = approachMs;
    const tOutEnd      = tApproachEnd + PHASE_3_PORTAL_OUT_MS;
    const tTransitEnd  = tOutEnd      + PHASE_3_PORTAL_TRANSIT_MS;
    const tInEnd       = tTransitEnd  + PHASE_3_PORTAL_IN_MS;

    // stage A -- glide from captured start to exit anchor (skipped
    // when approachMs is 0). easeOutCubic matches the rapid-initial
    // slowdown the + projectiles + bossGlide use
    if (elapsed < tApproachEnd) {
      const k = Math.min(1, elapsed / approachMs);
      const e = easeOutCubic(k);
      state.bossX = lerp(state.hopFromX, exitX, e);
      state.bossY = lerp(state.hopFromY, exitY, e);
      bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
      bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
      updateBossDir();
      return;
    }

    // stage B -- exit portal opens, boss fades into it. portal element
    // gets spawned once on first entry to this stage (one-shot guard)
    if (elapsed < tOutEnd) {
      if (!state.hopExitSpawned) {
        state.bossX = exitX;
        state.bossY = exitY;
        bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
        bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
        updateBossDir();
        spawnPortal(exitPx, exitPy,
                    PHASE_3_PORTAL_OUT_MS,
                    PHASE_3_PORTAL_TRANSIT_MS + PHASE_3_PORTAL_IN_MS,
                    PHASE_3_PORTAL_OUT_MS, t);
        bossEl.setAttribute('data-portaling', 'out');
        state.hopExitSpawned = true;
      }
      return;
    }

    // stage C -- transit. boss teleported to entry anchor and held
    // hidden. both portals are briefly visible during this window
    if (elapsed < tTransitEnd) {
      if (!state.hopTeleported) {
        state.bossX = entryX;
        state.bossY = entryY;
        bossEl.style.setProperty('--boss-x', state.bossX.toFixed(2) + 'px');
        bossEl.style.setProperty('--boss-y', state.bossY.toFixed(2) + 'px');
        // sync lastBossX too -- the teleport is an instant snap from
        // exitX, and the boss is invisible at this point (data-portaling
        // "hidden"), so we don't want the next frame's delta to read as
        // a giant flip in the wrong direction. resync without changing
        // the current bossDir
        state.lastBossX = state.bossX;
        // afterimage trail would otherwise sample exitX from a few
        // frames ago and draw a long ghost line across the arena to
        // entryX. flush the history to all-current-pose so the trail
        // resumes from here once the boss reappears
        resetBossTrail();
        bossEl.setAttribute('data-portaling', 'hidden');
        state.hopTeleported = true;
      }
      return;
    }

    // stage D -- entry portal opens at destination, boss fades back in
    if (elapsed < tInEnd) {
      if (!state.hopEntrySpawned) {
        spawnPortal(entryPx, entryPy,
                    PHASE_3_PORTAL_IN_MS,
                    PHASE_3_PORTAL_TRANSIT_MS,
                    PHASE_3_PORTAL_IN_MS, t);
        bossEl.setAttribute('data-portaling', 'in');
        state.hopEntrySpawned = true;
      }
      return;
    }

    // hop complete -- handed off in pattern_phase3b
  }

  // initialize per-kind state for the section at idx. called once on
  // entry into each section (by pattern_phase3b on advance). the section
  // body itself runs out of updatePhase + updateBossMovement, gated on
  // state.phase3Mode (which is the section kind)
  function enterSection(idx, t) {
    state.sectionIdx    = idx;
    state.sectionStartT = t;
    const sec = state.activeProgram[idx];
    if (!sec) {
      // program exhausted -- boss idles until phase auto-advance
      state.phase3Mode = 'idle';
      state.patternName = 'program-end';
      return;
    }
    state.phase3Mode = sec.kind;
    const vh = window.innerHeight / 100;
    if (sec.kind === 'lance') {
      // phase 5a's lance ambush. spawn point is the PLAYER's position
      // -- their shadow has become the danger. dirRad is the angle the
      // attack is coming from, baked into the telegraph + the trunk's
      // growth direction. spawnShadowLance handles the telegraph -> grow
      // -> hold -> dissolve staging across the section's duration
      spawnShadowLance(sec.dirRad, sec.durMs, t);
    } else if (sec.kind === 'idle') {
      // explicit no-op section. boss + attacks are silent for durMs
      // (phase 5a uses this between the two lances)
      state.patternName = 'idle';
    } else if (sec.kind === 'gate-storm') {
      // phase 5b -- updateGateStorm runs the maintenance loop while
      // phase3Mode === 'gate-storm', spawning portals + firing volleys
      // until the section ends. enterSection just sets the mode flag;
      // the loop handles all the actual gate work
      state.patternName = 'gate-storm';
    } else if (sec.kind === 'split-cross-volley') {
      // phase 6 -- staggered splitting-beam crosses. sec.count is the
      // max to spawn this section; the dispatcher fires one every
      // PHASE_6_VOLLEY_INTERVAL_MS while count is below the cap
      state.nextSplitCrossT  = t;
      state.splitCrossSpawned = 0;
      state.patternName = 'split-cross';
    } else if (sec.kind === 'cursor-volley') {
      // phase 6 -- reuse the cursor-intro pattern (5 stacked-column
      // teeth volleys aimed at the player). reset the counter so the
      // section gets a fresh run
      state.cursorIntroVolleyCount = 0;
      state.nextCursorIntroVolleyT = t;
      state.patternName = 'cursor-volley';
    } else if (sec.kind === 'tower-barrage') {
      // phase 6 -- reuse the tower barrage. front pair spawns at
      // section start, rear pair at +REAR_DELAY. one-shot flags
      // reset so it can replay
      state.phase3FrontSpawned = false;
      state.phase3RearSpawned  = false;
      state.patternName = 'tower-barrage';
    } else if (sec.kind === 'tower-roam-wave') {
      // phase 7a -- spawn N roaming towers across the section.
      // first spawns immediately, rest staggered every SPAWN_GAP
      state.nextRoamTowerT  = t;
      state.roamTowerSpawned = 0;
      state.patternName = 'tower-roam';
    } else if (sec.kind === 'puddle-lance-wave') {
      // phase 7a -- spawn puddles at sec.interval cadence; each
      // erupts into a lance 1.6s after its spawn (updatePuddles)
      state.nextPuddleT  = t;
      state.patternName = 'puddle-lance';
    } else if (sec.kind === 'phase7a-climax') {
      // phase 7a closer -- both mechanics layered. towers spawn at
      // a longer cadence (so they don't crowd the puddles); puddles
      // run at the dense interval. roamTowerSpawned cap doesn't apply
      // here -- climax keeps spawning until the section ends
      state.nextRoamTowerT   = t + 800;
      state.nextClimaxTowerT = t + 800;
      state.nextClimaxPuddleT = t + 200;
      state.roamTowerSpawned = 0;
      state.patternName = 'phase7a-climax';
    } else if (sec.kind === 'iron-maiden') {
      // phase 7b ultimate 1 -- concurrent telescoping rings. brief
      // grace, then the first ring spawns at the arena boundary;
      // updatePhase fires fresh rings every SPAWN_INTERVAL_MS so
      // 3-4 are alive at once, each at a different scale. fresh
      // chain state each entry so re-runs read clean
      clearMaidenBox();
      state.nextMaidenBoxT     = t + 600;
      state.maidenChainIdx     = 0;
      state.lastMaidenExitSide = null;
      state.patternName = 'iron-maiden';
    } else if (sec.kind === 'snake-curve') {
      // phase 7b ultimate 2 -- snake-curve trails. seed FOUR prongs
      // from the BOSS SPRITE in cardinal directions, then trickle
      // additional prongs over the section so the count grows. the
      // initial 4 don't saturate the grid alone within 24s, but the
      // trickle pushes the last unfilled corridors closed right as
      // the timer expires
      const bc = bossCenterPx();
      clearSnakes();
      for (const d of PHASE_7B_SNAKE_PRONG_DIRS) {
        spawnSnake(t, bc.x, bc.y, d);
      }
      state.nextSnakeTrickleT = t + PHASE_7B_SNAKE_TRICKLE_MS;
      state.patternName = 'snake-curve';
    } else if (sec.kind === 'climax') {
      // phase 6 closer -- everything layered. split-crosses open at
      // a HEAVY cadence that ramps down to steady-state over
      // CLIMAX_RAMP_MS. cursor volleys ride at CLIMAX_CURSOR_MS.
      // towers fire TWO waves: first pair at section start +
      // REAR_DELAY, second pair at FRONT2_T / REAR2_T so the closer
      // keeps biting through to the end
      state.climaxNextSplitT   = t;
      state.nextCursorVolleyT  = t;
      state.cursorIntroVolleyCount = 0;
      state.nextCursorIntroVolleyT = t;
      state.climaxFrontWave    = 0;
      state.climaxRearWave     = 0;
      state.patternName = 'climax';
    } else if (sec.kind === 'scatter') {
      // new cycle of 12 +s tossed from the spot's orbit. reset toss
      // counter + next-toss timestamp so pattern_phase3Scatter starts
      // firing immediately
      state.currentSpot   = sec.spot;
      state.plusTossCount = 0;
      state.nextPlusTossT = t;
    } else if (sec.kind === 'hop' || sec.kind === 'return-hop') {
      // capture current boss position so the approach (if any) can
      // lerp from there. return-hop sets exit anchor to TOP so the
      // boss visibly glides back to center before the portal opens;
      // instant hop opens the portal at the boss's current position
      state.hopStartT      = t;
      state.hopFromX       = state.bossX;
      state.hopFromY       = state.bossY;
      state.hopToSpot      = sec.spot;
      if (sec.kind === 'return-hop') {
        state.hopApproachMs = PHASE_3_RETURN_APPROACH_MS;
        state.hopExitX = 0;
        state.hopExitY = 0;
      } else {
        state.hopApproachMs = 0;
        state.hopExitX = state.bossX;
        state.hopExitY = state.bossY;
      }
      state.hopExitSpawned  = false;
      state.hopTeleported   = false;
      state.hopEntrySpawned = false;
      bossEl.removeAttribute('data-portaling');
    } else if (sec.kind === 'interlude') {
      // brief glide back to (0,0) for the breather, then phase-1
      // sine drift takes over (clocked off interludeSineStartT)
      state.bossGlide = {
        fromX: state.bossX,
        fromY: state.bossY,
        toX:   0,
        toY:   0,
        startT: t,
        durMs:  PHASE_3_INTERLUDE_GLIDE_MS
      };
      state.interludeSineStartT = t + PHASE_3_INTERLUDE_GLIDE_MS;
      state.nextInterludePlusT  = state.interludeSineStartT + 1000;
      state.lastFireBossT       = 0;
    } else if (sec.kind === 'climax') {
      // closing flurry -- spiral + cardinal crossbeams concurrently
      // from boss center. independent fire timestamps so neither
      // pattern blocks the other on its interval check
      state.lastFireSpiralT    = 0;
      state.lastFireCrossBeamT = 0;
      state.spiralAngle        = 0;
    }
  }

  // section-list program controller -- single advance check per frame.
  // walks state.activeProgram (which setPhase sets per phase --
  // PHASE_3_PROGRAM, PHASE_5_PROGRAM, etc.) using state.sectionIdx as
  // a cursor + (t - sectionStartT) >= sec.durMs as the advance
  // trigger. each entry's enterSection sets up the per-kind state;
  // the per-kind attack dispatch lives in updatePhase
  function advanceProgram(t) {
    // don't advance while the title-card overlay is up -- programStartT
    // is set to the moment the overlay clears, so any frame before that
    // would tick the cycle clock against an empty arena
    if (t < state.programStartT) return;
    while (state.sectionIdx < state.activeProgram.length) {
      const sec = state.activeProgram[state.sectionIdx];
      if (t - state.sectionStartT < sec.durMs) break;
      enterSection(state.sectionIdx + 1, t);
    }
  }
  // back-compat alias -- existing callers reference pattern_phase3b
  const pattern_phase3b = advanceProgram;

  // pick the active phase-1 sub-pattern from elapsed-phase ms.
  // diagonals + wedge alternate for the first ~39s; the last ~13s
  // is the spiral. after the 52s window expires the boss stays quiet
  // (phase 2 wiring is the next planning beat)
  function phase1Cycler(t) {
    const elapsed = t - state.phaseStartT;
    if (elapsed >= PHASE_1_DURATION_MS) { state.patternName = 'idle'; return; }
    if      (elapsed < 12000) state.patternName = 'diagonal';
    else if (elapsed < 22000) state.patternName = 'wedge';
    else if (elapsed < 33000) state.patternName = 'diagonal';
    else if (elapsed < 39000) state.patternName = 'wedge';
    else                       state.patternName = 'spiral';
    switch (state.patternName) {
      case 'diagonal': pattern_diagonal(t); break;
      case 'wedge':    pattern_wedge(t);    break;
      case 'spiral':   pattern_spiral(t);   break;
    }
  }

  // phase router. while the transition overlay is up (state.transitionUntilT
  // > t), boss patterns are paused -- the movement title "owns"
  // those frames. once t crosses the expiry, dismiss the overlay AND
  // start firing the new phase's patterns from this same frame
  function updatePhase(t) {
    // timer-driven phase advancement -- when the active phase clock
    // crosses its cap from PHASE_DURATION_MS, hand off to the next
    // phase via setPhase (which resets phaseStartT + fires the new
    // phase's transition overlay + boss glide). cap is null for the
    // last phase in the table so we never auto-step past it.
    // intentionally runs before updateBossMovement so the new phase's
    // glide kicks in this same frame -- avoids a one-frame jitter
    // where the old phase's steady-state position writes first
    const cap = PHASE_DURATION_MS[state.phase];
    if (cap != null && t - state.phaseStartT >= cap && state.phase < PHASE_MAX) {
      setPhase(state.phase + 1);
    }
    // final-phase timeout -- boss survived the full PHASE_MAX clock.
    // the auto-advance above is gated on phase < PHASE_MAX so a phase-8
    // expiry falls through to here. fire onDefeat once; victoryFired
    // wins the race if the player drained the bar on the very last
    // frame (defeatFired won't latch in that case)
    if (cap != null
        && t - state.phaseStartT >= cap
        && state.phase >= PHASE_MAX
        && !state.victoryFired
        && !state.defeatFired) {
      state.defeatFired = true;
      try { opts.onDefeat?.(); } catch (_) {}
    }
    updateBossMovement(t);
    // deferred title-card trigger -- runs BEFORE the transitionUntilT
    // early-return so the card can slide in while the transition
    // window is still active. used by phase 6 to fire the title-card
    // overlay 4s into the longer dialogue opening (so the title peaks
    // as the swears dissolve and lands at 4:02 with the program start)
    if (state.pendingTitleCardT > 0 && t >= state.pendingTitleCardT) {
      const tcCap = PHASE_CAPTIONS[state.phase];
      if (tcCap && tcCap.caption) {
        showTransition(tcCap.caption, tcCap.sub,
                       tcCap.durationMs || PHASE_TRANSITION_DEFAULT_MS);
      }
      state.pendingTitleCardT = 0;
    }
    if (state.transitionUntilT > 0) {
      if (t < state.transitionUntilT) return;
      // expiry tick -- hide the overlay, fall through to normal flow
      hideTransition();
    }
    if      (state.phase === 1) phase1Cycler(t);
    else if (state.phase === 2) {
      // base move always fires; the radial layer joins in at +8s and
      // runs on top, with its own cadence + cleanup
      pattern_crossBeams(t);
      const phaseElapsed = t - state.phaseStartT;
      if (phaseElapsed >= PHASE_2_RADIAL_START_MS) {
        state.patternName = 'crossBeams + radial';
        pattern_radialBeams(t);
      } else {
        state.patternName = 'crossBeams';
      }
    }
    else if (state.phase === 3) {
      // STURMSZENE -- TWELVEFOLD VOLLEY. program-driven sections walk
      // through wave 1 (TOP/BL/BR), breather, wave 2 (TL/TR), recall
      // + cycle 6 at TOP, then climax. pattern_phase3b runs FIRST so
      // a same-frame section advance (hop -> scatter) resets the toss
      // counter before pattern_phase3Scatter reads it
      //
      // shelved to phase 4+ (kept implementations for the future wire-up,
      // dispatched here is just the scatter/hop/interlude/climax core):
      // - hexagram beat (orb-lattice star + concurrent cross beams)
      // - cursor-intro (stacked teeth volleys)
      // - tower barrage (front + rear towers with split teeth)
      pattern_phase3b(t);
      if (state.phase3Mode === 'scatter') {
        pattern_phase3Scatter(t);
        state.patternName = 'scatter @' + state.currentSpot;
      } else if (state.phase3Mode === 'hop') {
        state.patternName = 'hop ->' + state.hopToSpot;
      } else if (state.phase3Mode === 'return-hop') {
        state.patternName = 'return ->' + state.hopToSpot;
      } else if (state.phase3Mode === 'interlude') {
        // diagonal (0 -> DIAG_END) then wedge (DIAG_END -> end). + trios
        // ride on top throughout the interlude. section-relative time
        // since enterSection set sectionStartT to the moment of entry
        const interludeElapsed = t - state.sectionStartT;
        if (interludeElapsed < PHASE_3_INTERLUDE_DIAG_END_MS) {
          pattern_diagonal(t, PHASE_3_INTERLUDE_DIAGONAL_INTERVAL_MS);
          state.patternName = 'interlude-diagonal';
        } else {
          pattern_wedge(t, PHASE_3_INTERLUDE_WEDGE_INTERVAL_MS);
          state.patternName = 'interlude-wedge';
        }
        if (t >= state.nextInterludePlusT) {
          for (let i = 0; i < PHASE_3_INTERLUDE_PLUS_TRIO_COUNT; i++) {
            spawnPlusProjectile(t);
          }
          state.nextInterludePlusT = t + PHASE_3_INTERLUDE_PLUS_INTERVAL_MS;
        }
      } else if (state.phase3Mode === 'climax') {
        // closing flurry -- spiral arms wind out while cardinal cross
        // beams punch through. independent fire timestamps so they
        // can fire concurrently without stepping on each other
        pattern_spiral(t, 'lastFireSpiralT');
        pattern_crossBeams(t, 'lastFireCrossBeamT');
        state.patternName = 'climax';
      } else {
        state.patternName = 'phase-3-idle';
      }
    }
    else if (state.phase === 5) {
      // phase 5a -- SHADOW LANCE. program walks: lance @BELOW (3:11),
      // idle, lance @BOTTOM_RIGHT_DIAG (3:24). lances spawn in
      // enterSection; updateLances handles their grow / hold /
      // dissolve + collision. no pattern dispatch here -- enterSection
      // already did the work
      pattern_phase3b(t);
      if (state.phase3Mode === 'lance') {
        state.patternName = 'shadow-lance';
      } else if (state.phase3Mode === 'gate-storm') {
        state.patternName = 'gate-storm';
      } else if (state.phase3Mode === 'idle') {
        state.patternName = 'phase-5-silence';
      } else {
        state.patternName = 'phase-5-end';
      }
    }
    else if (state.phase === 6) {
      // phase 6 -- program-driven sections: split-cross volleys,
      // cursor-intro reruns, tower barrage, climax with everything
      // layered. pattern_phase3b advances the cursor; each section's
      // per-frame work happens here (volley scheduling, tower spawns,
      // climax overlay)
      pattern_phase3b(t);
      const sec = state.activeProgram[state.sectionIdx];
      const sectionElapsed = t - state.sectionStartT;
      if (state.phase3Mode === 'split-cross-volley') {
        // fire one split cross every VOLLEY_INTERVAL, up to sec.count
        if (sec && state.splitCrossSpawned < (sec.count || 1) && t >= state.nextSplitCrossT) {
          spawnSplitCross(t);
          state.splitCrossSpawned++;
          state.nextSplitCrossT = t + PHASE_6_VOLLEY_INTERVAL_MS;
        }
        state.patternName = 'split-cross';
      } else if (state.phase3Mode === 'cursor-volley') {
        pattern_cursorIntro(t);
        state.patternName = 'cursor-volley';
      } else if (state.phase3Mode === 'tower-barrage') {
        // front pair at section start; rear pair at +REAR_DELAY
        if (!state.phase3FrontSpawned) {
          spawnTower('front-left',  t);
          spawnTower('front-right', t);
          state.phase3FrontSpawned = true;
        }
        if (!state.phase3RearSpawned && sectionElapsed >= 2500) {
          spawnTower('rear-left',  t);
          spawnTower('rear-right', t);
          state.phase3RearSpawned = true;
        }
        state.patternName = 'tower-barrage';
      } else if (state.phase3Mode === 'climax') {
        // tower waves -- two pairs. wave 1: front at section start,
        // rear at +REAR_DELAY. wave 2: front at FRONT2_T, rear at
        // REAR2_T. tracked via climaxFront/RearWave counters so each
        // wave fires exactly once
        if (state.climaxFrontWave === 0) {
          spawnTower('front-left',  t);
          spawnTower('front-right', t);
          state.climaxFrontWave = 1;
        }
        if (state.climaxRearWave === 0 && sectionElapsed >= PHASE_6_CLIMAX_REAR_DELAY_MS) {
          spawnTower('rear-left',  t);
          spawnTower('rear-right', t);
          state.climaxRearWave = 1;
        }
        if (state.climaxFrontWave === 1 && sectionElapsed >= PHASE_6_CLIMAX_FRONT2_T_MS) {
          spawnTower('front-left',  t);
          spawnTower('front-right', t);
          state.climaxFrontWave = 2;
        }
        if (state.climaxRearWave === 1 && sectionElapsed >= PHASE_6_CLIMAX_REAR2_T_MS) {
          spawnTower('rear-left',  t);
          spawnTower('rear-right', t);
          state.climaxRearWave = 2;
        }
        // split-cross cadence -- heavy at section start, ramps to
        // steady-state over CLIMAX_RAMP_MS. easeOutCubic on the ramp
        // so the initial barrage lingers a touch before tapering
        const rampK = Math.min(1, sectionElapsed / PHASE_6_CLIMAX_RAMP_MS);
        const rampE = easeOutCubic(rampK);
        const splitInterval = lerp(PHASE_6_CLIMAX_SPLIT_FAST_MS,
                                   PHASE_6_CLIMAX_SPLIT_MS, rampE);
        if (t >= state.climaxNextSplitT) {
          spawnSplitCross(t);
          state.climaxNextSplitT = t + splitInterval;
        }
        // cursor volleys ride on top -- reuse the cursor-intro fire
        // path with a tighter cadence override. reset the counter
        // each cycle so the cap never closes the firing
        if (t >= state.nextCursorIntroVolleyT) {
          state.cursorIntroVolleyCount = 0;
          state.nextCursorIntroVolleyT = t;
          pattern_cursorIntro(t);
          state.nextCursorIntroVolleyT = t + PHASE_6_CLIMAX_CURSOR_MS;
        }
        state.patternName = 'climax';
      } else {
        state.patternName = 'phase-6-end';
      }
    }
    else if (state.phase === 7) {
      // phase 7a -- SOVEREIGN UMBRA. program-driven sections:
      //   tower-roam-wave: spawn N moving towers (staggered)
      //   puddle-lance-wave: scatter puddles that erupt into lances
      //   phase7a-climax: both layered
      pattern_phase3b(t);
      const sec = state.activeProgram[state.sectionIdx];
      if (state.phase3Mode === 'tower-roam-wave') {
        if (sec && state.roamTowerSpawned < (sec.count || 1) && t >= state.nextRoamTowerT) {
          spawnRoamingTower(t, sec.variant || 'teeth');
          state.roamTowerSpawned++;
          state.nextRoamTowerT = t + PHASE_7A_TOWER_SPAWN_GAP_MS;
        }
        state.patternName = 'tower-roam';
      } else if (state.phase3Mode === 'puddle-lance-wave') {
        const interval = (sec && sec.interval) || PHASE_7A_PUDDLE_INTERVAL_MS;
        if (t >= state.nextPuddleT) {
          spawnPuddle(t);
          state.nextPuddleT = t + interval;
        }
        state.patternName = 'puddle-lance';
      } else if (state.phase3Mode === 'phase7a-climax') {
        // both layered. towers spawn on the climax tower cadence,
        // puddles on the dense interval
        if (t >= state.nextClimaxTowerT) {
          // alternate variants to keep visual variety
          const variant = (state.roamTowerSpawned % 2 === 0) ? 'orbs' : 'teeth';
          spawnRoamingTower(t, variant);
          state.roamTowerSpawned++;
          state.nextClimaxTowerT = t + 2000;
        }
        if (t >= state.nextClimaxPuddleT) {
          spawnPuddle(t);
          state.nextClimaxPuddleT = t + PHASE_7A_PUDDLE_DENSE_MS;
        }
        state.patternName = 'phase7a-climax';
      } else {
        state.patternName = 'phase-7a-end';
      }
    }
    else if (state.phase === 8) {
      // phase 7b TODESREIGEN + UNTERGANG -- SHADE'S EMBRACE + DEATHTHROES.
      // each section runs its own mechanic. boss + hud stay visible
      // across both so damage dealt during iron-maiden carries into
      // deaththroes
      pattern_phase3b(t);
      const sec = state.activeProgram[state.sectionIdx];
      const sectionElapsed = t - state.sectionStartT;
      if (state.phase3Mode === 'iron-maiden') {
        // ring driver -- spawn a fresh ring every SPAWN_INTERVAL_MS.
        // updateMaidenBox owns each ring's lifecycle (telescope +
        // collision + collapse) so this side just gates new spawns
        // at the cadence that gives consecutive ring spacings
        if (t >= state.nextMaidenBoxT) {
          spawnMaidenBox(t);
          state.nextMaidenBoxT = t + PHASE_7B_MAIDEN_BOX_SPAWN_INTERVAL_MS;
        }
        state.patternName = 'iron-maiden';
      } else if (state.phase3Mode === 'snake-curve') {
        // updateSnakes runs unconditionally in tick(); section just
        // owns the time window. dead-snake fade + active hazards are
        // both handled by updateSnakes
        state.patternName = 'snake-curve';
      } else {
        state.patternName = 'phase-7b-end';
      }
    }
  }

  // game loop -- rAF-driven. dt-clamped so backgrounded tabs don't
  // catapult the player across the arena on resume. while paused we
  // just re-arm the rAF without advancing -- _gameNow() keeps the
  // world frozen via _pauseAccum
  let lastT = _gameNow();
  let _rafId = 0;
  function tick(_rafT) {
    // hard wrap -- any throw inside the body would normally kill the
    // rAF chain + freeze the game. log it and keep ticking so a one-
    // off bad frame (eg a stray null deref in a phase-transition path)
    // doesn't take down the whole fight. previously phase transitions
    // appeared to "freeze the screen" because an exception inside
    // setPhase or one of the spawn helpers would silently break the
    // loop with no console trace from React
    try { _tickBody(_rafT); }
    catch (err) {
      // eslint-disable-next-line no-console
      console.error('[hole2 tick]', err);
      _rafId = requestAnimationFrame(tick);
    }
  }
  function _tickBody(_rafT) {
    if (_paused) {
      // keep the loop ticking so resume picks up immediately, but
      // skip every game-time read + every dom write. lastT gets
      // refreshed on resume so dt doesn't spike
      _rafId = requestAnimationFrame(tick);
      return;
    }
    const t = _gameNow();
    const dt = Math.min(64, t - lastT) / 1000;
    lastT = t;
    const dx = (state.pressed.right ? 1 : 0) - (state.pressed.left ? 1 : 0);
    const dy = (state.pressed.down  ? 1 : 0) - (state.pressed.up   ? 1 : 0);
    const vh = window.innerHeight / 100;
    // shift clutches movement -- slower + more precise. higher
    // output levels will also use shift to tighten bullet spread
    const speedMult = state.pressed.shift ? SHIFT_SPEED_MULT : 1;
    if (dx !== 0) state.playerX += dx * SPEED_VH_PER_SEC * vh * dt * speedMult;
    if (dy !== 0) state.playerY += dy * SPEED_VH_PER_SEC * vh * dt * speedMult;
    // clamp x + y to box-edge-hugging ranges
    const xMax = MAX_X_VH * vh;
    const yMin = MIN_Y_VH * vh;
    const yMax = MAX_Y_VH * vh;
    if (state.playerX >  xMax) state.playerX =  xMax;
    if (state.playerX < -xMax) state.playerX = -xMax;
    if (state.playerY <  yMin) state.playerY =  yMin;
    if (state.playerY >  yMax) state.playerY =  yMax;
    playerEl.style.setProperty('--player-x', state.playerX.toFixed(2) + 'px');
    playerEl.style.setProperty('--player-y', state.playerY.toFixed(2) + 'px');

    // fire stream -- output level 1: single bullet every
    // FIRE_INTERVAL_MS while z is held. higher levels will branch on
    // state.output and choose different spawn patterns
    // bomb-window lockout -- spirit bomb suppresses firing while the
    // sun is still resolving. lastFireT isn't reset so the cadence
    // picks up cleanly once the lockout clears
    if (state.pressed.z && state.output >= 1 && t >= state.bombFireLockUntilT) {
      if (t - state.lastFireT >= FIRE_INTERVAL_MS) {
        fireVolley();
        state.lastFireT = t;
      }
    }
    updateBullets(dt, t);

    // boss -- movement + per-phase attack patterns. spawned orbs land
    // in state.enemyBullets which gets updated + collision-checked
    // against the player just below
    updatePhase(t);
    // portal hop position writes need to land AFTER updatePhase (which
    // calls updateBossMovement) so the per-frame hop driver wins over
    // any steady-state writes for the hop modes. portals self-cull
    // after their fade-out window
    updatePortalHop(t);
    // afterimage trail runs LAST in the boss-position pipeline so it
    // samples the final per-frame bossX/Y (post portal-hop). this is
    // the only site that pushes onto state.bossTrail
    updateBossTrail();
    updatePortals(t);
    updateLances(t);
    updateGateStorm(t);
    updateSwearBubbles(t, dt);
    updateSplitCrosses(t);
    updatePuddles(t);
    updateMaidenBox(t, dt);
    updateSnakes(t);
    updateEnemyBullets(dt, t);
    updateBeams(t);
    updateGlobes(dt);
    updatePlusProjectiles(t);
    updateHexagrams(t);
    updateTowers(t);
    updateTeeth(t, dt);

    // player-vs-boss collision + immunity. flicker class flips off
    // automatically when t crosses immuneUntilT
    checkPlayerBossCollision(t);
    if (t < state.immuneUntilT) {
      playerEl.setAttribute('data-immune', 'true');
    } else if (playerEl.getAttribute('data-immune') === 'true') {
      playerEl.setAttribute('data-immune', 'false');
    }

    // timer -- per-phase countdown (movement-clock idiom). reads the
    // current phase's cap from PHASE_DURATION_MS and counts down to
    // 0:00, at which point the auto-advance in updatePhase hands off to
    // the next phase and the timer immediately re-reads the new cap.
    // Math.ceil so the very first frame shows the full cap (eg 0:55)
    // instead of one-second-in. open-ended phase (phase 6 currently) has
    // no cap -- show a dashed placeholder so the slot doesn't go blank
    const timerCapMs = PHASE_DURATION_MS[state.phase];
    if (timerCapMs != null) {
      const remainMs = Math.max(0, timerCapMs - (t - state.phaseStartT));
      const s = Math.ceil(remainMs / 1000);
      const mm = Math.floor(s / 60).toString().padStart(2, '0');
      const ss = (s % 60).toString().padStart(2, '0');
      timerEl.textContent = mm + ':' + ss;
    } else {
      timerEl.textContent = '--:--';
    }

    // debug readout -- handy while tuning numbers. shows the live
    // damage multiplier so distance falloff is visible per-frame
    const playerCenterYVh = 85 + state.playerY / vh;
    const distVh = Math.abs(playerCenterYVh - 22);
    const dmgMult = (1 - DAMAGE_FALLOFF * Math.min(1, distVh / DIST_MAX_VH)).toFixed(2);
    const imm = t < state.immuneUntilT
      ? ((state.immuneUntilT - t) / 1000).toFixed(1) + 's'
      : 'no';
    const phaseElapsedSec = ((t - state.phaseStartT) / 1000).toFixed(1);
    // show the cap inline so the auto-advance moment is visible -- last
    // phase reads as just the elapsed since there's no successor
    const phaseCapMs = PHASE_DURATION_MS[state.phase];
    const phaseCapStr = phaseCapMs != null ? '/' + (phaseCapMs / 1000).toFixed(0) + 's' : '';
    // debug readout -- only updated when dev mode is unlocked, since
    // production hides .debug via display:none and the per-frame text
    // write would otherwise clobber the brief [dev] toast we flash on
    // unlock + on i-toggle. _devToastUntilT pauses the readout for ~1.8s
    // after a toast fires so the user can actually read it
    if (state.devUnlocked && t >= _devToastUntilT) {
      debugEl.textContent =
        'phase: '   + state.phase + '@' + phaseElapsedSec + 's' + phaseCapStr + '  ' +
        'patt: '    + state.patternName + '  ' +
        'orbs: '    + state.enemyBullets.length + '  ' +
        'orbDmg: '  + (state.orbDamage ? 'ON' : 'off') + '  ' +
        'x: '       + state.playerX.toFixed(0) + 'px  ' +
        'y: '       + state.playerY.toFixed(0) + 'px  ' +
        'shift: '   + (state.pressed.shift ? 'on' : 'off') + '  ' +
        'output: '  + state.output + '  ' +
        'dmg x: '   + dmgMult + '  ' +
        'bullets: ' + state.bullets.length + '  ' +
        'hits: '    + state.hits  + '  ' +
        'immune: '  + imm + '  ' +
        'bombs: '   + state.bombs + '  ' +
        'boss: '    + state.boss.toFixed(2);
    }

    _rafId = requestAnimationFrame(tick);
  }
  _rafId = requestAnimationFrame(tick);

  // audio gate -- chrome (+ safari + firefox to a lesser extent) won't
  // let .play() succeed until the document has had user activation.
  // the fight loop boots on page load + phase 1's first volley fires
  // ~760ms in, often before hunter touches a key, so those early plays
  // get silently rejected. warm every pooled Audio on the first
  // keydown/pointerdown by play-then-pause at volume 0 -- marks them
  // user-activated so subsequent .play() calls just work for the whole
  // session. the explicit retry pattern (vs trusting that the gate
  // self-lifts on activation) is needed because some browsers cache
  // the "blocked" state per-element after a rejected .play()
  (function setupAudioUnlock() {
    let unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      const pools = [puddleSfxPool, portalSfxPool, orbSfxPool];
      for (const pool of pools) {
        for (const a of pool) {
          const vol = a.volume;
          a.volume = 0;
          const p = a.play();
          const restore = () => { try { a.pause(); a.currentTime = 0; } catch (_) {} a.volume = vol; };
          if (p && typeof p.then === 'function') p.then(restore).catch(() => { a.volume = vol; });
          else restore();
        }
      }
    }
    _wlisten('keydown',     unlock, { once: true, capture: true });
    _wlisten('pointerdown', unlock, { once: true, capture: true });
  })();

  // ---- cleanup ----
  return function destroy() {
    try { cancelAnimationFrame(_rafId); } catch (_) {}
    for (const [name, fn, opts2] of _listeners) {
      try {
        if (name === '_doc_visibilitychange') {
          document.removeEventListener('visibilitychange', fn);
        } else {
          window.removeEventListener(name, fn, opts2);
        }
      } catch (_) {}
    }
    for (const a of _audioPool) {
      try { a.pause(); } catch (_) {}
    }
    // wipe any in-flight DOM nodes the engine APPENDED at runtime.
    // leaving them around between mounts produces ghost orbs / lances
    // when the user re-enters the page.
    // CRITICAL: does NOT include #phase-transition -- its children
    // come from the React JSX (hex svg, caption div, sub div), not
    // from engine-appended nodes. wiping innerHTML here also wipes
    // those JSX-managed children, and React doesn't repopulate
    // because its virtual tree still thinks they're there. that bug
    // surfaced as "background paints but text + hexagram invisible"
    // when StrictMode's double-mount or any cleanup cycle fired.
    // engine-managed caption text gets updated via .innerHTML in
    // showTransition (caption only), which preserves the wrapper divs
    for (const sel of [
      '#bullets', '#orbs', '#beams', '#globes',
    ]) {
      try {
        const el = document.querySelector(sel);
        if (el) el.innerHTML = '';
      } catch (_) {}
    }
  };
}
