import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { LoadingState } from "@/components/LoadingState";
import { PokemonSummaryGrid } from "@/components/PokemonSummaryGrid";
import { Seo } from "@/components/Seo";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePokedexList } from "@/hooks/usePokedex";
import { GENERATIONS } from "@/lib/generations";
import { ALL_TYPES } from "@/lib/pokemonTypes";
import {
  AbilitiesCatalogPanel,
  ItemsCatalogPanel,
  MovesCatalogPanel,
} from "@/pages/pokedex/PokedexCatalogLists";
import { PokedexTeamBuilderPromo } from "@/pages/pokedex/PokedexTeamBuilderPromo";
import type { PokemonSummary } from "@/types/pokemon";

/** The "All" generation tab's value — kept distinct from any real generation
 * number (1-9) so it round-trips cleanly through the Tabs component's
 * string-only value without colliding with `String(generationNumber)`. */
const ALL_GENERATIONS = "all";

const SECTIONS = [
  { value: "pokemon", label: "Pokemon" },
  { value: "moves", label: "Moves" },
  { value: "abilities", label: "Abilities" },
  { value: "items", label: "Items" },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

function isSection(value: string | null): value is Section {
  return SECTIONS.some((s) => s.value === value);
}

function filterPokedex(
  all: PokemonSummary[],
  opts: { search: string; type: string; generation?: number },
): PokemonSummary[] {
  let list = all;

  if (opts.generation !== undefined) {
    const gen = GENERATIONS.find((g) => g.number === opts.generation);
    if (gen) {
      list = list.filter((p) => p.num >= gen.start && p.num <= gen.end);
    }
  }

  if (opts.type) {
    list = list.filter((p) => p.type1 === opts.type || p.type2 === opts.type);
  }

  const q = opts.search.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.id.includes(q));
  }

  return list;
}

function PokemonBrowserPanel() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("");
  const [generationTab, setGenerationTab] = useState<string>(ALL_GENERATIONS);

  const generation = generationTab === ALL_GENERATIONS ? undefined : Number(generationTab);
  const activeGeneration = GENERATIONS.find((g) => g.number === generation);
  const debouncedSearch = useDebouncedValue(search, 150);

  const { data: allPokemon, isPending, isError } = usePokedexList({});

  const pokemon = useMemo(() => {
    if (!allPokemon) return undefined;
    return filterPokedex(allPokemon, {
      search: debouncedSearch,
      type,
      generation,
    });
  }, [allPokemon, debouncedSearch, type, generation]);

  return (
    <div className="flex flex-col gap-4" id="pokedex-pokemon-panel">
      <Tabs value={generationTab} onValueChange={(value) => setGenerationTab(value as string)}>
        <div id="pokedex-filters" className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value={ALL_GENERATIONS}>All</TabsTrigger>
            {GENERATIONS.map((g) => (
              <TabsTrigger key={g.number} value={String(g.number)} title={g.region}>
                Gen {g.number}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={generationTab} className="flex flex-col gap-4 pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-xs"
            />
            <Select
              items={{ __all__: "All types", ...Object.fromEntries(ALL_TYPES.map((t) => [t, t])) }}
              value={type || "__all__"}
              onValueChange={(v) => setType(v && v !== "__all__" ? v : "")}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                {ALL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pokemon && (
              <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
                {pokemon.length} Pokemon
                {activeGeneration
                  ? ` · ${activeGeneration.region} (Gen ${activeGeneration.number})`
                  : ""}
              </span>
            )}
          </div>

          {isError && (
            <p className="text-destructive">Couldn't load the Pokedex. Is the backend running?</p>
          )}

          {pokemon && <PokemonSummaryGrid pokemon={pokemon} />}

          {isPending && !pokemon && <LoadingState label="Loading Pokedex" size="inline" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function PokedexBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("tab");
  const section: Section = isSection(sectionParam) ? sectionParam : "pokemon";

  const setSection = (next: string) => {
    const value = isSection(next) ? next : "pokemon";
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (value === "pokemon") params.delete("tab");
        else params.set("tab", value);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <div id="pokedex-page" className="flex flex-col gap-4">
      <Seo
        title="Pokedex"
        description="Browse Pokemon, moves, abilities, and items — base stats, movepools, type matchups, and held-item data for competitive play."
      />
      <div id="pokedex-header">
        <h1 className="text-2xl font-semibold">Pokedex</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Pokemon, moves, abilities, and items in one place — the same reference data that powers
          Team Builder and the Professor.
        </p>
      </div>

      <PokedexTeamBuilderPromo />

      <Tabs value={section} onValueChange={setSection}>
        <div id="pokedex-section-tabs" className="overflow-x-auto">
          <TabsList>
            {SECTIONS.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="pokemon" id="pokedex-results" className="pt-2">
          <PokemonBrowserPanel />
        </TabsContent>
        <TabsContent value="moves" className="pt-2">
          <MovesCatalogPanel />
        </TabsContent>
        <TabsContent value="abilities" className="pt-2">
          <AbilitiesCatalogPanel />
        </TabsContent>
        <TabsContent value="items" className="pt-2">
          <ItemsCatalogPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
