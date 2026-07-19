import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Dices } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfessorChat } from "@/components/ProfessorChat";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { prefetchPokedexList, usePokedexList } from "@/hooks/usePokedex";
import { ApiError } from "@/lib/api";
import { generateRandomTeam } from "@/lib/randomTeam";
import { analyzeTeam } from "@/lib/teamApi";
import { cn } from "@/lib/utils";
import { TeamAnalysisView } from "@/pages/team-builder/TeamAnalysisView";
import { TeamInsightsPanel } from "@/pages/team-builder/TeamInsightsPanel";
import { TeamLibraryBar } from "@/pages/team-builder/TeamLibraryBar";
import { AddSlotTile, TeamSlotEditor } from "@/pages/team-builder/TeamSlotEditor";
import { TeamSuggestionsPanel } from "@/pages/team-builder/TeamSuggestionsPanel";
import { TeamVsButton } from "@/pages/team-builder/TeamVsPanel";
import { useActiveSavedTeam, useTeamStore } from "@/store/teamStore";

export function TeamBuilderPage() {
  const { team, setTeam, updateMember, addMember, addMemberWithSpecies, removeMember, clearTeam } =
    useTeamStore();
  const activeSaved = useActiveSavedTeam();
  // Which slot's full editor is open — at most one at a time, so the grid
  // stays scannable rather than every slot's fields fighting for space.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [professorOpen, setProfessorOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: pokedex } = usePokedexList({});

  // Warm the full pokedex before the user opens a slot — SpeciesCombobox
  // filters this client-side, so a cold first open would otherwise wait on
  // GET /pokedex.
  useEffect(() => {
    void prefetchPokedexList(queryClient);
  }, [queryClient]);

  const analysisMutation = useMutation({
    mutationFn: () => analyzeTeam(team),
  });

  const randomTeamMutation = useMutation({
    mutationFn: () => {
      if (!pokedex?.length) {
        throw new Error("Pokedex hasn't loaded yet — try again in a moment.");
      }
      return generateRandomTeam(pokedex);
    },
    onSuccess: (next) => {
      setTeam(next);
      setExpandedIndex(null);
    },
  });

  const handleRandomTeam = () => {
    const hasFilled = team.members.some((m) => m.species_id);
    if (hasFilled && !window.confirm("Replace your current team with a random one?")) {
      return;
    }
    randomTeamMutation.mutate();
  };

  const handleAddSlot = () => {
    const newIndex = team.members.length;
    addMember();
    setExpandedIndex(newIndex);
  };

  const handleAddSuggested = (speciesId: string) => {
    const newIndex = team.members.length;
    addMemberWithSpecies(speciesId);
    setExpandedIndex(newIndex);
  };

  const handleRemove = (index: number) => {
    removeMember(index);
    setExpandedIndex((current) => (current === index ? null : current));
  };

  return (
    <div id="team-builder-page" className="flex flex-col gap-6">
      <Seo
        title="Team Builder"
        description="Build a competitive team visually with sprite pickers for every Pokemon, item, and move, or ask the Professor to build one for you. Instant type coverage, speed tiers, and weakness analysis — no account needed."
      />
      <div id="team-builder-header">
        <h1 className="text-2xl font-semibold">Team Builder</h1>
        <p className="text-muted-foreground text-sm">
          Pick Pokemon, items, and moves visually below, or ask the Professor to build a team for
          you. Save multiple named teams in this browser and switch between them anytime.
        </p>
      </div>

      {/* Professor first — collapsed by default so the roster stays primary. */}
      <section
        id="team-builder-professor"
        className="w-full overflow-hidden rounded-2xl border border-border bg-card"
      >
        <button
          type="button"
          id="team-builder-professor-toggle"
          aria-expanded={professorOpen}
          aria-controls="team-builder-professor-chat"
          onClick={() => setProfessorOpen((open) => !open)}
          className={cn(
            "relative flex w-full cursor-pointer items-center gap-3 overflow-hidden px-4 py-3.5 text-left sm:px-5",
            "transition-colors hover:bg-muted/30",
            professorOpen && "border-b border-border/70",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.12]"
          />
          <img
            src="/images/professor-avatar.png"
            alt=""
            aria-hidden
            className="relative size-10 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-border"
          />
          <div className="relative min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">Professor</h2>
            <p className="truncate text-sm text-muted-foreground">
              Ask me to build a team, suggest a set, or check a matchup.
            </p>
          </div>
          <span className="relative shrink-0 text-muted-foreground" aria-hidden>
            {professorOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </span>
        </button>
        {professorOpen && (
          <div id="team-builder-professor-chat">
            <ProfessorChat compact teamBuilderMode contextTeam={team} onApplyTeam={setTeam} />
          </div>
        )}
      </section>

      <TeamLibraryBar />

      <div id="team-builder-roster" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{activeSaved?.name ?? "Your team"}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <TeamVsButton />
            <Button
              type="button"
              variant="gradient"
              size="sm"
              disabled={!pokedex?.length || randomTeamMutation.isPending}
              onClick={handleRandomTeam}
            >
              <Dices />
              {randomTeamMutation.isPending ? "Rolling…" : "Random Team"}
            </Button>
            {team.members.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearTeam}>
                Clear team
              </Button>
            )}
          </div>
        </div>
        {randomTeamMutation.isError && (
          <p className="text-sm text-destructive">
            {randomTeamMutation.error instanceof Error
              ? randomTeamMutation.error.message
              : "Couldn't roll a random team."}
          </p>
        )}
        {/* 3-across on sm+ so a full six reads as two even rows (not 4+2). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {team.members.map((member, index) => (
            <TeamSlotEditor
              // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional and reordering isn't supported
              key={index}
              index={index}
              member={member}
              isExpanded={expandedIndex === index}
              onExpand={() => setExpandedIndex(index)}
              onCollapse={() => setExpandedIndex(null)}
              onChange={(updated) => updateMember(index, updated)}
              onRemove={() => handleRemove(index)}
            />
          ))}

          {team.members.length < 6 && (
            <AddSlotTile onClick={handleAddSlot} count={team.members.length} />
          )}
        </div>
      </div>

      <TeamSuggestionsPanel
        speciesIds={team.members.map((m) => m.species_id).filter((id) => id.length > 0)}
        onAdd={handleAddSuggested}
      />

      <TeamInsightsPanel />

      {team.members.length > 0 && (
        <Button
          variant="gradient"
          className="w-fit"
          disabled={analysisMutation.isPending}
          onClick={() => analysisMutation.mutate()}
        >
          {analysisMutation.isPending ? "Analyzing..." : "Analyze team"}
        </Button>
      )}

      {analysisMutation.isError && (
        <p className="text-destructive">
          {analysisMutation.error instanceof ApiError
            ? analysisMutation.error.message
            : "Couldn't analyze this team."}
        </p>
      )}

      {analysisMutation.data && <TeamAnalysisView analysis={analysisMutation.data} />}
    </div>
  );
}
