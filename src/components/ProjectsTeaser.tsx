import { projects } from '../data/projects';
import { PromptHeading } from './PromptHeading';

// teaser on the main page -- shows 4 cards + a link to the full
// projects page. avoids duplicating the whole project list
export function ProjectsTeaser() {
  const done = projects.filter((p) => p.status === 'done').length;
  const wip = projects.filter((p) => p.status === 'wip').length;

  return (
    <section id="projects-teaser" className="section reveal" aria-labelledby="proj-teaser-title">
      <div className="container">
        <PromptHeading cmd="ls projects/" meta={`// ${projects.length} entries · ${done} done · ${wip} wip`} />
        <h2 id="proj-teaser-title" className="section-title">Selected work lives on its own page.</h2>
        <p className="lede">
          Pathology research, course math, full-stack tooling -- the bigger
          cards and per-project visualisations live on the projects page
          rather than getting crammed into the main scroll.
        </p>

        <div className="grid cols-2" style={{ marginTop: 'var(--sp-6)', rowGap: 'var(--sp-6)' }}>
          {projects.slice(0, 4).map((p, i) => (
            <a
              key={p.slug}
              href={`#projects/${p.slug}`}
              className="boxed boxed--project"
              data-title={`./projects/${p.slug}.md`}
              data-foot={p.status === 'done' ? '● done' : '○ wip'}
              style={{ display: 'block', borderBottom: 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ fontSize: 'var(--fs-lg)' }}>{p.name}</h3>
                <span style={{ color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <div style={{ color: 'var(--sage)', fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-1)' }}>
                {p.when}
              </div>
              <p style={{ color: 'var(--fg-muted)', margin: 'var(--sp-3) 0 0', fontSize: 'var(--fs-sm)' }}>
                {p.blurb}
              </p>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 'var(--sp-6)' }}>
          <a
            href="#projects"
            style={{
              display: 'inline-block',
              padding: 'var(--sp-3) var(--sp-5)',
              border: '1px solid var(--amber)',
              color: 'var(--amber)',
              fontSize: 'var(--fs-sm)',
              borderBottom: '1px solid var(--amber)'
            }}
          >
            → see all {projects.length} projects
          </a>
        </div>
      </div>
    </section>
  );
}
