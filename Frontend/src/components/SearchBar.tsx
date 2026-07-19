import { useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SpriteImg } from "@/components/PokemonSprite";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSearchResults } from "@/hooks/useSearch";
import { fetchSearchResults } from "@/lib/searchApi";
import { cn } from "@/lib/utils";
import type { SearchResultItem, SearchResults } from "@/types/search";

type EnrichedResult = SearchResultItem & { path: string };

type ResultGroup = {
  value: string;
  items: EnrichedResult[];
};

/** Maps each SearchResults key to its section heading + the route prefix used
 * to navigate on selection (e.g. a "pokemon" hit at id "charizard" navigates
 * to "/pokedex/charizard") — see Docs/frontend/README.md's "Global search"
 * section. */
const GROUPS: { key: keyof SearchResults; label: string; path: string }[] = [
  { key: "pokemon", label: "Pokemon", path: "/pokedex" },
  { key: "moves", label: "Moves", path: "/moves" },
  { key: "abilities", label: "Abilities", path: "/abilities" },
  { key: "items", label: "Items", path: "/items" },
  { key: "types", label: "Types", path: "/types" },
];

function groupsFromResults(data: SearchResults): ResultGroup[] {
  return GROUPS.map((group) => ({
    value: group.label,
    items: data[group.key].map((item) => ({ ...item, path: group.path })),
  })).filter((group) => group.items.length > 0);
}

/** Exact name/id match, else first Pokemon hit, else first result overall. */
function pickBestMatch(groups: ResultGroup[], q: string): EnrichedResult | null {
  const all = groups.flatMap((group) => group.items);
  if (all.length === 0) return null;
  const lower = q.toLowerCase();
  const exact = all.find(
    (item) => item.name.toLowerCase() === lower || item.id.toLowerCase() === lower,
  );
  if (exact) return exact;
  const pokemon = groups.find((group) => group.value === "Pokemon")?.items[0];
  return pokemon ?? all[0] ?? null;
}

/**
 * Global header search — one box that finds Pokemon, moves, abilities,
 * items, and types, grouped by kind, and navigates to the matching detail
 * page on selection. Built on @base-ui/react's Combobox primitive (already
 * vendored into src/components/ui/combobox.tsx), not a hand-rolled dropdown
 * — it gets full keyboard navigation (arrows/Enter/Escape) and ARIA combobox
 * semantics for free. Filtering happens server-side (GET /search), so the
 * Combobox's own filtering is disabled (`filter={null}`, `autoComplete="none"`)
 * — the `items` passed in are always exactly what should be shown.
 *
 * Enter without an arrow-highlighted row jumps to the best match for the
 * typed query (exact name, else top Pokemon, else first hit).
 */
export function SearchBar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const { data } = useSearchResults(debouncedQuery);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** Set when a list item is chosen so Enter's fallback doesn't also navigate. */
  const selectedViaListRef = useRef(false);

  const groups: ResultGroup[] = useMemo(() => (data ? groupsFromResults(data) : []), [data]);

  const trimmedQuery = query.trim();

  const goToBestMatch = async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) return;
    const results = await queryClient.fetchQuery({
      queryKey: ["search", q],
      queryFn: () => fetchSearchResults(q),
      staleTime: 30_000,
    });
    const best = pickBestMatch(groupsFromResults(results), q);
    if (!best) return;
    navigate(`${best.path}/${best.id}`);
    setQuery("");
  };

  return (
    <Combobox
      items={groups}
      filter={null}
      autoComplete="none"
      inputValue={query}
      onInputValueChange={(value) => setQuery(value)}
      itemToStringLabel={(item) => (item as EnrichedResult).name}
      // Always controlled back to `null` — this search box never "holds" a
      // selection the way a normal combobox would (there's nothing to keep
      // selected once you've navigated away), which also stops Base UI from
      // re-filling the input with the picked item's label after the clear
      // below.
      value={null as EnrichedResult | null}
      onValueChange={(item) => {
        if (!item) return;
        selectedViaListRef.current = true;
        navigate(`${item.path}/${item.id}`);
        setQuery("");
      }}
    >
      <ComboboxInput
        icon={<SearchIcon className="size-4" />}
        showTrigger={false}
        showClear={query.length > 0}
        placeholder="Search Pokemon, moves, items..."
        aria-label="Search Pokemon, moves, abilities, items, and types"
        className={cn("w-full md:w-72", className)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const q = query.trim();
          if (!q) return;
          selectedViaListRef.current = false;
          // Let the combobox select a highlighted row first; if nothing was
          // selected, fall back to the best match for what was typed.
          window.setTimeout(() => {
            if (selectedViaListRef.current) return;
            void goToBestMatch(q);
          }, 0);
        }}
      />
      <ComboboxContent
        align="start"
        className="min-w-[min(100vw-2rem,var(--anchor-width))] w-(--anchor-width) max-w-[min(100vw-2rem,36rem)]"
      >
        <ComboboxEmpty>
          {trimmedQuery ? "No matches found." : "Start typing to search."}
        </ComboboxEmpty>
        <ComboboxList className="max-h-[min(60vh,22rem)]">
          {groups.map((group) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item: EnrichedResult) => (
                  <ComboboxItem key={`${item.path}/${item.id}`} value={item} className="gap-2.5">
                    {item.sprite_url && (
                      <SpriteImg
                        spriteUrl={item.sprite_url}
                        name={item.name}
                        className="size-7 shrink-0 object-contain"
                        placeholderClassName="size-7 shrink-0 text-[10px]"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{item.name}</span>
                      {item.subtitle && (
                        <span className="truncate text-muted-foreground text-xs">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
