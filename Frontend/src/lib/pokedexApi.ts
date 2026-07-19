import { apiFetch } from "@/lib/api";
import type {
  AbilityDetail,
  AbilitySummary,
  MoveDetail,
  MoveSummary,
  PokemonProfile,
  PokemonSummary,
  TypeDetail,
} from "@/types/pokemon";

export async function fetchPokedexList(params: {
  search?: string;
  type?: string;
  generation?: number;
}): Promise<PokemonSummary[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.type) query.set("type", params.type);
  if (params.generation) query.set("generation", String(params.generation));
  const qs = query.toString();
  return apiFetch<PokemonSummary[]>(`/pokedex${qs ? `?${qs}` : ""}`);
}

export async function fetchPokemonProfile(speciesId: string): Promise<PokemonProfile> {
  return apiFetch<PokemonProfile>(`/pokedex/${speciesId}`);
}

export async function fetchMovesList(): Promise<MoveSummary[]> {
  return apiFetch<MoveSummary[]>("/moves");
}

export async function fetchMoveDetail(moveId: string): Promise<MoveDetail> {
  return apiFetch<MoveDetail>(`/moves/${moveId}`);
}

export async function fetchAbilitiesList(): Promise<AbilitySummary[]> {
  return apiFetch<AbilitySummary[]>("/abilities");
}

export async function fetchAbilityDetail(abilityId: string): Promise<AbilityDetail> {
  return apiFetch<AbilityDetail>(`/abilities/${abilityId}`);
}

export async function fetchTypeDetail(type: string): Promise<TypeDetail> {
  return apiFetch<TypeDetail>(`/types/${type}`);
}
