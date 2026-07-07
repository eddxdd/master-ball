import { useQuery } from "@tanstack/react-query";
import { fetchPokedexList, fetchPokemonProfile } from "@/lib/pokedexApi";

export function usePokedexList(params: { search?: string; type?: string }) {
  return useQuery({
    queryKey: ["pokedex", params],
    queryFn: () => fetchPokedexList(params),
    placeholderData: (previous) => previous,
  });
}

export function usePokemonProfile(speciesId: string | undefined) {
  return useQuery({
    queryKey: ["pokedex", "profile", speciesId],
    queryFn: () => fetchPokemonProfile(speciesId as string),
    enabled: Boolean(speciesId),
  });
}
