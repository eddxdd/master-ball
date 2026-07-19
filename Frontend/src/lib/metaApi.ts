import { apiFetch } from "@/lib/api";
import type { MetaLeaderboard, MetaStatsResult, ScoutReport } from "@/types/meta";

export async function fetchMetaLeaderboard(
  format = "gen9ou",
  limit = 12,
): Promise<MetaLeaderboard> {
  return apiFetch<MetaLeaderboard>(`/meta?format=${format}&limit=${limit}`);
}

export async function fetchMetaStats(
  speciesId: string,
  format = "gen9ou",
): Promise<MetaStatsResult> {
  return apiFetch<MetaStatsResult>(`/meta/${speciesId}?format=${format}`);
}

export async function fetchScoutReport(speciesId: string, format = "gen9ou"): Promise<ScoutReport> {
  return apiFetch<ScoutReport>(`/scout/${speciesId}?format=${format}`);
}
