import { NATURES } from "@/lib/natures";
import { fetchPokemonProfile } from "@/lib/pokedexApi";
import type { PokemonProfile, PokemonSummary } from "@/types/pokemon";
import { defaultPokemonSet, type PokemonSet, type Team } from "@/types/team";

const TEAM_SIZE = 6;

/** Competitive staples for random held items — stored as display names to
 * match team-import / ItemCombobox (`PokemonSet.item` is plain text, not an
 * id). Ids here are the seeded Items-table keys (PokeAPI), not Showdown's
 * occasional mismatches (e.g. Showdown `focusash` vs `focussash`). */
const RANDOM_ITEMS = [
  { id: "leftovers", name: "Leftovers" },
  { id: "lifeorb", name: "Life Orb" },
  { id: "choicescarf", name: "Choice Scarf" },
  { id: "choiceband", name: "Choice Band" },
  { id: "choicespecs", name: "Choice Specs" },
  { id: "heavydutyboots", name: "Heavy-Duty Boots" },
  { id: "assaultvest", name: "Assault Vest" },
  { id: "focussash", name: "Focus Sash" },
  { id: "rockyhelmet", name: "Rocky Helmet" },
  { id: "eviolite", name: "Eviolite" },
  { id: "blacksludge", name: "Black Sludge" },
  { id: "sitrusberry", name: "Sitrus Berry" },
] as const;

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function pickNUnique<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items];
  return shuffleInPlace([...items]).slice(0, n);
}

/** Base formes only — Mega/Gmax/cosmetic battle formes clutter random rolls. */
export function randomTeamPool(pokedex: PokemonSummary[]): PokemonSummary[] {
  return pokedex.filter((p) => !p.forme && p.num > 0);
}

function randomSetFromProfile(profile: PokemonProfile): PokemonSet {
  const ability = profile.abilities.length > 0 ? pickOne(profile.abilities).id : null;
  const moves = pickNUnique(profile.learnable_moves, 4).map((m) => m.id);
  const teraOptions = [profile.type1, profile.type2].filter(Boolean) as string[];
  const tera_type = teraOptions.length > 0 ? pickOne(teraOptions) : profile.type1;
  const nature = pickOne(NATURES);
  const physical =
    nature.increased === "atk" ||
    (nature.increased !== "spa" && nature.increased !== "spd" && Math.random() < 0.5);

  return {
    ...defaultPokemonSet(),
    species_id: profile.id,
    nature: nature.id,
    ability,
    item: pickOne(RANDOM_ITEMS).name,
    moves,
    tera_type,
    evs: physical
      ? { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 }
      : { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
}

/** Build a full 6-mon random team from the Pokedex list (fetches profiles). */
export async function generateRandomTeam(pokedex: PokemonSummary[]): Promise<Team> {
  const pool = randomTeamPool(pokedex);
  if (pool.length === 0) {
    throw new Error("No Pokemon available to roll a team.");
  }

  const picks = pickNUnique(pool, Math.min(TEAM_SIZE, pool.length));
  const profiles = await Promise.all(picks.map((p) => fetchPokemonProfile(p.id)));
  return { members: profiles.map(randomSetFromProfile) };
}
