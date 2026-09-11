// skill names redacted, dot levels preserved -- the rating glyphs
// are the visual interest, not the names. spoken-language levels
// also redacted (CEFR levels are identifying)

export type RatedSkill = { name: string; level: 1 | 2 | 3 | 4 | 5 };

const b = (n: number) => '█'.repeat(n);

export const languages: RatedSkill[] = [
  { name: b(6), level: 4 },
  { name: b(4), level: 4 },
  { name: b(1), level: 2 },
  { name: b(4), level: 3 },
  { name: b(8), level: 2 }
];

export const mlPathology = [b(7), b(3), b(5), b(3), b(9), b(4), b(5), b(7)];

export const frameworks = [b(5), b(5), b(15), b(6)];

export const tooling = [b(3), b(5), b(5), b(6), b(6), b(11), b(13)];

export const spokenLanguages = [
  { name: b(7), level: b(6) },
  { name: b(6), level: b(2) }
];
