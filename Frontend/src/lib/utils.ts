import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Last-resort label for a Showdown id (e.g. a `PokemonSet.moves`/`.ability`
 * entry from a team import) that a `Select`'s own id->name `items` map
 * doesn't cover — most often because the Pokemon's profile is still
 * loading, occasionally because the id is genuinely unresolvable. Base
 * UI's `Select.Value` renders the raw `value` verbatim when it's missing
 * from `items` (e.g. bare "voltswitch"), so callers should merge this in
 * as that id's label rather than let that raw id reach the screen — see
 * `Backend/app/tools/meta_stats.py`'s `_unresolved_display_name` for the
 * same fallback on the backend side of this exact problem. Not a full
 * unfix — a Showdown id has no separators left to reconstruct word
 * boundaries from — just capitalizes the first letter so it doesn't read
 * as a raw internal identifier. */
export function humanizeShowdownId(id: string): string {
  return id.slice(0, 1).toUpperCase() + id.slice(1);
}

/** The other direction of `humanizeShowdownId` — approximates poke-env's
 * `to_id_str` (lowercase, strip everything but letters/digits) so a plain
 * display-text field (e.g. `PokemonSet.item`, stored as text per
 * `app/tools/team_import.py`'s comment) can still guess its backing item id
 * for a best-effort sprite lookup. Not authoritative — just a UI nicety that
 * gracefully renders nothing when the guess doesn't match a real item. */
export function toShowdownId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Showdown vs PokeAPI item-id mismatches (same map as Backend
 * `app/tools/items.py`). Never use `humanizeShowdownId` for item labels —
 * resolve through GET /items and use the API's display `name` ("Focus Sash"). */
const ITEM_ID_ALIASES: Record<string, string> = {
  focusash: "focussash",
};

/** Normalize a stored item string (display name or id) to the id our Items
 * table actually uses. */
export function toItemLookupId(name: string): string {
  const id = toShowdownId(name);
  return ITEM_ID_ALIASES[id] ?? id;
}
