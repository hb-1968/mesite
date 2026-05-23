// the production mount for the boss-fight engine. mirrors the testbed
// body markup (arena box, boss, bullet pools, player, hud, phase-
// transition overlay) and kicks off startHole2Engine on mount. all
// generic-named classes (.arena, .boss, .player, .hud, etc.) live under
// the .hole2-game wrapper so they don't bleed into the rest of the
// site. unmount cleanly stops the rAF + tears down listeners + audio
import { useEffect, useRef } from 'react';
import { startHole2Engine, type Hole2EngineHandle } from './engine';

// sprite.png IS the boss (the vampire-cloak figure). same file the
// rising-from-eclipse transition uses, so the figure that landed in the
// arena now also IS the figure the engine controls
const SPRITE_URL = `${import.meta.env.BASE_URL}sprite.png`;

type Hole2GameProps = {
  // fired the moment the player drains the boss bar in PHASE_MAX. the
  // page-level state lifts this into rendering the win overlay
  onVictory: () => void;
  // fired when the engine pauses or resumes (Escape / tab-out). page-
  // level state mounts the pause overlay so the player can see why the
  // world stopped + what key resumes it
  onPauseChange?: (paused: boolean) => void;
  // fired the first time the player types "lehrer" inside the arena.
  // payload is the engine api handle the admin panel uses to drive
  // phase / output / damage from React
  onAdminUnlock?: (api: Hole2EngineHandle) => void;
  // fired every time the fight resets to phase 1 -- death or dev `r`.
  // page-level wires this to a boss-music restart so the phase-synced
  // track lines up with the fresh phase 1 instead of drifting
  onFightReset?: () => void;
  // fired once when the final-phase timer expires without victory.
  // page-level mounts the DARKNESS RISES loss overlay
  onDefeat?: () => void;
};

