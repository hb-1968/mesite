import { useEffect, useState, useCallback } from 'react';

export type Page = 'main' | 'projects';

export type Route = {
  page: Page;
  // for projects page: scroll to this slug
  slug?: string;
  // for main page: scroll to this anchor
  anchor?: string;
};

// hash conventions:
//   ''                     -> main
//   '#whoami' / '#skills'  -> main + scroll to anchor
//   '#projects'            -> projects page
//   '#projects/<slug>'     -> projects page + scroll to card
export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '').trim();
  if (h === '' ) return { page: 'main' };

  const m = h.match(/^projects(?:\/(.+))?$/);
  if (m) {
    return { page: 'projects', slug: m[1] || undefined };
  }
  return { page: 'main', anchor: h };
}

export function routeToHash(route: Route): string {
  if (route.page === 'projects') {
    return route.slug ? `#projects/${route.slug}` : '#projects';
  }
  return route.anchor ? `#${route.anchor}` : '';
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // imperative nav -- NavTransition calls this once the curtain's up
  const goTo = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (hash === window.location.hash || (hash === '' && !window.location.hash)) {
      // same route, but still update state so re-render sees it
      setRoute(next);
      return;
    }
    if (hash === '') {
      // clear hash without leaving a trailing '#'
      history.pushState(null, '', window.location.pathname + window.location.search);
      setRoute(next);
    } else {
      window.location.hash = hash;
      // hashchange handler updates state
    }
  }, []);

  return { route, goTo };
}
