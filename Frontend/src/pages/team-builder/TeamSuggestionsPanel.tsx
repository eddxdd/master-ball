import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { Link } from "react-router";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { TypeBadge } from "@/components/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTeamSuggestions } from "@/hooks/useTeamSuggestions";

/** Phase 6's AI-assisted Team Builder pick — a Neo4j knowledge-graph
 * traversal (real Smogon usage-stats co-occurrence + type-weakness
 * coverage, see app/tools/graph_query.py), not an LLM call, surfaced right
 * on the Team Builder so it updates live as the team changes. Renders
 * nothing (not an error) when there's no team yet or the graph has no
 * usable data for the current members — see the 503/empty-result handling
 * below. */
export function TeamSuggestionsPanel({
  speciesIds,
  onAdd,
}: {
  speciesIds: string[];
  onAdd: (speciesId: string) => void;
}) {
  const { data, isPending, isError, error } = useTeamSuggestions(speciesIds);

  if (speciesIds.length === 0 || speciesIds.length >= 6) {
    return null;
  }

  return (
    <Card id="team-builder-suggestions">
      <GradientCardHeader icon={Sparkles} title="Suggested teammates" />
      <CardContent className="flex flex-col gap-4 pt-4">
        <p className="text-xs text-muted-foreground">
          Ranked by a knowledge-graph traversal of real ladder usage-stats pairings and
          type-weakness coverage — not an LLM guess. Ask the Professor for a reasoned take on any of
          these.
        </p>

        {isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Querying the knowledge graph...
          </p>
        )}

        {isError && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Couldn't reach the knowledge graph."}
          </p>
        )}

        {data && data.team_weaknesses.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Team is weak to
            </span>
            {data.team_weaknesses.map((w) => (
              <TypeBadge key={w.type} type={w.type} />
            ))}
          </div>
        )}

        {data && data.candidates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No graph-backed suggestions yet for this team — try adding a synced/popular Pokemon, or
            run <code>scripts/load_graph.py</code> if you're running this locally.
          </p>
        )}

        {data && data.candidates.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.candidates.map((candidate) => (
              <li
                key={candidate.species_id}
                className="flex flex-col gap-1 rounded-md border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to={`/pokedex/${candidate.species_id}`}
                    className="link-underline font-semibold hover:text-primary"
                  >
                    {candidate.species_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">score {candidate.score}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onAdd(candidate.species_id)}
                    >
                      <UserPlus /> Add
                    </Button>
                  </div>
                </div>
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {candidate.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
