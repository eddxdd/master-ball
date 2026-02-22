import type { LevelInfo, TrainerProfile } from '../api';

/** Milestone definitions — must stay in sync with backend xpSystem.ts */
const AVATAR_UNLOCK_LEVELS: Record<number, number> = {
  1: 1, 2: 10, 3: 20, 4: 30, 5: 40, 6: 50, 7: 60, 8: 75, 9: 90,
};
const BANNER_UNLOCK_LEVELS: Record<number, number> = {
  1: 1, 2: 15, 3: 25, 4: 35, 5: 45, 6: 55, 7: 65, 8: 80, 9: 100,
};

export function avatarUnlockLevel(key: number): number {
  return AVATAR_UNLOCK_LEVELS[key] ?? 1;
}
export function bannerUnlockLevel(key: number): number {
  return BANNER_UNLOCK_LEVELS[key] ?? 1;
}

type Props = {
  profile: TrainerProfile | null;
  /** Transient post-capture update (overrides profile while animating) */
  captureResult?: LevelInfo | null;
};

/** Notable levels that get milestone markers on the dashboard */
const MILESTONE_LEVELS = [10, 20, 30, 40, 50, 60, 75, 90, 100];

function getLevelTitle(level: number): string {
  if (level >= 100) return 'Master Trainer';
  if (level >= 90)  return 'Legend';
  if (level >= 75)  return 'Champion';
  if (level >= 60)  return 'Dragon Tamer';
  if (level >= 50)  return 'Elite Trainer';
  if (level >= 40)  return 'Ace Trainer';
  if (level >= 30)  return 'Cool Trainer';
  if (level >= 20)  return 'Adventurer';
  if (level >= 10)  return 'Rookie';
  return 'Newcomer';
}

/** XP per rarity table shown to the user */
const RARITY_XP_TABLE: { rarity: string; xp: number }[] = [
  { rarity: 'Common',                    xp:    50 },
  { rarity: 'Uncommon',                  xp:   100 },
  { rarity: 'Rare',                      xp:   200 },
  { rarity: 'Double Rare',               xp:   400 },
  { rarity: 'Illustration Rare',         xp:   700 },
  { rarity: 'Super Rare',                xp: 1_200 },
  { rarity: 'Special Illustration Rare', xp: 2_000 },
  { rarity: 'Ultra Rare',                xp: 2_000 },
  { rarity: 'Hyper Rare',                xp: 2_500 },
  { rarity: 'Shiny Rare',                xp: 3_000 },
  { rarity: 'Shiny',                     xp: 3_000 },
  { rarity: 'Immersive',                 xp: 5_000 },
];

export function TrainerLevel({ profile, captureResult }: Props) {
  if (!profile) return null;

  const level = captureResult?.level ?? profile.level;
  const currentXp = captureResult?.currentXp ?? profile.currentXp;
  const xpNeeded = captureResult?.xpNeeded ?? profile.xpNeeded;
  const progressPercent = captureResult?.progressPercent ?? profile.progressPercent;
  const totalXp = captureResult?.totalXp ?? profile.totalXp;
  const leveledUp = captureResult?.leveledUp ?? false;
  const prevLevel = captureResult?.prevLevel ?? level;

  const isMaxLevel = level >= 100;
  const title = getLevelTitle(level);

  // Upcoming milestone for the progress section
  const nextMilestone = MILESTONE_LEVELS.find((m) => m > level);

  return (
    <div className="trainer-level-card">
      {leveledUp && (
        <div className="trainer-levelup-toast">
          Level up! {prevLevel} → {level}
        </div>
      )}

      <div className="trainer-level-header">
        <div className="trainer-level-badge">
          <span className="trainer-level-num">{level}</span>
          <span className="trainer-level-label">LVL</span>
        </div>
        <div className="trainer-level-info">
          <p className="trainer-level-title">{title}</p>
          <p className="trainer-level-xp-total">{totalXp.toLocaleString()} XP total</p>
        </div>
      </div>

      <div className="trainer-level-progress-wrap">
        <div
          className="trainer-level-bar"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="trainer-level-bar-fill"
            style={{ width: `${isMaxLevel ? 100 : progressPercent}%` }}
          />
        </div>
        <div className="trainer-level-xp-labels">
          {isMaxLevel ? (
            <span className="trainer-level-max">Max level reached!</span>
          ) : (
            <>
              <span>{currentXp.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
              {nextMilestone && (
                <span className="trainer-level-milestone-hint">
                  Next unlock at Lv.{nextMilestone}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="trainer-level-xp-table">
        <h4 className="trainer-level-xp-table-title">XP per card rarity</h4>
        <div className="trainer-level-xp-rows">
          {RARITY_XP_TABLE.map(({ rarity, xp }) => (
            <div key={rarity} className="trainer-level-xp-row">
              <span className="trainer-level-xp-rarity">{rarity}</span>
              <span className="trainer-level-xp-val">+{xp.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
