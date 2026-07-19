import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, ClipboardList, Cpu, History, Loader2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import MarkdownMessage from "@/components/MarkdownMessage";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { type MoodLabel, useOnDeviceMood } from "@/hooks/useOnDeviceMood";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { ApiError } from "@/lib/api";
import { getClientId } from "@/lib/clientId";
import { getBattleLog, postBattleLog, postLossReview } from "@/lib/sessionApi";
import { cn } from "@/lib/utils";
import type { BattleResult } from "@/types/session";

const MOOD_COPY: Record<MoodLabel, { emoji: string; text: string; badgeClassName: string }> = {
  positive: { emoji: "🙂", text: "Sounds upbeat", badgeClassName: "bg-success/15 text-success" },
  neutral: {
    emoji: "😐",
    text: "Sounds neutral",
    badgeClassName: "bg-muted text-muted-foreground",
  },
  negative: {
    emoji: "😤",
    text: "Sounds frustrated",
    badgeClassName: "bg-destructive/15 text-destructive",
  },
};

/**
 * Phase 3's Mental-Game Coach check-in surface: log a win/loss, see the
 * "two-loss rule" tilt nudge fire in real time, manage Web Push permission,
 * and request a grounded post-loss explanation from the same agent that
 * powers /professor. See Docs/roadmap.md's Phase 3 section.
 */
export function MentalCoachPage() {
  const clientId = getClientId();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [pendingResult, setPendingResult] = useState<BattleResult>("loss");
  const [reviewFor, setReviewFor] = useState<number | null>(null);

  const { data: history } = useQuery({
    queryKey: ["sessions", "battle-log", clientId],
    queryFn: () => getBattleLog(clientId),
  });

  const logMutation = useMutation({
    mutationFn: () => postBattleLog(clientId, pendingResult, note),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["sessions", "battle-log", clientId] });
    },
  });

  const mood = useOnDeviceMood(note);
  const push = usePushSubscription();

  const reviewMutation = useMutation({
    mutationFn: (battleLogEntryId: number) => postLossReview(clientId, { battleLogEntryId }),
  });

  const latestTiltCheck = logMutation.data?.tilt_check;

  return (
    <div id="mental-coach-page" className="mx-auto flex max-w-2xl flex-col gap-4">
      <Seo
        title="Mental-Game Coach"
        description="Log your Pokemon battle results, get a nudge after back-to-back losses, and ask for a grounded, specific explanation of what went wrong."
      />
      <div id="mental-coach-header">
        <h1 className="text-2xl font-semibold">Mental-Game Coach</h1>
        <p className="text-sm text-muted-foreground">
          A quick check-in after every game — no live game-state access, just an honest log.
        </p>
      </div>

      {latestTiltCheck?.nudge && (
        <Card id="mental-coach-tilt-alert" className="border-destructive/40 bg-destructive/5">
          <CardContent className="text-sm text-destructive">{latestTiltCheck.message}</CardContent>
        </Card>
      )}

      <Card id="mental-coach-log">
        <GradientCardHeader icon={ClipboardList} title="Log a result" />
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={pendingResult === "win" ? "default" : "outline"}
              onClick={() => setPendingResult("win")}
            >
              Win
            </Button>
            <Button
              type="button"
              variant={pendingResult === "loss" ? "default" : "outline"}
              onClick={() => setPendingResult("loss")}
            >
              Loss
            </Button>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional: what happened? (e.g. 'got swept by a Choice Scarf Dragapult I didn't expect')"
          />
          {note.trim().length > 0 && mood.status !== "unsupported" && mood.status !== "idle" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Cpu className="size-3.5 shrink-0" />
              {mood.status === "loading-model" && (
                <span>Loading a small on-device mood model (one-time download)...</span>
              )}
              {mood.status === "classifying" && !mood.label && <span>Reading the room...</span>}
              {mood.status === "error" && <span>On-device mood check unavailable right now.</span>}
              {mood.label && (
                <Badge className={MOOD_COPY[mood.label].badgeClassName}>
                  {MOOD_COPY[mood.label].emoji} {MOOD_COPY[mood.label].text}
                </Badge>
              )}
              <span className="italic">
                Runs locally in your browser (WebGPU/WASM) — no network round-trip.
              </span>
            </div>
          )}
          <Button
            type="button"
            variant="gradient"
            className="w-fit"
            disabled={logMutation.isPending}
            onClick={() => logMutation.mutate()}
          >
            {logMutation.isPending ? "Logging..." : "Log result"}
          </Button>
        </CardContent>
      </Card>

      <Card id="mental-coach-notifications">
        <GradientCardHeader icon={Bell} title="Notifications" />
        <CardContent className="flex flex-col gap-2 pt-4">
          {push.state === "unsupported" && (
            <p className="text-sm text-muted-foreground">
              Push notifications aren't supported in this browser.
            </p>
          )}
          {push.state === "unconfigured" && (
            <p className="text-sm text-muted-foreground">
              Push notifications aren't configured on this server yet.
            </p>
          )}
          {push.state === "denied" && (
            <p className="text-sm text-muted-foreground">
              Notifications are blocked — enable them in your browser's site settings to get tilt
              nudges.
            </p>
          )}
          {(push.state === "default" || push.state === "granted") && (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={push.busy}
              onClick={push.state === "granted" ? push.unsubscribe : push.subscribe}
            >
              {push.busy ? (
                <Loader2 className="animate-spin" />
              ) : push.state === "granted" ? (
                <BellOff />
              ) : (
                <Bell />
              )}
              {push.state === "granted" ? "Disable tilt nudges" : "Enable tilt nudges"}
            </Button>
          )}
          {push.error && <p className="text-sm text-destructive">{push.error}</p>}
        </CardContent>
      </Card>

      <Card id="mental-coach-history">
        <GradientCardHeader icon={History} title="Recent history" />
        <CardContent className="flex flex-col gap-2 pt-4">
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games logged yet.</p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.result === "win" ? "default" : "destructive"}>
                      {entry.result}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  {entry.result === "loss" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={reviewMutation.isPending && reviewFor === entry.id}
                      onClick={() => {
                        setReviewFor(entry.id);
                        reviewMutation.mutate(entry.id);
                      }}
                    >
                      {reviewMutation.isPending && reviewFor === entry.id
                        ? "Reviewing..."
                        : "Explain this loss"}
                    </Button>
                  )}
                </div>
                {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                {reviewFor === entry.id && reviewMutation.data && (
                  <div className="rounded-lg bg-muted p-3 text-foreground">
                    <MarkdownMessage content={reviewMutation.data.answer} />
                    {reviewMutation.data.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reviewMutation.data.citations.map((c) => (
                          <Badge key={c.source_id} variant="outline">
                            {c.title}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <CopyButton
                      text={reviewMutation.data.answer}
                      label="Copy response"
                      className="mt-1"
                    />
                  </div>
                )}
                {reviewFor === entry.id && reviewMutation.isError && (
                  <p
                    className={cn(
                      "text-sm",
                      reviewMutation.error instanceof ApiError &&
                        reviewMutation.error.status === 503
                        ? "text-muted-foreground"
                        : "text-destructive",
                    )}
                  >
                    {reviewMutation.error instanceof ApiError
                      ? reviewMutation.error.message
                      : "Something went wrong getting that review."}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
