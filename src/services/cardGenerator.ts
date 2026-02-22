/**
 * Card Generator Service
 * Generates card offers based on tier and pity system
 */

import { Card } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getPityTracker, calculatePityModifiers, calculatePityTier } from './pitySystem.js';

/** Rarity rank from least rare (1) to rarest (11), matching the official TCG order. */
const RARITY_RANK: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Double Rare': 4,
  'Illustration Rare': 5,
  'Super Rare': 6,
  'Special Illustration Rare': 7,
  'Immersive': 8,
  'Shiny Rare': 9,
  'Shiny Super Rare': 10,
  'Ultra Rare': 11,
};

/** Rarities available per tier (rarest-first order, mirroring the Card Rewards table). */
const TIER_RARITY_POOLS: Record<number, string[]> = {
  1: ['Ultra Rare', 'Shiny Super Rare', 'Shiny Rare', 'Immersive', 'Special Illustration Rare', 'Illustration Rare'],
  2: ['Ultra Rare', 'Special Illustration Rare', 'Super Rare', 'Illustration Rare', 'Double Rare'],
  3: ['Super Rare', 'Illustration Rare', 'Double Rare', 'Rare'],
  4: ['Illustration Rare', 'Double Rare', 'Rare', 'Uncommon'],
  5: ['Double Rare', 'Rare', 'Uncommon', 'Common'],
  6: ['Rare', 'Uncommon', 'Common'],
};

/**
 * For each rarity, find the highest tier number (worst tier) it appears in —
 * that is the tier where it is "newly introduced" going from worst → best.
 */
const RARITY_FIRST_TIER: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const [tierStr, rarities] of Object.entries(TIER_RARITY_POOLS)) {
    const t = Number(tierStr);
    for (const r of rarities) {
      if (map[r] === undefined || t > map[r]) map[r] = t;
    }
  }
  return map;
})();

/**
 * Set of rarities that are new (first introduced) at each tier.
 * e.g. NEW_RARITIES_FOR_TIER[4] = Set { 'Illustration Rare' }
 */
const NEW_RARITIES_FOR_TIER: Record<number, Set<string>> = (() => {
  const map: Record<number, Set<string>> = {};
  for (const [rarity, firstTier] of Object.entries(RARITY_FIRST_TIER)) {
    if (!map[firstTier]) map[firstTier] = new Set();
    map[firstTier].add(rarity);
  }
  return map;
})();

export interface CardOffer {
  cards: Card[];
  guaranteedCard: Card;
  appliedPityTier: number | null;
  appliedPity: {
    ceilingBoost: number;
    tierBoost: boolean;
    hardPity: boolean;
  };
}

/**
 * Generate 3 card offers for a completed game
 * Returns [guaranteedPokemonCard, randomCard1, randomCard2]
 */
