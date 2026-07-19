import { AlertTriangle, Grid3x3, Shield, Zap } from "lucide-react";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { Reveal } from "@/components/Reveal";
import { TypeBadge } from "@/components/TypeBadge";
import { Card, CardContent } from "@/components/ui/card";
import { ALL_TYPES } from "@/lib/pokemonTypes";
import { cn } from "@/lib/utils";
import type { TeamAnalysis } from "@/types/team";

export function TeamAnalysisView({ analysis }: { analysis: TeamAnalysis }) {
  const coverageByType = Object.fromEntries(analysis.type_coverage.map((c) => [c.type, c]));

  return (
    <Reveal id="team-builder-analysis" stagger className="grid gap-4 md:grid-cols-2">
      <Card>
        <GradientCardHeader icon={Zap} title="Speed tiers" />
        <CardContent className="pt-4">
          <ol className="flex flex-col gap-1 text-sm">
            {analysis.speed_tiers.map((entry, i) => (
              <li key={entry.species_id} className="flex justify-between gap-2">
                <span>
                  {i + 1}. {entry.nickname ?? entry.name}
                  {entry.nickname && <span className="text-muted-foreground"> ({entry.name})</span>}
                </span>
                <span className="font-mono text-muted-foreground">{entry.speed}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <GradientCardHeader icon={AlertTriangle} title="Role-compression flags" />
        <CardContent className="pt-4">
          {analysis.role_flags.length === 0 ? (
            <p className="text-muted-foreground text-sm">No flags raised for this team.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {analysis.role_flags.map((flag) => (
                <li key={flag.flag} className="text-warning">
                  {flag.description}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Simple, heuristic flags (base-stat thresholds and shared weaknesses) — not a substitute
            for real team-building judgment.
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <GradientCardHeader icon={Shield} title="Type coverage" />
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-1">Type</th>
                  <th className="p-1 text-right">Weak</th>
                  <th className="p-1 text-right">Resist</th>
                  <th className="p-1 text-right">Immune</th>
                </tr>
              </thead>
              <tbody>
                {ALL_TYPES.map((type, i) => {
                  const c = coverageByType[type];
                  return (
                    <tr
                      key={type}
                      className={cn(
                        "border-b border-border last:border-0",
                        i % 2 === 0 && "bg-muted/30",
                      )}
                    >
                      <td className="p-1">
                        <TypeBadge type={type} />
                      </td>
                      <td className="p-1 text-right font-mono">{c?.weak_count ?? 0}</td>
                      <td className="p-1 text-right font-mono">{c?.resist_count ?? 0}</td>
                      <td className="p-1 text-right font-mono">{c?.immune_count ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <GradientCardHeader icon={Grid3x3} title="Weakness matrix" />
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="sticky left-0 bg-card p-1">Pokemon</th>
                  {ALL_TYPES.map((type) => (
                    <th key={type} className="p-1 text-center">
                      <TypeBadge type={type} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.weakness_matrix.map((entry, i) => (
                  <tr
                    key={entry.species_id}
                    className={cn(
                      "border-b border-border last:border-0",
                      i % 2 === 0 && "bg-muted/30",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 p-1 font-medium whitespace-nowrap",
                        i % 2 === 0 ? "bg-muted/30" : "bg-card",
                      )}
                    >
                      {entry.nickname ?? entry.name}
                    </td>
                    {ALL_TYPES.map((type) => {
                      const mult = entry.matchups[type] ?? 1;
                      return (
                        <td
                          key={type}
                          className="p-1 text-center font-mono text-xs text-muted-foreground"
                        >
                          {mult === 1 ? "—" : `${mult}x`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Reveal>
  );
}
