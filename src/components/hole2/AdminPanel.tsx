// admin panel -- mounted once the player types "lehrer" inside the
// arena. independent of the "hb1968" dev keyboard unlock; this panel
// is the visual alternative for the same controls (phase scrub,
// globe-lvl switch, orb-damage toggle). the engine exposes an
// imperative handle (Hole2EngineHandle) via opts.onAdminUnlock; we
// drive everything through that
import { useEffect, useState } from 'react';
import type { Hole2EngineHandle } from './engine';

const PHASE_COUNT  = 8;
const OUTPUT_COUNT = 5;
// label per globe level -- matches the GLOBE LVL pip ladder colors
// (green/blue/purple/yellow/white) the HUD shows
const GLOBE_LABELS = ['center', 'V', '3-prong', '+1 big', '+2 big'];
const PHASE_LABELS = [
  'p1 -- diagonal/wedge/spiral',
  'p2 -- ARIE',
  'p3 -- STURMSZENE',
  'p4 -- portal exit',
  'p5 -- silent ambush',
  'p6 -- DUETT',
  'p7a -- KADENZ',
  'p7b -- TODESREIGEN / UNTERGANG'
];

export function AdminPanel({ api }: { api: Hole2EngineHandle }) {
  // mirror the engine state so the active phase / output / damage
  // toggle reflect immediately on click. lightweight poll keeps it in
  // sync if the keyboard shortcuts (hb1968 path) change them out from
  // under us. 200ms is fine for an admin tool -- no need to chase rAF
  const [snap, setSnap] = useState(() => api.getState());
  useEffect(() => {
    const id = window.setInterval(() => setSnap(api.getState()), 200);
    return () => window.clearInterval(id);
  }, [api]);

  return (
    <div className="hole2-admin" role="region" aria-label="admin panel">
      <div className="hole2-admin__title">ADMIN -- lehrer</div>

      <section className="hole2-admin__section">
        <div className="hole2-admin__label">PHASE</div>
        <div className="hole2-admin__grid hole2-admin__grid--phase">
          {Array.from({ length: PHASE_COUNT }, (_, i) => {
            const n = i + 1;
            const active = snap.phase === n;
            return (
              <button
                key={n}
                type="button"
                className="hole2-admin__btn"
                data-active={active ? 'true' : 'false'}
                title={PHASE_LABELS[i]}
                onClick={() => {
                  api.setPhase(n);
                  setSnap(api.getState());
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      <section className="hole2-admin__section">
        <div className="hole2-admin__label">GLOBE LVL</div>
        <div className="hole2-admin__grid hole2-admin__grid--output">
          {Array.from({ length: OUTPUT_COUNT }, (_, i) => {
            const n = i + 1;
            const active = snap.output === n;
            return (
              <button
                key={n}
                type="button"
                className="hole2-admin__btn hole2-admin__btn--globe"
                data-active={active ? 'true' : 'false'}
                data-tier={n}
                title={GLOBE_LABELS[i]}
                onClick={() => {
                  api.setOutput(n);
                  setSnap(api.getState());
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </section>

      <section className="hole2-admin__section">
        <div className="hole2-admin__label">DAMAGE</div>
        <div className="hole2-admin__toggles">
          <button
            type="button"
            className="hole2-admin__btn hole2-admin__btn--toggle"
            data-active={snap.orbDamage ? 'true' : 'false'}
            onClick={() => {
              api.setOrbDamage(!snap.orbDamage);
              setSnap(api.getState());
            }}
          >
            orb damage: {snap.orbDamage ? 'ON' : 'off'}
          </button>
        </div>
      </section>
    </div>
  );
}
