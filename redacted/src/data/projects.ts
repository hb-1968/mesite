// project entries redacted in place. shape preserved so every
// component (teaser, projects page, statusbar dropdown, animations)
// keeps rendering. slug values are kept terse + generic so hash
// routes still resolve and the project animation switch falls
// through to its default case.

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
  highlight?: { label: string; value: string };
  heuristics?: string[];
  links?: { label: string; href: string }[];
};

const block = (n: number) => '█'.repeat(n);
// build a redacted blurb out of word-shaped block runs so the
// underlying CSS wrap behavior still reads naturally
const phrase = (...counts: number[]) => counts.map(block).join(' ');

export const projects: Project[] = [
  {
    slug: 'one',
    name: phrase(8, 5, 11, 4, 7),
    when: '████',
    role: phrase(11, 9, 4, 5, 4),
    status: 'done',
    blurb: phrase(2, 9, 11, 5, 4, 7, 2, 6, 8, 5, 9, 4, 7, 4, 7, 6, 3, 8, 6, 5, 8, 8),
    details: [
      phrase(9, 5, 8, 11, 5, 4, 9, 4, 7, 9),
      phrase(10, 7, 4, 10, 11, 7, 8, 5, 4, 9),
      phrase(8, 4, 6, 4, 9, 8, 11, 6, 4, 10)
    ],
    stack: [block(7), block(4), block(6), block(4), block(9), block(6)],
    tags: ['research'],
    highlight: { label: '█████', value: '███' }
  },
  {
    slug: 'two',
    name: phrase(8, 10, 6, 9),
    when: '███████ ████',
    role: phrase(11, 4, 9, 7),
    status: 'done',
    blurb: phrase(2, 8, 9, 4, 6, 8, 4, 7, 9, 2, 5, 7, 4, 5, 11, 8, 6, 4, 9, 5),
    details: [
      phrase(7, 9, 4, 8, 11, 5, 10, 6, 7, 9),
      phrase(8, 5, 4, 7, 9, 6, 8, 11, 4, 9),
      phrase(11, 8, 4, 7, 10, 6, 9, 4, 8, 7)
    ],
    stack: [block(7), block(4), block(7), block(7)],
    tags: ['research'],
    highlight: { label: '███ · ███', value: '█████' }
  },
  {
    slug: 'three',
    name: phrase(3, 4, 4, 6, 11),
    when: '██████ ████',
    role: phrase(6, 11, 4, 7, 9, 10),
    status: 'done',
    blurb: phrase(2, 8, 9, 4, 7, 11, 8, 4, 6, 9, 5, 8, 11, 4, 7),
    details: [
      phrase(6, 9, 4, 8, 11, 6, 10, 4, 7, 9),
      phrase(8, 5, 11, 7, 4, 9, 6, 8, 10),
      phrase(9, 4, 7, 11, 5, 8, 6, 10, 4, 8)
    ],
    stack: [block(6), block(6), block(7), block(5), block(10)],
    tags: ['coursework'],
    heuristics: [
      phrase(11, 8, 5, 9, 4, 7, 10, 6, 8),
      phrase(9, 4, 8, 11, 6, 7, 5, 10, 8),
      phrase(10, 6, 4, 9, 8, 11, 5, 7, 9)
    ]
  },
  {
    slug: 'four',
    name: phrase(3, 4, 10, 10),
    when: '██████ ████',
    role: phrase(6, 11, 4, 7, 9, 10),
    status: 'done',
    blurb: phrase(2, 8, 6, 4, 11, 9, 5, 8, 7, 4, 10, 6, 8, 5, 9),
    details: [
      phrase(7, 9, 4, 8, 11, 6, 5, 10, 4, 7),
      phrase(11, 6, 5, 8, 9, 4, 7, 10, 8, 6),
      phrase(8, 4, 7, 11, 9, 5, 6, 10, 8, 4)
    ],
    stack: [block(6), block(6), block(11), block(10)],
    tags: ['coursework'],
    heuristics: [
      phrase(10, 7, 4, 8, 11, 5, 9, 6, 8),
      phrase(8, 9, 4, 7, 11, 6, 10, 5),
      phrase(11, 5, 9, 8, 6, 4, 7, 10)
    ]
  },
  {
    slug: 'five',
    name: phrase(7, 7, 8, 11),
    when: '██████ ████ -- ███████',
    role: phrase(4, 2, 1),
    status: 'wip',
    blurb: phrase(2, 11, 7, 8, 5, 9, 4, 7, 10, 6, 4, 11, 9, 4, 7, 5, 8),
    details: [
      phrase(7, 5, 11, 4, 8, 9, 6, 10, 4, 9),
      phrase(8, 4, 7, 11, 9, 6, 5, 10, 8, 4),
      phrase(11, 4, 8, 5, 9, 7, 10, 6, 4, 8)
    ],
    stack: [block(7), block(11), block(5), block(10), block(6)],
    tags: ['systems'],
    highlight: { label: '████', value: '█' }
  },
  {
    slug: 'six',
    name: phrase(10, 11, 8, 3, 4, 4),
    when: '██████ ████ -- ███████',
    role: phrase(11),
    status: 'wip',
    blurb: phrase(2, 5, 7, 4, 9, 11, 8, 6, 4, 10, 5, 8, 7, 4, 11, 9, 6, 4, 10, 5, 8),
    details: [
      phrase(7, 9, 11, 4, 8, 6, 5, 10, 4, 9),
      phrase(8, 4, 11, 7, 9, 5, 10, 6, 4, 8),
      phrase(11, 6, 4, 9, 8, 5, 7, 10, 4, 8)
    ],
    stack: [block(6), block(7), block(11), block(6)],
    tags: ['tooling'],
    highlight: { label: '██████', value: '█' }
  }
];
