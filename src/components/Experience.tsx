import { roles, publications } from '../data/experience';
import { PromptHeading } from './PromptHeading';

// status word shown next to a publication -- kept literal on purpose,
// 'submitted' is not 'accepted'
const STATUS_LABEL: Record<string, string> = {
  submitted: 'submitted',
  accepted: 'accepted',
  presented: 'presented'
};

export function Experience() {
  return (
    <section id="experience" className="section reveal" aria-labelledby="experience-title">
      <div className="container">
        <PromptHeading cmd="whoami --research" />
        <h2 id="experience-title" className="section-title">
          Research experience
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)', marginTop: 'var(--sp-6)' }}>
          {roles.map((r) => (
            <article key={r.slug} className="boxed" data-title={`./research/${r.slug}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
                <h3 style={{ fontSize: 'var(--fs-lg)' }}>{r.title}</h3>
                <span style={{ color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
                  {r.when}
                </span>
              </div>
              <div style={{ color: 'var(--sage)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
                {r.org}
              </div>
              <div style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
                {r.mode}
              </div>

              <p style={{ marginTop: 'var(--sp-3)', color: 'var(--fg-muted)' }}>{r.blurb}</p>

              <ul className="tree" style={{ marginTop: 'var(--sp-3)', color: 'var(--fg-muted)' }}>
                {r.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </article>
          ))}

          {publications.length > 0 && (
            <div className="boxed" data-title="./publications">
              {publications.map((p) => (
                <div key={p.title}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
                    <strong style={{ fontWeight: 500 }}>{p.title}</strong>
                    <span style={{ color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>
                      {p.when}
                    </span>
                  </div>
                  <div style={{ color: 'var(--sage)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
                    {p.venue} · {STATUS_LABEL[p.status]}
                  </div>
                  {p.note && (
                    <p style={{ marginTop: 'var(--sp-2)', color: 'var(--fg-muted)' }}>{p.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
