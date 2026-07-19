import { apiFetch } from "@/lib/api";
import type { ChatResponse } from "@/types/chat";
import type {
  BattleLogEntry,
  BattleResult,
  LogBattleResultResponse,
  VapidPublicKeyResponse,
} from "@/types/session";

export async function postBattleLog(
  clientId: string,
  result: BattleResult,
  note?: string,
): Promise<LogBattleResultResponse> {
  return apiFetch<LogBattleResultResponse>("/sessions/battle-log", {
    method: "POST",
    body: JSON.stringify({ client_id: clientId, result, note: note || null }),
  });
}

export async function getBattleLog(clientId: string): Promise<BattleLogEntry[]> {
  return apiFetch<BattleLogEntry[]>(
    `/sessions/battle-log?client_id=${encodeURIComponent(clientId)}`,
  );
}

export async function getVapidPublicKey(): Promise<VapidPublicKeyResponse> {
  return apiFetch<VapidPublicKeyResponse>("/sessions/push/vapid-public-key");
}

export async function subscribeToPush(
  clientId: string,
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON();
  await apiFetch<void>("/sessions/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });
}

export async function unsubscribeFromPush(clientId: string): Promise<void> {
  await apiFetch<void>(`/sessions/push/subscribe/${encodeURIComponent(clientId)}`, {
    method: "DELETE",
  });
}

export async function postLossReview(
  clientId: string,
  opts: { battleLogEntryId?: number; note?: string },
): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/sessions/post-loss-review", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      battle_log_entry_id: opts.battleLogEntryId ?? null,
      note: opts.note ?? null,
    }),
  });
}
