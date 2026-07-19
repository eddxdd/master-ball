import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSearchResults } from "@/hooks/useSearch";
import { fetchItemDetail } from "@/lib/itemsApi";
import { toItemLookupId } from "@/lib/utils";
import type { SearchResultItem } from "@/types/search";

/** Best-effort sprite/name lookup for an item stored as plain display text
 * (see `app/tools/team_import.py`) — normalizes via `toItemLookupId` (handles
 * Showdown↔PokeAPI aliases like focusash→focussash) and quietly renders
 * nothing if that guess doesn't resolve. Never invent labels with
 * `humanizeShowdownId`; use `data.name` from this query instead. */
export function useItemSpriteGuess(itemName: string | null | undefined) {
  const guessedId = itemName ? toItemLookupId(itemName) : undefined;
  return useQuery({
    queryKey: ["items", "sprite-guess", guessedId],
    queryFn: () => fetchItemDetail(guessedId as string),
    enabled: Boolean(guessedId),
    retry: false,
  });
}

/**
 * A sprite-assisted item field — still stores plain display text in
 * `PokemonSet.item` (typing freely always works, exactly like the plain
 * `Input` this replaces), but offers a searchable dropdown of real items
 * with sprites via GET /search for anyone who wants to pick rather than
 * type a set's held item.
 */
export function ItemCombobox({
  itemName,
  onSelect,
}: {
  itemName: string | null;
  onSelect: (name: string | null) => void;
}) {
  const [query, setQuery] = useState(itemName ?? "");
  // Sticky pick so controlled `value` isn't always null — Base UI clears the
  // input after selection when value stays null (SearchBar wants that;
  // this field must keep the chosen name).
  const [picked, setPicked] = useState<SearchResultItem | null>(null);
  // Re-syncs from an external change (e.g. a team applied by the Professor)
  // — an uncontrolled sync-on-prop-change, not a fully controlled value,
  // since the user's own typing should never get overwritten mid-edit.
  useEffect(() => {
    setQuery(itemName ?? "");
    if (!itemName) setPicked(null);
  }, [itemName]);

  const debouncedQuery = useDebouncedValue(query, 100);
  const { data } = useSearchResults(debouncedQuery);
  const options = data?.items ?? [];
  const { data: resolvedItem } = useItemSpriteGuess(itemName);
  const selected = picked && picked.name === (itemName ?? "") ? picked : null;

  return (
    <Combobox
      items={options}
      filter={null}
      autoComplete="none"
      inputValue={query}
      onInputValueChange={(value) => {
        setQuery(value);
        if (picked && value !== picked.name) setPicked(null);
        onSelect(value.trim() || null);
      }}
      itemToStringLabel={(item) => (item as SearchResultItem).name}
      value={selected}
      onValueChange={(item) => {
        if (!item) return;
        setPicked(item);
        setQuery(item.name);
        onSelect(item.name);
      }}
    >
      <ComboboxInput
        placeholder="e.g. Choice Band"
        showClear={query.length > 0}
        icon={
          resolvedItem?.sprite_url ? (
            <img
              src={resolvedItem.sprite_url}
              alt=""
              aria-hidden
              className="size-5 shrink-0 object-contain"
            />
          ) : undefined
        }
      />
      <ComboboxContent>
        <ComboboxEmpty>{query ? "No matching items." : "Start typing to search."}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(item: SearchResultItem) => (
              <ComboboxItem key={item.id} value={item}>
                {item.sprite_url && (
                  <img
                    src={item.sprite_url}
                    alt=""
                    aria-hidden
                    className="size-6 shrink-0 object-contain"
                  />
                )}
                <span className="truncate">{item.name}</span>
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
