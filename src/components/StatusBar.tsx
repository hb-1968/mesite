import { useEffect, useState } from 'react';
import { meta } from '../data/meta';
import { projects } from '../data/projects';
import type { Theme } from '../hooks/useTheme';
import type { Page } from '../hooks/useRoute';

type Props = {
  theme: Theme;
  onToggleTheme: () => void;
  page: Page;
};

const MAIN_SECTIONS: { id: string; label: string }[] = [
  { id: 'top',      label: '~' },
  { id: 'whoami',   label: '~/about' },
  { id: 'focus',    label: '~/focus' },
  { id: 'skills',   label: '~/skills' },
  { id: 'history',  label: '~/history' },
  { id: 'contact',  label: '~/contact' }
];
const PROJ_SECTIONS: { id: string; label: string }[] = [
  { id: 'projects', label: '~/projects' },
  { id: 'wip',      label: '~/projects/wip' },
  { id: 'done',     label: '~/projects/done' }
];

export function StatusBar({ theme, onToggleTheme, page }: Props) {
  const sections = page === 'main' ? MAIN_SECTIONS : PROJ_SECTIONS;
  const [active, setActive] = useState(sections[0]?.label ?? '~');
  const [dropOpen, setDropOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  // taller at the top of the page, shrinks once you've scrolled in.
  // CSS handles the transition so it doesn't snap
  const [compressed, setCompressed] = useState(false);

  useEffect(() => {
    const els = sections
      .map(({ id, label }) => ({ el: document.getElementById(id), label }))
      .filter((x): x is { el: HTMLElement; label: string } => x.el !== null);

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) {
          const match = els.find((x) => x.el === visible[0].target);
          if (match) setActive(match.label);
        }
      },
      { rootMargin: '-30% 0px -55% 0px' }
    );

    els.forEach(({ el }) => io.observe(el));
    return () => io.disconnect();
  }, [page, sections]);

  // 80px dead zone so a tiny twitch doesn't flip the bar to compact
  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const glyph = theme === 'dark' ? '◐' : '◑';
  const targetLabel = theme === 'dark' ? 'light' : 'dark';

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'color-mix(in srgb, var(--bg-deep) 88%, transparent)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderBottom: '1px solid var(--fg-faint)',
        fontSize: compressed ? 'var(--fs-sm)' : 'var(--fs-md)',
        transition: 'font-size 220ms ease'
      }}
      aria-label="status bar"
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: compressed ? 40 : 68,
          gap: 'var(--sp-4)',
          color: 'var(--fg-muted)',
          transition: 'height 220ms ease'
        }}
      >
        <span style={{ color: 'var(--amber)', fontWeight: compressed ? 400 : 500, transition: 'font-weight 220ms ease' }}>{meta.handle}@bu</span>
        <span style={{ color: 'var(--fg-dim)' }}>:</span>
        <SectionsDropdown
          active={active}
          sections={sections}
          open={sectionsOpen}
          onOpenChange={setSectionsOpen}
        />

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}>
          {page === 'projects' && <a href="#">home</a>}

          <ProjectsDropdown
            open={dropOpen}
            onOpenChange={setDropOpen}
            currentPage={page}
          />

          {page === 'main' && <>
            <a href="#skills">skills</a>
            <a href="#contact">contact</a>
          </>}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${targetLabel} mode (current: ${theme})`}
            title={`Switch to ${targetLabel} mode (t)`}
            style={{
              padding: '2px 8px',
              fontSize: 'var(--fs-xs)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '0.9em' }}>{glyph}</span>
            {targetLabel}
          </button>
        </span>
      </div>
    </header>
  );
}

function ProjectsDropdown({
  open,
  onOpenChange,
  currentPage
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPage: Page;
}) {
  return (
    <div
      className="proj-drop"
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => onOpenChange(false)}
      onFocus={() => onOpenChange(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onOpenChange(false);
      }}
    >
      <a
        href="#projects"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        projects
        <span style={{ fontSize: '0.8em', color: open ? 'var(--amber)' : 'var(--fg-dim)' }} aria-hidden="true">▾</span>
      </a>
      {open && (
        <div className="proj-drop__wrap">
          <div
            role="menu"
            className="proj-drop__panel boxed"
            data-title="./projects"
            onClick={() => onOpenChange(false)}
          >
            <a role="menuitem" href="#projects" className="proj-drop__item">
              <span className="proj-drop__num">all</span>
              <span className="proj-drop__name">overview · {projects.length}</span>
            </a>
            {projects.map((p, i) => (
              <a
                key={p.slug}
                role="menuitem"
                href={`#projects/${p.slug}`}
                className="proj-drop__item"
              >
                <span className="proj-drop__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="proj-drop__name">{p.name}</span>
                <span className={`proj-drop__status proj-drop__status--${p.status}`}>
                  {p.status === 'done' ? '●' : '○'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
      <style>{`
        .proj-drop { position: relative; }
        /* transparent wrapper covers the link-to-panel gap + the panel
           itself -- gives a continuous hover hit-area */
        .proj-drop__wrap {
          position: absolute;
          top: 100%;
          right: 0;
          width: 380px;
          max-width: 92vw;
          padding-top: 12px;
          z-index: 10;
        }
        .proj-drop__panel {
          background: var(--bg-deep);
          padding: var(--sp-3);
          width: 100%;
        }
        .proj-drop__panel[data-title]::before { background: var(--bg-deep); }
        .proj-drop__item {
          display: grid;
          grid-template-columns: 2.4ch 1fr auto;
          gap: var(--sp-3);
          align-items: baseline;
          padding: var(--sp-2) var(--sp-3);
          color: var(--fg-muted);
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--fs-xs);
        }
        .proj-drop__item:hover {
          background: var(--bg-elev);
          color: var(--fg);
          border-bottom: none;
        }
        .proj-drop__num {
          color: var(--fg-dim);
          font-variant-numeric: tabular-nums;
        }
        .proj-drop__name { font-size: var(--fs-sm); line-height: 1.3; }
        .proj-drop__status { font-size: var(--fs-xs); }
        .proj-drop__status--done { color: var(--olive); }
        .proj-drop__status--wip  { color: var(--terracotta); }
        .proj-drop a { border-bottom: 1px dashed transparent; }
        .proj-drop a:hover { border-bottom-color: var(--amber-hi); }
        .proj-drop__panel a { border-bottom: none; }
        .proj-drop__panel a:hover { border-bottom: none; }
        ${currentPage === 'projects' ? '.proj-drop > a { color: var(--amber); }' : ''}
      `}</style>
    </div>
  );
}

