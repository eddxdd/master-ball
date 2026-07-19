import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultPokemonSet, type PokemonSet, type SavedTeam, type Team } from "@/types/team";

const MAX_TEAM_SIZE = 6;
const MAX_SAVED_TEAMS = 12;

function newTeamId(): string {
  return crypto.randomUUID();
}

function makeSavedTeam(name: string, members: PokemonSet[] = []): SavedTeam {
  return {
    id: newTeamId(),
    name,
    members,
    updatedAt: Date.now(),
  };
}

function nextTeamName(existing: SavedTeam[]): string {
  const used = new Set(existing.map((t) => t.name));
  let n = existing.length + 1;
  while (used.has(`Team ${n}`)) n += 1;
  return `Team ${n}`;
}

type TeamStore = {
  teams: SavedTeam[];
  activeTeamId: string;
  /** Working roster for the active saved team — kept in sync for callers. */
  team: Team;
  setTeam: (team: Team) => void;
  updateMember: (index: number, member: PokemonSet) => void;
  addMember: () => void;
  addMemberWithSpecies: (speciesId: string) => void;
  removeMember: (index: number) => void;
  clearTeam: () => void;
  switchTeam: (id: string) => void;
  createTeam: (name?: string) => void;
  renameActiveTeam: (name: string) => void;
  deleteTeam: (id: string) => void;
};

function withActiveMembers(
  state: Pick<TeamStore, "teams" | "activeTeamId">,
  members: PokemonSet[],
): Pick<TeamStore, "teams" | "team"> {
  return {
    team: { members },
    teams: state.teams.map((t) =>
      t.id === state.activeTeamId ? { ...t, members, updatedAt: Date.now() } : t,
    ),
  };
}

const initialSaved = makeSavedTeam("Team 1");

/** Team Builder state lives in the browser (localStorage). Multiple named
 * teams are stored locally; server sync can layer on later without changing
 * the edit surface (analyze_team still takes a team payload, not a team_id). */
export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      teams: [initialSaved],
      activeTeamId: initialSaved.id,
      team: { members: [] },
      setTeam: (team) => set((state) => withActiveMembers(state, team.members)),
      updateMember: (index, member) =>
        set((state) => {
          const members = [...state.team.members];
          members[index] = member;
          return withActiveMembers(state, members);
        }),
      addMember: () =>
        set((state) => {
          if (state.team.members.length >= MAX_TEAM_SIZE) return state;
          return withActiveMembers(state, [...state.team.members, defaultPokemonSet()]);
        }),
      addMemberWithSpecies: (speciesId) =>
        set((state) => {
          if (state.team.members.length >= MAX_TEAM_SIZE) return state;
          return withActiveMembers(state, [
            ...state.team.members,
            { ...defaultPokemonSet(), species_id: speciesId },
          ]);
        }),
      removeMember: (index) =>
        set((state) =>
          withActiveMembers(
            state,
            state.team.members.filter((_, i) => i !== index),
          ),
        ),
      clearTeam: () => set((state) => withActiveMembers(state, [])),
      switchTeam: (id) =>
        set((state) => {
          const next = state.teams.find((t) => t.id === id);
          if (!next) return state;
          return { activeTeamId: id, team: { members: next.members } };
        }),
      createTeam: (name) =>
        set((state) => {
          if (state.teams.length >= MAX_SAVED_TEAMS) return state;
          const saved = makeSavedTeam(name?.trim() || nextTeamName(state.teams));
          return {
            teams: [...state.teams, saved],
            activeTeamId: saved.id,
            team: { members: [] },
          };
        }),
      renameActiveTeam: (name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed) return state;
          return {
            teams: state.teams.map((t) =>
              t.id === state.activeTeamId ? { ...t, name: trimmed, updatedAt: Date.now() } : t,
            ),
          };
        }),
      deleteTeam: (id) =>
        set((state) => {
          if (state.teams.length <= 1) return state;
          const teams = state.teams.filter((t) => t.id !== id);
          if (state.activeTeamId !== id) return { teams };
          const active = teams[0];
          return {
            teams,
            activeTeamId: active.id,
            team: { members: active.members },
          };
        }),
    }),
    {
      name: "masterball-team-builder",
      version: 1,
      migrate: (persisted) => {
        const raw = persisted as {
          team?: Team;
          teams?: SavedTeam[];
          activeTeamId?: string;
        };
        if (raw.teams?.length && raw.activeTeamId) {
          const active = raw.teams.find((t) => t.id === raw.activeTeamId) ?? raw.teams[0];
          return {
            teams: raw.teams,
            activeTeamId: active.id,
            team: { members: active.members },
          };
        }
        const members = raw.team?.members ?? [];
        const saved = makeSavedTeam("Team 1", members);
        return {
          teams: [saved],
          activeTeamId: saved.id,
          team: { members },
        };
      },
      // Re-bind `team` from the active saved slot after rehydrate.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const active = state.teams.find((t) => t.id === state.activeTeamId) ?? state.teams[0];
        if (!active) return;
        if (state.activeTeamId !== active.id || state.team.members !== active.members) {
          useTeamStore.setState({
            activeTeamId: active.id,
            team: { members: active.members },
          });
        }
      },
    },
  ),
);

/** Active saved-team metadata (name/id) for Team Builder chrome. */
export function useActiveSavedTeam(): SavedTeam | undefined {
  return useTeamStore((s) => s.teams.find((t) => t.id === s.activeTeamId));
}
