import { useQuery } from "@tanstack/react-query";
import { suggestTeammates } from "@/lib/teamApi";

/** Phase 6's AI-assisted Team Builder suggestions — a fast GraphRAG
 * traversal (see app/tools/graph_query.py), not an LLM call, so it's cheap
 * enough to refetch on every team-slot edit. `speciesIds` should already be
 * deduplicated/filtered to real, non-empty slots by the caller. */
export function useTeamSuggestions(speciesIds: string[]) {
  return useQuery({
    queryKey: ["team", "suggest-teammates", [...speciesIds].sort()],
    queryFn: () => suggestTeammates(speciesIds),
    enabled: speciesIds.length > 0 && speciesIds.length < 6,
  });
}
