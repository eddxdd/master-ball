import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PokeballWatermark } from "@/components/PokeballWatermark";
import { SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { typeCardBackground } from "@/lib/typeColors";
import { cn } from "@/lib/utils";
import type { PokemonSummary } from "@/types/pokemon";

/** First paint + each scroll page — keeps DOM/image work bounded while the
 * user can already browse the top of the list. */
const PAGE_SIZE = 36;

/** The Pokedex browser's card grid, pulled out for reuse on move/ability/type
 * detail pages ("every Pokemon that matches this") — see
 * Docs/frontend/README.md's cross-linked reference pages section.
 *
 * Mobile: wide type-colored horizontal cards (dex #, name, type pills, sprite).
 * sm+: compact bordered grid cards.
 * Renders in pages and appends as you scroll so ~1000 species never mount at once. */
export function PokemonSummaryGrid({ pokemon }: { pokemon: PokemonSummary[] }) {
  const listKey = `${pokemon.length}:${pokemon[0]?.id ?? ""}:${pokemon.at(-1)?.id ?? ""}`;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevKey, setPrevKey] = useState(listKey);
  if (prevKey !== listKey) {
    setPrevKey(listKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visible = pokemon.slice(0, visibleCount);
  const hasMore = visibleCount < pokemon.length;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, pokemon.length));
        }
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pokemon.length, visibleCount]);

  if (pokemon.length === 0) {
    return <p className="text-muted-foreground text-sm">No Pokemon match.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((p, index) => (
          <PokemonSummaryCard key={p.id} pokemon={p} priority={index < 6} />
        ))}
      </div>
      {hasMore ? (
        <div
          ref={sentinelRef}
          className="flex h-10 items-center justify-center text-xs text-muted-foreground"
          aria-hidden
        >
          Loading more…
        </div>
      ) : null}
    </div>
  );
}

function PokemonSummaryCard({
  pokemon: p,
  priority = false,
}: {
  pokemon: PokemonSummary;
  priority?: boolean;
}) {
  const dexNum = `#${String(p.num).padStart(3, "0")}`;

  return (
    <Link
      to={`/pokedex/${p.id}`}
      className={cn(
        "motion-lift relative flex min-h-28 items-center overflow-hidden rounded-3xl px-5 py-4 text-white",
        "[background-image:var(--pokedex-card-bg)]",
        "sm:min-h-0 sm:flex-col sm:items-center sm:gap-1 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-3 sm:text-center sm:text-foreground sm:[background-image:none]",
      )}
      style={
        {
          "--pokedex-card-bg": typeCardBackground(p.type1, p.type2),
        } as CSSProperties
      }
    >
      {/* Mobile: number + name + type pills on the left */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-2 sm:hidden">
        <span className="text-sm font-medium text-white/75">{dexNum}</span>
        <span className="truncate text-2xl font-bold leading-tight tracking-tight">{p.name}</span>
        <div className="flex flex-wrap gap-1.5">
          <TypeBadge type={p.type1} linkable={false} />
          {p.type2 && <TypeBadge type={p.type2} linkable={false} />}
        </div>
      </div>

      {/* Faint Pokeball watermark behind the sprite (mobile) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[55%] overflow-hidden sm:hidden"
      >
        <PokeballWatermark className="-top-6 -right-8 h-44 w-44 text-white/25" />
      </div>

      <SpriteImg
        spriteUrl={p.sprite_url}
        name={p.name}
        preferHome
        priority={priority}
        // Official artwork is national-dex keyed — only safe for base formes
        // (same rule as PokemonDetail's hero). Mega/Gmax keep Showdown sprites.
        artworkNum={p.forme ? undefined : p.num}
        className="relative z-10 -my-1 -mr-1 size-28 shrink-0 object-contain drop-shadow-md sm:my-0 sm:mr-0 sm:size-16 sm:drop-shadow-none"
        placeholderClassName="relative z-10 size-28 text-2xl sm:size-16 sm:text-lg"
      />

      {/* Desktop: name / dex / type badges under the sprite */}
      <span className="relative z-10 hidden text-sm font-medium sm:inline">{p.name}</span>
      <span className="relative z-10 hidden text-xs text-muted-foreground sm:inline">{dexNum}</span>
      <div className="relative z-10 hidden gap-1 sm:flex">
        <TypeBadge type={p.type1} linkable={false} />
        {p.type2 && <TypeBadge type={p.type2} linkable={false} />}
      </div>
    </Link>
  );
}
