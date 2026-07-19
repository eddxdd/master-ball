import { useQueries } from "@tanstack/react-query";
import { BarChart3, Layers, Loader2, Target, Trophy } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { DonutChart, type DonutSlice } from "@/components/DonutChart";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { LoadingState } from "@/components/LoadingState";
import { PokemonSprite, SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeamAnalysis } from "@/hooks/useTeamAnalysis";
import { fetchMetaStats } from "@/lib/metaApi";
import { typeColor } from "@/lib/typeColors";
import { humanizeShowdownId } from "@/lib/utils";
import { useTeamStore } from "@/store/teamStore";
import type { MetaStatsResult } from "@/types/meta";
import type { Team } from "@/types/team";

const ROLE_COLORS = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#047857",
  "#7c3aed",
  "#0e7490",
  "#c2410c",
] as const;

const USAGE_COLORS = ["#0f766e", "#b45309", "#1d4ed8", "#be123c", "#047857", "#334155"] as const;

function Kpi({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-muted/30 px-3.5 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="truncate text-lg font-bold leading-tight">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SpeciesUsageRow({ stats, maxUsage }: { stats: MetaStatsResult; maxUsage: number }) {
  const width = maxUsage > 0 ? (stats.usage_percent / maxUsage) * 100 : 0;
  const topItem = stats.top_items[0];
  const topMove = stats.top_moves[0];

  return (
    <Link
      to={`/pokedex/${stats.species_id}`}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2.5 transition hover:border-primary/40 hover:bg-muted/40"
    >
      <SpriteImg
        spriteUrl={`https://play.pokemonshowdown.com/sprites/dex/${stats.species_id}.png`}
        name={stats.species_name}
        preferHome
        className="size-11 object-contain"
        placeholderClassName="size-11 text-sm"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate font-semibold group-hover:underline">{stats.species_name}</span>
          <span className="font-mono text-xs text-muted-foreground">#{stats.rank}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[image:var(--gradient-accent)]"
            style={{ width: `${width}%` }}
          />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {topItem ? topItem.name : "—"}
          {" · "}
          {topMove ? topMove.name : "—"}
        </p>
      </div>
      <span className="w-14 text-right font-mono text-sm font-semibold">
        {stats.usage_percent.toFixed(1)}%
      </span>
    </Link>
  );
}

function buildTypeSlices(members: { type1: string; type2: string | null }[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    counts.set(m.type1, (counts.get(m.type1) ?? 0) + 1);
    if (m.type2) counts.set(m.type2, (counts.get(m.type2) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, value]) => ({
      key: type,
      label: type,
      value,
      color: typeColor(type),
    }));
}

function buildRoleSlices(roles: { role: string }[]): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const m of roles) {
    counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, value], i) => ({
      key: role,
      label: role,
      value,
      color: ROLE_COLORS[i % ROLE_COLORS.length],
    }));
}

function buildUsageSlices(stats: MetaStatsResult[]): DonutSlice[] {
  return [...stats]
    .sort((a, b) => b.usage_percent - a.usage_percent)
    .map((s, i) => ({
      key: s.species_id,
      label: s.species_name,
      value: Math.max(s.usage_percent, 0.01),
      color: USAGE_COLORS[i % USAGE_COLORS.length],
    }));
}

/**
 * Combined roster overview + ladder analytics for Team Builder — type/role/usage
 * charts, member blurbs, shared weaknesses, and usage ranks in one panel.
 */
