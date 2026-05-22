import { useEffect } from 'react';
import { projects, type Project } from '../data/projects';
import { PromptHeading } from './PromptHeading';
import { ProjectAnimation } from './animations/ProjectAnimation';
import { parseRoute } from '../hooks/useRoute';

const TAG_CLASS: Record<string, string> = {
  research: 'chip accent',
  systems: 'chip warm',
  tooling: 'chip',
  coursework: 'chip alert'
};

export function ProjectsPage() {
  const done = projects.filter((p) => p.status === 'done');
  const wip = projects.filter((p) => p.status === 'wip');

  // on first mount, scroll to the slug if the URL has one. subsequent
  // nav goes through NavTransition
  useEffect(() => {
    const r = parseRoute(window.location.hash);
    if (r.page === 'projects' && r.slug) {
      // rAF gives cards time to mount before we measure
      requestAnimationFrame(() => {
        const el = document.getElementById(r.slug!);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 56;
          window.scrollTo({ top: y, behavior: 'auto' });
        }
      });
    }
  }, []);

  return (
    <main id="main" className="projects-page">
      <section id="projects" className="section reveal" aria-labelledby="proj-title">
        <div className="container">
          <PromptHeading
            cmd="ls projects/"
            meta={`// ${String(projects.length).padStart(2, '0')} total · ${done.length} done · ${wip.length} wip`}
          />
          <h1 id="proj-title" className="section-title">Selected work</h1>
          <p className="lede" style={{ marginBottom: 'var(--sp-7)' }}>
            Independent research, team builds, coursework. The "in progress"
            set below is whatever I'm actively pushing on right now -- the
            "complete" set is the stuff that's frozen at an actual result.
          </p>

          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <a href="#" className="chip" style={{ padding: '4px 12px' }}>← back to /</a>
          </div>
        </div>
      </section>

      {wip.length > 0 && (
        <Group
          id="wip"
          title="Work in progress"
          cmd="ls projects/wip/"
          items={wip}
          status="wip"
        />
      )}

      {done.length > 0 && (
        <Group
          id="done"
          title="Complete"
          cmd="ls projects/done/"
          items={done}
          status="done"
        />
      )}
    </main>
  );
}

function Group({
  id,
  title,
  cmd,
  items,
  status
}: {
  id: string;
  title: string;
  cmd: string;
  items: Project[];
  status: 'done' | 'wip';
}) {
  return (
    <section id={id} className="section reveal" aria-labelledby={`${id}-title`}>
      <div className="container">
        <PromptHeading cmd={cmd} meta={`// ${String(items.length).padStart(2, '0')} entries`} />
        <h2 id={`${id}-title`} className="section-title">{title}</h2>

        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 'var(--sp-6) 0 0',
            display: 'grid',
            gap: 'var(--sp-8)'
          }}
        >
          {items.map((p, i) => (
            <ProjectEntry key={p.slug} project={p} index={i + 1} groupStatus={status} />
          ))}
        </ol>
      </div>
    </section>
  );
}

// counts 0 -> target as the card scrolls in. driven by useScrollProgress
// via [data-counter]. falls back to the raw string if not a number
function CountingValue({ raw }: { raw: string }) {
  const num = parseFloat(raw);
  if (!isFinite(num)) {
    return <div className="entry-highlight__value">{raw}</div>;
  }
  const decimals = raw.includes('.') ? (raw.split('.')[1] ?? '').length : 0;
  return (
    <div
      className="entry-highlight__value"
      data-counter={num}
      data-counter-precision={decimals}
      aria-label={raw}
    >
      {(0).toFixed(decimals)}
    </div>
  );
}

function ProjectEntry({
  project: p,
  index,
  groupStatus
}: {
  project: Project;
  index: number;
  groupStatus: 'done' | 'wip';
}) {
  return (
    <li
      id={p.slug}
      className="boxed boxed--project boxed--entry reveal"
      data-progress
      data-title={`./projects/${p.slug}.md`}
      data-foot={`${String(index).padStart(2, '0')} · ${p.tags[0]}`}
    >
      <header className="entry-head">
        <span className="entry-num" aria-hidden="true">{String(index).padStart(2, '0')}</span>
        <h3 className="entry-name">{p.name}</h3>
        <span className={`status-badge status-badge--${groupStatus}`}>
          {groupStatus === 'done' ? '● done' : '○ wip'}
        </span>
        <span className="entry-when">{p.when}</span>
      </header>

      <div className="entry-role">{p.role}</div>

      <div className="entry-body">
        <div className="entry-prose">
          <p style={{ color: 'var(--fg)', fontSize: 'var(--fs-lg)', lineHeight: 'var(--lh-snug)' }}>
            {p.blurb}
          </p>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 'var(--sp-4) 0',
              color: 'var(--fg-muted)'
            }}
          >
            {p.details.map((d, di) => (
              <li
                key={di}
                style={{
                  position: 'relative',
                  paddingLeft: '1.6ch',
                  marginBottom: 'var(--sp-3)'
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ position: 'absolute', left: 0, color: 'var(--amber)' }}
                >
                  ›
                </span>
                {d}
              </li>
            ))}
          </ul>

          <div>
            {p.tags.map((t) => (
              <span key={t} className={TAG_CLASS[t]}>{t}</span>
            ))}
            <span style={{ marginLeft: 'var(--sp-3)', color: 'var(--fg-faint)' }}>·</span>
            {p.stack.map((s) => (
              <span key={s} className="chip" style={{ marginLeft: 'var(--sp-2)' }}>
                {s}
              </span>
            ))}
          </div>
        </div>

        <aside className="entry-viz" aria-label={`${p.name} visualization`}>
          <ProjectAnimation slug={p.slug} />
          {p.heuristics ? (
            <div className="entry-heuristics">
              <div className="entry-heuristics__label">learned heuristics</div>
              <ul className="entry-heuristics__list">
                {p.heuristics.map((h, i) => (
                  <li key={i} data-scramble data-text={h} aria-label={h}>{h}</li>
                ))}
              </ul>
            </div>
          ) : p.highlight ? (
            <div className="entry-highlight">
              <div className="entry-highlight__label">{p.highlight.label}</div>
              <CountingValue raw={p.highlight.value} />
            </div>
          ) : null}
        </aside>
      </div>
    </li>
  );
}
