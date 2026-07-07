import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { analyzeTeam, importTeam } from "@/lib/teamApi";
import { TeamAnalysisView } from "@/pages/team-builder/TeamAnalysisView";
import { TeamSlotEditor } from "@/pages/team-builder/TeamSlotEditor";
import { useTeamStore } from "@/store/teamStore";

export function TeamBuilderPage() {
  const { team, setTeam, updateMember, addMember, removeMember, clearTeam } = useTeamStore();
  const [importText, setImportText] = useState("");

  const importMutation = useMutation({
    mutationFn: () => importTeam(importText),
    onSuccess: (response) => {
      setTeam(response.team);
      if (response.warnings.length === 0) setImportText("");
    },
  });

  const analysisMutation = useMutation({
    mutationFn: () => analyzeTeam(team),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Team Builder</h1>
        <p className="text-muted-foreground text-sm">
          Paste a Showdown export, or build a team slot-by-slot below. Your team is saved in this
          browser — no account needed.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Import from Showdown</h2>
        <Textarea
          rows={6}
          placeholder={"Landorus-Therian @ Choice Scarf\nAbility: Intimidate\n..."}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            className="w-fit"
            disabled={!importText.trim() || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? "Importing..." : "Import team"}
          </Button>
          {team.members.length > 0 && (
            <Button variant="ghost" className="w-fit" onClick={clearTeam}>
              Clear team
            </Button>
          )}
        </div>
        {importMutation.data && importMutation.data.warnings.length > 0 && (
          <ul className="text-sm text-amber-700 dark:text-amber-400">
            {importMutation.data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {importMutation.isError && (
          <p className="text-destructive text-sm">
            {importMutation.error instanceof ApiError
              ? importMutation.error.message
              : "Couldn't import that team."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {team.members.map((member, index) => (
          <TeamSlotEditor
            // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional and reordering isn't supported
            key={index}
            index={index}
            member={member}
            onChange={(updated) => updateMember(index, updated)}
            onRemove={() => removeMember(index)}
          />
        ))}

        {team.members.length < 6 && (
          <Button variant="outline" className="w-fit" onClick={addMember}>
            Add Pokemon ({team.members.length}/6)
          </Button>
        )}
      </div>

      {team.members.length > 0 && (
        <Button
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
