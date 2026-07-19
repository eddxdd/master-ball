export type BattleResult = "win" | "loss";

export type BattleLogEntry = {
  id: number;
  result: BattleResult;
  note: string | null;
  created_at: string;
};

export type TiltCheckResult = {
  consecutive_losses: number;
  nudge: boolean;
  message: string | null;
};

export type LogBattleResultResponse = {
  entry: BattleLogEntry;
  tilt_check: TiltCheckResult;
  push_sent: boolean;
};

export type VapidPublicKeyResponse = {
  public_key: string | null;
};
