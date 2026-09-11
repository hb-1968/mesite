export type Role = {
  slug: string;
  title: string;
  org: string;
  when: string;
  mode: string;
  blurb: string;
  details: string[];
  // slugs from projects.ts that came out of this role
  projects?: string[];
};

export type Publication = {
  title: string;
  venue: string;
  when: string;
  // 'submitted' until a decision comes back -- do not promote this early
  status: 'submitted' | 'accepted' | 'presented';
  note?: string;
};

export const roles: Role[] = [
  {
    slug: 'chao-lab',
    title: 'Research Volunteer',
    org: 'Prof. Wei-Lun Chao, Boston University',
    when: 'Summer 2026 -- present',
    mode: 'hybrid',
    blurb:
      'Fine-grained specimen segmentation, in a group that works on imageomics -- the computer-vision side of getting biological traits out of museum specimen photographs.',
    details: [
      'The one-shot trait segmentation project is the tangible output: reproducing his group\'s published method end to end, then pushing on the part of it that did not hold up.',
      'The rest is quieter -- annotation and quality control for PhD students\' ongoing segmentation work, which is also the fastest way to learn what the data actually looks like before you model it.'
    ],
    projects: ['sst-tracking']
  }
];

export const publications: Publication[] = [
  {
    title: 'From Stain Normalization to Virtual Staining: Emerging AI Tools in Dermatopathology',
    venue: 'ASDP 63rd Annual Meeting',
    when: 'Nov 2026',
    status: 'submitted',
    note:
      'Co-author. A narrative review of where stain normalization, virtual staining, and virtual IHC actually stand -- including the melanin-DAB spectral overlap that general-pathology work tends to skip, and the fact that external validation is thin across basically all of it.'
  }
];
