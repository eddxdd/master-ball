export type PokemonSet = {
  species_id: string;
  nickname?: string | null;
  level: number;
  nature: string;
  ability?: string | null;
  item?: string | null;
  evs: Record<string, number>;
  ivs: Record<string, number>;
  moves: string[];
  tera_type?: string | null;
};

export type Team = {
  members: PokemonSet[];
};

/** One named roster in the browser-local team library. */
export type SavedTeam = {
  id: string;
  name: string;
  members: PokemonSet[];
  updatedAt: number;
};

export type TeamImportResponse = {
  team: Team;
  warnings: string[];
};

export type TypeCoverageEntry = {
  type: string;
  weak_count: number;
  resist_count: number;
  immune_count: number;
};

export type SpeedTierEntry = {
  species_id: string;
  name: string;
  nickname: string | null;
  speed: number;
};

export type WeaknessMatrixEntry = {
  species_id: string;
  name: string;
  nickname: string | null;
  matchups: Record<string, number>;
};

export type RoleFlag = {
  flag: string;
  description: string;
};

export type MemberRoleEntry = {
  species_id: string;
  name: string;
  nickname: string | null;
  sprite_url: string;
  type1: string;
  type2: string | null;
  role: string;
  summary: string;
  item: string | null;
  ability: string | null;
  speed: number;
};

export type TeamAnalysis = {
  type_coverage: TypeCoverageEntry[];
  speed_tiers: SpeedTierEntry[];
  weakness_matrix: WeaknessMatrixEntry[];
  role_flags: RoleFlag[];
  member_roles: MemberRoleEntry[];
};

export function defaultPokemonSet(): PokemonSet {
  return {
    species_id: "",
    nickname: null,
    level: 100,
    nature: "hardy",
    ability: null,
    item: null,
    evs: {},
    ivs: {},
    moves: [],
    tera_type: null,
  };
}
