import { useQuery } from "@tanstack/react-query";
import { analyzeTeam } from "@/lib/teamApi";
import type { Team } from "@/types/team";

/** Live team analysis for the Team Builder's "About the team" blurb —
 * keyed on a compact roster fingerprint so EV/nature tweaks that affect
 * speed tiers refetch, but an empty slot doesn't fire a request. */
export function useTeamAnalysis(team: Team) {
  const filled = team.members.filter((m) => m.species_id.length > 0);
  const fingerprint = filled.map(
    (m) => `${m.species_id}:${m.nature}:${m.evs.spe ?? 0}:${m.ability ?? ""}`,
  );

  return useQuery({
    queryKey: ["team", "analyze", fingerprint],
    queryFn: () => analyzeTeam({ members: filled }),
    enabled: filled.length > 0,
    staleTime: 15_000,
  });
}
