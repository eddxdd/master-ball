import { useMutation } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useState } from "react";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { predictWinProbability } from "@/lib/mlApi";
import { importTeam } from "@/lib/teamApi";
import type { Team } from "@/types/team";

/** Phase 7's win-probability toy model, surfaced right on the Team Builder
 * next to the LLM-based analysis it's meant to sit "alongside" (per
 * Docs/roadmap.md's Phase 7 item 5) — a fast, classical-ML estimate rather
 * than an LLM call. Paste an opponent's Showdown export, get an estimated
 * win probability for the current team against it.
 *
 * TOY MODEL: trained on a documented synthetic battle-outcome simulator, not
 * real logged match results (see Backend/app/tools/win_probability.py's
 * module docstring) — the `model_note` returned by the API is always shown
 * verbatim alongside the number so this is never presented as more
 * authoritative than it is. */
export function WinProbabilityPanel({ team }: { team: Team }) {
  const [opponentText, setOpponentText] = useState("");
  const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);

  const importOpponentMutation = useMutation({
    mutationFn: () => importTeam(opponentText),
    onSuccess: (response) => setOpponentTeam(response.team),
  });

  const predictMutation = useMutation({
    mutationFn: () => {
      if (!opponentTeam) throw new Error("Parse an opponent team first.");
      return predictWinProbability(team, opponentTeam);
    },
  });

  if (team.members.length === 0) {
    return null;
  }

  const probability = predictMutation.data?.team_a_win_probability;
  const percent = probability !== undefined ? Math.round(probability * 1000) / 10 : null;

  return (
    <Card id="team-builder-win-probability">
      <GradientCardHeader icon={FlaskConical} title="Win probability (toy model)" />
      <CardContent className="flex flex-col gap-3 pt-4">
        <p className="text-xs text-muted-foreground">
          A small XGBoost model estimates your team's win probability against a pasted opponent
          team, from team-composition features (stats, type coverage) alone — no movesets, no player
          skill. This is a toy/demo model trained on a synthetic simulator, not real ladder match
          results; treat the number below as illustrative, not a guarantee.
        </p>

        <Textarea
          rows={4}
          placeholder={
            "Paste the opponent's Showdown export...\nLandorus-Therian @ Choice Scarf\n..."
          }
          value={opponentText}
          onChange={(e) => {
            setOpponentText(e.target.value);
            setOpponentTeam(null);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="w-fit"
            disabled={!opponentText.trim() || importOpponentMutation.isPending}
            onClick={() => importOpponentMutation.mutate()}
          >
            {importOpponentMutation.isPending ? "Parsing..." : "Parse opponent team"}
          </Button>
          {opponentTeam && opponentTeam.members.length > 0 && (
            <Button
              variant="gradient"
              className="w-fit"
              disabled={predictMutation.isPending}
              onClick={() => predictMutation.mutate()}
            >
              {predictMutation.isPending
                ? "Estimating..."
                : `Estimate vs. this ${opponentTeam.members.length}-Pokemon team`}
            </Button>
          )}
        </div>

        {importOpponentMutation.isError && (
          <p className="text-destructive text-sm">
            {importOpponentMutation.error instanceof ApiError
              ? importOpponentMutation.error.message
              : "Couldn't parse that team."}
          </p>
        )}
        {importOpponentMutation.data && importOpponentMutation.data.warnings.length > 0 && (
          <ul className="text-sm text-warning">
            {importOpponentMutation.data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {predictMutation.isError && (
          <p className="text-destructive text-sm">
            {predictMutation.error instanceof ApiError
              ? predictMutation.error.message
              : "Couldn't estimate a win probability for this matchup."}
          </p>
        )}

        {predictMutation.data && percent !== null && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Your team</span>
              <span className="font-mono">{percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[image:var(--gradient-brand)]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs italic">
              {predictMutation.data.model_note}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
