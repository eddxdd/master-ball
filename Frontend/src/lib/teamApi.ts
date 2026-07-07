import { apiFetch } from "@/lib/api";
import type { Team, TeamAnalysis, TeamImportResponse } from "@/types/team";

export async function importTeam(text: string): Promise<TeamImportResponse> {
  return apiFetch<TeamImportResponse>("/team/import", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function analyzeTeam(team: Team): Promise<TeamAnalysis> {
  return apiFetch<TeamAnalysis>("/team/analyze", {
    method: "POST",
    body: JSON.stringify(team),
  });
}
