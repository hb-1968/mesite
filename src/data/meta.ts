export const meta = {
  name: 'Hunter Bridges',
  handle: 'hb-1968',
  role: 'CS undergrad · Boston University',
  locations: ['Boston, MA', 'Glen Head, NY'],
  email: 'hunterbridges06@gmail.com',
  emailAlt: 'hbridges@bu.edu',
  phone: '(513) 515-1469',
  github: 'https://github.com/hb-1968',
  linkedin: 'https://www.linkedin.com/in/hunterbridges/',
  resumeUrl: '/resume.pdf'
} as const;

export const focusAreas = [
  {
    id: 'compath',
    title: 'Computational pathology',
    body:
      'WSI pipelines, foundation models (UNI, CONCH), attention-based MIL -- basically the home base for most of my research right now.'
  },
  {
    id: 'medimg',
    title: 'Medical image analysis',
    body:
      'H&E and IHC, mostly dermatopathology-flavored -- tile-level features rolled up to slide-level calls, with calibration that hopefully does not lie about itself.'
  },
  {
    id: 'statml',
    title: 'Statistical ML & math foundations',
    body:
      'EM, GMMs, random projections, OLS/polynomial fits -- the math sitting underneath the deep-learning stuff (CS365 territory, honestly). Also the foundational side for its own sake: MA531 -- mathematical logic -- this fall, after Calculus I-III, differential equations, linear algebra, and probability.'
  },
  {
    id: 'fullstack',
    title: 'Full-stack development',
    body:
      'Tauri desktop apps, React/TypeScript, MV3 browser extensions, SQLite for local-first state -- the plumbing that has to exist before anything else does.'
  }
] as const;
