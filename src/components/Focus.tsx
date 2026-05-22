import { focusAreas } from '../data/meta';
import { PromptHeading } from './PromptHeading';

export function Focus() {
  return (
    <section id="focus" className="section reveal" aria-labelledby="focus-title">
      <div className="container">
        <PromptHeading cmd="ls focus/" meta={`// ${focusAreas.length} entries`} />
        <h2 id="focus-title" className="section-title">Focus areas</h2>

        <div className="grid cols-2" style={{ marginTop: 'var(--sp-6)', rowGap: 'var(--sp-7)' }}>
          {focusAreas.map((f, i) => (
            <article
              key={f.id}
              className="boxed"
              data-title={`./focus/${f.id}.md`}
              data-foot={String(i + 1).padStart(2, '0') + ' / ' + String(focusAreas.length).padStart(2, '0')}
            >
              <h3 style={{ fontSize: 'var(--fs-lg)', marginBottom: 'var(--sp-2)' }}>{f.title}</h3>
              <p style={{ color: 'var(--fg-muted)', margin: 0 }}>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
