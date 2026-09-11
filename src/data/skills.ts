export type RatedSkill = { name: string; level: 1 | 2 | 3 | 4 | 5 };

// ordered by how much a reader is likely to care, not by level
export const languages: RatedSkill[] = [
  { name: 'Python', level: 4 },
  { name: 'TypeScript', level: 2 },
  { name: 'Go', level: 2 },
  { name: 'Rust', level: 2 },
  { name: 'Java', level: 4 },
  { name: 'C', level: 2 },
  { name: 'Assembly', level: 2 }
];

export const mlPathology = [
  'PyTorch',
  'vLLM',
  'SAM 2/3',
  'LoRA',
  'UNI',
  'CONCH',
  'MIL',
  'OpenSlide',
  'CLAM',
  'MONAI',
  'sklearn'
];

export const frameworks = [
  'React',
  'Tauri',
  'WebExtension MV3',
  'SQLite'
];

export const tooling = [
  'Git',
  'LaTeX',
  'Colab',
  'BU SCC',
  'pytest',
  'Fedora Linux',
  'Windows 10/11'
];

export const spokenLanguages = [
  { name: 'English', level: 'Native' },
  { name: 'German', level: 'B2' }
];
