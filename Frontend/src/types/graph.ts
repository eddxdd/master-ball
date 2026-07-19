export type TeamWeakness = {
  type: string;
  weak_member_count: number;
};

export type TeammateCandidate = {
  species_id: string;
  species_name: string;
  score: number;
  reasons: string[];
};

export type TeamSuggestionResult = {
  team_weaknesses: TeamWeakness[];
  candidates: TeammateCandidate[];
};
