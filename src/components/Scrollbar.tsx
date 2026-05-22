// custom scroll indicator + drag handle. native is hidden because
// Edge's overlay mode kills ::-webkit-scrollbar styling -- drawing our
// own keeps the CLI look consistent across browsers.
// thumb height ~ vh/doc, thumb top ~ scroll position. drag scrolls,
// track click jumps a page. wheel/keys/touch untouched.
// hidden on narrow viewports where the OS bar is touch-managed.
import { useCallback, useEffect, useRef, useState } from 'react';

const W = 20;          // gutter width in px
const MIN_THUMB = 48;  // never shrink below this

export function Scrollbar() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);     // px
  const [thumbHeight, setThumbHeight] = useState(0); // px
  const [trackHeight, setTrackHeight] = useState(0); // px
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const measure = useCallback(() => {
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    if (docH <= winH + 1) {
      setShow(false);
      return;
    }
    setShow(true);
    setTrackHeight(winH);
    const rawThumbH = (winH / docH) * winH;
    const th = Math.max(MIN_THUMB, rawThumbH);
    setThumbHeight(th);
    const maxScroll = docH - winH;
    const scrollTop = window.scrollY;
    const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    setThumbTop(ratio * (winH - th));
  }, []);

  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); });
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // re-measure when doc height changes (route swap, images, reveals)
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { subtree: true, childList: true, attributes: false });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mo.disconnect();
    };
  }, [measure]);

  /* ── drag handling ──
   * Capture the thumb element AND pointer id locally before any inner
   * function uses them — React clears `e.currentTarget` after the handler
   * returns, and the old code's `releasePointerCapture(e.currentTarget…)`
   * threw on null, skipping the `removeEventListener` calls below it. The
   * document-level `pointermove` listener was left attached, so every
   * subsequent mouse move re-fired the drag math and scrolled the page.
   *
   * Now: listeners ride directly on the captured thumb element. Pointer
   * capture routes all subsequent pointer events to it even when the
   * cursor leaves the bar. A single `cleanup` function removes all three
   * listeners (pointermove / pointerup / pointercancel) FIRST, then
   * releases capture under try/catch, then drops the dragging flag —
   * so a throw anywhere never strands the listeners.
   */
  const onThumbPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const thumb = e.currentTarget;
    const pointerId = e.pointerId;

    try { thumb.setPointerCapture(pointerId); } catch { /* not supported / already captured */ }
    setDragging(true);

    const startY = e.clientY;
    const startScrollTop = window.scrollY;
    const docH = document.documentElement.scrollHeight;
    const winH = window.innerHeight;
    const maxScroll = docH - winH;
    const trackTravel = winH - thumbHeight;

    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      const scrollDelta = trackTravel > 0 ? (dy / trackTravel) * maxScroll : 0;
      window.scrollTo({ top: startScrollTop + scrollDelta, behavior: 'auto' });
    };
    const cleanup = () => {
      thumb.removeEventListener('pointermove', onMove);
      thumb.removeEventListener('pointerup', cleanup);
      thumb.removeEventListener('pointercancel', cleanup);
      try { thumb.releasePointerCapture(pointerId); } catch { /* already released */ }
      setDragging(false);
    };
    thumb.addEventListener('pointermove', onMove);
    thumb.addEventListener('pointerup', cleanup);
    thumb.addEventListener('pointercancel', cleanup);
  }, [thumbHeight]);

  /* ── click empty track to jump by ~one page ── */
  const onTrackClick = useCallback((e: React.MouseEvent) => {
    if (e.target !== trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const winH = window.innerHeight;
    const pageDelta = winH * 0.9 * (y < thumbTop + thumbHeight / 2 ? -1 : 1);
    window.scrollTo({ top: window.scrollY + pageDelta, behavior: 'smooth' });
  }, [thumbTop, thumbHeight]);

  if (!show) return null;

  // block pattern color changes on hover/drag
  const blockColor =
    dragging ? 'var(--amber-hi)' :
    hover    ? 'var(--amber)'    :
              'var(--fg-faint)';
  const frameColor = blockColor;

  return (
    <div
      ref={trackRef}
      role="presentation"
      onClick={onTrackClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="hb-scrollbar"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: W,
        height: trackHeight,
        background: 'var(--bg-deep)',
        borderLeft: '1px solid var(--fg-faint)',
        zIndex: 4,
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      <div
        onPointerDown={onThumbPointerDown}
        style={{
          position: 'absolute',
          top: thumbTop,
          left: 5,
          right: 5,
          height: thumbHeight,
          backgroundImage: `repeating-linear-gradient(
            0deg,
            ${blockColor} 0,
            ${blockColor} 14px,
            transparent  14px,
            transparent  18px
          )`,
          boxShadow: `inset 0 0 0 1px ${frameColor}`,
          cursor: dragging ? 'grabbing' : 'grab',
          transition: 'background-image 120ms linear, box-shadow 120ms linear'
        }}
      />
      <style>{`
        @media (max-width: 700px) { .hb-scrollbar { display: none; } }
      `}</style>
    </div>
  );
}
