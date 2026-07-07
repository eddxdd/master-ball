import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { usePokedexList, usePokemonProfile } from "@/hooks/usePokedex";

export function PokemonPicker({
  label,
  speciesId,
  onSelect,
}: {
  label: string;
  speciesId: string;
  onSelect: (speciesId: string, name: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const { data: options } = usePokedexList({ search: query || undefined });
  // For displaying an already-set speciesId's name (e.g. a team restored
  // from localStorage) — a direct per-id lookup, rather than searching for
  // it in the (paginated/filtered) browse list, which may not contain it.
  const { data: currentProfile } = usePokemonProfile(speciesId || undefined);
  const lastMatchedRef = useRef<string | null>(null);

  // Matching on every keystroke's onChange is racy: `options` reflects the
  // *previous* query's results until the new fetch resolves, so checking
  // against it inline could match against stale data (or miss a match
  // entirely on the keystroke that actually completes a valid name). Doing
  // it here, keyed off `options` itself, always checks the current query
  // against the results that were actually fetched for it.
  useEffect(() => {
    if (!query || !options) return;
    const match = options.find((p) => p.name.toLowerCase() === query.toLowerCase());
    if (match && lastMatchedRef.current !== match.id) {
      lastMatchedRef.current = match.id;
      onSelect(match.id, match.name);
    }
  }, [query, options, onSelect]);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={listId} className="text-sm font-medium">
        {label}
      </label>
      <Input
        // Remounts (recomputing defaultValue) whenever speciesId changes
        // externally — e.g. a team restored from localStorage after this
        // component already mounted — since an uncontrolled input otherwise
        // never re-reads `defaultValue` after its first render.
        key={speciesId}
        id={listId}
        list={`${listId}-options`}
        placeholder="Search by name..."
        defaultValue={currentProfile?.name ?? ""}
        onChange={(e) => setQuery(e.target.value)}
      />
      <datalist id={`${listId}-options`}>
        {options?.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
    </div>
  );
}
