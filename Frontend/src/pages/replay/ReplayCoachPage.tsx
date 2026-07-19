import { useMutation } from "@tanstack/react-query";
import { FileText, ListOrdered, Loader2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { getReplayCoachReview, parseReplay } from "@/lib/replayApi";
import type { ParsedReplay } from "@/types/replay";

type Source = { log: string } | { replay_id: string };

function resolveSource(replayUrl: string, rawLog: string): Source | null {
  const trimmedUrl = replayUrl.trim();
  const trimmedLog = rawLog.trim();
  if (trimmedUrl) {
    // Accept either a bare id ("gen9ou-1234567890") or a full replay URL.
    const id = trimmedUrl
      .replace(/^https?:\/\/replay\.pokemonshowdown\.com\//, "")
      .replace(/\.json$/, "");
    return { replay_id: id };
  }
  if (trimmedLog) {
    return { log: trimmedLog };
  }
  return null;
}

function ReplayTurnList({ replay }: { replay: ParsedReplay }) {
  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
      {replay.turns.map((turn) => (
        <div key={turn.number}>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {turn.number === 0 ? "Pre-battle" : `Turn ${turn.number}`}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {turn.events.map((event, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: events within a turn are positional, protocol order matters and nothing else uniquely identifies them
              <li key={i} className="text-muted-foreground">
                {event.summary}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Phase 5's Replay Coach — parses a real Showdown replay log
 * (app/tools/replay_parser.py, a from-scratch implementation of Showdown's
 * own documented protocol) into structured turns, then asks the same Phase 2
 * agent for a postmortem grounded in that real turn-by-turn data. See
 * Docs/roadmap.md's Phase 5 section. */
export function ReplayCoachPage() {
  const [replayUrl, setReplayUrl] = useState("");
  const [rawLog, setRawLog] = useState("");

  const parseMutation = useMutation({ mutationFn: (source: Source) => parseReplay(source) });
  const coachMutation = useMutation({
    mutationFn: (source: Source) => getReplayCoachReview(source),
  });

  const source = resolveSource(replayUrl, rawLog);

  return (
    <div id="replay-coach-page" className="mx-auto flex max-w-3xl flex-col gap-6">
      <Seo
        title="Replay Coach"
        description="Paste a Pokemon Showdown replay URL or raw log and get a turn-by-turn postmortem from Master Ball's Professor — grounded in the real parsed battle log, not a guess."
      />
      <div id="replay-coach-header">
        <h1 className="text-2xl font-semibold">Replay Coach</h1>
        <p className="text-sm text-muted-foreground">
          Paste a Showdown replay URL (or its raw log) to get a structured turn-by-turn breakdown
          and an AI postmortem of the key turning points.
        </p>
      </div>

      <Card id="replay-coach-input">
        <GradientCardHeader icon={FileText} title="Paste a replay" gradient="brand" />
        <CardContent className="flex flex-col gap-3 pt-4">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="replay-url">
            Replay URL or id
            <Input
              id="replay-url"
              placeholder="https://replay.pokemonshowdown.com/gen9ou-1234567890"
              value={replayUrl}
              onChange={(e) => setReplayUrl(e.target.value)}
            />
          </label>
          <p className="text-center text-xs text-muted-foreground">— or —</p>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="replay-log">
            Paste raw replay log
            <Textarea
              id="replay-log"
              rows={5}
              placeholder="|player|p1|...&#10;|move|p1a: ...&#10;..."
              value={rawLog}
              onChange={(e) => setRawLog(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={!source || parseMutation.isPending}
              onClick={() => source && parseMutation.mutate(source)}
            >
              {parseMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              Parse replay
            </Button>
            <Button
              variant="gradient"
              disabled={!source || coachMutation.isPending}
              onClick={() => source && coachMutation.mutate(source)}
            >
              {coachMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              Get AI postmortem
            </Button>
          </div>
          {(parseMutation.isError || coachMutation.isError) && (
            <p className="text-sm text-destructive">
              {parseMutation.error instanceof ApiError
                ? parseMutation.error.message
                : coachMutation.error instanceof ApiError
                  ? coachMutation.error.message
                  : "Couldn't process that replay."}
            </p>
          )}
        </CardContent>
      </Card>

      {parseMutation.data && (
        <Card id="replay-coach-parsed">
          <GradientCardHeader icon={ListOrdered} title="Parsed replay" />
          <CardContent className="flex flex-col gap-3 pt-4">
            {(parseMutation.data.format || parseMutation.data.winner) && (
              <div className="flex flex-wrap items-center gap-2">
                {parseMutation.data.format && (
                  <Badge variant="outline">{parseMutation.data.format}</Badge>
                )}
                {parseMutation.data.winner && (
                  <Badge variant="secondary">Winner: {parseMutation.data.winner}</Badge>
                )}
              </div>
            )}
            <ReplayTurnList replay={parseMutation.data} />
          </CardContent>
        </Card>
      )}

      {coachMutation.data && (
        <Card id="replay-coach-postmortem">
          <GradientCardHeader icon={MessageSquareText} title="AI postmortem" gradient="brand" />
          <CardContent className="pt-4">
            <p className="text-sm whitespace-pre-wrap">{coachMutation.data.answer}</p>
            {coachMutation.data.citations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {coachMutation.data.citations.map((citation) => (
                  <Badge key={`${citation.source_id}-${citation.title}`} variant="outline">
                    {citation.title}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
