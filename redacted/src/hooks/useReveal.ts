import { useEffect } from 'react';

// toggles .in on .reveal elements as they enter/leave viewport. drives
// the panel-rise + wipe-rule + per-project SVG animations.
// data-nav-locked is honored so NavTransition can scripted-strip .in
// during the curtain without the observer fighting back.
// routeKey: re-scan when the page changes (typically route.page)
export function useReveal(routeKey?: string | number) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (el.hasAttribute('data-nav-locked')) continue;
          el.classList.toggle('in', e.isIntersecting);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [routeKey]);
}
