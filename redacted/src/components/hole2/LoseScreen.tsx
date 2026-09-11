// DARKNESS RISES overlay. mounted when the engine fires onDefeat --
// the final-phase timer expired without the player draining the boss
// bar. inversion of WinScreen: instead of bright fireworks blooming
// outward, dark pixel columns rise from the arena floor, eventually
// drowning the screen. caption uses the same gothic stack as victory
// but in cold red + bone-white
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type Column = {
  id: number;
  x: number;        // % across the arena width (left edge)
  width: number;    // vh -- column pixel-block width
  delay: number;    // ms before this column starts rising
  rise: number;     // ms -- how long the rise takes (vary across columns
                    //   so the wave reads as uneven rather than synced)
  hue: number;      // 0..14, slight per-column hue jitter -- mostly
                    //   deep red, some bruised purple
};

const COLUMN_COUNT = 32;
const HUES = [354, 348, 12, 340, 332, 358];   // ember-red into bruise-plum

// hash-noise from an integer seed -- avoids pulling in a PRNG. two
// sin terms with prime-ish multipliers de-correlates enough for a
// pixel-art shower
function noise(seed: number, salt: number): number {
  const v = Math.sin(seed * 13.37 + salt * 91.7) * 43758.5453;
  return v - Math.floor(v);
}

function makeColumn(id: number): Column {
  // even slot across the arena, then jitter slightly so the columns
  // don't read as a perfectly-aligned barcode
  const slot = (id / COLUMN_COUNT) * 100;
  const jitter = (noise(id, 1) - 0.5) * (100 / COLUMN_COUNT) * 0.9;
  return {
    id,
    x: slot + jitter,
    width: 2.2 + noise(id, 2) * 1.6,           // 2.2..3.8vh
    delay: noise(id, 3) * 900,                  // staggered start across ~1s
    rise: 1100 + noise(id, 4) * 700,            // 1100..1800ms rise
    hue: HUES[Math.floor(noise(id, 5) * HUES.length)]
  };
}

export function LoseScreen() {
  const [columns] = useState<ReadonlyArray<Column>>(
    () => Array.from({ length: COLUMN_COUNT }, (_, i) => makeColumn(i))
  );
  // second wave kicks in after the initial rise has filled the lower
  // half. taller, slower, more central -- reads as "the floor itself
  // is being lifted into the arena"
  const [secondWave, setSecondWave] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSecondWave(true), 1400);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="hole2-lose" data-on="true" aria-hidden="true">
      <div className="hole2-lose__dim" />
      <div className="hole2-lose__columns">
        {columns.map((c) => (
          <ShadowColumn key={c.id} column={c} />
        ))}
      </div>
      {/* second wave -- a slow black gradient that pushes UP from the
          floor, eventually swallowing the columns themselves into a
          uniform black. data-on flips after the initial rise so the
          two stages chain rather than racing */}
      <div
        className="hole2-lose__floor"
        data-on={secondWave ? 'true' : 'false'}
      />
      <div className="hole2-lose__caption">
        <div className="hole2-lose__title">DARKNESS RISES</div>
        <div className="hole2-lose__sub">FINIS -- THE STAGE EATS THE DANCER</div>
        <div className="hole2-lose__epitaph">
          the clock ran out and the boss is still standing. eleven
          centuries of shadowmancy, undimmed. the eclipse settles back
          over the arena -- the audience, ultimately, was the dark.
        </div>
      </div>
    </div>
  );
}

function ShadowColumn({ column }: { column: Column }) {
  const style = useMemo<CSSProperties>(() => ({
    ['--col-x' as string]:     `${column.x.toFixed(2)}%`,
    ['--col-width' as string]: `${column.width.toFixed(2)}vh`,
    ['--col-delay' as string]: `${column.delay.toFixed(0)}ms`,
    ['--col-rise' as string]:  `${column.rise.toFixed(0)}ms`,
    ['--col-hue' as string]:   String(column.hue)
  }), [column]);
  return <div className="hole2-lose__column" style={style} />;
}
