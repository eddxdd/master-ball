/**
 * Shared card enrichment helpers (biome data, etc.)
 */

import { prisma } from '../lib/prisma.js';

/**
 * Adds a sorted `biomeNames` array to each card object based on the Pokemon's spawn biomes.
 */
export async function enrichCardsWithBiomes(cards: any[]): Promise<any[]> {
  if (!cards.length) return cards;
  const pokemonIds = [...new Set(cards.map((c) => c.pokemonId as number))];
  const spawns = await prisma.pokemonSpawn.findMany({
    where: { pokemonId: { in: pokemonIds } },
    include: { biome: { select: { name: true } } },
  });
  const biomesByPokemon = new Map<number, string[]>();
  for (const spawn of spawns) {
    const list = biomesByPokemon.get(spawn.pokemonId) ?? [];
    if (!list.includes(spawn.biome.name)) list.push(spawn.biome.name);
    biomesByPokemon.set(spawn.pokemonId, list);
  }
  return cards.map((c) => ({
    ...c,
    biomeNames: (biomesByPokemon.get(c.pokemonId) ?? []).sort(),
  }));
}
