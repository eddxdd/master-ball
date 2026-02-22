/**
 * Card Rewards Modal
 * Explains tier system, card pools per tier, and shows pity stats
 */

interface PityInfo {
  consecutiveTier6: number;
  consecutiveTier5: number;
  consecutiveTier4: number;
  consecutiveTier3: number;
  consecutiveTier2: number;
  gamesWithoutCeiling: number;
  hardPityCounter: number;
  totalGames: number;
}

// Rarity order: rarest (index 0) → least rare (last index), per the official TCG symbol chart.
const RARITY_RANK: Record<string, number> = {
  'Ultra Rare': 11,
  'Shiny Super Rare': 10,
  'Shiny Rare': 9,
  'Immersive': 8,
  'Special Illustration Rare': 7,
  'Super Rare': 6,
  'Illustration Rare': 5,
  'Double Rare': 4,
  'Rare': 3,
  'Uncommon': 2,
  'Common': 1,
};

// Rarities sorted rarest-first per tier.
const TIER_POOLS: { tier: number; guesses: number; rarities: string[] }[] = [
  { tier: 1, guesses: 1, rarities: ['Ultra Rare', 'Shiny Super Rare', 'Shiny Rare', 'Immersive', 'Special Illustration Rare', 'Illustration Rare'] },
  { tier: 2, guesses: 2, rarities: ['Ultra Rare', 'Special Illustration Rare', 'Super Rare', 'Illustration Rare', 'Double Rare'] },
  { tier: 3, guesses: 3, rarities: ['Super Rare', 'Illustration Rare', 'Double Rare', 'Rare'] },
  { tier: 4, guesses: 4, rarities: ['Illustration Rare', 'Double Rare', 'Rare', 'Uncommon'] },
  { tier: 5, guesses: 5, rarities: ['Double Rare', 'Rare', 'Uncommon', 'Common'] },
  { tier: 6, guesses: 6, rarities: ['Rare', 'Uncommon', 'Common'] },
];

/**
 * For each rarity, the highest tier number (worst tier) it appears in is where it's "first introduced"
 * going from tier 6 → tier 1. A rarity tag at that tier gets the gradient treatment.
 */
const RARITY_FIRST_TIER: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const { tier, rarities } of TIER_POOLS) {
    for (const r of rarities) {
      if (map[r] === undefined || tier > map[r]) map[r] = tier;
    }
  }
  return map;
})();

/** New rarities introduced at each tier (the ones that get the gradient highlight). */
const NEW_RARITIES_FOR_TIER: Record<number, string[]> = (() => {
  const map: Record<number, string[]> = {};
  for (const [rarity, firstTier] of Object.entries(RARITY_FIRST_TIER)) {
    if (!map[firstTier]) map[firstTier] = [];
    map[firstTier].push(rarity);
    // Sort rarest-first within the group
    map[firstTier].sort((a, b) => (RARITY_RANK[b] ?? 0) - (RARITY_RANK[a] ?? 0));
  }
  return map;
})();

/**
 * Pity mapping: when stuck at a tier for 3 games in a row, the player is upgraded
 * to the next better tier and receives a card exclusively from that tier's new rarity.
 */
const PITY_ROWS = [
  { label: 'Tier 6', upgradedTier: 5, statKey: 'consecutiveTier6' as const },
  { label: 'Tier 5', upgradedTier: 4, statKey: 'consecutiveTier5' as const },
  { label: 'Tier 4', upgradedTier: 3, statKey: 'consecutiveTier4' as const },
  { label: 'Tier 3', upgradedTier: 2, statKey: 'consecutiveTier3' as const },
  { label: 'Tier 2', upgradedTier: 1, statKey: 'consecutiveTier2' as const },
];

interface CardRewardsModalProps {
  onClose: () => void;
  pity: PityInfo | null;
}

export function CardRewardsModal({ onClose, pity }: CardRewardsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card-rewards-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-rewards-modal-header">
          <h2>Card Rewards</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="card-rewards-modal-body">
          <p className="card-rewards-intro">
            Fewer guesses = better tier = rarer card pool. After each game you get 3 card choices; one is guaranteed from your tier.
          </p>
          <div className="card-rewards-tiers">
            <h3>Tiers &amp; card pools</h3>
            <p className="card-rewards-intro card-rewards-intro--small">
              Highlighted rarities are exclusive to that tier's pool. If you land on Tier 4 or worse 3 games in a row, <strong>pity</strong> upgrades one mystery card to a card exclusively from the highlighted rarity of the next better tier.
            </p>
            <div className="card-rewards-table-wrap">
              <table className="card-rewards-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Guesses to reach</th>
                    <th>Rarities in pool</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_POOLS.map(({ tier, guesses, rarities }) => (
                    <tr key={tier}>
                      <td><span className={`tier-badge tier-${tier}`}>{tier}</span></td>
                      <td>{guesses} {guesses === 1 ? 'guess' : 'guesses'}</td>
                      <td>
                        <div className="rarity-tags">
                          {rarities.map((r) => {
                            const isNew = RARITY_FIRST_TIER[r] === tier;
                            const rank = RARITY_RANK[r] ?? 0;
                            return (
                              <span
                                key={r}
                                className={`rarity-tag${isNew ? ' rarity-tag--new' : ''}`}
                                data-rank={rank}
                              >
                                {r}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-rewards-tiers">
            <h3>Pity system</h3>
            <p className="card-rewards-intro card-rewards-intro--small">
              After 3 consecutive games at the same tier (or worse), one mystery card is guaranteed to come from the highlighted rarity of the upgraded tier. Pity resets when triggered or when you improve your tier.
            </p>
            <div className="card-rewards-table-wrap">
              <table className="card-rewards-table">
                <thead>
                  <tr>
                    <th>Stuck at</th>
                    <th>Upgrades to</th>
                    <th>Pity card rarity</th>
                  </tr>
                </thead>
                <tbody>
                  {PITY_ROWS.map(({ label, upgradedTier }) => {
                    const newRarities = NEW_RARITIES_FOR_TIER[upgradedTier] ?? [];
                    return (
                      <tr key={label}>
                        <td><span className={`tier-badge tier-${parseInt(label.split(' ')[1])}`}>{label}</span></td>
                        <td><span className={`tier-badge tier-${upgradedTier}`}>{upgradedTier}</span></td>
                        <td>
                          <div className="rarity-tags">
                            {newRarities.map((r) => (
                              <span
                                key={r}
                                className="rarity-tag rarity-tag--new"
                                data-rank={RARITY_RANK[r] ?? 0}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {pity != null && (
            <div className="card-rewards-pity">
              <h3>Your stats</h3>
              <ul className="card-rewards-stats">
                <li>Games played: <strong>{pity.totalGames}</strong></li>
                {PITY_ROWS.map(({ label, upgradedTier, statKey }) => {
                  const newRarities = NEW_RARITIES_FOR_TIER[upgradedTier] ?? [];
                  const rarityLabel = newRarities.join(' / ');
                  return (
                    <li key={statKey}>
                      Consecutive {label}{' '}
                      <span className="pity-note">
                        (pity at 3 → Tier {upgradedTier}{rarityLabel ? `, guaranteed ${rarityLabel}` : ''})
                      </span>
                      : <strong>{pity[statKey] ?? 0}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
