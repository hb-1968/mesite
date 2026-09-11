import { meta } from '../data/meta';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        borderTop: 'var(--rule)',
        padding: 'var(--sp-6) 0',
        color: 'var(--fg-dim)',
        fontSize: 'var(--fs-xs)',
        position: 'relative',
        zIndex: 2
      }}
    >
      <div
        className="container"
        style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)', flexWrap: 'wrap' }}
      >
        <span>© {year} {meta.name}</span>
        <span>
          built with <span style={{ color: 'var(--sage)' }}>vite</span> +{' '}
          <span style={{ color: 'var(--sage)' }}>react</span> +{' '}
          <span style={{ color: 'var(--sage)' }}>ts</span>
          {' · '}
          <a href={`https://github.com/${meta.handle}`} target="_blank" rel="noreferrer noopener">
            source
          </a>
        </span>
      </div>
    </footer>
  );
}
