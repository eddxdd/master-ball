/**
 * XP & Level System
 *
 * Players earn XP whenever they capture a card. Rarer cards give more XP.
 * Levels go from 1 to 100, with the XP required to advance growing each level.
 *
 * Formula: XP needed to advance from level N → N+1 is 100 * N
 *   Level 1→2:   100 XP
 *   Level 10→11: 1,000 XP
 *   Level 50→51: 5,000 XP
 *   Level 99→100: 9,900 XP
 *   Total XP for level 100: 495,000 XP
 */

/** XP awarded per rarity on card capture */
export const RARITY_XP: Record<string, number> = {
  'Common':                    50,
  'Uncommon':                 100,
  'Rare':                     200,
  'Double Rare':              400,
  'Illustration Rare':        700,
  'Super Rare':             1_200,
  'Special Illustration Rare': 2_000,
  'Ultra Rare':             2_000,
  'Hyper Rare':             2_500,
  'Shiny Rare':             3_000,
  'Shiny':                  3_000,
  'Immersive':              5_000,
};

export function xpForRarity(rarity: string): number {
  return RARITY_XP[rarity] ?? 100;
}

/** XP required to advance from level `n` to `n + 1` */
export function xpToNextLevel(n: number): number {
  if (n >= 100) return 0;
  return 100 * n;
}

/** Total cumulative XP needed to *reach* level `n` (i.e. to have just hit level n) */
export function totalXpForLevel(n: number): number {
  // Sum of 100*1 + 100*2 + ... + 100*(n-1) = 100 * n*(n-1)/2
  const clamped = Math.max(1, Math.min(n, 100));
  return 50 * clamped * (clamped - 1);
}

/** Derive the current level from a raw XP total (1–100) */
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 100 && xp >= totalXpForLevel(level + 1)) {
    level++;
  }
  return level;
}

/** Returns level + progress within the current level */
export function xpProgress(totalXp: number): {
  level: number;
  currentXp: number;
  xpNeeded: number;
  progressPercent: number;
} {
  const level = levelFromXp(totalXp);
  const xpAtThisLevel = totalXpForLevel(level);
  const currentXp = totalXp - xpAtThisLevel;
  const xpNeeded = xpToNextLevel(level);
  const progressPercent = level >= 100 ? 100 : Math.min(100, (currentXp / xpNeeded) * 100);
  return { level, currentXp, xpNeeded, progressPercent };
}

/**
 * Level milestones that unlock avatars and banners.
 * `type` is either 'avatar' or 'banner'.
 * `key` matches the `num` field used in the image options.
 */
export interface Milestone {
  level: number;
  type: 'avatar' | 'banner';
  key: number;
  label: string;
}

export const MILESTONES: Milestone[] = [
  // Avatars — num 1-9 matching existing avatarOptions
  { level:  1, type: 'avatar', key: 1, label: 'Chili unlocked'   },
  { level: 10, type: 'avatar', key: 2, label: 'Erika unlocked'   },
  { level: 20, type: 'avatar', key: 3, label: 'Nessa unlocked'   },
  { level: 30, type: 'avatar', key: 4, label: 'Elesa unlocked'   },
  { level: 40, type: 'avatar', key: 5, label: 'Allister unlocked' },
  { level: 50, type: 'avatar', key: 6, label: 'Diantha unlocked' },
  { level: 60, type: 'avatar', key: 7, label: 'Sabrina unlocked' },
  { level: 75, type: 'avatar', key: 8, label: 'Marnie unlocked'  },
  { level: 90, type: 'avatar', key: 9, label: 'Zinnia unlocked'  },

  // Banners — num 1-9
  { level:  1, type: 'banner', key: 1, label: 'Starter banner'   },
  { level: 15, type: 'banner', key: 2, label: 'Forest banner'    },
  { level: 25, type: 'banner', key: 3, label: 'Ocean banner'     },
  { level: 35, type: 'banner', key: 4, label: 'Volcano banner'   },
  { level: 45, type: 'banner', key: 5, label: 'Storm banner'     },
  { level: 55, type: 'banner', key: 6, label: 'Mystic banner'    },
  { level: 65, type: 'banner', key: 7, label: 'Dragon banner'    },
  { level: 80, type: 'banner', key: 8, label: 'Champion banner'  },
  { level: 100, type: 'banner', key: 9, label: 'Master banner'   },
];

/** Return the minimum level required to unlock a given avatar/banner key */
export function unlockLevel(type: 'avatar' | 'banner', key: number): number {
  const m = MILESTONES.find((m) => m.type === type && m.key === key);
  return m?.level ?? 1;
}

/** Return all milestones that would be newly reached when going from `prevLevel` to `newLevel` */
export function newlyUnlockedMilestones(prevLevel: number, newLevel: number): Milestone[] {
  return MILESTONES.filter((m) => m.level > prevLevel && m.level <= newLevel);
}
