import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'hb-theme';
const TRANSITION_MS = 450;

// dark/light theme, persisted to localStorage. resolves from storage,
// then prefers-color-scheme, then dark. toggle adds .theme-transitioning
// to <html> for the cross-fade window, then removes it.
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

  const timer = useRef<number | null>(null);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      root.classList.remove('theme-transitioning');
      timer.current = null;
    }, TRANSITION_MS);
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