export async function generateCardOffers(
  userId: number,
  tier: number,
  guaranteedPokemonId: number
): Promise<CardOffer> {
  const pityState = await getPityTracker(userId);
  const pityModifiers = calculatePityModifiers(pityState);
  const { effectiveTier, appliedPityTier } = calculatePityTier(tier, pityState);
  if (appliedPityTier != null) {
    console.log(`Pity applied: ${tier} → effective tier ${effectiveTier}`);
  }
  let effectiveTierFinal = effectiveTier;
  if (pityModifiers.tierBoost && effectiveTierFinal > 1) {
    effectiveTierFinal = Math.max(1, effectiveTierFinal - 1);
    console.log(`Tier boost: ${effectiveTierFinal + 1} → ${effectiveTierFinal}`);
  }

  let guaranteedCard = await selectGuaranteedCard(guaranteedPokemonId, effectiveTierFinal);
  
  if (!guaranteedCard) {
    // This should not happen if database is properly seeded
    // Log error but don't fallback to random Pokemon
    throw new Error(`No cards found for Pokemon ${guaranteedPokemonId}. Please ensure all Pokemon have cards in the database.`);
  }
  
  // Generate 2 random cards
  // randomCard1 is the designated pity card slot — use top-2-rarest selection when pity applies
  let randomCard1;
  let randomCard2;
  
  try {
    randomCard1 = appliedPityTier != null
      ? await selectPityCard(effectiveTierFinal, [guaranteedCard.id])
      : await selectRandomCard(
          effectiveTierFinal,
          pityModifiers.ceilingWeightMultiplier,
          pityModifiers.guaranteeCeiling,
          [guaranteedCard.id]
        );
  } catch (error) {
    console.error('Error selecting random card 1:', error);
    randomCard1 = await prisma.card.findFirst({
      where: { id: { not: guaranteedCard.id } }
    });
    if (!randomCard1) randomCard1 = guaranteedCard;
  }
  
  try {
    randomCard2 = await selectRandomCard(
      effectiveTierFinal,
      pityModifiers.ceilingWeightMultiplier,
      pityModifiers.guaranteeCeiling,
      [guaranteedCard.id, randomCard1.id]
    );
  } catch (error) {
    console.error('Error selecting random card 2:', error);
    // Fallback: use any card from any tier
    randomCard2 = await prisma.card.findFirst({
      where: { id: { notIn: [guaranteedCard.id, randomCard1.id] } }
    });
    if (!randomCard2) randomCard2 = guaranteedCard; // Ultimate fallback
  }
  
  return {
    cards: [guaranteedCard, randomCard1, randomCard2],
    guaranteedCard,
    appliedPityTier: appliedPityTier ?? null,
    appliedPity: {
      ceilingBoost: pityModifiers.ceilingWeightMultiplier,
      tierBoost: pityModifiers.tierBoost,
      hardPity: pityModifiers.guaranteeCeiling
    }
  };
}

/**
 * Select the guaranteed card (matching the guessed Pokemon)
 */
async function selectGuaranteedCard(pokemonId: number, tier: number): Promise<Card | null> {
  console.log(`selectGuaranteedCard called with pokemonId=${pokemonId}, tier=${tier}`);
  
  // Get all cards for this Pokemon in this tier
  const cards = await prisma.card.findMany({
    where: {
      pokemonId,
      tier
    }
  });
  
  console.log(`Found ${cards.length} cards for Pokemon ${pokemonId} in tier ${tier}`);
  
  if (cards.length === 0) {
    console.log(`No cards for Pokemon ${pokemonId} in tier ${tier}, trying fallback...`);
    
    // Fallback 1: try adjacent tiers (±1)
    const fallbackCards1 = await prisma.card.findMany({
      where: {
        pokemonId,
        tier: {
          in: [Math.max(1, tier - 1), Math.min(6, tier + 1)]
        }
      }
    });
    
    console.log(`Fallback 1: Found ${fallbackCards1.length} cards in adjacent tiers`);
    
    if (fallbackCards1.length > 0) {
      return selectWeightedRandom(fallbackCards1);
    }
    
    // Fallback 2: try ANY tier for this Pokemon
    const fallbackCards2 = await prisma.card.findMany({
      where: {
        pokemonId
      }
    });
    
    console.log(`Fallback 2: Found ${fallbackCards2.length} cards in any tier for Pokemon ${pokemonId}`);
    
    if (fallbackCards2.length > 0) {
      return selectWeightedRandom(fallbackCards2);
    }
    
    console.error(`No cards found at all for Pokemon ${pokemonId}`);
    return null;
  }
  
  return selectWeightedRandom(cards);
}

/**
 * Select a random card with pity modifiers
 */
async function selectRandomCard(
  tier: number,
  ceilingWeightMultiplier: number,
  guaranteeCeiling: boolean,
  excludeIds: number[]
): Promise<Card> {
  // If hard pity, guarantee ceiling card
  if (guaranteeCeiling) {
    const ceilingCards = await prisma.card.findMany({
      where: {
        tier,
        isCeiling: true,
        id: { notIn: excludeIds }
      }
    });
    
    if (ceilingCards.length > 0) {
      return ceilingCards[Math.floor(Math.random() * ceilingCards.length)];
    }
  }
  
  // Get all cards in this tier
  const cards = await prisma.card.findMany({
    where: {
      tier,
      id: { notIn: excludeIds }
    }
  });
  
  if (cards.length === 0) {
    throw new Error(`No cards available for tier ${tier}`);
  }
  
  // Apply pity weight boost to ceiling cards
  const weightedCards = cards.map((card: any) => ({
    card,
    weight: card.isCeiling
      ? card.weight * ceilingWeightMultiplier
      : card.weight
  }));
  
  return selectWeightedRandom(weightedCards.map((w: any) => w.card), weightedCards.map((w: any) => w.weight));
}