// sections dropdown -- wraps `~/about` etc. in a working menu. each
// item is just an anchor; NavTransition's click handler does the curtain
function SectionsDropdown({
  active,
  sections,
  open,
  onOpenChange
}: {
  active: string;
  sections: { id: string; label: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div
      className="sect-drop"
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => onOpenChange(false)}
      onFocus={() => onOpenChange(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onOpenChange(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className="sect-drop__trigger"
        onClick={() => onOpenChange(!open)}
      >
        <span aria-live="polite">{active}</span>
        <span className="sect-drop__chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="sect-drop__wrap">
          <div
            role="menu"
            className="sect-drop__panel boxed"
            data-title="./sections"
            onClick={() => onOpenChange(false)}
          >
            {sections.map((s) => {
              const isActive = s.label === active;
              // 'top' has no real anchor -- use '#' to jump to doc top
              const href = s.id === 'top' ? '#' : `#${s.id}`;
              return (
                <a
                  key={s.id}
                  role="menuitem"
                  href={href}
                  className={`sect-drop__item${isActive ? ' sect-drop__item--active' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="sect-drop__bullet" aria-hidden="true">
                    {isActive ? '●' : '○'}
                  </span>
                  <span className="sect-drop__label">{s.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
      <style>{`
        .sect-drop { position: relative; }
        .sect-drop__trigger {
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          padding: 0;
          background: transparent;
          border: none;
          color: var(--fg-muted);
          font-family: var(--font-mono);
          font-size: inherit;
          line-height: inherit;
          cursor: pointer;
          border-bottom: 1px dashed transparent;
          transition: border-color 120ms linear, color 120ms linear;
        }
        .sect-drop__trigger:hover,
        .sect-drop__trigger:focus-visible {
          color: var(--fg);
          border-bottom-color: var(--amber-hi);
          outline: none;
        }
        .sect-drop__chev {
          font-size: 0.8em;
          color: ${open ? 'var(--amber)' : 'var(--fg-dim)'};
          transition: color 120ms linear, transform 120ms linear;
          transform: ${open ? 'rotate(180deg)' : 'rotate(0)'};
          display: inline-block;
        }
        .sect-drop__wrap {
          position: absolute;
          top: 100%;
          left: 0;
          width: 220px;
          max-width: 92vw;
          padding-top: 12px;
          z-index: 10;
        }
        .sect-drop__panel {
          background: var(--bg-deep);
          padding: var(--sp-3);
          width: 100%;
        }
        .sect-drop__panel[data-title]::before { background: var(--bg-deep); }
        .sect-drop__item {
          display: grid;
          grid-template-columns: 1.2em 1fr;
          gap: var(--sp-3);
          align-items: baseline;
          padding: var(--sp-2) var(--sp-3);
          color: var(--fg-muted);
          font-size: var(--fs-sm);
          border: none;
          border-radius: var(--radius-sm);
        }
        .sect-drop__item:hover {
          background: var(--bg-elev);
          color: var(--fg);
        }
        .sect-drop__item--active { color: var(--amber); }
        .sect-drop__item--active:hover { color: var(--amber-hi); }
        .sect-drop__bullet { color: var(--fg-dim); }
        .sect-drop__item--active .sect-drop__bullet { color: var(--amber); }
        .sect-drop a { border-bottom: 1px dashed transparent; }
        .sect-drop a:hover { border-bottom: none; }
      `}</style>
    </div>
  );
}
