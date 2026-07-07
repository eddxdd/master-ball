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
  abilities: AbilitySummary[];
  learnable_moves: MoveSummary[];
  type_matchups: TypeEffectiveness[];
  natures: NatureRef[];
  sprite_url: string;
  mega_formes: PokemonProfile[];
};
