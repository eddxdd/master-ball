export type StatBlock = {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
};

export type MoveSummary = {
  id: string;
  name: string;
  type: string;
  category: string;
  base_power: number | null;
  accuracy: number | null;
  pp: number;
  priority: number;
  target: string;
  description: string | null;
};

export type AbilitySummary = {
  id: string;
  name: string;
  description: string | null;
};

export type NatureRef = {
  id: string;
  name: string;
  increased_stat: string | null;
  decreased_stat: string | null;
};

export type TypeEffectiveness = {
  type: string;
  multiplier: number;
};

export type PokemonSummary = {
  id: string;
  name: string;
  num: number;
  type1: string;
  type2: string | null;
  sprite_url: string;
  /** Showdown forme tag when set (e.g. "Mega-X", "Gmax"); null for the base forme. */
  forme: string | null;
};

export type SpecialFormeRef = {
  id: string;
  name: string;
  sprite_url: string;
  forme: string;
};

export type EvolutionRef = {
  id: string;
  name: string;
  sprite_url: string;
  condition: string | null;
  special_formes: SpecialFormeRef[];
};

export type EvolutionStage = {
  pokemon: EvolutionRef[];
};

export type PokemonProfile = {
  id: string;
  name: string;
  num: number;
  base_species: string | null;
  forme: string | null;
  type1: string;
  type2: string | null;
  base_stats: StatBlock;
  min_stats: StatBlock;
  max_stats: StatBlock;
  abilities: AbilitySummary[];
  learnable_moves: MoveSummary[];
  type_matchups: TypeEffectiveness[];
  natures: NatureRef[];
  sprite_url: string;
  description: string | null;
  /** Pokedex category line, e.g. "Emperor Pokémon". */
  genus: string | null;
  mega_formes: PokemonProfile[];
  evolution_chain: EvolutionStage[];
};

export type MoveDetail = MoveSummary & {
  learned_by: PokemonSummary[];
};

export type AbilityDetail = AbilitySummary & {
  pokemon: PokemonSummary[];
};

export type TypeDetail = {
  type: string;
  attacking: TypeEffectiveness[];
  defending: TypeEffectiveness[];
  pokemon: PokemonSummary[];
};
