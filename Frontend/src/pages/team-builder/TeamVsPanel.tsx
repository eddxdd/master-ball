import { useMutation } from "@tanstack/react-query";
import { Swords, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePokedexList } from "@/hooks/usePokedex";
import { ApiError } from "@/lib/api";
import { predictWinProbability } from "@/lib/mlApi";
import { useTeamStore } from "@/store/teamStore";
import type { SavedTeam } from "@/types/team";

const VS_REQUIREMENT_HINT =
  "Save at least two teams to compare them (use New team). Defaults to Team 1 vs Team 2.";

function pickDefaultPair(teams: SavedTeam[]): { aId: string; bId: string } | null {
  if (teams.length < 2) return null;
  const byName = (name: string) => teams.find((t) => t.name === name);
  const team1 = byName("Team 1");
  const team2 = byName("Team 2");
  if (team1 && team2) return { aId: team1.id, bId: team2.id };
  return { aId: teams[0].id, bId: teams[1].id };
}

function TeamPicker({
  label,
  value,
  onChange,
  teams,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  teams: SavedTeam[];
  excludeId?: string;
}) {
  const options = teams.filter((t) => t.id !== excludeId);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Select
        items={Object.fromEntries(options.map((t) => [t.id, t.name]))}
        value={value}
        onValueChange={(id) => {
          if (id) onChange(id);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((t) => (
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
  );
}

function TeamSidePreview({
  team,
  pokedexById,
}: {
  team: SavedTeam;
  pokedexById: Map<
    string,
    { name: string; sprite_url: string; type1: string; type2: string | null }
  >;
}) {
  const filled = team.members.filter((m) => m.species_id);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border bg-card/60 p-3 sm:p-4">
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{team.name}</h3>
        <p className="text-xs text-muted-foreground">{filled.length}/6 Pokemon</p>
      </div>
      {filled.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Pokemon on this team yet.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {filled.map((member, index) => {
            const mon = pokedexById.get(member.species_id);
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
                key={`${member.species_id}-${index}`}
                className="flex min-w-0 flex-col items-center gap-1"
                title={mon?.name ?? member.species_id}
              >
                <SpriteImg
                  spriteUrl={
                    mon?.sprite_url ??
                    `https://play.pokemonshowdown.com/sprites/dex/${member.species_id}.png`
                  }
                  name={mon?.name ?? member.species_id}
                  preferHome
                  className="size-12 object-contain"
                  placeholderClassName="size-12 text-xs"
                />
                <span className="w-full truncate text-center text-[10px] font-medium leading-tight">
                  {mon?.name ?? member.species_id}
                </span>
                {mon && (
                  <div className="flex scale-90 flex-wrap justify-center gap-0.5">
                    <TypeBadge type={mon.type1} linkable={false} />
                    {mon.type2 && <TypeBadge type={mon.type2} linkable={false} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VsCompareBody({
  teams,
  initialAId,
  initialBId,
}: {
  teams: SavedTeam[];
  initialAId: string;
  initialBId: string;
}) {
  const { data: pokedex } = usePokedexList({});
  const pokedexById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; sprite_url: string; type1: string; type2: string | null }
    >();
    for (const p of pokedex ?? []) {
      map.set(p.id, {
        name: p.name,
        sprite_url: p.sprite_url,
        type1: p.type1,
        type2: p.type2,
      });
    }
    return map;
  }, [pokedex]);

  const [teamAId, setTeamAId] = useState(initialAId);
  const [teamBId, setTeamBId] = useState(initialBId);

  useEffect(() => {
    if (!teams.some((t) => t.id === teamAId)) setTeamAId(initialAId);
    if (!teams.some((t) => t.id === teamBId)) setTeamBId(initialBId);
  }, [teams, teamAId, teamBId, initialAId, initialBId]);

  useEffect(() => {
    if (teamAId === teamBId && teams.length > 1) {
      const other = teams.find((t) => t.id !== teamAId);
      if (other) setTeamBId(other.id);
    }
  }, [teamAId, teamBId, teams]);

  const teamA = teams.find((t) => t.id === teamAId) ?? teams[0];
  const teamB =
    teams.find((t) => t.id === teamBId) ?? teams.find((t) => t.id !== teamA?.id) ?? teams[1];

  const predictMutation = useMutation({
    mutationFn: () => {
      if (!teamA || !teamB) throw new Error("Pick two teams to compare.");
      return predictWinProbability({ members: teamA.members }, { members: teamB.members });
    },
  });
  const resetPredict = predictMutation.reset;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when matchup changes
  useEffect(() => {
    resetPredict();
  }, [teamAId, teamBId, resetPredict]);

  if (!teamA || !teamB) return null;

  const aFilled = teamA.members.some((m) => m.species_id);
  const bFilled = teamB.members.some((m) => m.species_id);
  const canCompare = aFilled && bFilled && teamA.id !== teamB.id;

  const probability = predictMutation.data?.team_a_win_probability;
  const aPercent = probability !== undefined ? Math.round(probability * 1000) / 10 : null;
  const bPercent = aPercent !== null ? Math.round((100 - aPercent) * 10) / 10 : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <TeamPicker
          label="Team A"
          value={teamA.id}
          onChange={setTeamAId}
          teams={teams}
          excludeId={teamB.id}
        />
        <div className="flex shrink-0 items-center justify-center px-1 pb-1">
          <span className="rounded-full bg-[image:var(--gradient-brand)] px-3 py-1 text-xs font-bold tracking-widest text-white uppercase">
            VS
          </span>
        </div>
        <TeamPicker
          label="Team B"
          value={teamB.id}
          onChange={setTeamBId}
          teams={teams}
          excludeId={teamA.id}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <TeamSidePreview team={teamA} pokedexById={pokedexById} />
        <div className="hidden items-center justify-center lg:flex">
          <span className="text-2xl font-black tracking-tighter text-muted-foreground/40">VS</span>
        </div>
        <TeamSidePreview team={teamB} pokedexById={pokedexById} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="gradient"
          disabled={!canCompare || predictMutation.isPending}
          onClick={() => predictMutation.mutate()}
        >
          <Swords />
          {predictMutation.isPending ? "Comparing…" : "Compare matchup"}
        </Button>
        {!canCompare && (
          <p className="text-xs text-muted-foreground">Both teams need at least one Pokemon.</p>
        )}
      </div>

      {predictMutation.isError && (
        <p className="text-sm text-destructive">
          {predictMutation.error instanceof ApiError
            ? predictMutation.error.message
            : "Couldn't compare these teams."}
        </p>
      )}

      {predictMutation.data && aPercent !== null && bPercent !== null && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-end justify-between gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{teamA.name}</p>
              <p className="font-mono text-2xl font-bold text-primary">{aPercent}%</p>
            </div>
            <p className="pb-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Est. win rate
            </p>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{teamB.name}</p>
              <p className="font-mono text-2xl font-bold">{bPercent}%</p>
            </div>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-[image:var(--gradient-brand)] transition-[width] duration-500"
              style={{ width: `${aPercent}%` }}
            />
            <div
              className="h-full bg-foreground/25 transition-[width] duration-500"
              style={{ width: `${bPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * VS control for Team Builder — opens a modal to compare two saved teams
 * (defaults Team 1 vs Team 2). Requires at least two saved teams.
 */
export function TeamVsButton() {
  const teams = useTeamStore((s) => s.teams);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const canVs = teams.length >= 2;
  const pair = pickDefaultPair(teams);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title={
          canVs ? "Compare two saved teams (defaults to Team 1 vs Team 2)" : VS_REQUIREMENT_HINT
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Swords />
        VS
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close VS window"
            className="absolute inset-0 cursor-pointer bg-background/70 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[min(90dvh,48rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="relative flex shrink-0 items-center gap-3 overflow-hidden border-b border-border/70 px-4 py-3 sm:px-5">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.12]"
              />
              <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-brand)] text-white shadow-sm">
                <Swords className="size-4" />
              </div>
              <div className="relative min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-semibold leading-tight">
                  {canVs && pair
                    ? `${teams.find((t) => t.id === pair.aId)?.name ?? "Team 1"} VS ${teams.find((t) => t.id === pair.bId)?.name ?? "Team 2"}`
                    : "VS"}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  Head-to-head roster compare
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="relative shrink-0"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {canVs && pair ? (
                <VsCompareBody
                  key={`${pair.aId}-${pair.bId}`}
                  teams={teams}
                  initialAId={pair.aId}
                  initialBId={pair.bId}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Swords className="size-6 text-muted-foreground" />
                  </div>
                  <div className="max-w-sm space-y-2">
                    <p className="font-semibold">You need at least two saved teams</p>
                    <p className="text-sm text-muted-foreground">
                      Create another roster with <span className="font-medium">New team</span> in
                      Saved teams above, then open VS again to compare Team 1 vs Team 2 (or any pair
                      you pick).
                    </p>
                  </div>
                  <Button type="button" variant="gradient" size="sm" onClick={() => setOpen(false)}>
                    Got it
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
