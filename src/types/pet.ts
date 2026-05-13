// Pet species
export const SPECIES = [
  'duck',
  'goose',
  'cat',
  'dragon',
  'owl',
  'penguin',
  'turtle',
  'ghost',
  'axolotl',
  'capybara',
  'robot',
  'rabbit',
  'mushroom',
] as const;

export type Species = (typeof SPECIES)[number];

// Rarity levels
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9CA3AF',
  uncommon: '#22C55E',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

export const RARITY_STARS: Record<Rarity, string> = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
};

// Eye styles
export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const;
export type Eye = (typeof EYES)[number];

// Hat styles
export const HATS = ['none', 'crown', 'tophat', 'propeller', 'halo', 'wizard', 'beanie'] as const;
export type Hat = (typeof HATS)[number];

// Stats
export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const;
export type StatName = (typeof STAT_NAMES)[number];

// Pet appearance (deterministic based on seed)
export interface PetAppearance {
  species: Species;
  eye: Eye;
  hat: Hat;
  rarity: Rarity;
  shiny: boolean;
  stats: Record<StatName, number>;
}

// Pet soul (user-defined)
export interface PetSoul {
  name: string;
  personality: string;
}

// Full pet
export interface Pet extends PetAppearance, PetSoul {
  id: string;
  hatchedAt: number;
  lastInteraction: number;
  mood: 'happy' | 'neutral' | 'sleepy' | 'excited';
}

// Pet position on screen
export interface PetPosition {
  x: number;
  y: number;
}
