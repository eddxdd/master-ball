import { type QueryClient, useQuery } from "@tanstack/react-query";
import { fetchMetaLeaderboard, fetchMetaStats } from "@/lib/metaApi";
import {
  fetchAbilitiesList,
  fetchAbilityDetail,
  fetchMoveDetail,
  fetchMovesList,
  fetchPokedexList,
  fetchPokemonProfile,
  fetchTypeDetail,
} from "@/lib/pokedexApi";

/** Full unfiltered list — shared by Pokedex browser, SpeciesCombobox, and
 * idle prefetch so the first open rarely waits on the network. */
export const POKEDEX_LIST_QUERY_KEY = ["pokedex", {}] as const;
export const POKEDEX_LIST_STALE_TIME = 5 * 60_000;

export function prefetchPokedexList(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: POKEDEX_LIST_QUERY_KEY,
    queryFn: () => fetchPokedexList({}),
    staleTime: POKEDEX_LIST_STALE_TIME,
  });
}

export function usePokedexList(params: { search?: string; type?: string; generation?: number }) {
  return useQuery({
    queryKey: ["pokedex", params],
    queryFn: () => fetchPokedexList(params),
    placeholderData: (previous) => previous,
    // Team Builder's SpeciesCombobox filters this client-side — keep the
    // full list warm for the session so opening a slot never waits on /pokedex.
    staleTime: POKEDEX_LIST_STALE_TIME,
  });
}

export function usePokemonProfile(speciesId: string | undefined) {
  return useQuery({
    queryKey: ["pokedex", "profile", speciesId],
    queryFn: () => fetchPokemonProfile(speciesId as string),
    enabled: Boolean(speciesId),
  });
}

export function useMovesList() {
  return useQuery({
    queryKey: ["moves", "list"],
    queryFn: fetchMovesList,
    staleTime: POKEDEX_LIST_STALE_TIME,
  });
}

export function useMoveDetail(moveId: string | undefined) {
  return useQuery({
    queryKey: ["moves", moveId],
    queryFn: () => fetchMoveDetail(moveId as string),
    enabled: Boolean(moveId),
  });
}

export function useAbilitiesList() {
  return useQuery({
    queryKey: ["abilities", "list"],
    queryFn: fetchAbilitiesList,
    staleTime: POKEDEX_LIST_STALE_TIME,
  });
}

export function useAbilityDetail(abilityId: string | undefined) {
  return useQuery({
    queryKey: ["abilities", abilityId],
    queryFn: () => fetchAbilityDetail(abilityId as string),
    enabled: Boolean(abilityId),
  });
}

export function useTypeDetail(type: string | undefined) {
  return useQuery({
    queryKey: ["types", type],
    queryFn: () => fetchTypeDetail(type as string),
    enabled: Boolean(type),
  });
}

export function useMetaStats(speciesId: string | undefined) {
  return useQuery({
    queryKey: ["meta", speciesId],
    queryFn: () => fetchMetaStats(speciesId as string),
    enabled: Boolean(speciesId),
    retry: false, // a 404 ("not synced yet") is an expected, common outcome
  });
}

export function useMetaLeaderboard(format = "gen9ou", limit = 12) {
  return useQuery({
    queryKey: ["meta", "leaderboard", format, limit],
    queryFn: () => fetchMetaLeaderboard(format, limit),
    staleTime: 5 * 60_000,
  });
}
