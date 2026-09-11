import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'hb-theme';

// dark/light theme, persisted to localStorage. resolves from storage,
// then prefers-color-scheme, then dark. toggle uses the View Transitions
// API when available -- one GPU-composited crossfade, no per-element
// style recalc. falls back to a hard snap on browsers without it (mostly
// firefox as of mid-2026); the per-element transition machinery we used
// to run was the source of the click-feels-laggy window.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    // pull the flip out so we can pass it as a callback. flushSync forces
    // react to commit synchronously inside the view-transition callback --
    // without it the snapshot/swap timing is off and you get a flash
    const apply = () => {
      flushSync(() => {
        setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
      });
    };

    // startViewTransition lives on Document in lib.dom (TS 5.6+) so no
    // cast needed. older browsers (firefox as of mid-2026) just won't
    // have it -- fall through to the hard snap.
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(apply);
      return;
    }
    apply();
  }, []);

  return { theme, setTheme, toggle };
}
