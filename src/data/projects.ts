export type ProjectStatus = 'done' | 'wip';

export type Project = {
  slug: string;
  name: string;
  when: string;
  role: string;
  blurb: string;
  details: string[];
  stack: string[];
  tags: ('research' | 'systems' | 'tooling' | 'coursework')[];
  status: ProjectStatus;
  // a single headline number (cases, AUC, etc.). xor with `heuristics`
  highlight?: { label: string; value: string };
  // short list of takeaways for coursework -- used when no number fits
  heuristics?: string[];
  links?: { label: string; href: string }[];
};

export const projects: Project[] = [
  {
    slug: 'prame-melanoma',
    name: 'PRAME-Conditioned Melanoma Classification from H&E',
    when: '2026',
    role: 'independent research · TCGA-SKCM, 469 cases',
    status: 'done',
    blurb:
      'A melanoma diagnostic that learns to predict PRAME expression directly from H&E whole-slide images -- then uses that prediction to gate which classifier the slide actually goes through.',
    details: [
      'Attention-based multiple-instance learning over tile features from UNI and CONCH foundation models.',
      'Confidence-gated routing: when PRAME prediction is confident the slide goes through a conditioned classifier; uncertain cases fall back to standard foundation-model classification.',
      'Pipeline from GDC data pull through OpenSlide tiling on BU HPC, with attention-heatmap overlays for sanity-checking what the model actually fixates on.'
    ],
    stack: ['PyTorch', 'UNI', 'CONCH', 'MIL', 'OpenSlide', 'CLAM', 'BU HPC'],
    tags: ['research'],
    highlight: { label: 'cases', value: '469' }
  },
  {
    slug: 'pathology-benchmark',
    name: 'Pathology Foundation Model Benchmark',
    when: 'Summer 2026',
    role: 'independent · MHIST histopathology dataset',
    status: 'done',
    blurb:
      'An honest head-to-head of three feature extractors -- UNI, DINO ViT-Base, and ResNet-50 -- on a public colorectal histopathology dataset. The kind of comparison I kept wishing someone else had already done.',
    details: [
      'Linear-probe protocol over frozen features with 5-fold stratified cross-validation; no fine-tuning, so the comparison reflects pretraining quality directly.',
      'UNI lands at AUC 0.917, ResNet-50 at 0.890, DINO ViT-B at 0.878. The gap is real but small: pathology-specific pretraining wins, generic ImageNet/DINO are not far behind.',
      'Confusion matrices and ROC overlays in the repo; the bar chart on the right is the headline.'
    ],
    stack: ['PyTorch', 'UNI', 'sklearn', 'pandas'],
    tags: ['research'],
    highlight: { label: 'AUC · UNI', value: '0.917' }
  },
  {
    slug: 'gmm-rp',
    name: 'EM for GMM + Random Projections',
    when: 'Spring 2026',
    role: 'CS365 Foundations of Data Science · coursework',
    status: 'done',
    blurb:
      'EM for Gaussian mixtures, written from scratch and run across three synthetic 3-component datasets -- plus a Johnson-Lindenstrauss study where I randomly project 2D points down to 1D and ask whether 3NN still works (spoiler: it does not).',
    details: [
      'Three datasets, 10 EM runs each. Well-separated mixtures (Dataset 2) converge in 5-9 iterations, log-likelihood ≈ −3.7. Overlapping mixtures (Dataset 3) need 8-46 iterations and saturate around LL ≈ −4.2.',
      'Ratio of estimated to true-parameter log-likelihood drifts from 99% on the easy data down to ~90% on the tightly-clustered dataset -- quantifying how cluster overlap punishes EM.',
      'Random projection from 2D to 1D produces 80-93% 3NN error: the JL bound does not protect you when you halve the dimension.'
    ],
    stack: ['Python', 'NumPy', 'scikit-learn', 'SciPy', 'matplotlib'],
    tags: ['coursework'],
    heuristics: [
      'Well-separated mixtures converge in 5-9 EM iterations; overlap pushes that past 40 and sometimes fails entirely at a 16-iter cap.',
      'Estimated log-likelihood almost always sits below the true-parameter LL -- the gap widens as components overlap.',
      'Johnson-Lindenstrauss does not protect distances when you cut dimension in half: 2D → 1D wrecked 3NN at 80-93% error.'
    ]
  },
  {
    slug: 'ols-poly',
    name: 'OLS & Polynomial Regression',
    when: 'Spring 2026',
    role: 'CS365 Foundations of Data Science · coursework',
    status: 'done',
    blurb:
      'A five-task OLS study -- linear fits at three different noise variances, a deliberately mis-specified linear fit forced onto quadratic data, multiple regression on a 2D plane, and polynomial fits of degrees 1-3 against a cubic ground truth.',
    details: [
      'Linear OLS on cubic data (y = 1 + 2x + x³): degree-1 fit reaches R² = 0.843 (under-fit), degree-2 R² = 0.996 (clearly a better approximation but still wrong), degree-3 R² = 1.000 (perfect).',
      'Linear fit forced through quadratic data produces an absurd intercept (−1724.38) and slope 102 yet still scores R² = 0.940 -- classic example of why R² alone is misleading; SSE is the size of a small planet (≈ 1.09 × 10⁸).',
      'Variance sweep on noisy linear data (σ² = 1, 5, 10): R² drifts 0.9998 → 0.9984 → 0.9969, parameter standard errors widen as expected.'
    ],
    stack: ['Python', 'NumPy', 'statsmodels', 'matplotlib'],
    tags: ['coursework'],
    heuristics: [
      'R² alone lies -- a linear fit on quadratic data hit R² 0.94 with an intercept of −1724 and SSE in the hundreds of millions.',
      'Pair R² with SSE and parameter standard errors before trusting any fit.',
      'Higher polynomial degree is not always better; overfitting kicks in just past the true degree of the underlying signal.'
    ]
  },
  {
    slug: 'package-tracking',
    name: 'Dynamic Package Tracking Integration',
    when: 'Summer 2026 -- present',
    role: 'team of 4',
    status: 'wip',
    blurb:
      'A local-first desktop app + browser extension that pulls order and tracking data straight from retailer pages -- no scraper-as-a-service, no account-linking dance.',
    details: [
      'Tauri v2 desktop with a SQLite store; MV3 WebExtension that extracts orders from Amazon and a growing set of generic retailer templates.',
      '17Track API for shipment status; Google Calendar API writes predicted delivery windows as events. CalDAV path planned for Apple Calendar.',
      'Everything stays on-device by default -- the extension is the only network surface.'
    ],
    stack: ['Tauri v2', 'WebExtension MV3', 'React', 'TypeScript', 'SQLite'],
    tags: ['systems'],
    highlight: { label: 'team', value: '4' }
  },
  {
    slug: 'iconograph',
    name: 'Iconograph: Algorithmic Identity for Icon Sets',
    when: 'Summer 2026 -- present',
    role: 'independent',
    status: 'wip',
    blurb:
      'A six-stage pipeline that decomposes an existing logo into a pixelated abstract mark plus a monogram -- then re-renders both per Fedora 44 icon target. Borrows pretty heavily from the MIT Media Lab "algorithmic identity" idea.',
    details: [
      'Sub-case routing (standard / inverted / burst) driven by polygon-vertex counts and radial-profile heuristics.',
      'KMeans palette quantization in CIE Lab to keep color relationships perceptually faithful, not just RGB-close.',
      'Validated against a 25-fixture ground-truth set; each fixture spans the size/format matrix Fedora actually asks for.'
    ],
    stack: ['Python', 'OpenCV', 'scikit-image', 'NumPy'],
    tags: ['tooling'],
    highlight: { label: 'stages', value: '6' }
  }
];
