import { useEffect } from 'react';
import Lenis from 'lenis';

// smooth scroll. the scrubbed project anims read --progress off native
// scroll position, and a wheel notch moves that in one jump -- so the
// wipes step instead of sliding. lenis interpolates the scroll position
// between notches, which is the whole reason every award-gallery site
// runs it. it drives real window scroll (not a transformed wrapper), so
// useScrollProgress keeps working off the same scroll event and needs no
// changes.
//
// pass enabled=false on the game routes -- #hole2 wants raw input and
// has nothing to scroll, so interpolating its wheel is pure downside.
export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    // reduced motion means no interpolation at all. useScrollProgress
    // already collapses to final state; here we just never start lenis
    // so scrolling stays exactly native.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return;

    const lenis = new Lenis({
      // ~0.9s to settle. long enough that a wipe visibly travels, short
      // enough that the page does not feel like it is fighting you.
      duration: 0.9,
      // expo-out. matches the ease-out-dominant curves the reference
      // sites use (cubic-bezier .22 .61 .36 1 and neighbours).
      easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      // touch is left native -- smoothing a finger drag feels laggy and
      // fights the platform.
      smoothWheel: true,
      syncTouch: false
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // in-page anchors have to go through lenis or they teleport past the
    // interpolation and land with --progress already settled
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      // hash routes (#projects, #hole) are page swaps, not scroll targets
      if (href === '#' || href.length < 2) return;
      const target = document.getElementById(href.slice(1));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -24 });
    };
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [enabled]);
}
