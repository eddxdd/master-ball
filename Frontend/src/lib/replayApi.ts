import { apiFetch } from "@/lib/api";
import type { ChatResponse } from "@/types/chat";
import type { ParsedReplay } from "@/types/replay";

type ReplaySource = { log: string } | { replay_id: string };

export async function parseReplay(source: ReplaySource): Promise<ParsedReplay> {
  return apiFetch<ParsedReplay>("/replay/parse", {
    method: "POST",
    body: JSON.stringify(source),
  });
}

export async function getReplayCoachReview(source: ReplaySource): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/replay/coach", {
    method: "POST",
    body: JSON.stringify(source),
  });
}
