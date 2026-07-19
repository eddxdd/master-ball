/** Phase 7's win-probability toy model — see
 * Backend/app/tools/win_probability.py's module docstring for the full
 * "toy model, synthetic training labels" caveat `model_note` refers to. */
export type WinProbabilityResult = {
  team_a_win_probability: number;
  team_a_features: Record<string, number>;
  team_b_features: Record<string, number>;
  model_note: string;
};
