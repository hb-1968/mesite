import {
  languages,
  mlPathology,
  frameworks,
  tooling,
  spokenLanguages
} from '../data/skills';
import { PromptHeading } from './PromptHeading';

function Dots({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <span className="dots" aria-label={`${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`dot${i <= level ? ' filled' : ''}`} />
      ))}
    </span>
  );
}

export function Skills() {
  return (
    <section id="skills" className="section reveal" aria-labelledby="skills-title">
      <div className="container">
        <PromptHeading cmd="man skills" meta="// last updated 2026-05" />
        <h2 id="skills-title" className="section-title">Tools & tech</h2>

        <div className="grid cols-2" style={{ marginTop: 'var(--sp-6)', rowGap: 'var(--sp-7)' }}>
          <section className="boxed" data-title="./lang/programming" aria-labelledby="prog-langs">
            <h3 id="prog-langs" className="sr-only">programming languages</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {languages.map((s) => (
                <li
                  key={s.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 'var(--sp-2) 0',
                    borderBottom: '1px dashed var(--fg-faint)',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  <span style={{ minWidth: '12ch' }}>{s.name}</span>
                  <Dots level={s.level} />
                </li>
              ))}
            </ul>
          </section>

          <section className="boxed" data-title="./lang/spoken" aria-labelledby="spoken">
            <h3 id="spoken" className="sr-only">spoken languages</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {spokenLanguages.map((l) => (
                <li
                  key={l.name}
                  style={{
                    display: 'flex',
                    padding: 'var(--sp-2) 0',
                    borderBottom: '1px dashed var(--fg-faint)'
                  }}
                >
                  <span style={{ minWidth: '12ch' }}>{l.name}</span>
                  <span style={{ color: 'var(--fg-muted)' }}>{l.level}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="grid cols-2" style={{ marginTop: 'var(--sp-7)', rowGap: 'var(--sp-7)' }}>
          <section className="boxed" data-title="./stack/ml-pathology">
            <div>{mlPathology.map((t) => <span key={t} className="chip accent">{t}</span>)}</div>
          </section>
          <section className="boxed" data-title="./stack/frameworks">
            <div>{frameworks.map((t) => <span key={t} className="chip warm">{t}</span>)}</div>
          </section>
        </div>

        <div style={{ marginTop: 'var(--sp-7)' }}>
          <section className="boxed" data-title="./stack/tooling">
            <div>{tooling.map((t) => <span key={t} className="chip">{t}</span>)}</div>
          </section>
        </div>
      </div>
    </section>
  );
}
