export type Status = "brn" | "psn" | "tox" | "par" | "slp" | "frz";

export type PokemonBattleState = {
  species_id: string;
  level: number;
  nature: string;
  evs: Record<string, number>;
  ivs: Record<string, number>;
  ability?: string | null;
  item?: string | null;
  status?: Status | null;
  tera_type?: string | null;
  stat_stages: Record<string, number>;
  current_hp_percent: number;
};

export type FieldConditions = {
  weather?: "sun" | "rain" | null;
  reflect: boolean;
  light_screen: boolean;
  aurora_veil: boolean;
  is_critical: boolean;
  spread_move: boolean;
};

export type DamageCalcRequest = {
  attacker: PokemonBattleState;
  defender: PokemonBattleState;
  move_id: string;
  field: FieldConditions;
};

export type DamageCalcResult = {
  move_name: string;
  move_type: string;
  category: string;
  is_immune: boolean;
  type_effectiveness: number;
  stab_multiplier: number;
  rolls: number[];
  min_damage: number;
  max_damage: number;
  min_percent: number;
  max_percent: number;
  defender_max_hp: number;
  ko_chance_description: string;
};

export function defaultBattleState(): PokemonBattleState {
  return {
    species_id: "",
    level: 100,
    nature: "hardy",
    evs: {},
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    ability: null,
    item: null,
    status: null,
    tera_type: null,
    stat_stages: {},
    current_hp_percent: 100,
  };
}

export function defaultFieldConditions(): FieldConditions {
  return {
    weather: null,
    reflect: false,
    light_screen: false,
    aurora_veil: false,
    is_critical: false,
    spread_move: false,
  };
}