/**
 * Select a pity card: must be from the rarity (or rarities) that are newly introduced
 * at this effective tier and not available in any worse tier.
 * Falls back to the highest-ranked rarity available in the tier if no new-rarity cards exist.
 */
async function selectPityCard(tier: number, excludeIds: number[]): Promise<Card> {
  const newRarities = NEW_RARITIES_FOR_TIER[tier];

  if (newRarities && newRarities.size > 0) {
    const newRarityCards = await prisma.card.findMany({
      where: { tier, rarity: { in: [...newRarities] }, id: { notIn: excludeIds } }
    });
    if (newRarityCards.length > 0) {
      console.log(`Pity card: selecting from new rarities ${[...newRarities].join(', ')} for tier ${tier}`);
      return selectWeightedRandom(newRarityCards);
    }
  }

  // Fallback: pick highest-ranked rarity available in the db for this tier
  const allCards = await prisma.card.findMany({
    where: { tier, id: { notIn: excludeIds } }
  });
  if (allCards.length === 0) throw new Error(`No pity cards available for tier ${tier}`);

  const distinctRarities = [...new Set(allCards.map((c: Card) => c.rarity))];
  distinctRarities.sort((a, b) => (RARITY_RANK[b] ?? 0) - (RARITY_RANK[a] ?? 0));
  const bestRarity = distinctRarities[0];
  const pool = allCards.filter((c: Card) => c.rarity === bestRarity);
  return selectWeightedRandom(pool.length > 0 ? pool : allCards);
}

/**
 * Select a random item from array using weighted probability
 */
function selectWeightedRandom<T extends { weight?: number }>(
  items: T[],
  customWeights?: number[]
): T {
  if (items.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  
  if (items.length === 1) {
    return items[0];
  }
  
  // Use custom weights if provided, otherwise use item.weight
  const weights = customWeights || items.map((item: any) => item.weight || 1);
  const totalWeight = weights.reduce((sum: number, w: number) => sum + w, 0);
  
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  
  // Fallback (shouldn't happen)
  return items[items.length - 1];
}

/**
 * Get Pokemon pool for a biome and time of day
 */
export async function getPokemonPool(biomeId: number, timeOfDay: string): Promise<number[]> {
  const spawns = await prisma.pokemonSpawn.findMany({
    where: {
      biomeId,
      OR: [
        { timeOfDay },
        { timeOfDay: 'both' }
      ]
    },
    select: {
      pokemonId: true,
      spawnWeight: true
    }
  });
  
  if (spawns.length === 0) {
    throw new Error(`No Pokemon available for biome ${biomeId} at ${timeOfDay}`);
  }
  
  // Weight-based selection
  const weighted = spawns.map((s: any) => ({
    id: s.pokemonId,
    weight: s.spawnWeight
  }));
  
  return weighted.map(w => w.id);
}

/**
 * Select a random Pokemon from the pool
 */
export async function selectRandomPokemon(biomeId: number, timeOfDay: string): Promise<number> {
  // Only select Pokemon that have cards available; prefer spawns matching timeOfDay
  let spawns = await prisma.pokemonSpawn.findMany({
    where: {
      biomeId,
      OR: [
        { timeOfDay },
        { timeOfDay: 'both' }
      ],
      pokemon: {
        cards: { some: {} }
      }
    }
  });

  // If no spawns for this time (e.g. Cemetery at day - Ghost only at night), use any spawn in biome
  if (spawns.length === 0) {
    spawns = await prisma.pokemonSpawn.findMany({
      where: {
        biomeId,
        pokemon: {
          cards: { some: {} }
        }
      }
    });
  }

  if (spawns.length === 0) {
    throw new Error(`No Pokemon with cards available for biome ${biomeId}`);
  }
  
  const weights = spawns.map((s: any) => s.spawnWeight);
  const totalWeight = weights.reduce((sum: number, w: number) => sum + w, 0);
  
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < spawns.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return spawns[i].pokemonId;
    }
  }
  
  return spawns[spawns.length - 1].pokemonId;
}
