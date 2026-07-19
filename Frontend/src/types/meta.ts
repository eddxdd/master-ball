export type UsageShare = {
  name: string;
  percent: number;
};

export type AbilityUsageShare = UsageShare & {
  ability_id: string | null;
  description: string | null;
};

export type MoveUsageShare = UsageShare & {
  move_id: string | null;
  type: string | null;
  category: string | null;
  description: string | null;
  base_power: number | null;
  accuracy: number | null;
  pp: number | null;
};

export type ItemUsageShare = UsageShare & {
  item_id: string | null;
  sprite_url: string | null;
  short_effect: string | null;
};

export type PokemonUsageShare = UsageShare & {
  species_id: string | null;
  sprite_url: string | null;
  type1: string | null;
  type2: string | null;
  description: string | null;
};

export type CheckOrCounter = {
  name: string;
  species_id: string | null;
  sprite_url: string | null;
  type1: string | null;
  type2: string | null;
  description: string | null;
  matchups_seen: number;
  beats_percent: number;
};

export type MetaStatsResult = {
  species_id: string;
  species_name: string;
  format: string;
  month: string;
  rank: number;
  usage_percent: number;
  raw_count: number;
  top_abilities: AbilityUsageShare[];
  top_items: ItemUsageShare[];
  top_moves: MoveUsageShare[];
  top_tera_types: UsageShare[];
  top_teammates: PokemonUsageShare[];
  top_checks_and_counters: CheckOrCounter[];
  /** True when the API served local demo filler (no Smogon sync row). */
  is_demo?: boolean;
};

export type ScoutReport = {
  species_id: string;
  meta_stats: MetaStatsResult | null;
  strategy_notes: string[];
};

export type MetaLeaderboardEntry = {
  species_id: string;
  species_name: string;
  rank: number;
  usage_percent: number;
  raw_count: number;
  sprite_url: string | null;
  type1: string | null;
  type2: string | null;
  top_moves: MoveUsageShare[];
  top_items: ItemUsageShare[];
};

export type TypeUsageShare = {
  type: string;
  percent: number;
};

export type MetaLeaderboard = {
  format: string;
  month: string | null;
  species_count: number;
  top_usage_percent: number | null;
  entries: MetaLeaderboardEntry[];
  type_distribution: TypeUsageShare[];
  /** True when the API served the local demo filler pack (no Smogon sync yet). */
  is_demo?: boolean;
};
