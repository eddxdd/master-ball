export type ReplayEvent = {
  kind: string;
  actor: string | null;
  summary: string;
};

export type ReplayTurn = {
  number: number;
  events: ReplayEvent[];
};

export type ParsedReplay = {
  format: string | null;
  players: Record<string, string>;
  winner: string | null;
  turns: ReplayTurn[];
  turn_count: number;
};
