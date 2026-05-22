# hunter-portfolio

Personal site for Hunter Bridges. Vite + React + TypeScript. Terminal-themed,
scroll-based, designed in the same espresso-and-cream palette as the resume,
expanded with amber / sage / terracotta accents.

## Local dev

```bash
npm install
npm run dev          # http://localhost:5173/portfolio/
npm run build        # static output in dist/
npm run preview      # serves the built bundle
npm run typecheck    # strict TS check, no emit
```

The dev server uses Vite's HMR. The `base` path defaults to `/portfolio/`
(matching the GitHub Pages project URL when the repo is named `portfolio`).
If you rename the repo, the deploy workflow will rebuild with the right base.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`:

1. `npm ci`
2. `VITE_BASE=/<repo-name>/ npm run build`
3. Uploads `dist/` as a Pages artifact
4. Deploys to `https://hb-1968.github.io/<repo-name>/`

To enable: in the GitHub repo settings, go to **Pages → Build and deployment →
Source** and pick **GitHub Actions**. First push to `main` will deploy.

## Structure

```
src/
├── App.tsx                  # composition root
├── main.tsx                 # entry
├── components/
│   ├── Boot.tsx             # /dev/console boot trace
│   ├── StatusBar.tsx        # sticky top status line
│   ├── Hero.tsx             # name, lede, ASCII glyph
│   ├── About.tsx            # $ whoami
│   ├── Focus.tsx            # focus areas
│   ├── Projects.tsx         # cards
│   ├── Skills.tsx           # dot meters + chip clusters
│   ├── History.tsx          # education + conferences + volunteer
│   ├── Contact.tsx          # email + GH + LinkedIn
│   ├── Footer.tsx
│   └── PromptHeading.tsx    # shared $-prefixed section header
├── data/
│   ├── meta.ts              # name, links, focus areas
│   ├── projects.ts          # project list
│   ├── skills.ts            # languages + framework chips
│   └── timeline.ts          # education + conferences + volunteer
├── hooks/
│   ├── useReveal.ts         # IntersectionObserver fade-in
│   └── useTheme.ts          # espresso / phosphor / ice
└── styles/
    ├── tokens.css           # CSS variables (palette, type, spacing)
    └── global.css           # base styles, primitives, utilities
```

## Editing content

Most edits happen in `src/data/`. Add a project by appending to
`projects.ts`; new entries automatically renumber and re-grid. Skills are
similar.

Add a section by writing a component and dropping it into `App.tsx`. Use
`<PromptHeading cmd="…" meta="…" />` and `.section .container` to match the
rest of the page.

## Themes

Two states, both based on the resume's espresso palette:

- **dark** (default): espresso brown background, cream foreground, amber prompt, sage tags.
- **light**: warm cream paper, espresso ink, deeper amber/sage/terracotta tuned for AA contrast on the lighter ground.

The initial value resolves from, in order: `localStorage`, then the
`prefers-color-scheme` media query, then dark. Press `t` anywhere to
toggle. The choice persists in `localStorage`.

## Accessibility

- Skip link at the very top of the document.
- Boot animation is suppressed when `prefers-reduced-motion: reduce` is set.
- Color pairs pass WCAG AA at body sizes.
- All interactive elements are real `<a>`/`<button>` with visible focus.
- `aria-label`/`aria-labelledby` on every landmark section.
- Semantic landmarks: `<header>`, `<main>`, `<section>`, `<footer>`.

## Design notes

The aesthetic borrows from [primaalab.com](https://primaalab.com) — large
editorial headings, sober tone, restrained motion — and translates it to a
CLI feel: monospace throughout, prompt-prefixed section headers, output
blocks for tabular data, a small scanline overlay, dot meters for skill
levels (same shape as the resume).
