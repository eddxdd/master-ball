import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { LoadingState } from "@/components/LoadingState";
import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { TypeBadge } from "@/components/TypeBadge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useItemsList } from "@/hooks/useItems";
import { useAbilitiesList, useMovesList } from "@/hooks/usePokedex";
import { ALL_TYPES } from "@/lib/pokemonTypes";
import { cn } from "@/lib/utils";
import type { ItemSummary } from "@/types/items";
import type { AbilitySummary, MoveSummary } from "@/types/pokemon";

const PAGE_SIZE = 48;
const MOVE_CATEGORIES = ["Physical", "Special", "Status"] as const;

function usePagedSlice<T>(items: T[]) {
  const listKey = items.length;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevKey, setPrevKey] = useState(listKey);
  if (prevKey !== listKey) {
    setPrevKey(listKey);
    setVisibleCount(PAGE_SIZE);
  }
  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, items.length));
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  return { visible, hasMore, sentinelRef };
}

function formatCategory(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ScrollSentinel({
  hasMore,
  sentinelRef,
}: {
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  if (!hasMore) return null;
  return (
    <div
      ref={sentinelRef}
      className="flex h-10 items-center justify-center text-xs text-muted-foreground"
      aria-hidden
    >
      Loading more…
    </div>
  );
}

/** Moves catalog — search + type/category filters. */
export function MovesCatalogPanel() {
  const { data, isPending, isError } = useMovesList();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = debouncedSearch.trim().toLowerCase();
    return data.filter((m) => {
      if (type && m.type !== type) return false;
      if (category && m.category !== category) return false;
      if (q && !m.name.toLowerCase().includes(q) && !m.id.includes(q)) return false;
      return true;
    });
  }, [data, debouncedSearch, type, category]);

  const { visible, hasMore, sentinelRef } = usePagedSlice(filtered);

  return (
    <div className="flex flex-col gap-4" id="pokedex-moves-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search moves..."
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
        <Select
          items={{
            __all__: "All categories",
            ...Object.fromEntries(MOVE_CATEGORIES.map((c) => [c, c])),
          }}
          value={category || "__all__"}
          onValueChange={(v) => setCategory(v && v !== "__all__" ? v : "")}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {MOVE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
          {filtered.length} moves
        </span>
      </div>

      {isError && <p className="text-destructive">Couldn't load moves. Is the backend running?</p>}
      {isPending && !data && <LoadingState label="Loading moves" size="inline" />}
      {data && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No moves match.</p>
      )}
      {data && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((move) => (
              <MoveCatalogCard key={move.id} move={move} />
            ))}
          </ul>
          <ScrollSentinel hasMore={hasMore} sentinelRef={sentinelRef} />
        </div>
      )}
    </div>
  );
}

function MoveCatalogCard({ move }: { move: MoveSummary }) {
  return (
    <li>
      <Link
        to={`/moves/${move.id}`}
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition",
          "hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-tight">{move.name}</span>
          <MoveCategoryBadge category={move.category} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={move.type} linkable={false} />
          <span className="font-mono text-xs text-muted-foreground">
            {move.base_power != null ? `${move.base_power} BP` : "— BP"}
            {" · "}
            {move.accuracy != null ? `${move.accuracy}%` : "—"}
            {" · "}
            {move.pp} PP
          </span>
        </div>
        {move.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{move.description}</p>
        )}
      </Link>
    </li>
  );
}

/** Abilities catalog. */
export function AbilitiesCatalogPanel() {
  const { data, isPending, isError } = useAbilitiesList();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return data;
    return data.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q));
  }, [data, debouncedSearch]);

  const { visible, hasMore, sentinelRef } = usePagedSlice(filtered);

  return (
    <div className="flex flex-col gap-4" id="pokedex-abilities-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search abilities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
          {filtered.length} abilities
        </span>
      </div>

      {isError && (
        <p className="text-destructive">Couldn't load abilities. Is the backend running?</p>
      )}
      {isPending && !data && <LoadingState label="Loading abilities" size="inline" />}
      {data && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No abilities match.</p>
      )}
      {data && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((ability) => (
              <AbilityCatalogCard key={ability.id} ability={ability} />
            ))}
          </ul>
          <ScrollSentinel hasMore={hasMore} sentinelRef={sentinelRef} />
        </div>
      )}
    </div>
  );
}

function AbilityCatalogCard({ ability }: { ability: AbilitySummary }) {
  return (
    <li>
      <Link
        to={`/abilities/${ability.id}`}
        className={cn(
          "flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition",
          "hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        <span className="font-semibold leading-tight">{ability.name}</span>
        <p className="line-clamp-3 text-xs text-muted-foreground">
          {ability.description ?? "No description available."}
        </p>
      </Link>
    </li>
  );
}

/** Items catalog. */
export function ItemsCatalogPanel() {
  const { data, isPending, isError } = useItemsList();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);

  const categories = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((i) => i.category))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = debouncedSearch.trim().toLowerCase();
    return data.filter((item) => {
      if (category && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q) && !item.id.includes(q)) return false;
      return true;
    });
  }, [data, debouncedSearch, category]);

  const { visible, hasMore, sentinelRef } = usePagedSlice(filtered);

  return (
    <div className="flex flex-col gap-4" id="pokedex-items-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select
          items={{
            __all__: "All categories",
            ...Object.fromEntries(categories.map((c) => [c, formatCategory(c)])),
          }}
          value={category || "__all__"}
          onValueChange={(v) => setCategory(v && v !== "__all__" ? v : "")}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {formatCategory(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">
          {filtered.length} items
        </span>
      </div>

      {isError && <p className="text-destructive">Couldn't load items. Is the backend running?</p>}
      {isPending && !data && <LoadingState label="Loading items" size="inline" />}
      {data && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No items match.</p>
      )}
      {data && filtered.length > 0 && (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <ItemCatalogCard key={item.id} item={item} />
            ))}
          </ul>
          <ScrollSentinel hasMore={hasMore} sentinelRef={sentinelRef} />
        </div>
      )}
    </div>
  );
}

function ItemCatalogCard({ item }: { item: ItemSummary }) {
  return (
    <li>
      <Link
        to={`/items/${item.id}`}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition",
          "hover:border-primary/40 hover:bg-muted/40",
        )}
      >
        {item.sprite_url ? (
          <img
            src={item.sprite_url}
            alt=""
            className="size-10 shrink-0 object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="size-10 shrink-0 rounded-md bg-muted" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{item.name}</p>
          <p className="text-xs text-muted-foreground">{formatCategory(item.category)}</p>
        </div>
      </Link>
    </li>
  );
}
