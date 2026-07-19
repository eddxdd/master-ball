import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Turns a display name into the hyphenated slug Showdown's sprite
 * filenames tend to use — strips accents ("Flabébé" -> "flabebe") and
 * apostrophes/periods entirely rather than hyphenating them ("Sirfetch'd"
 * -> "sirfetchd", not "sirfetch-d", which 404s), and collapses "Mega X"/"Mega
 * Y" to "megax"/"megay" (Showdown never hyphenates the forme letter). */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['.’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-mega-([xy])$/, "-mega$1");
}

/** Showdown's "dex" sprite set (the one `sprite_url` is built from) is
 * inconsistent about hyphenating forme suffixes, and doesn't have Gimmighoul
 * Gigantamax forms or several Gen 8/9 species *at all* — but its "home" set
 * (Pokemon HOME's official render style) covers almost everything "dex" is
 * missing. So beyond just re-hyphenating the filename, also try the "home"
 * set, and progressively drop trailing forme segments ("raticate-alola-totem"
 * -> "raticate-alola" -> "raticate") across both sets — a Totem/cosmetic
 * variant with no dedicated art falls back to its nearest real relative
 * instead of a text placeholder. Ordered most-to-least specific.
 *
 * When `artworkNum` is set (detail heroes), PokeAPI official artwork leads —
 * those assets are ~475px and stay sharp at large sizes; Showdown dex/home
 * sprites are ~100px and look soft when scaled up. Artwork is keyed by
 * national dex number, so only use it for default formes. */
function buildSpriteCandidates(
  spriteUrl: string,
  name: string,
  opts?: { artworkNum?: number; preferHome?: boolean },
): string[] {
  const match = spriteUrl.match(/^(.*\/)dex\/([^/]+)\.png$/);
  const sets =
    opts?.preferHome || opts?.artworkNum ? (["home", "dex"] as const) : (["dex", "home"] as const);

  const showdown = (() => {
    if (!match) return [spriteUrl];
    const [, base, idFilename] = match;

    const segments = slugify(name).split("-").filter(Boolean);
    const tiers = segments.map((_, i) => segments.slice(0, segments.length - i).join("-"));
    // Some species names are themselves hyphenated ("Kommo-o") but Showdown's
    // own ids drop the hyphen entirely ("kommoo") — try both per tier.
    const joinedTiers = tiers.map((t) => t.replace(/-/g, ""));

    const filenames = [idFilename, ...tiers, ...joinedTiers].filter(
      (filename, i, all) => filename && all.indexOf(filename) === i,
    );

    return filenames.flatMap((filename) => sets.map((set) => `${base}${set}/${filename}.png`));
  })();

  if (opts?.artworkNum) {
    return [
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${opts.artworkNum}.png`,
      ...showdown,
    ];
  }

  return showdown;
}

/** Shared building block behind every Pokemon sprite in the app — walks
 * `buildSpriteCandidates`'s fallback chain on each 404, and finally renders
 * an initial-letter placeholder instead of a broken-image icon once every
 * candidate is exhausted. Sizing is fully caller-controlled via `className`/`placeholderClassName`
 * so this can back both the fixed-size `PokemonSprite` and dense grids
 * (PokemonSummaryGrid, SearchBar's dropdown, FeaturedPokemonCard) that want
 * their own smaller sizing. */
export function SpriteImg({
  spriteUrl,
  name,
  className,
  placeholderClassName,
  priority = false,
  artworkNum,
  preferHome = false,
  onReady,
}: {
  spriteUrl: string;
  name: string;
  className?: string;
  placeholderClassName?: string;
  /** Eager-load + high fetch priority for above-the-fold heroes. */
  priority?: boolean;
  /** National dex number — when set, try PokeAPI official artwork first. */
  artworkNum?: number;
  /** Prefer Showdown's "home" set over "dex" (sharper at medium sizes). */
  preferHome?: boolean;
  /** Fires once a candidate paints (or the letter placeholder is shown). */
  onReady?: () => void;
}) {
  // Reset the fallback attempt whenever the target sprite changes (e.g. the
  // user picks a different Pokemon in the same form) rather than getting
  // stuck showing a stale placeholder from the previously selected species.
  const candidateKey = `${spriteUrl}:${artworkNum ?? ""}:${preferHome}`;
  const [state, setState] = useState({ key: candidateKey, attempt: 0 });
  if (state.key !== candidateKey) {
    setState({ key: candidateKey, attempt: 0 });
  }
  const attempt = state.key === candidateKey ? state.attempt : 0;
  const setAttempt = (next: number) => setState({ key: candidateKey, attempt: next });

  const candidates = useMemo(
    () => buildSpriteCandidates(spriteUrl, name, { artworkNum, preferHome }),
    [spriteUrl, name, artworkNum, preferHome],
  );
  const candidateUrl = candidates[attempt];

  const imgRef = useRef<HTMLImageElement>(null);
  const readyForUrl = useRef<string | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const markReady = (key: string) => {
    if (readyForUrl.current === key) return;
    readyForUrl.current = key;
    onReadyRef.current?.();
  };

  // Cached images often skip a late onLoad — mark them ready on mount too.
  useEffect(() => {
    readyForUrl.current = null;
    if (!candidateUrl) {
      const key = `placeholder:${spriteUrl}`;
      readyForUrl.current = key;
      onReadyRef.current?.();
      return;
    }
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      readyForUrl.current = candidateUrl;
      onReadyRef.current?.();
    }
  }, [candidateUrl, spriteUrl]);

  if (candidateUrl) {
    return (
      <img
        ref={imgRef}
        key={candidateUrl}
        src={candidateUrl}
        alt={name}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={className}
        onLoad={() => markReady(candidateUrl)}
        onError={() => setAttempt(attempt + 1)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
        placeholderClassName ?? className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** The one canonical size for "a single Pokemon's sprite, on its own" —
 * used everywhere a form/card focuses on exactly one Pokemon (the Pokedex
 * detail header, evolution/Mega nodes, the Team Builder's slot editor, the
 * Damage Calculator's config forms) so that size can never silently drift
 * between pages. Deliberately not used by dense multi-item grids/lists
 * (PokemonSummaryGrid, SearchBar's dropdown, FeaturedPokemonCard) — those
 * are a different UI pattern (many Pokemon at once) with their own,
 * intentionally smaller, sizing (still via SpriteImg, so they share the
 * same 404 fallback behavior). */
export function PokemonSprite({
  spriteUrl,
  name,
  className,
  priority = false,
  artworkNum,
  preferHome = false,
  onReady,
}: {
  spriteUrl: string;
  name: string;
  className?: string;
  priority?: boolean;
  artworkNum?: number;
  preferHome?: boolean;
  onReady?: () => void;
}) {
  return (
    <SpriteImg
      spriteUrl={spriteUrl}
      name={name}
      priority={priority}
      artworkNum={artworkNum}
      preferHome={preferHome}
      onReady={onReady}
      className={cn("h-24 w-24 object-contain", className)}
      placeholderClassName={cn("h-24 w-24 text-2xl", className)}
    />
  );
}
