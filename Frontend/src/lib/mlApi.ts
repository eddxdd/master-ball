import { apiFetch } from "@/lib/api";
import type { WinProbabilityResult } from "@/types/ml";
import type { Team } from "@/types/team";

/** Phase 7's win-probability toy model — see
 * Backend/app/tools/win_probability.py's module docstring for the full
 * "trained on a synthetic simulator, not real match data" caveat. Always
 * surface `model_note` alongside the number, never just the raw percentage. */
export async function predictWinProbability(
  teamA: Team,
  teamB: Team,
): Promise<WinProbabilityResult> {
  return apiFetch<WinProbabilityResult>("/ml/win-probability", {
    method: "POST",
    body: JSON.stringify({ team_a: teamA, team_b: teamB }),
  });
}
