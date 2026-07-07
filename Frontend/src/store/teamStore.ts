import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultPokemonSet, type PokemonSet, type Team } from "@/types/team";

const MAX_TEAM_SIZE = 6;

type TeamStore = {
  team: Team;
  setTeam: (team: Team) => void;
  updateMember: (index: number, member: PokemonSet) => void;
  addMember: () => void;
  removeMember: (index: number) => void;
  clearTeam: () => void;
};

/** Team Builder state lives in the browser (localStorage), not the server —
 * see Docs/frontend/README.md and the Phase 1 plan's scope note: nothing in
 * this app currently requires a server-side team, since analyze_team takes a
 * team payload directly rather than a team_id. Real persistence arrives in
 * Phase 3, once session logging actually needs a user identity. */
export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      team: { members: [] },
      setTeam: (team) => set({ team }),
      updateMember: (index, member) =>
        set((state) => {
          const members = [...state.team.members];
          members[index] = member;
          return { team: { members } };
        }),
      addMember: () =>
        set((state) => {
          if (state.team.members.length >= MAX_TEAM_SIZE) return state;
          return { team: { members: [...state.team.members, defaultPokemonSet()] } };
        }),
      removeMember: (index) =>
        set((state) => ({
          team: { members: state.team.members.filter((_, i) => i !== index) },
        })),
      clearTeam: () => set({ team: { members: [] } }),
    }),
    { name: "dextrainer-team-builder" },
  ),
);
