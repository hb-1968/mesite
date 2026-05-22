# Instructions — `mesite`

You're helping **Hunter Bridges** with his personal site. Always address
him as "Hunter" -- never "Alina" or any variant of the cowork-session
email. CS undergrad at Boston University, entering junior year
Fall 2026. The work below applies on every message in this project.

**Stack:** Vite 5 + React 18 + TypeScript. Hash routing
(`src/hooks/useRoute.ts`), no router library. Custom CLI-styled CSS,
no framework. Deployed to `https://hb-1968.github.io/mesite/` via
GH Actions on push to `main`.

---

## voice rules (non-negotiable, apply to all prose + code comments)

- **`--` for em-dashes**, never `—`. Hunter writes ASCII by habit;
  the typographic em-dash is a Google-Docs autocorrect tell.
- **`-` for en-dashes** in numeric ranges (`5-9`, `degrees 1-3`).
  Never `5–9`.
- **Hedge vocabulary** -- use sparingly but consistently. Their
  absence reads as AI-elegant: `honestly`, `ultimately`, `in
  practice`, `kind of`, `fairly`, `pretty`, `at all`,
  `if anything`.
- **Self-aware asides** in parens or em-dash-set-off.
- **Specific concrete examples > abstractions.** Name UNI/CONCH,
  MA531, Fedora 44, Erdős, AAD/ASDP/Noah Worcester. Don't say
  "foundation models" / "math" / "the field" when you can name
  the actual thing.
- **Don't oversell dermatopathology.** It's ONE thread in Hunter's
  interests, not the prime mover. Lead with broader framings; the
  family/personal angle comes later in any passage, not in headers.
- **No corporate / consultant cadence**: never "sits at the
  intersection of X, Y, and Z", "passionate about", "excited to",
  "leverage", "synergy", "ecosystem", "drive impact".
- **No defensive anti-AI tells**: never "hand-written", "no
  template", "no generator", or any similar disclaimer. Let the
  work speak.
- **Sentence-level rhythm matters.** Vary lengths, use em-dashes
  for asides, parens for clarifications. Long compound sentences
  punctuated with short rhythmic ones.

**Touchstones** -- when in doubt, match the register of:

- "term time I'm in Boston; breaks I'm back in Glen Head, NY"
- "the genuinely awkward seam where tile-level deep features have
  to be aggregated into something that actually tells you what's
  wrong with the slide"
- "axiomatic or deductive constructions for algorithms --
  derivations that start from a small set of clearly-stated
  assumptions and reason forward -- over the empirical
  alternative, where you run a sweep and let the numbers vote"
- "transcribing those intuitions into code"
- "no longer the open-ended suffering it used to be"

---

## code comment rules

- **Prefer `//` over `/* */`.** Multi-line block JSDoc at function
  tops is banned. Drop a 2-3 line `//` comment instead.
- **Lowercase, terse, hedge-y.** Same register as prose, minus any
  attempt at grammatical elegance.
- **Inline `// what this does`** markers > grand explanatory
  blocks. Mark only the non-obvious parts; trust the reader on the
  rest.
- **No decorative section dividers** like `/* ──── Section ──── */`.
  Pads without informing.

---

## about Hunter

- **Email:** `hunterbridges06@gmail.com` (preferred),
  `hbridges@bu.edu` (BU). NOT a GitHub-messaging person.
- **GitHub:** `hb-1968`. Repo for this site: `mesite`.
- **Desktop:** Fedora 44 (recently switched from Windows 10).
  AMD GPU + ROCm for ML.
- **Location:** Boston in term, Glen Head NY on breaks.
- **Family connection to dermatopathology:** mother is a
  dermatopathologist + dermatologist; he's been around society
  meetings (AAD, ASDP, Noah Worcester) and the clinical workflow
  since childhood. This is *context*, not a headline -- don't
  lead with it in prose.
- **Interests** (roughly in time-spent order, all distinct
  threads):
  1. Computational dermatopathology (applied research)
  2. Complexity theory -- NP-hard approximations, Erdős-style
     combinatorial proofs
  3. Deductive algorithm design (axiomatic > empirical sweeps)
  4. ML foundations (linear algebra, optimization theory)
  5. Niche tools when something specific won't automate itself
     (e.g. the Iconograph pixel-art pipeline)
- **Pixel-art background** from younger years feeds the icon
  pipeline project. He doesn't market himself as a designer
  though.
- **TA application** targeting Fall 2026, preference order:
  CS237, CS210, CS365, CS330, CS131, CS112.

---

## key systems (refer to files for full mechanics)

### custom snake-style 5x11 pixel typeface (`src/lib/typeface.ts`)

1-cell strokes, right-angle transitions only, no retracing. Stems
on col 0/4/2. Horizontals on rows 4 (top of x-height), 6 (middle
bar), 8 (baseline). Ascenders 0-3, descenders 9-10. The 11 letters
of "hunterbridges" are hand-authored; the rest follow the same
rules. Includes a-z, 0-9, ' ', '/', '-', '.'. Adding a glyph means
matching these constraints and adding to `TYPEFACE`.

### join policy (`src/components/Wordmark.tsx`)

Joins only at row 8 (baseline rail). Strict AND: bridge fires when
both prev col-4 and next col-0 are filled at row 8.

