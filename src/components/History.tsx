import { education, conferences, volunteer } from '../data/timeline';
import { PromptHeading } from './PromptHeading';

export function History() {
  return (
    <section id="history" className="section reveal" aria-labelledby="history-title">
      <div className="container">
        <PromptHeading cmd="history --since 2024" />
        <h2 id="history-title" className="section-title">
          Education, conferences, volunteering
        </h2>

        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            marginTop: 'var(--sp-6)',
            rowGap: 'var(--sp-7)'
          }}
        >
          <article className="boxed" data-title="./edu/boston-university">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 'var(--fs-lg)' }}>{education.school}</h3>
              <span style={{ color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)' }}>{education.expected}</span>
            </div>
            <div style={{ color: 'var(--sage)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
              {education.degree}
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
              GPA {education.gpa} · {education.location}
            </div>
            <p style={{ marginTop: 'var(--sp-3)', color: 'var(--fg-muted)' }}>{education.current}.</p>

            <div style={{ marginTop: 'var(--sp-4)' }}>
              <div
                style={{
                  fontSize: 'var(--fs-xs)',
                  color: 'var(--fg-dim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 'var(--sp-2)'
                }}
              >
                coursework/
              </div>
              <ul className="tree">
                {education.coursework.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </article>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
            <div className="boxed" data-title="./conferences">
              <ul className="tree" style={{ color: 'var(--fg-muted)' }}>
                {conferences.map((c) => (
                  <li key={c.name}>{c.name}</li>
                ))}
              </ul>
            </div>

            <div className="boxed" data-title="./volunteer">
              {volunteer.map((v) => (
                <div key={v.title}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontWeight: 500 }}>{v.title}</strong>
                    <span style={{ color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)' }}>{v.when}</span>
                  </div>
                  {v.org && (
                    <div style={{ color: 'var(--sage)', fontSize: 'var(--fs-sm)' }}>{v.org}</div>
                  )}
                  {v.body && (
                    <p style={{ marginTop: 'var(--sp-2)', color: 'var(--fg-muted)' }}>{v.body}</p>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
