import { API_BASE_URL, apiFetch } from "@/lib/api";
import type { Citation } from "@/types/chat";

type ChatWsEvent =
  | { type: "token"; content: string }
  | {
      type: "done";
      answer: string;
      needs_clarification: boolean;
      citations: Citation[];
      turn_id: string;
      quality_warnings?: string[];
    }
  | { type: "error"; detail: string };

type StreamChatCallbacks = {
  onToken: (content: string) => void;
  onDone: (result: {
    answer: string;
    needsClarification: boolean;
    citations: Citation[];
    turnId: string;
    qualityWarnings: string[];
  }) => void;
  onError: (detail: string) => void;
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type StreamChatOptions = {
  teamBuilder?: boolean;
  team?: string[];
  /** Prior turns oldest → newest, excluding the current `message`. */
  history?: ChatHistoryTurn[];
};

export function streamChatMessage(
  message: string,
  callbacks: StreamChatCallbacks,
  options?: StreamChatOptions,
): () => void {
  const wsUrl = `${API_BASE_URL.replace(/^http/, "ws")}/chat/ws`;
  const socket = new WebSocket(wsUrl);
  let closedByClient = false;
  let settled = false;

  const fail = (detail: string) => {
    if (settled || closedByClient) return;
    settled = true;
    callbacks.onError(detail);
  };

  socket.onopen = () => {
    if (closedByClient) return;
    socket.send(
      JSON.stringify({
        message,
        team_builder: options?.teamBuilder ?? false,
        team: options?.team ?? [],
        history: options?.history ?? [],
      }),
    );
  };

  socket.onmessage = (event) => {
    if (closedByClient) return;
    const data: ChatWsEvent = JSON.parse(event.data);
    if (data.type === "token") {
      callbacks.onToken(data.content);
    } else if (data.type === "done") {
      settled = true;
      callbacks.onDone({
        answer: data.answer,
        needsClarification: data.needs_clarification,
        citations: data.citations,
        turnId: data.turn_id,
        qualityWarnings: data.quality_warnings ?? [],
      });
      closedByClient = true;
      socket.close();
    } else if (data.type === "error") {
      fail(data.detail);
      closedByClient = true;
      socket.close();
    }
  };

  // Browsers often fire `error` when we intentionally close during React
  // Strict Mode remounts / cancel — ignore those so auto-ask doesn't flash
  // "Connection failed" before a healthy second connection.
  socket.onerror = () => {
    fail("Connection to the Professor failed — is the backend running?");
  };

  socket.onclose = () => {
    if (!settled && !closedByClient) {
      fail("Connection to the Professor failed — is the backend running?");
    }
  };

  return () => {
    closedByClient = true;
    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close();
    }
  };
}

export type ChatFeedbackPayload = {
  turn_id: string;
  rating: "up" | "down";
  message: string;
  answer: string;
  comment?: string;
};

export function submitChatFeedback(payload: ChatFeedbackPayload) {
  return apiFetch<{ id: number; turn_id: string; rating: string }>("/chat/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
