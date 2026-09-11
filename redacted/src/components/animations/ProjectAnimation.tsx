// stub. the original held 6 hand-authored SVG visualizations keyed to
// specific project slugs; those were saturated with personal research
// labels (dataset names, course numbers, etc.) and have been removed
// for the redacted build. the project entries here use generic slugs
// that fall through to null -- the project cards still render, just
// without the right-hand visual aside.
import './animations.css';

type Props = { slug: string };

export function ProjectAnimation(_: Props) {
  return null;
}
