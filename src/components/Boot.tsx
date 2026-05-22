import { useEffect, useState } from 'react';

const LINES = [
  '[ OK ] mounting /home/hunter ... done',
  '[ OK ] starting fontconfig.service',
  '[ OK ] reached target portfolio.target',
  '[ OK ] session opened for hunter on tty1'
];

const PER_LINE_MS = 110;
const STORAGE_KEY = 'hb-booted';

export function Boot() {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const alreadyBooted =
    typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1';

  const [count, setCount] = useState(reduced || alreadyBooted ? LINES.length : 0);

  useEffect(() => {
    if (reduced || alreadyBooted) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= LINES.length) {
        window.clearInterval(id);
        sessionStorage.setItem(STORAGE_KEY, '1');
      }
    }, PER_LINE_MS);
    return () => window.clearInterval(id);
  }, [reduced, alreadyBooted]);

  return (
    <section
      id="top"
      aria-label="boot trace"
      style={{
        padding: 'var(--sp-6) 0 0',
        color: 'var(--fg-dim)',
        fontSize: 'var(--fs-sm)',
        position: 'relative',
        zIndex: 2
      }}
    >
      <div className="container">
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            color: 'var(--fg-dim)',
            lineHeight: 1.7
          }}
        >
          {LINES.slice(0, count).map((l, i) => (
            <span key={i}>
              <span style={{ color: 'var(--olive)' }}>{l.slice(0, 6)}</span>
              {l.slice(6)}
              {'\n'}
            </span>
          ))}
          {count < LINES.length && <span className="cursor" aria-hidden="true" />}
        </pre>
      </div>
    </section>
  );
}
