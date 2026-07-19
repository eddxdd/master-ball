import { useEffect, useMemo, useState } from "react";
import { SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { usePokedexList, usePokemonProfile } from "@/hooks/usePokedex";
import type { PokemonSummary } from "@/types/pokemon";

/** Cap rendered rows so opening the dropdown doesn't mount ~1000 sprites. */
const MAX_VISIBLE = 50;

function profileToSummary(profile: {
  id: string;
  name: string;
  num: number;
  type1: string;
  type2: string | null;
  sprite_url: string;
  forme: string | null;
}): PokemonSummary {
  return {
    id: profile.id,
    name: profile.name,
    num: profile.num,
    type1: profile.type1,
    type2: profile.type2,
    sprite_url: profile.sprite_url,
    forme: profile.forme,
  };
}

/**
 * A sprite-forward species picker — the Team Builder's visual replacement
 * for `PokemonPicker`'s plain `<datalist>` (still used by the Calculator).
 * Built on the same `Combobox` primitive as `SearchBar`, but scoped to
 * `/pokedex` results only and *does* hold its selection (the input keeps
 * showing the picked name), unlike `SearchBar`'s "always resets" pattern.
 *
 * Filters the full cached pokedex client-side (no per-keystroke round trip)
 * so the dropdown feels instant once the one-time list fetch is warm.
 */
export function SpeciesCombobox({
  speciesId,
  onSelect,
}: {
  speciesId: string;
  onSelect: (option: PokemonSummary | null) => void;
}) {
  const { data: allPokemon = [], isLoading } = usePokedexList({});
  // Fallback for species applied externally before the list is warm (or an
  // id that somehow isn't in the list) — not on the hot pick path.
  const { data: currentProfile } = usePokemonProfile(speciesId || undefined);
  // Sticky pick so `value` is non-null the instant you click a row — deriving
  // selection only from `usePokemonProfile` used to flash empty while that
  // request was in flight (the "click and it disappears" bug).
  const [picked, setPicked] = useState<PokemonSummary | null>(null);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);

  const selected = useMemo((): PokemonSummary | null => {
    if (!speciesId) return null;
    if (picked?.id === speciesId) return picked;
    const fromList = allPokemon.find((p) => p.id === speciesId);
    if (fromList) return fromList;
    if (currentProfile?.id === speciesId) return profileToSummary(currentProfile);
    return null;
  }, [speciesId, picked, allPokemon, currentProfile]);

  // External roster changes (Professor apply / suggestions) — drop mid-type
  // state so the new species label can take over the input.
  useEffect(() => {
    setDirty(false);
    if (!speciesId) {
      setPicked(null);
      setQuery("");
    }
  }, [speciesId]);

  // Fill label/sprite from the cached list (or profile fallback) once data
  // is warm — skipped while the user is mid-type so keystrokes aren't
  // overwritten when the list finishes loading.
  useEffect(() => {
    if (!speciesId || dirty) return;
    const fromList = allPokemon.find((p) => p.id === speciesId);
    if (fromList) {
      setPicked(fromList);
      setQuery(fromList.name);
      return;
    }
    if (currentProfile?.id === speciesId) {
      const summary = profileToSummary(currentProfile);
      setPicked(summary);
      setQuery(summary.name);
    }
  }, [speciesId, allPokemon, currentProfile, dirty]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const browsing = Boolean(selected && !dirty);
    if (!q || browsing) return allPokemon.slice(0, MAX_VISIBLE);
    const compact = q.replace(/[^a-z0-9]/g, "");
    return allPokemon
      .filter(
        (p) => p.name.toLowerCase().includes(q) || (compact.length > 0 && p.id.includes(compact)),
      )
      .slice(0, MAX_VISIBLE);
  }, [allPokemon, query, selected, dirty]);

  const inputValue = dirty ? query : (selected?.name ?? query);

  return (
    <Combobox
      items={options}
      filter={null}
      autoComplete="none"
      inputValue={inputValue}
      onInputValueChange={(value) => {
        setDirty(true);
        setQuery(value);
      }}
      itemToStringLabel={(item) => (item as PokemonSummary).name}
      value={selected}
      onValueChange={(item) => {
        if (!item) {
          setPicked(null);
          setQuery("");
          setDirty(false);
          onSelect(null);
          return;
        }
        setPicked(item);
        setQuery(item.name);
        setDirty(false);
        onSelect(item);
      }}
    >
      <ComboboxInput
        placeholder="Search Pokemon..."
        showClear={inputValue.length > 0}
        icon={
          selected ? (
            <SpriteImg
              spriteUrl={selected.sprite_url}
              name={selected.name}
              className="size-5 shrink-0 object-contain"
              placeholderClassName="size-5 shrink-0 text-[10px]"
            />
          ) : undefined
        }
      />
      <ComboboxContent>
        <ComboboxEmpty>{isLoading ? "Loading Pokemon..." : "No Pokemon found."}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(item: PokemonSummary) => (
              <ComboboxItem key={item.id} value={item}>
                <SpriteImg
                  spriteUrl={item.sprite_url}
                  name={item.name}
                  className="size-8 shrink-0 object-contain"
                  placeholderClassName="size-8 shrink-0 text-xs"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.name}</span>
                  <span className="flex gap-1">
                    <TypeBadge type={item.type1} linkable={false} />
                    {item.type2 && <TypeBadge type={item.type2} linkable={false} />}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
