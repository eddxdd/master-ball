import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveSavedTeam, useTeamStore } from "@/store/teamStore";

const MAX_SAVED_TEAMS = 12;

/** Switch / rename / create / delete named teams in the local library. */
export function TeamLibraryBar() {
  const teams = useTeamStore((s) => s.teams);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const switchTeam = useTeamStore((s) => s.switchTeam);
  const createTeam = useTeamStore((s) => s.createTeam);
  const renameActiveTeam = useTeamStore((s) => s.renameActiveTeam);
  const deleteTeam = useTeamStore((s) => s.deleteTeam);
  const active = useActiveSavedTeam();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(active?.name ?? "");

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft when switching saved teams (id), not only on rename
  useEffect(() => {
    setDraftName(active?.name ?? "");
    setEditing(false);
  }, [active?.id, active?.name]);

  const commitRename = () => {
    renameActiveTeam(draftName);
    setEditing(false);
  };

  const atCap = teams.length >= MAX_SAVED_TEAMS;

  return (
    <div
      id="team-builder-library"
      className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Saved teams
        </span>
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              commitRename();
            }}
          >
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 max-w-xs"
              aria-label="Team name"
              autoFocus
              maxLength={40}
            />
            <Button type="submit" size="icon-xs" variant="ghost" aria-label="Save team name">
              <Check />
            </Button>
          </form>
        ) : (
          <>
            <Select
              items={Object.fromEntries(teams.map((t) => [t.id, t.name]))}
              value={activeTeamId}
              onValueChange={(id) => {
                if (id) switchTeam(id);
              }}
            >
              <SelectTrigger className="h-8 w-full max-w-xs sm:w-52">
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
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Rename team"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={atCap}
          title={
            atCap ? `Up to ${MAX_SAVED_TEAMS} teams in this browser` : "Create a new empty team"
          }
          onClick={() => createTeam()}
        >
          <Plus /> New team
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={teams.length <= 1}
          aria-label="Delete current team"
          onClick={() => {
            if (!active || teams.length <= 1) return;
            if (window.confirm(`Delete “${active.name}”? This can’t be undone.`)) {
              deleteTeam(active.id);
            }
          }}
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}
