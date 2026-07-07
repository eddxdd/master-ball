import { useState } from "react";
import { Link } from "react-router";
import { TypeBadge } from "@/components/TypeBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePokedexList } from "@/hooks/usePokedex";
import { ALL_TYPES } from "@/lib/pokemonTypes";

export function PokedexBrowser() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("");

  const { data: pokemon, isPending, isError } = usePokedexList({ search, type });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pokedex</h1>
        <p className="text-muted-foreground text-sm">
          Base stats, movepool, abilities, and type matchups for every Pokemon in the current format
          — including Mega Evolution stat/ability changes, shown before you ever mega evolve in a
          real match.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          items={{ __all__: "All types", ...Object.fromEntries(ALL_TYPES.map((t) => [t, t])) }}
          value={type || "__all__"}
          onValueChange={(v) => setType(v && v !== "__all__" ? v : "")}
        >
          <SelectTrigger className="w-40">
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
      </div>

      {isError && (
        <p className="text-destructive">Couldn't load the Pokedex. Is the backend running?</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {pokemon?.map((p) => (
          <Link
            key={p.id}
            to={`/pokedex/${p.id}`}
            className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-center transition-colors hover:bg-muted"
          >
            <img
              src={p.sprite_url}
              alt={p.name}
              className="h-16 w-16 object-contain"
              loading="lazy"
            />
            <span className="text-sm font-medium">{p.name}</span>
            <span className="text-muted-foreground text-xs">#{p.num}</span>
            <div className="flex gap-1">
              <TypeBadge type={p.type1} />
              {p.type2 && <TypeBadge type={p.type2} />}
            </div>
          </Link>
        ))}
      </div>

      {isPending && <p className="text-muted-foreground">Loading...</p>}
      {!isPending && pokemon?.length === 0 && (
        <p className="text-muted-foreground">No Pokemon match that search.</p>
      )}
    </div>
  );
}
