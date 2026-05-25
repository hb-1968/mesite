import { useEffect, useRef, useState } from 'react';
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
  // NB: no early returns above the hooks -- bailing out before
  // useState/useEffect changes hook count between renders and React
  // throws "rendered fewer hooks than expected" the moment you nav
  // away from hole2. the page === 'hole2' / isHole branches sit
  // below, after all hooks have been called.
  const isHole = page === 'hole';
  const isHole2 = page === 'hole2';
  // hole route uses a different layout entirely -- no sections menu
  const sections = page === 'main' ? MAIN_SECTIONS : PROJ_SECTIONS;
  const [active, setActive] = useState(sections[0]?.label ?? '~');
  const [dropOpen, setDropOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  // taller at the top of the page, shrinks once you've scrolled in.
  // CSS handles the transition so it doesn't snap
  const [compressed, setCompressed] = useState(false);

  useEffect(() => {
    // hole + hole2 have no anchored sections to track
    if (isHole || isHole2) return;
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
  }, [page, sections, isHole, isHole2]);

  // 80px dead zone so a tiny twitch doesn't flip the bar to compact
  useEffect(() => {
    const onScroll = () => setCompressed(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // hole2 = nothing. bail out only AFTER every hook above has run
  // so the hook count stays stable across page transitions
  if (isHole2) return null;

  const glyph = theme === 'dark' ? '◐' : '◑';
  const targetLabel = theme === 'dark' ? 'light' : 'dark';

  // hole route -- nothing but the exit prompt + theme toggle. by the
  // time someone's down here they've committed to the bit. href="#"
  // routes through NavTransition back to the main page.
  if (isHole) {
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
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            height: compressed ? 40 : 68,
            gap: 'var(--sp-4)',
            color: 'var(--fg-muted)',
            transition: 'height 220ms ease'
          }}
        >
          {/* left cell: empty -- pushes the prompt to center */}
          <span />

          <a
            href="#"
            className="hole-end-link"
            aria-label="End yourself and return home"
          >
            END YOURSELF
          </a>

          <span style={{ justifySelf: 'end' }}>
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

  return (
    <header
      className="statusbar"
      data-compressed={compressed ? '' : undefined}
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
        className="container statusbar__row"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: compressed ? 40 : 68,
          gap: 'var(--sp-4)',
          color: 'var(--fg-muted)',
          transition: 'height 220ms ease'
        }}
      >
        <span
          className="statusbar__handle"
          style={{
            color: 'var(--amber)',
            fontWeight: compressed ? 400 : 500,
            transition: 'font-weight 220ms ease',
            whiteSpace: 'nowrap'
          }}
        >
          <span>{meta.handle}</span>
          <span className="statusbar__handle-suffix">@bu</span>
        </span>
        <span className="statusbar__colon" style={{ color: 'var(--fg-dim)' }}>:</span>
        <SectionsDropdown
          active={active}
          sections={sections}
          open={sectionsOpen}
          onOpenChange={setSectionsOpen}
        />

        <span
          className="statusbar__right"
          style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-4)', alignItems: 'center' }}
        >
          {page === 'projects' && <a href="#" className="statusbar__link">home</a>}

          <ProjectsDropdown
            open={dropOpen}
            onOpenChange={setDropOpen}
            currentPage={page}
          />

          {page === 'main' && <>
            <a href="#skills" className="statusbar__link statusbar__link--secondary">skills</a>
            <a href="#contact" className="statusbar__link statusbar__link--secondary">contact</a>
          </>}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${targetLabel} mode (current: ${theme})`}
            title={`Switch to ${targetLabel} mode (t)`}
            className="statusbar__theme"
            style={{
              padding: '2px 8px',
              fontSize: 'var(--fs-xs)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '0.9em' }}>{glyph}</span>
            <span className="statusbar__theme-label">{targetLabel}</span>
          </button>
        </span>
      </div>

      <style>{`
        /* mobile reformat. logic:
           - skills/contact direct anchors are redundant -- both live in
             the sections dropdown already. drop them first.
           - @bu suffix is decorative. drop it next.
           - colon vanishes on phones, the prompt reads fine without it.
           - theme button shrinks to the glyph alone at the narrowest tier */
        .statusbar__link { white-space: nowrap; }

        @media (max-width: 720px) {
          .statusbar__row { gap: var(--sp-3); }
          .statusbar__link--secondary { display: none; }
        }
        @media (max-width: 560px) {
          .statusbar__row { gap: var(--sp-2); }
          .statusbar__handle-suffix { display: none; }
          .statusbar__colon { display: none; }
        }
        @media (max-width: 420px) {
          .statusbar__theme-label { display: none; }
          .statusbar__theme { padding: 2px 6px; }
        }
      `}</style>
    </header>
  );
}

// shared dropdown behavior. closes on outside-click and Escape so touch
// devices don't get stuck-open panels (no mouseleave on touch).
function useDropdown(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  rootRef: React.RefObject<HTMLElement>
) {
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange, rootRef]);
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
  const rootRef = useRef<HTMLDivElement>(null);
  useDropdown(open, onOpenChange, rootRef);

  return (
    <div
      ref={rootRef}
      className="nav-drop nav-drop--right"
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
        className="nav-drop__trigger nav-drop__trigger--link"
        data-open={open ? '' : undefined}
      >
        <span>projects</span>
        <span className="nav-drop__chev" aria-hidden="true">▾</span>
      </a>
      {open && (
        <div className="nav-drop__wrap nav-drop__wrap--right">
          <div
            role="menu"
            className="nav-drop__panel boxed"
            data-title="./projects"
            onClick={() => onOpenChange(false)}
          >
            <a role="menuitem" href="#projects" className="nav-drop__item proj-item">
              <span className="proj-item__num">all</span>
              <span className="proj-item__name">overview · {projects.length}</span>
            </a>
            {projects.map((p, i) => (
              <a
                key={p.slug}
                role="menuitem"
                href={`#projects/${p.slug}`}
                className="nav-drop__item proj-item"
              >
                <span className="proj-item__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="proj-item__name">{p.name}</span>
                <span className={`proj-item__status proj-item__status--${p.status}`}>
                  {p.status === 'done' ? '●' : '○'}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
      <style>{`
        ${sharedDropdownCss}

        .proj-item {
          grid-template-columns: 2.4ch 1fr auto;
        }
        .proj-item__num {
          color: var(--fg-dim);
          font-variant-numeric: tabular-nums;
        }
        .proj-item__name { font-size: var(--fs-sm); line-height: 1.3; }
        .proj-item__status { font-size: var(--fs-xs); }
        .proj-item__status--done { color: var(--olive); }
        .proj-item__status--wip  { color: var(--terracotta); }

        ${currentPage === 'projects'
          ? '.nav-drop__trigger--link { color: var(--amber-hi); border-bottom-color: var(--amber-hi); }'
          : ''}
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
  const rootRef = useRef<HTMLDivElement>(null);
  useDropdown(open, onOpenChange, rootRef);

  return (
    <div
      ref={rootRef}
      className="nav-drop nav-drop--left"
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
        className="nav-drop__trigger nav-drop__trigger--btn"
        data-open={open ? '' : undefined}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-live="polite">{active}</span>
        <span className="nav-drop__chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="nav-drop__wrap nav-drop__wrap--left">
          <div
            role="menu"
            className="nav-drop__panel boxed"
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
                  className={`nav-drop__item sect-item${isActive ? ' sect-item--active' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="sect-item__bullet" aria-hidden="true">
                    {isActive ? '●' : '○'}
                  </span>
                  <span className="sect-item__label">{s.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
      <style>{`
        ${sharedDropdownCss}

        .sect-item {
          grid-template-columns: 1.2em 1fr;
          font-size: var(--fs-sm);
        }
        .sect-item--active { color: var(--amber); }
        .sect-item--active:hover { color: var(--amber-hi); }
        .sect-item__bullet { color: var(--fg-dim); }
        .sect-item--active .sect-item__bullet { color: var(--amber); }
      `}</style>
    </div>
  );
}

// one source of truth for the two dropdowns so their trigger styling,
// chevron rotation, panel offset + alignment all stay in lockstep. each
// dropdown adds its own item-grid rules on top
const sharedDropdownCss = `
  .nav-drop { position: relative; }

  .nav-drop__trigger {
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
  .nav-drop__trigger:hover,
  .nav-drop__trigger:focus-visible,
  .nav-drop__trigger[data-open] {
    color: var(--fg);
    border-bottom-color: var(--amber-hi);
    outline: none;
  }
  .nav-drop__trigger--link {
    color: var(--amber);
    text-decoration: none;
  }
  .nav-drop__trigger--link:hover,
  .nav-drop__trigger--link[data-open] {
    color: var(--amber-hi);
  }

  .nav-drop__chev {
    font-size: 0.8em;
    color: var(--fg-dim);
    transition: color 120ms linear, transform 160ms ease;
    transform: rotate(0deg);
    display: inline-block;
  }
  .nav-drop__trigger[data-open] .nav-drop__chev {
    color: var(--amber);
    transform: rotate(180deg);
  }

  /* transparent wrapper covers the link-to-panel gap + the panel
     itself -- gives a continuous hover hit-area so the menu doesn't
     close while the cursor traverses the 12px offset */
  .nav-drop__wrap {
    position: absolute;
    top: 100%;
    padding-top: 12px;
    z-index: 10;
  }
  .nav-drop__wrap--left  { left: 0;  width: 240px; max-width: 92vw; }
  .nav-drop__wrap--right { right: 0; width: 380px; max-width: 92vw; }

  .nav-drop__panel {
    background: var(--bg-deep);
    padding: var(--sp-3);
    width: 100%;
  }
  .nav-drop__panel[data-title]::before { background: var(--bg-deep); }

  .nav-drop__item {
    display: grid;
    gap: var(--sp-3);
    align-items: baseline;
    padding: var(--sp-2) var(--sp-3);
    color: var(--fg-muted);
    border: none;
    border-radius: var(--radius-sm);
    text-decoration: none;
  }
  .nav-drop__item:hover {
    background: var(--bg-elev);
    color: var(--fg);
  }
  .nav-drop a { border-bottom: 1px dashed transparent; }
  .nav-drop a:hover { border-bottom-color: var(--amber-hi); }
  .nav-drop__panel a { border-bottom: none; }
  .nav-drop__panel a:hover { border-bottom: none; }

  /* phones -- the right-anchored panel was pushing off-screen because
     the trigger sits within ~80px of the viewport edge. drop the
     .nav-drop's positioning context so the wrap anchors to the
     .statusbar header (next positioned ancestor) and can span the
     viewport with gutter margins. left panel keeps its trigger anchor
     -- it extends rightward and never overflows */
  @media (max-width: 560px) {
    .nav-drop--right { position: static; }
    .nav-drop__wrap--right {
      left: var(--sp-3);
      right: var(--sp-3);
      width: auto;
      max-width: none;
    }
    .nav-drop__wrap--left { width: 78vw; }
  }
`;
