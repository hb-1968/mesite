export type TimelineEntry = {
  when: string;
  title: string;
  org?: string;
  body?: string;
  kind: 'edu' | 'conf' | 'volunteer';
};

export const education = {
  school: 'Boston University',
  degree: 'B.A. Computer Science, Minor in Mathematics',
  gpa: '3.38 / 4.00',
  expected: 'Expected May 2028',
  current: 'Entering Junior year, Fall 2026',
  location: 'Boston, MA',
  coursework: [
    'Calculus I',
    'Calculus II',
    'Multivariable Calculus',
    'Differential Equations',
    'Linear Algebra',
    'Probability',
    'Data Structures',
    'Computer Systems',
    'Randomized Algorithms',
    'Data Science',
    'Machine Learning (Fall 2026)',
    'Distributed Systems (Fall 2026)',
    'Mathematical Logic (Fall 2026)'
  ]
};

export const conferences = [
  { name: 'AAD Annual Meeting',                    when: 'attended' },
  { name: 'Noah Worcester Dermatological Society', when: 'attended' },
  { name: 'ASDP Annual Meeting',                   when: 'attended' }
];

export const volunteer: TimelineEntry[] = [
  {
    when: '2024',
    title: 'FDNY Skin Cancer Check Volunteer',
    org: 'American Academy of Dermatology',
    body:
      'Patient intake and processing for FDNY firefighters getting free skin checks from volunteer dermatologists -- mostly clipboard work, plus some on-the-fly triage logistics.',
    kind: 'volunteer'
  }
];
