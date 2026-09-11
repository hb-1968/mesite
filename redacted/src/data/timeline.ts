// education / conferences / volunteering all redacted in place.
// shape and array length preserved so History.tsx renders without
// conditional handling

export type TimelineEntry = {
  when: string;
  title: string;
  org?: string;
  body?: string;
  kind: 'edu' | 'conf' | 'volunteer';
};

const b = (n: number) => '█'.repeat(n);
const phrase = (...counts: number[]) => counts.map(b).join(' ');

export const education = {
  school: phrase(6, 10),
  degree: phrase(4, 12, 5, 5, 11),
  gpa: '█.██ / █.██',
  expected: '████████ ███ ████',
  current: phrase(8, 6, 4, 4, 4),
  location: phrase(7, 2),
  coursework: [
    b(10),
    b(11),
    b(13),
    b(13),
    b(14),
    b(11),
    b(15),
    b(16),
    b(11),
    b(12),
    phrase(8, 9, 4),
    phrase(11, 7, 4),
    phrase(12, 5, 4)
  ]
};

export const conferences = [
  { name: phrase(3, 6, 7),  when: '████████' },
  { name: phrase(4, 8, 13, 7), when: '████████' },
  { name: phrase(4, 6, 7),  when: '████████' }
];

export const volunteer: TimelineEntry[] = [
  {
    when: '████',
    title: phrase(4, 4, 6, 5, 9),
    org: phrase(8, 7, 2, 12),
    body:
      phrase(7, 8, 4, 10, 9, 4, 11, 6, 4, 9, 11, 4, 8, 5, 10),
    kind: 'volunteer'
  }
];
