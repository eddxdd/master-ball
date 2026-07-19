export type Generation = {
  number: number;
  region: string;
  start: number;
  end: number;
};

/** Generation <-> National Dex number boundaries, mirroring
 * Backend/app/data/generations.py — static game data duplicated client-side
 * on purpose (same precedent as natures.ts). Used for tab labels and for
 * filtering the cached full pokedex list in the browser. */
export const GENERATIONS: Generation[] = [
  { number: 1, region: "Kanto", start: 1, end: 151 },
  { number: 2, region: "Johto", start: 152, end: 251 },
  { number: 3, region: "Hoenn", start: 252, end: 386 },
  { number: 4, region: "Sinnoh", start: 387, end: 493 },
  { number: 5, region: "Unova", start: 494, end: 649 },
  { number: 6, region: "Kalos", start: 650, end: 721 },
  { number: 7, region: "Alola", start: 722, end: 809 },
  { number: 8, region: "Galar", start: 810, end: 905 },
  { number: 9, region: "Paldea", start: 906, end: 1025 },
];
