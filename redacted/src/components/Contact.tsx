import { meta } from '../data/meta';
import { PromptHeading } from './PromptHeading';

export function Contact() {
  return (
    <section id="contact" className="section reveal" aria-labelledby="contact-title">
      <div className="container">
        <PromptHeading cmd="contact --open" meta="// always" />
        <h2 id="contact-title" className="section-title">
          ████ ███ ██ █████ ██ ██ █████.
        </h2>

        <p className="lede">
          █'█ ███ ██ ███████/█, ███ ██████ ████'█ █ █████████ ███████ ███ ██ --
          █████ ██ ████████ ███ ████ ████████ ███ ██ █████ ██, ████{' '}
          <strong style={{ fontWeight: 500, color: 'var(--amber)' }}>
            ████████████████████████
          </strong>{' '}
          ████████ ████ ███ ██ ███████. ██ ████'██ █ █████████ ███ █ ██████
          ████ ██ ██ ███ █████████ -- ███████ █████████ ███ ████████ ████
          ████. █████ ████ ██ ██ █ █████-█████.
        </p>

        <div
          style={{
            marginTop: 'var(--sp-7)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--sp-6) var(--sp-4)'
          }}
        >
          <ContactBox
            label="./contact/email (preferred)"
            value={meta.email}
            href={`mailto:${meta.email}`}
            preferred
          />
          <ContactBox
            label="./contact/email.bu"
            value={meta.emailAlt}
            href={`mailto:${meta.emailAlt}`}
          />
          <ContactBox
            label="./profile/github"
            value={`github.com/${meta.handle}`}
            href={meta.github}
            external
          />
          <ContactBox
            label="./profile/linkedin"
            value="██████ ███████"
            href={meta.linkedin}
            external
          />
        </div>
      </div>
    </section>
  );
}

function ContactBox({
  label,
  value,
  href,
  external,
  preferred
}: {
  label: string;
  value: string;
  href: string;
  external?: boolean;
  preferred?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      className={preferred ? 'boxed boxed--amber' : 'boxed'}
      data-title={label}
      style={{
        display: 'block',
        color: 'var(--fg)',
        textDecoration: 'none'
      }}
    >
      <div style={{ color: 'var(--fg)', fontSize: 'var(--fs-md)' }}>
        {value}
      </div>
      <div style={{ marginTop: 'var(--sp-2)', color: 'var(--fg-dim)', fontSize: 'var(--fs-xs)' }}>
        {external ? '↗ open in new tab' : '↗ open client'}
      </div>
    </a>
  );
}
