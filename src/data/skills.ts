export type RatedSkill = { name: string; level: 1 | 2 | 3 | 4 | 5 };

export const languages: RatedSkill[] = [
  { name: 'Python', level: 4 },
  { name: 'Java', level: 4 },
  { name: 'C', level: 2 },
  { name: 'Rust', level: 3 },
  { name: 'Assembly', level: 2 }
];

export const mlPathology = [
  'PyTorch',
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
  'BU HPC',
  'MATLAB',
  'Windows 10/11',
  'Fedora Linux'
];

export const spokenLanguages = [
  { name: 'English', level: 'Native' },
  { name: 'German', level: 'B2' }
];
