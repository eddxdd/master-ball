import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api";
import type { TeamSuggestionResult } from "@/types/graph";
import type { Team, TeamAnalysis, TeamImportResponse } from "@/types/team";

export async function importTeam(text: string): Promise<TeamImportResponse> {
  return apiFetch<TeamImportResponse>("/team/import", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** Multipart upload — deliberately bypasses apiFetch, which always forces a
 * `Content-Type: application/json` header; a browser-set multipart boundary
 * is required instead, so `fetch` is called directly here. See
 * app/routers/team.py's POST /team/import-image. */
export async function importTeamFromImage(file: File): Promise<TeamImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/team/import-image`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new ApiError(response.status, detail?.detail ?? `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function analyzeTeam(team: Team): Promise<TeamAnalysis> {
  return apiFetch<TeamAnalysis>("/team/analyze", {
    method: "POST",
    body: JSON.stringify(team),
  });
}

/** Phase 6's GraphRAG-backed teammate suggestion — see
 * app/tools/graph_query.py and app/routers/team.py's POST
 * /team/suggest-teammates. A fast Neo4j traversal, not an LLM call, so it's
 * cheap enough to call on every meaningful Team Builder edit. */
export async function suggestTeammates(speciesIds: string[]): Promise<TeamSuggestionResult> {
  return apiFetch<TeamSuggestionResult>("/team/suggest-teammates", {
    method: "POST",
    body: JSON.stringify({ species_ids: speciesIds }),
  });
}
