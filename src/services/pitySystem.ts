/**
 * Pity System Service
 *
 * Each tier (2-6) has its own streak counter. After 3 consecutive games at the same tier
 * the next game at that tier is upgraded to the next-better tier, and the pity card is
 * drawn exclusively from that tier's newly-introduced rarity.
 *
 * Tier 1 has no pity (can't go higher).
 *
 * Streak resets when:
 *   (a) pity fires (streak for that tier resets to 0, then the game counts as +1)
 *   (b) the player improves their tier (all worse-tier streaks reset)
 */

import { PityTracker } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface PityState {
  consecutiveTier6: number;   // tier 6 streak
  consecutiveTier5: number;   // tier 5 streak
  consecutiveTier4: number;   // tier 4 streak
  consecutiveTier3: number;   // tier 3 streak
  consecutiveTier2: number;   // tier 2 streak
  gamesWithoutCeiling: number;
  hardPityCounter: number;
  totalGames: number;
  lastCeilingPull: Date | null;
}

export async function getPityTracker(userId: number): Promise<PityState> {
  let tracker = await prisma.pityTracker.findUnique({ where: { userId } });
  if (!tracker) {
    tracker = await prisma.pityTracker.create({ data: { userId } });
  }
  return {
    consecutiveTier6: tracker.consecutiveTier6,
    consecutiveTier5: tracker.consecutiveTier5,
    consecutiveTier4: tracker.consecutiveTier4,
    consecutiveTier3: tracker.consecutiveTier3,
    consecutiveTier2: tracker.consecutiveTier2,
    gamesWithoutCeiling: tracker.gamesWithoutCeiling,
    hardPityCounter: tracker.hardPityCounter,
    totalGames: tracker.totalGames,
    lastCeilingPull: tracker.lastCeilingPull,
  };
}

/**
 * Update pity tracker after a game (called on capture).
 *
 * @param appliedPityTier  The effective tier given by pity (= the upgraded tier).
 *                         If pity fired at tier 6 → appliedPityTier = 5.
 *                         Null if pity was not applied.
 */
export async function updatePityTracker(
  userId: number,
  tier: number,
  pulledCeiling: boolean,
  appliedPityTier?: number | null
): Promise<PityState> {
  const tracker = await getPityTracker(userId);

  // Work on mutable copies
  let t6 = tracker.consecutiveTier6;
  let t5 = tracker.consecutiveTier5;
  let t4 = tracker.consecutiveTier4;
  let t3 = tracker.consecutiveTier3;
  let t2 = tracker.consecutiveTier2;

  // Step 1: If pity fired last game, reset that tier's streak (it broke the streak)
  // appliedPityTier is the upgraded tier, so source tier = appliedPityTier + 1
  if (appliedPityTier != null) {
    const sourceTier = appliedPityTier + 1;
    if (sourceTier === 6) t6 = 0;
    else if (sourceTier === 5) t5 = 0;
    else if (sourceTier === 4) t4 = 0;
    else if (sourceTier === 3) t3 = 0;
    else if (sourceTier === 2) t2 = 0;
  }

  // Step 2: Reset streaks for all tiers worse than the current result
  // (improvement breaks worse-tier streaks)
  if (tier < 6) t6 = 0;
  if (tier < 5) t5 = 0;
  if (tier < 4) t4 = 0;
  if (tier < 3) t3 = 0;
  if (tier < 2) t2 = 0;

  // Step 3: Increment the streak for the current tier (tier 1 has no streak)
  if (tier === 6) t6++;
  else if (tier === 5) t5++;
  else if (tier === 4) t4++;
  else if (tier === 3) t3++;
  else if (tier === 2) t2++;

  const updates: Partial<PityTracker> = {
    consecutiveTier6: t6,
    consecutiveTier5: t5,
    consecutiveTier4: t4,
    consecutiveTier3: t3,
    consecutiveTier2: t2,
    totalGames: tracker.totalGames + 1,
    hardPityCounter: tracker.hardPityCounter + 1,
  };

  if (pulledCeiling) {
    updates.gamesWithoutCeiling = 0;
    updates.hardPityCounter = 0;
    updates.lastCeilingPull = new Date();
  } else {
    updates.gamesWithoutCeiling = tracker.gamesWithoutCeiling + 1;
  }

  const updated = await prisma.pityTracker.update({
    where: { userId },
    data: updates,
  });

  return {
    consecutiveTier6: updated.consecutiveTier6,
    consecutiveTier5: updated.consecutiveTier5,
    consecutiveTier4: updated.consecutiveTier4,
    consecutiveTier3: updated.consecutiveTier3,
    consecutiveTier2: updated.consecutiveTier2,
    gamesWithoutCeiling: updated.gamesWithoutCeiling,
    hardPityCounter: updated.hardPityCounter,
    totalGames: updated.totalGames,
    lastCeilingPull: updated.lastCeilingPull,
  };
}

/**
 * Calculate effective tier from pity.
 * Pity fires when a player has 3+ consecutive games at the same tier (checked BEFORE this game).
 * Tier 1 = no pity.
 */
export function calculatePityTier(
  tier: number,
  pity: PityState
): { effectiveTier: number; appliedPityTier: number | null } {
  if (tier === 6 && pity.consecutiveTier6 >= 3) return { effectiveTier: 5, appliedPityTier: 5 };
  if (tier === 5 && pity.consecutiveTier5 >= 3) return { effectiveTier: 4, appliedPityTier: 4 };
  if (tier === 4 && pity.consecutiveTier4 >= 3) return { effectiveTier: 3, appliedPityTier: 3 };
  if (tier === 3 && pity.consecutiveTier3 >= 3) return { effectiveTier: 2, appliedPityTier: 2 };
  if (tier === 2 && pity.consecutiveTier2 >= 3) return { effectiveTier: 1, appliedPityTier: 1 };
  return { effectiveTier: tier, appliedPityTier: null };
}

/**
 * Weight modifiers for ceiling card selection (soft/hard pity for ceiling pulls).
 */
export function calculatePityModifiers(pity: PityState): {
  ceilingWeightMultiplier: number;
  guaranteeCeiling: boolean;
  tierBoost: boolean;
} {
  let ceilingWeightMultiplier = 1.0;
  const guaranteeCeiling = pity.hardPityCounter >= 10;
  const tierBoost = false;

  if (!guaranteeCeiling) {
    if (pity.gamesWithoutCeiling >= 7) ceilingWeightMultiplier = 2.0;
    else if (pity.gamesWithoutCeiling >= 5) ceilingWeightMultiplier = 1.3;
  }

  return { ceilingWeightMultiplier, guaranteeCeiling, tierBoost };
}

export async function resetPityTracker(userId: number): Promise<void> {
  await prisma.pityTracker.update({
    where: { userId },
    data: {
      consecutiveTier6: 0,
      consecutiveTier5: 0,
      consecutiveTier4: 0,
      consecutiveTier3: 0,
      consecutiveTier2: 0,
      gamesWithoutCeiling: 0,
      hardPityCounter: 0,
      lastCeilingPull: null,
    },
  });
}
