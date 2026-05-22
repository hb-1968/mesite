import { meta } from '../data/meta';
import { Monogram } from './Monogram';

// hero -- top section. flex row with identity (left, grows) and the
// monogram (right, pinned). below: lede + manifest. on narrow screens
// the monogram scales down via transform so it stays on the right.
export function Hero() {
  return (
    <section
      id="hero"
      className="section reveal"
      style={{ borderTop: 'none', paddingTop: 'var(--sp-6)' }}
      aria-labelledby="hero-name"
    >
      <div className="container">
        {/* top row -- identity left, monogram right */}
        <div className="hero-top">
          {/* identity stack */}
          <div className="hero-identity">
            <p className="hero-prompt">
              <span style={{ color: 'var(--amber)' }}>$</span> echo $USER
            </p>

            <h1 id="hero-name" className="hero-name">
              Hunter
              <br />
              Bridges<span className="cursor" aria-hidden="true" />
            </h1>

            <div className="hero-links">
              <a href={meta.github} rel="noreferrer noopener" target="_blank">
                github/{meta.handle}
              </a>
              <span className="hero-sep">·</span>
              <a href={meta.linkedin} rel="noreferrer noopener" target="_blank">
                linkedin
              </a>
              <span className="hero-sep">·</span>
              <a href={`mailto:${meta.email}`}>{meta.email}</a>
            </div>
          </div>

          {/* monogram + wordmark, pinned right */}
          <div className="hero-signature">
            <Monogram />
          </div>
        </div>

        {/* lede */}
        <p className="lede hero-lede">
          CS undergrad at BU. What I actually keep coming back to is{' '}
          <em style={{ color: 'var(--sage)', fontStyle: 'normal' }}>computational pathology</em> --
          whole-slide images, foundation models, and the deeply unglamorous gap
          between tile-level features and a slide-level call -- with regular
          detours into general{' '}
          <em style={{ color: 'var(--sage)', fontStyle: 'normal' }}>ML</em>{' '}
          and the{' '}
          <em style={{ color: 'var(--sage)', fontStyle: 'normal' }}>mathematics</em>{' '}
          sitting underneath both, plus the occasional foray into pure-math
          territory that doesn't always loop back.
        </p>

        {/* manifest box -- quick who/what summary */}
        <div
          className="boxed"
          data-title="./manifest"
          data-foot="press t to toggle light / dark"
          style={{
            marginTop: 'var(--sp-7)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--fg-muted)'
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            <tbody>
              <tr>
                <td style={cell}>name</td>
                <td style={val}>Hunter Bridges</td>
                <td style={cell}>status</td>
                <td style={val}><span style={{ color: 'var(--olive)' }}>● </span>summer break 2026</td>
              </tr>
              <tr>
                <td style={cell}>year</td>
                <td style={val}>BU CS · entering Junior · grad May 2028</td>
                <td style={cell}>open to</td>
                <td style={val}>Summer 2027 ML / SWE internships</td>
              </tr>
              <tr>
                <td style={cell}>based</td>
                <td style={val}>Boston, MA / Glen Head, NY</td>
                <td style={cell}>desktop</td>
                <td style={val}>Fedora 44</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        /* hero top -- 2-col flex */
        #hero .hero-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-8);
          margin-bottom: var(--sp-7);
        }
        #hero .hero-identity {
          flex: 1 1 auto;
          min-width: 0;
        }
        #hero .hero-signature {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          /* pin right -- don't drift inward if identity col is narrow */
          margin-left: auto;
        }

        #hero .hero-prompt {
          color: var(--fg-dim);
          font-size: var(--fs-sm);
          margin: 0 0 var(--sp-3) 0;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        #hero .hero-name {
          font-size: var(--fs-3xl);
          line-height: 0.95;
          letter-spacing: -0.02em;
          font-weight: 700;
          margin: 0 0 var(--sp-5) 0;
        }
        #hero .hero-links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--sp-4);
          font-size: var(--fs-sm);
        }
        #hero .hero-sep { color: var(--fg-faint); }

        #hero .hero-lede {
          margin: 0 0 var(--sp-2) 0;
          max-width: 52ch;
        }

        /* manifest table responsive */
        @media (max-width: 760px) {
          #hero .boxed table { font-size: var(--fs-xs); }
          #hero .boxed table td:nth-child(3) { padding-top: 6px; }
        }

        /* narrow viewports -- shrink the monogram instead of wrapping */
        @media (max-width: 760px) {
          #hero .monogram { transform: scale(0.75); transform-origin: top right; }
          #hero .hero-top { gap: var(--sp-5); }
        }
        @media (max-width: 520px) {
          #hero .monogram { transform: scale(0.55); transform-origin: top right; }
        }
        @media (max-width: 400px) {
          #hero .monogram { transform: scale(0.42); transform-origin: top right; }
        }
      `}</style>
    </section>
  );
}

const cell: React.CSSProperties = {
  color: 'var(--fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontSize: 'var(--fs-xs)',
  padding: '4px 12px 4px 0',
  whiteSpace: 'nowrap',
  verticalAlign: 'top'
};
const val: React.CSSProperties = {
  color: 'var(--fg)',
  padding: '4px 24px 4px 0',
  verticalAlign: 'top'
};