export function TeamInsightsPanel() {
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const [insightsTeamId, setInsightsTeamId] = useState(activeTeamId);

  useEffect(() => {
    if (!teams.some((t) => t.id === insightsTeamId)) {
      setInsightsTeamId(activeTeamId);
    }
  }, [teams, insightsTeamId, activeTeamId]);

  const selected =
    teams.find((t) => t.id === insightsTeamId) ??
    teams.find((t) => t.id === activeTeamId) ??
    teams[0];

  const analysisTeam: Team = useMemo(() => ({ members: selected?.members ?? [] }), [selected]);
  const filledCount = analysisTeam.members.filter((m) => m.species_id.length > 0).length;
  const {
    data: analysis,
    isPending: analysisPending,
    isError: analysisError,
    error,
  } = useTeamAnalysis(analysisTeam);

  const speciesIds = useMemo(
    () =>
      selected?.members.map((m) => m.species_id).filter((id): id is string => Boolean(id)) ?? [],
    [selected],
  );

  const queries = useQueries({
    queries: speciesIds.map((id) => ({
      queryKey: ["meta", id] as const,
      queryFn: () => fetchMetaStats(id),
      retry: false as const,
      staleTime: 5 * 60_000,
    })),
  });

  const statsRows = queries.map((q) => q.data).filter((s): s is MetaStatsResult => Boolean(s));
  const metaPending = speciesIds.length > 0 && queries.some((q) => q.isPending);
  const maxUsage = Math.max(...statsRows.map((s) => s.usage_percent), 1);
  const avgUsage =
    statsRows.length > 0
      ? statsRows.reduce((sum, s) => sum + s.usage_percent, 0) / statsRows.length
      : 0;
  const bestRank = statsRows.length > 0 ? Math.min(...statsRows.map((s) => s.rank)) : null;
  const isDemo = statsRows.some((s) => s.is_demo);
  const format = statsRows[0]?.format ?? "gen9ou";
  const month = statsRows[0]?.month;

  const sharedWeaknesses =
    analysis?.type_coverage
      .filter((c) => c.weak_count >= Math.max(2, Math.ceil(filledCount / 2)))
      .sort((a, b) => b.weak_count - a.weak_count)
      .map((c) => c.type) ?? [];

  const typeSlices = useMemo(
    () => (analysis?.member_roles ? buildTypeSlices(analysis.member_roles) : []),
    [analysis?.member_roles],
  );
  const roleSlices = useMemo(
    () => (analysis?.member_roles ? buildRoleSlices(analysis.member_roles) : []),
    [analysis?.member_roles],
  );
  const usageSlices = useMemo(() => buildUsageSlices(statsRows), [statsRows]);

  if (teams.length === 0) return null;

  const showCharts = typeSlices.length > 0 || roleSlices.length > 0 || usageSlices.length > 0;

  return (
    <Card id="team-builder-insights" className="overflow-hidden">
      <GradientCardHeader
        icon={BarChart3}
        title="Team insights"
        subtitle="Composition, roles, and ladder usage"
      />
      <CardContent className="flex flex-col gap-6 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              How the roster is built and how it shows up on the ladder — pick any saved team.
            </p>
            {isDemo && (
              <p className="mt-1 text-xs text-muted-foreground">
                Demo ladder snapshot until Smogon stats sync.{" "}
                <Link to="/analytics" className="font-medium text-primary hover:underline">
                  Full Analytics
                </Link>
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-56">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Team
            </span>
            <Select
              items={Object.fromEntries(teams.map((t) => [t.id, t.name]))}
              value={selected?.id}
              onValueChange={(id) => {
                if (id) setInsightsTeamId(id);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    <span className="ml-2 text-muted-foreground">
                      ({t.members.filter((m) => m.species_id).length}/6)
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filledCount === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {selected?.name ?? "This team"} has no Pokemon yet — add some above, or pick another
            team.
          </p>
        )}

        {filledCount > 0 && (
          <>
            {(analysisPending && !analysis) || (metaPending && statsRows.length === 0) ? (
              <LoadingState label="Loading team insights" size="inline" />
            ) : null}

            {analysisError && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Couldn't analyze this team."}
              </p>
            )}

            {(analysis || statsRows.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi icon={Layers} label="Roster" value={`${filledCount}/6`} />
                <Kpi
                  icon={Target}
                  label="Avg usage"
                  value={statsRows.length ? `${avgUsage.toFixed(1)}%` : "—"}
                />
                <Kpi
                  icon={Trophy}
                  label="Best rank"
                  value={bestRank != null ? `#${bestRank}` : "—"}
                />
                <Kpi
                  icon={BarChart3}
                  label="Shared weaknesses"
                  value={sharedWeaknesses.length ? String(sharedWeaknesses.length) : "None"}
                />
              </div>
            )}

            {showCharts && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {typeSlices.length > 0 && (
                  <ChartCard title="Type mix">
                    <DonutChart
                      slices={typeSlices}
                      centerValue={typeSlices.length}
                      centerLabel="types"
                    />
                  </ChartCard>
                )}
                {roleSlices.length > 0 && (
                  <ChartCard title="Role mix">
                    <DonutChart
                      slices={roleSlices}
                      centerValue={roleSlices.length}
                      centerLabel="roles"
                    />
                  </ChartCard>
                )}
                {usageSlices.length > 0 && (
                  <ChartCard title="Usage share">
                    <DonutChart
                      slices={usageSlices}
                      centerValue={`${avgUsage.toFixed(0)}%`}
                      centerLabel="avg"
                    />
                  </ChartCard>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {analysis && (analysis.member_roles?.length ?? 0) > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Roster roles
                    </h3>
                    {analysisPending && (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {analysis.member_roles.map((member) => (
                      <li
                        key={`${member.species_id}-${member.nickname ?? ""}-${member.role}`}
                        className="flex gap-3 rounded-xl border border-border/70 bg-background/40 p-3"
                      >
                        <PokemonSprite
                          spriteUrl={member.sprite_url}
                          name={member.name}
                          className="size-12 shrink-0"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/pokedex/${member.species_id}`}
                              className="link-underline font-semibold hover:text-primary"
                            >
                              {member.nickname || member.name}
                            </Link>
                            <Badge variant="secondary" className="font-normal">
                              {member.role}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <TypeBadge type={member.type1} />
                            {member.type2 && <TypeBadge type={member.type2} />}
                          </div>
                          <p className="text-sm leading-snug text-muted-foreground">
                            {member.summary}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {member.item && (
                              <span>
                                Item: <span className="text-foreground">{member.item}</span>
                              </span>
                            )}
                            {member.ability && (
                              <span>
                                Ability:{" "}
                                <span className="text-foreground">
                                  {humanizeShowdownId(member.ability)}
                                </span>
                              </span>
                            )}
                            <span>
                              Speed:{" "}
                              <span className="font-mono text-foreground">{member.speed}</span>
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Ladder usage
                  </h3>
                  {statsRows.length > 0 && (
                    <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {format.toUpperCase()}
                      {month ? ` · ${month}` : ""}
                    </span>
                  )}
                </div>

                {statsRows.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {[...statsRows]
                      .sort((a, b) => a.rank - b.rank)
                      .map((stats) => (
                        <li key={stats.species_id}>
                          <SpeciesUsageRow stats={stats} maxUsage={maxUsage} />
                        </li>
                      ))}
                  </ul>
                ) : (
                  !metaPending &&
                  filledCount > 0 && (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                      No ladder usage data for this roster yet.
                    </p>
                  )
                )}

                {statsRows.length > 0 && (
                  <div className="flex flex-col gap-2 pt-1">
                    <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Common threats
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        new Map(
                          statsRows
                            .flatMap((s) => s.top_checks_and_counters.slice(0, 2))
                            .map((c) => [c.species_id ?? c.name, c]),
                        ).values(),
                      )
                        .slice(0, 8)
                        .map((check) => (
                          <span
                            key={check.species_id ?? check.name}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs"
                          >
                            {check.type1 && <TypeBadge type={check.type1} linkable={false} />}
                            {check.species_id ? (
                              <Link
                                to={`/pokedex/${check.species_id}`}
                                className="font-medium hover:underline"
                              >
                                {check.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{check.name}</span>
                            )}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </section>
            </div>

            {analysis && (
              <section className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 px-4 py-3.5">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Shared weaknesses
                </span>
                {sharedWeaknesses.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {sharedWeaknesses.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Types that hit at least half the team for super-effective damage — patch with
                      a teammate or Tera.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No widely shared weaknesses — defensive typing looks reasonably spread out.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
