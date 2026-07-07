import { apiFetch } from "@/lib/api";
import type { PokemonProfile, PokemonSummary } from "@/types/pokemon";

export async function fetchPokedexList(params: {
  search?: string;
  type?: string;
}): Promise<PokemonSummary[]> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.type) query.set("type", params.type);
  const qs = query.toString();
  return apiFetch<PokemonSummary[]>(`/pokedex${qs ? `?${qs}` : ""}`);
}

export async function fetchPokemonProfile(speciesId: string): Promise<PokemonProfile> {
  return apiFetch<PokemonProfile>(`/pokedex/${speciesId}`);
}
