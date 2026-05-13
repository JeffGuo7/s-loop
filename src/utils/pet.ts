import {
  SPECIES,
  RARITIES,
  RARITY_WEIGHTS,
  EYES,
  HATS,
  STAT_NAMES,
  type Species,
  type Rarity,
  type Hat,
  type StatName,
  type PetAppearance,
} from '../types/pet';

// Seeded random number generator (Mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash string to number
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pick random element from array
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// Roll rarity based on weights
function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'common';
}

// Stat floors by rarity
const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// Roll stats: one peak, one dump, rest scattered
function rollStats(rng: () => number, rarity: Rarity): Record<StatName, number> {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);

  const stats = {} as Record<StatName, number>;
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }
  return stats;
}

// Generate pet appearance from seed
export function generatePetAppearance(seed: string): PetAppearance {
  const rng = mulberry32(hashString(seed));
  const rarity = rollRarity(rng);

  return {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, // 1% chance
    stats: rollStats(rng, rarity),
  };
}

// Generate unique pet ID
export function generatePetId(): string {
  return `pet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get species emoji/icon
export function getSpeciesEmoji(species: Species): string {
  const emojis: Record<Species, string> = {
    duck: '🦆',
    goose: '🪿',
    cat: '🐱',
    dragon: '🐉',
    owl: '🦉',
    penguin: '🐧',
    turtle: '🐢',
    ghost: '👻',
    axolotl: '🦎',
    capybara: '🦫',
    robot: '🤖',
    rabbit: '🐰',
    mushroom: '🍄',
  };
  return emojis[species] || '🐾';
}

// Get hat emoji
export function getHatEmoji(hat: Hat): string {
  const emojis: Record<Hat, string> = {
    none: '',
    crown: '👑',
    tophat: '🎩',
    propeller: '🧢',
    halo: '😇',
    wizard: '🪄',
    beanie: '🧶',
  };
  return emojis[hat] || '';
}