export function Hole2Game({ onVictory, onPauseChange, onAdminUnlock, onFightReset, onDefeat }: Hole2GameProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // engine queries by id from the global document, which is fine since
    // ids are unique on the page (this component only mounts once at a
    // time). returned cleanup cancels the loop + wipes listeners + nukes
    // appended dom nodes so a re-mount starts fresh
    const stop = startHole2Engine({ onVictory, onPauseChange, onAdminUnlock, onFightReset, onDefeat });
    return () => {
      try { stop(); } catch (_) { /* ignore */ }
    };
  }, [onVictory, onPauseChange, onAdminUnlock, onFightReset, onDefeat]);

  return (
    <div ref={rootRef} className="hole2-game">
      <div className="arena" id="arena">
        <div className="arena__box" />
        <div className="boss" id="boss" aria-hidden="true">
          {/* sprite.png is the actual maestrul figure -- the same art
              that rises out of the eclipse. dropping the gradient
              placeholder; sprite + hitbox is all we need */}
          <img className="boss__body" src={SPRITE_URL} alt="" />
          <div className="boss__hitbox" />
        </div>
        {/* touhou-style afterimage trail. 3 lag copies of sprite.png at
            past poses from state.bossTrail. engine writes --ax/--ay/--ad
            per ghost and a shared --trail-strength gated on velocity, so
            the ghosts fade out the moment the boss holds still. lives
            BELOW .boss via z-index, not dom order, so the lead sprite
            stays on top */}
        <div className="boss__trail" id="boss-trail" aria-hidden="true">
          <img className="boss__afterimage" data-lag="1" src={SPRITE_URL} alt="" />
          <img className="boss__afterimage" data-lag="2" src={SPRITE_URL} alt="" />
          <img className="boss__afterimage" data-lag="3" src={SPRITE_URL} alt="" />
        </div>

        {/* bullet pool -- engine appends + removes children as the
            stream fires and bullets exit */}
        <div className="bullets" id="bullets" aria-hidden="true" />
        {/* shadow orbs (boss attacks). same shape of container as player
            bullets; lives separately so collision routing is unambiguous */}
        <div className="bullets" id="orbs" aria-hidden="true" />
        {/* radial damage-zone beams (phase 2). persistent hazards
            anchored at boss center, separate container so their dom
            lifetime tracks state.beams */}
        <div className="bullets" id="beams" aria-hidden="true" />
        {/* collectible globes. spawn from the boss when bossHealth
            crosses <15%; drift down; player collects to bump GLOBE LVL */}
        <div className="bullets" id="globes" aria-hidden="true" />

        <div className="player" id="player">
          {/* placeholder player sprite -- pure-white pixel humanoid,
              blocky + symmetric so the green torso hitbox lands cleanly.
              same SVG as the testbed -- final art replaces this */}
          <svg
            className="player__svg"
            viewBox="0 0 16 22"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            {/* head */}
            <rect x="6" y="2"  width="4" height="4" fill="#fff" />
            {/* neck */}
            <rect x="7" y="6"  width="2" height="1" fill="#fff" />
            {/* shoulders + torso block */}
            <rect x="4" y="7"  width="8" height="2" fill="#fff" />
            <rect x="5" y="9"  width="6" height="5" fill="#fff" />
            {/* arms (held to sides) */}
            <rect x="3" y="8"  width="1" height="5" fill="#fff" />
            <rect x="12" y="8" width="1" height="5" fill="#fff" />
            {/* hands */}
            <rect x="2"  y="12" width="2" height="2" fill="#fff" />
            <rect x="12" y="12" width="2" height="2" fill="#fff" />
            {/* hips */}
            <rect x="5" y="14" width="6" height="2" fill="#fff" />
            {/* legs */}
            <rect x="5" y="16" width="2" height="4" fill="#fff" />
            <rect x="9" y="16" width="2" height="4" fill="#fff" />
            {/* feet */}
            <rect x="4" y="20" width="4" height="2" fill="#fff" />
            <rect x="8" y="20" width="4" height="2" fill="#fff" />
          </svg>
          <div className="player__hitbox" aria-hidden="true" />
          {/* lance telegraph -- shadow overlay that lengthens off the
              player at the incoming lance's angle. red outline hints at
              malevolent intent. engine sets --lance-angle + data-on */}
          <div
            className="player__lance-telegraph"
            id="player-lance-telegraph"
            aria-hidden="true"
          />
        </div>

        <div className="bomb-flash" id="bomb-flash" aria-hidden="true" />

        {/* spirit bomb -- "light elemental." expanding sun anchored at
            the player. conic-gradient + radial-mask layers form the sun
            silhouette (core + long rays + offset short rays) */}
        <div className="spirit-bomb" id="spirit-bomb" aria-hidden="true">
          <div className="spirit-bomb__rays spirit-bomb__rays--long" />
          <div className="spirit-bomb__rays spirit-bomb__rays--short" />
          <div className="spirit-bomb__core" />
        </div>

        <div className="hud" id="hud" aria-hidden="true">
          {/* top lane -- thin health bar (left) + timer (right) */}
          <div className="hud__top">
            <div className="hud__health">
              <div
                className="hud__health-fill"
                id="health-fill"
                style={{ width: '100%' }}
              />
            </div>
            <div className="hud__timer" id="timer">00:00</div>
          </div>

          {/* right-edge column. order:
              GLOBE LVL -> 5 output pips
              LIGHT ELEMENTAL -> 3 bomb diamonds
              LIFE -> 5 hit squares
              CONTROLS -> wasd / shift / z / x legend */}
          <div className="hud__column">
            <div className="hud__label">GLOBE<br />LVL</div>
            <div className="hud__outputs" id="outputs-row">
              <span className="hud__pip" data-active="true" />
              <span className="hud__pip" />
              <span className="hud__pip" />
              <span className="hud__pip" />
              <span className="hud__pip" />
            </div>
            <div className="hud__label">LIGHT<br />ELEMENTAL</div>
            <div className="hud__bombs" id="bombs-row">
              <span className="hud__pip hud__pip--bomb" data-active="true" />
              <span className="hud__pip hud__pip--bomb" data-active="true" />
              <span className="hud__pip hud__pip--bomb" data-active="true" />
            </div>
            <div className="hud__label">LIFE</div>
            <div className="hud__hits" id="hits-row">
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

        <div className="debug" id="debug" />
      </div>

      {/* phase transition overlay. hoisted OUT of .arena so the
          overlay's z-index 100 propagates up to .hole2-stage's stack.
          inline styles cover positioning + the dark wash so nothing
          can override them; the rest (animations, fonts, colors) come
          from CSS so the testbed's scale-in choreography applies */}
      <div
        className="phase-transition"
        id="phase-transition"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(4, 4, 10, 0.86)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3vh',
          zIndex: 100,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 380ms ease-out'
        }}
      >
        <div className="phase-transition__hex">
          <svg
            className="phase-transition__hex-star"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <polygon points="50,5 89,72.5 11,72.5" />
            <polygon points="50,95 89,27.5 11,27.5" />
          </svg>
        </div>
        <div
          className="phase-transition__caption"
          id="phase-transition-caption"
        >
          ARIE -- FOURFOLD ECHO
        </div>
        <div className="phase-transition__sub">phase 2</div>
      </div>
    </div>
  );
}