- **Mid-word kerning rule:** no bridge -> joiner shrinks to 1 col
  so the word doesn't read as monospaced.
- **`|` = explicit word break** (no glyph, default joiner width,
  no bridge). Used in `hunter|bridges`.
- **Space behaves like `|`** -- no glyph placed, word-break only.

### snake-paint animation (Wordmark + global.css)

When `animate` prop is true, `computeSnakePath` walks the composed
grid; each cell gets a `--snake-delay` based on path index ×
`cellDelayMs`. CSS keyframe (`step-end`): transparent -> `amber-hi`
head (1 stride) -> `--snake-color` body. Bumping `playKey` triggers
a class-toggle + reflow + class-readd to restart.

Used by `Monogram`, `PromptHeading`, and the About reader's inline
labels.

### About reader (`src/components/About.tsx`)

Paginated 2-column reader, archive.org PDF-reader feel. Two
spreads, ←/→ to flip. Each column = passages with leading subscript
labels (pixel-typeface, snake-paint, then dash-bloom).

- **Flip animation:** center-origin compress + fade
  (`scaleX(0.02)` ↔ `scaleX(1)`).
- **Stretched ghosts:** prev/next spreads as `position: absolute`
  underlays, masked-gradient peek in the gutter, fade behind the
  current spread. At edge spreads the "other" spread fills both
  ghost slots so width stays constant.
- **Current spread = 85% width**, centered. 7.5% gutter each side.
- **Nav row:** 4 boxes (`< prev`, `1/4`, `2/4`, `next >`),
  counters touch with negative-margin pull.

### status bar (`src/components/StatusBar.tsx`)

`position: sticky; top: 0` -- **must never disappear at any scroll
depth**. Two-state height (68 → 40px) with CSS transition past
scrollY > 80. Contains: handle prompt, section dropdown (active
section indicator opens a menu of all sections), projects dropdown,
direct links, theme toggle.

The fix for "sticky bar disappears" was changing
`html, body, #root { height: 100% }` to `min-height: 100%`. Don't
revert that.

### dashed rules (tokens.css, global.css)

CSS linear-gradient pattern. Tokens: `--dash-len: 12px`,
`--dash-stride: 16px`, `--dash-thickness: 3px`. Used on
`.wipe-rule`, `.section` top edges, `hr`. Section dividers and box
borders should weigh in the same class (3px dashes ≈ 2px solid
box outline).

### scroll-driven effects (`useScrollProgress`)

`--progress` var on `[data-progress]` cards; counters ramp through
[0.35, 0.78]; scramble text runs ambient/resolve/stable zones off
each line's own progress (vh/2 denom). **Lock-in flash uses
paint-only props (color, text-shadow) -- never animate
layout-affecting props or IO will toggle `.in` in a feedback loop.**

---

## what to do when asked to...

- **Add a project** → `src/data/projects.ts` entry; optional SVG
  anim case in `src/components/animations/ProjectAnimation.tsx`.
- **Add a focus area** → `src/data/meta.ts` `focusAreas` array.
- **Add a main-page section** → component file, mount in
  `App.tsx`, add to `MAIN_SECTIONS` in `StatusBar.tsx`.
- **Add an About spread** → push to `SPREADS` array in
  `About.tsx`. Counters auto-update.
- **Add a glyph** → `src/lib/typeface.ts`, match the constraints,
  add to `TYPEFACE`.
- **Change a section header** → that section's component, the
  `<PromptHeading cmd="..." />` prop.
- **Rewrite prose** → apply voice rules; match the paragraph's
  existing rhythm; don't rewrite from scratch unless explicitly
  asked. Preserve `--` em-dashes; preserve specific proper-noun
  grounding.
- **Deploy** → push to `main`; GH Actions handles the rest. Don't
  touch `.github/workflows/deploy.yml` unless asked.

---

## what to never do

- Introduce features without asking. Every effect on this site
  (snake-paint, ghosts, scramble, dash bloom, page-flip) was
  approved iteratively. New effects need the same bar.
- Lead a passage or header with dermatopathology as the prime
  mover. It's a thread, not the headline.
- Convert ASCII `--` to typographic `—` (or `-` to `–`) under
  the guise of "fixing typography". Hunter writes ASCII.
- Add JSDoc block comments at function/component tops.
- Add `/* ──── Section Title ──── */` decorative dividers.
- Write "hand-coded", "no template", "no generator", or any
  variant of those defensive disclaimers.
- Drop a parent's height to 100% on `html/body/#root` -- breaks
  the sticky status bar.
- Animate layout-affecting properties on scramble lock-in -- it
  causes IO feedback loops.
- Add `package.json` dependencies casually. The site is
  deliberately dependency-light. New deps need justification.

---

## known TODOs

- `./about/expanded` + `./blog` -- WIP button on About last page
  is disabled; needs the actual page + route to ship.
- Light-mode contrast pass deferred until usage data justifies it.
- Mobile review deferred -- works at narrow widths but not
  celebrated.

---

## deploy

- Workflow at `.github/workflows/deploy.yml`. Triggers on push to
  `main`. Uses `npm ci`, so `package-lock.json` must stay
  committed.
- `VITE_BASE` derives from repo name: `/mesite/` for project page,
  `/` if you ever move to a user-page repo (override in workflow).
- Hash routing means GH Pages' SPA-fallback limitation doesn't
  apply.
