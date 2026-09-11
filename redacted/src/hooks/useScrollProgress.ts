import { useEffect } from 'react';

// scroll-coupled effects on each project card:
//   - --progress var (0..1) based on card center vs viewport center
//   - [data-counter] ramps 0 -> target in a tight window
//   - [data-scramble] runs ambient/resolve/stable zones off its own
//     element progress (vh/2 denom, so it activates as the line crosses
//     the visible edge, not before)
// prefers-reduced-motion collapses everything to the final state.
export function useScrollProgress(routeKey?: string | number) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-progress]'));
    if (els.length === 0) return;

    type Counter   = { el: HTMLElement; target: number; precision: number };
    type Scrambler = { el: HTMLElement; text: string };
    const cardCounters   = new Map<HTMLElement, Counter[]>();
    const cardScramblers = new Map<HTMLElement, Scrambler[]>();
    els.forEach((card) => {
      cardCounters.set(card,
        Array.from(card.querySelectorAll<HTMLElement>('[data-counter]'))
          .map<Counter>((c) => ({
            el: c,
            target: parseFloat(c.dataset.counter ?? '0'),
            precision: parseInt(c.dataset.counterPrecision ?? '0', 10)
          }))
      );
      cardScramblers.set(card,
        Array.from(card.querySelectorAll<HTMLElement>('[data-scramble]'))
          .map<Scrambler>((s) => ({ el: s, text: s.dataset.text ?? s.textContent ?? '' }))
      );
    });

    // tuning. counter rides the CARD's progress (full-vh denom), scramble
    // rides each LINE's own progress (vh/2 denom). different geometries
    // so thresholds don't share scale
    const COUNT_START = 0.35;
    const COUNT_END   = 0.78;

    const SCRAM_AMBIENT_START = 0.05;  // first chars start flickering
    const SCRAM_RESOLVE_START = 0.20;  // sharp lock-in begins
    const SCRAM_RESOLVE_END   = 0.45;  // lock-in done, text stable
    const AMBIENT_TICK_MS     = 70;    // ~14fps re-roll when idle

    const counterRamp = (p: number) => {
      if (p <= COUNT_START) return 0;
      if (p >= COUNT_END) return 1;
      return (p - COUNT_START) / (COUNT_END - COUNT_START);
    };

    const SCRAMBLE_CHARS = '!@#$%^&*-=+/\\<>{}[]|ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randChar = () => SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
    const isStructural = (c: string) => c === ' ' || c === '\n' || c === '\t';

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      els.forEach((card) => {
        card.style.setProperty('--progress', '1');
        (cardCounters.get(card)   ?? []).forEach(({ el, target, precision }) => {
          el.textContent = target.toFixed(precision);
        });
        (cardScramblers.get(card) ?? []).forEach(({ el, text }) => {
          el.textContent = text;
        });
      });
      return;
    }

    // walk every scrambler, write its zone state. called from both the
    // scroll rAF and the ambient tick -- same logic either way
    const updateScramblers = () => {
      const vh = window.innerHeight;
      const vpCenter = vh / 2;
      const halfVh = vh / 2;
      for (const card of els) {
        const scramblers = cardScramblers.get(card);
        if (!scramblers || !scramblers.length) continue;
        for (const { el, text } of scramblers) {
          const r = el.getBoundingClientRect();
          const c = r.top + r.height / 2;
          const dist = Math.abs(c - vpCenter);
          const itemP = Math.max(0, Math.min(1, 1 - dist / halfVh));

          if (itemP < SCRAM_AMBIENT_START) {
            // far -- fully scrambled, no flicker (saves cycles). write
            // once on entry so a fresh mount doesn't briefly show raw text
            if (el.dataset.zone !== 'far') {
              el.dataset.zone = 'far';
              let out = '';
              for (let i = 0; i < text.length; i++) {
                out += isStructural(text[i]) ? text[i] : randChar();
              }
              el.textContent = out;
            }
            continue;
          }
          if (itemP >= SCRAM_RESOLVE_END) {
            // past lock-in -- sit at resolved text
            if (el.dataset.zone !== 'stable') {
              const wasFlickering = el.dataset.zone === 'resolve' || el.dataset.zone === 'ambient';
              el.dataset.zone = 'stable';
              el.textContent = text;
              if (wasFlickering) {
                // toggle the class with a reflow in between so the anim
                // re-fires on re-entry from the same direction
                el.classList.remove('locked');
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                void el.offsetHeight;
                el.classList.add('locked');
              }
            }
            continue;
          }

          // ambient/resolve zone -- flicker, with a sharp lock-in window
          // in the upper half that locks chars left -> right
          let resolved = 0;
          if (itemP >= SCRAM_RESOLVE_START) {
            const t = (itemP - SCRAM_RESOLVE_START) / (SCRAM_RESOLVE_END - SCRAM_RESOLVE_START);
            resolved = Math.floor(t * text.length);
            el.dataset.zone = 'resolve';
          } else {
            el.dataset.zone = 'ambient';
          }
          let out = '';
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (i < resolved || isStructural(ch)) out += ch;
            else out += randChar();
          }
          el.textContent = out;
        }
      }
    };

    // scroll path: --progress + counters every rAF, then scramblers
    let raf = 0;
    const updateAll = () => {
      raf = 0;
      const vh = window.innerHeight;
      const vpCenter = vh / 2;
      for (const card of els) {
        const rect = card.getBoundingClientRect();
        const elCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elCenter - vpCenter);
        const p = Math.max(0, Math.min(1, 1 - distance / vh));
        card.style.setProperty('--progress', p.toFixed(4));

        const cp = counterRamp(p);
        const counters = cardCounters.get(card);
        if (counters) {
          for (const { el, target, precision } of counters) {
            el.textContent = (target * cp).toFixed(precision);
          }
        }
      }
      updateScramblers();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(updateAll);
    };

    // first pass before any scroll fires, so raw React text never shows
    updateAll();

    // ambient tick -- keeps unresolved chars flickering even when idle
    const ambient = window.setInterval(updateScramblers, AMBIENT_TICK_MS);

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(ambient);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [routeKey]);
}
