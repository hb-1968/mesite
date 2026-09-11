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
    slug: 'sst-tracking',
    name: 'One-Shot Trait Segmentation via Video Tracking',
    when: '2026 -- present',
    role: 'Chao Lab, Boston University',
    status: 'wip',
    blurb:
      'Reproducing Static Segmentation by Tracking, then trying to break the part of it I did not believe. The trick in the paper is to stop treating a specimen photo as a still image: you glue a labeled support image and an unlabeled query into a two-frame video and let a tracker carry the mask across.',
    details: [
      'Beetle reproduces cleanly -- 63.20 ± 3.89 mIoU at 1-shot against the paper\'s 61.9 ± 3.7, and 73.16 ± 2.31 at 5-shot against 74.2 ± 2.9. Getting there took three passes at how support images are picked; the std fell 7.90 → 5.77 → 3.89 as the selection got less arbitrary.',
      'Porting the OC-CCL fine-tuning objective onto SAM 3 is where the actual gain is: beetle 1-shot goes 64.12 → 69.88 mIoU, +5.77 and comfortably significant.',
      'Butterfly refuses to reproduce, and it is not the model. Per-image mIoU correlates -0.866 (n = 500) with how far the query specimen sits from where the support was placed -- 37% of one subspecies is pinned upside down in the source data. Eight other explanations got tested and eliminated first.',
      'The paper\'s claimed +3.3 from OC-CCL measures -0.05 [-0.15, +0.03] under its own config with LoRA. Negative results stay in the repo; a pre-registered gate harness and 16 test modules exist mostly so I cannot quietly retune a threshold after seeing the answer.'
    ],
    stack: ['PyTorch', 'SAM 2', 'SAM 3', 'LoRA', 'pytest', 'Colab A100'],
    tags: ['research'],
    highlight: { label: 'mIoU gain', value: '+5.77' },
    links: [{ label: 'the paper (arXiv 2501.06749)', href: 'https://arxiv.org/abs/2501.06749' }]
  },
  {
    slug: 'reasoning-topologies',
    name: 'Reasoning Topologies',
    when: '2026 -- present',
    role: 'independent research',
    status: 'wip',
    blurb:
      'Hand-curated argument-structure graphs used as an attention prior on a GATv2 layer. The question underneath is whether giving a model the shape of an argument -- explicitly, as a graph -- changes how it reasons, or whether it just learns the shape back from text anyway.',
    details: [
      'Extraction runs under grammar-constrained decoding (vLLM + xgrammar, TP=4, FP8 on four L40S). Qualifying the 122B extractor against a vetted key: 0.87 node recall, 31/31 schema conformance, 0.94 verbatim quote fidelity, adjudicated across 88 human verdicts.',
      'Stock GATv2 turns out to be exactly invariant to valence inversion -- flip every sign and the network cannot tell. A channelized encoder distinguishes the twins untrained, which is the sort of thing worth pinning in a test rather than a paragraph.',
      'The dull half is most of the work: a Pydantic v2 schema frozen behind an explicit revision rule, 1,024 tests green, and a 78-text corpus calibrated to 1.5M words ± 10% per framework so the axes are actually comparable.'
    ],
    stack: ['Python', 'vLLM', 'xgrammar', 'PyTorch Geometric', 'Pydantic v2', 'BU SCC'],
    tags: ['research'],
    highlight: { label: 'tests green', value: '1,024' }
  },
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
      'Pipeline from GDC data pull through OpenSlide tiling on Colab, with attention-heatmap overlays for sanity-checking what the model actually fixates on.'
    ],
    stack: ['PyTorch', 'UNI', 'CONCH', 'MIL', 'OpenSlide', 'CLAM', 'Colab'],
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
    name: 'Delivery Tracker',
    when: 'Summer 2026',
    role: 'team of 4',
    status: 'done',
    blurb:
      'A local-first desktop app + browser extension that pulls order and tracking data straight from retailer pages and email -- no scraper-as-a-service, no account-linking dance. Ships as an actual Windows installer, which took longer than the features did.',
    details: [
      'Tauri v2 desktop with a SQLite store; MV3 WebExtension bridged to the Rust backend over Native Messaging. 17Track for shipment status, Google Calendar for predicted delivery windows.',
      'My two pieces: the browser extension, and the LLM email parser -- built as a standalone module the app integrates rather than something welded into it.',
      'The extension is adapter-architected so extractors never throw -- each returns ok or a reason, highest-confidence extraction wins -- with a site-agnostic Schema.org/OpenGraph fallback and per-field provenance excerpts tying every value back to its source text.',
      'The parser runs a local model constrained so every value it emits has to be a verbatim substring of the source -- a hallucinating model can only return nulls, which is a much easier failure to handle than a plausible wrong address.',
      'Scored properly rather than by vibes: 5-fold cross-validation over a 33 MB labeled email corpus, reported as mean ± std. A review GUI grades outputs and promotes them into few-shot context after K=5, so it improves without retraining.',
      'Everything stays on-device by default -- the extension is the only network surface.'
    ],
    stack: ['Tauri v2', 'Rust', 'React 19', 'TypeScript', 'WebExtension MV3', 'SQLite', 'Ollama'],
    tags: ['systems'],
    highlight: { label: 'labeled corpus', value: '33 MB' }
  },
  {
    slug: 'iconograph',
    name: 'Iconograph: Algorithmic Identity for Icon Sets',
    when: 'Summer 2026',
    role: 'independent',
    status: 'done',
    blurb:
      'A six-stage pipeline that decomposes an existing logo into a pixelated abstract mark plus a monogram -- then re-renders both per Fedora 44 icon target. Borrows pretty heavily from the MIT Media Lab "algorithmic identity" idea. Shipped in the sense that actually matters: its output is the icon set this desktop runs.',
    details: [
      'Sub-case routing (standard / inverted / burst) driven by polygon-vertex counts and radial-profile heuristics.',
      'KMeans palette quantization in CIE Lab to keep color relationships perceptually faithful, not just RGB-close.',
      'Validated against a 30-fixture ground-truth set -- 30/30 scored, 0.963 mean area fidelity, and renders that are byte-deterministic under a --twice re-run check.'
    ],
    stack: ['Python', 'OpenCV', 'scikit-image', 'NumPy'],
    tags: ['tooling'],
    highlight: { label: 'stages', value: '6' }
  }
];
