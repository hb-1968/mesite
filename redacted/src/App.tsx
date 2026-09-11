import { useEffect } from 'react';
import { Boot } from './components/Boot';
import { StatusBar } from './components/StatusBar';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Focus } from './components/Focus';
import { ProjectsTeaser } from './components/ProjectsTeaser';
import { Skills } from './components/Skills';
import { History } from './components/History';
import { Contact } from './components/Contact';
import { Footer } from './components/Footer';
import { ProjectsPage } from './components/ProjectsPage';
import { HolePage } from './components/HolePage';
import { Hole2Page } from './components/Hole2Page';
import { NavTransition } from './components/NavTransition';
import { Scrollbar } from './components/Scrollbar';
import { useReveal } from './hooks/useReveal';
import { useScrollProgress } from './hooks/useScrollProgress';
import { useRoute } from './hooks/useRoute';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, toggle } = useTheme();
  const { route, goTo } = useRoute();
  // pass route.page so observers re-scan on page swap -- otherwise newly
  // mounted .reveal / [data-progress] elements stay at opacity 0
  useReveal(route.page);
  useScrollProgress(route.page);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  return (
    <NavTransition currentRoute={route} onRouteChange={goTo}>
      <a href="#main" className="skip-link">Skip to content</a>
      <Scrollbar />
      <StatusBar theme={theme} onToggleTheme={toggle} page={route.page} />
      {route.page === 'main' && (
        <>
          <Boot />
          <main id="main">
            <Hero />
            <About />
            <Focus />
            <ProjectsTeaser />
            <Skills />
            <History />
            <Contact />
          </main>
        </>
      )}
      {route.page === 'projects' && <ProjectsPage />}
      {route.page === 'hole' && <HolePage />}
      {route.page === 'hole2' && <Hole2Page />}
      <Footer />
    </NavTransition>
  );
}
