import { Sparkles } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { useItemSpriteGuess } from "@/components/ItemCombobox";
import { PokeballWatermark } from "@/components/PokeballWatermark";
import { PokemonSprite } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { useMetaStats, usePokemonProfile } from "@/hooks/usePokedex";
import { typeCardBackground } from "@/lib/typeColors";
import { cn } from "@/lib/utils";

export type PokemonShowcaseCardProps = {
  speciesId: string;
  /** Click target — defaults to the species Pokedex page. */
  to?: string;
  ariaLabel?: string;
  fallbackName?: string;
  /** When set, skips the meta ladder lookup for that field. */
  ability?: string;
  moves?: string[];
  itemName?: string;
  /** Fill ability/moves/item from OU usage stats when overrides are omitted. */
  useMetaSet?: boolean;
  compact?: boolean;
  className?: string;
  /** Remount key for the Pokedex promo swap animation. */
  swapKey?: number | string;
  children?: ReactNode;
};

/**
 * Type-gradient Pokemon card used by the Pokedex Team Builder promo and
 * Professor chat — sprite-forward, same language as roster slots.
 */
export function PokemonShowcaseCard({
  speciesId,
  to,
  ariaLabel,
  fallbackName,
  ability: abilityOverride,
  moves: movesOverride,
  itemName: itemOverride,
  useMetaSet = false,
  compact = false,
  className,
  swapKey,
  children,
}: PokemonShowcaseCardProps) {
  const { data: profile, isError } = usePokemonProfile(speciesId);
  const needsMeta = useMetaSet && (!abilityOverride || !movesOverride || !itemOverride);
  const { data: meta } = useMetaStats(needsMeta ? speciesId : undefined);

  const name = profile?.name ?? fallbackName ?? speciesId;
  const ability = abilityOverride ?? meta?.top_abilities[0]?.name ?? profile?.abilities[0]?.name;
  const moves = movesOverride ?? meta?.top_moves.slice(0, 4).map((m) => m.name) ?? [];
  const itemName = itemOverride ?? meta?.top_items[0]?.name;
  const metaItemSprite = !itemOverride ? meta?.top_items[0]?.sprite_url : undefined;
  const { data: itemDetail } = useItemSpriteGuess(itemOverride ?? itemName);
  const itemSprite = metaItemSprite ?? itemDetail?.sprite_url ?? null;

  const typeBg = profile
    ? typeCardBackground(profile.type1, profile.type2)
    : typeCardBackground("Normal");

  if (isError) return null;

  const href = to ?? `/pokedex/${speciesId}`;

  return (
    <Link
      to={href}
      aria-label={ariaLabel ?? `Open ${name} in the Pokedex`}
      className={cn(
        "motion-lift team-promo-card group relative flex items-stretch overflow-hidden rounded-3xl px-4 py-3.5 text-white shadow-[0_12px_40px_rgb(0_0_0_/_0.28)]",
        "[background-image:var(--team-promo-bg)]",
        "transition-[filter,box-shadow] duration-500 hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        compact ? "min-h-[7.5rem] my-2 not-prose" : "min-h-[9.5rem]",
        className,
      )}
      style={{ "--team-promo-bg": typeBg } as CSSProperties}
      data-swap={swapKey}
    >
      <div
        key={swapKey !== undefined ? `copy-${swapKey}` : undefined}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-2 pr-2",
          swapKey !== undefined && "team-promo-swap",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "truncate font-bold leading-tight tracking-tight",
              compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
            )}
          >
            {name}
          </span>
          {itemSprite && (
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f8d030] to-[#c9a227] p-[2px] shadow-[0_4px_12px_rgb(0_0_0_/_0.4)] ring-2 ring-white/30"
              title={itemName}
            >
              <div className="flex size-full items-center justify-center rounded-full bg-[#1a1428]">
                <img src={itemSprite} alt="" className="size-5 object-contain" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            {profile ? (
              <>
                <TypeBadge type={profile.type1} linkable={false} />
                {profile.type2 && <TypeBadge type={profile.type2} linkable={false} />}
              </>
            ) : (
              <span className="h-5 w-16 animate-pulse rounded-full bg-white/20" />
            )}
          </div>
          {ability && (
            <p className="flex items-center gap-1.5 text-xs text-white/90">
              <Sparkles className="size-3.5 shrink-0 text-[#f8d030]" aria-hidden />
              <span className="truncate">
                <span className="text-white/65">Ability</span>{" "}
                <span className="font-semibold">{ability}</span>
              </span>
            </p>
          )}
        </div>

        {moves.length > 0 && (
          <ul className="flex flex-wrap gap-1 text-xs">
            {moves.map((move) => (
              <li
                key={move}
                className="rounded-full bg-black/25 px-2 py-0.5 font-medium text-white/95 ring-1 ring-white/15"
              >
                {move}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[48%] overflow-hidden"
      >
        <PokeballWatermark className="-top-8 -right-10 h-48 w-48 text-white/20 sm:h-56 sm:w-56" />
      </div>

      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center justify-center self-center",
          compact ? "w-[5.5rem] sm:w-28" : "w-[6.5rem] sm:w-32",
        )}
      >
        {profile ? (
          <div
            key={swapKey !== undefined ? `sprite-${swapKey}` : undefined}
            className={cn(swapKey !== undefined && "team-promo-sprite")}
          >
            <PokemonSprite
              spriteUrl={profile.sprite_url}
              name={profile.name}
              preferHome
              artworkNum={profile.forme ? undefined : profile.num}
              className={cn(
                "object-contain drop-shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]",
                compact ? "size-20 sm:size-24" : "size-24 sm:size-28",
              )}
            />
          </div>
        ) : (
          <div
            className={cn(
              "animate-pulse rounded-full bg-white/10",
              compact ? "size-20 sm:size-24" : "size-24 sm:size-28",
            )}
          />
        )}
      </div>

      {children}
    </Link>
  );
}

const POKEDEX_LINK_RE = /\]\(\/pokedex\/([a-z0-9]+)\)/gi;

/** Species ids referenced by `/pokedex/{id}` markdown links, in order. */
export function extractPokedexSpeciesIds(content: string, limit = 6): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const match of content.matchAll(POKEDEX_LINK_RE)) {
    const id = match[1]?.toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Drop bare Showdown/PokeAPI sprite images — the showcase card replaces them. */
export function stripPokemonSpriteMarkdown(content: string): string {
  return content
    .replace(
      /!\[[^\]]*\]\((https?:\/\/[^)]*(?:play\.pokemonshowdown\.com|raw\.githubusercontent\.com\/PokeAPI)[^)]*)\)\s*/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
