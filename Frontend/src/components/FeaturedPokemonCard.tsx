import { ArrowRight, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { Card, CardContent } from "@/components/ui/card";
import { usePokemonProfile } from "@/hooks/usePokedex";

type FeaturedPokemonCardProps = {
  speciesId: string;
  blurb: string;
};

/** A homepage card for a featured OU Pokemon — sprite/types are fetched live
 * (never hardcoded, so a re-seed can't silently drift out of sync with what's
 * on the card), and clicking through opens that Pokemon's Pokedex page.
 * See Docs/frontend/README.md's homepage section. */
export function FeaturedPokemonCard({ speciesId, blurb }: FeaturedPokemonCardProps) {
  const { data: pokemon, isPending, isError } = usePokemonProfile(speciesId);

  return (
    <Link to={`/pokedex/${speciesId}`} className="group block h-full">
      <Card className="motion-lift h-full transition-colors group-hover:ring-primary/40">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
              {isPending ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : isError || !pokemon ? (
                <span className="text-xs text-muted-foreground">?</span>
              ) : (
                <SpriteImg
                  spriteUrl={pokemon.sprite_url}
                  name={pokemon.name}
                  className="size-12 object-contain"
                  placeholderClassName="size-12 text-base"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-semibold">{pokemon?.name ?? speciesId}</p>
              {pokemon && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <TypeBadge type={pokemon.type1} linkable={false} />
                  {pokemon.type2 && <TypeBadge type={pokemon.type2} linkable={false} />}
                </div>
              )}
            </div>
          </div>
          <p className="flex-1 text-sm text-muted-foreground">{blurb}</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            View in the Pokedex{" "}
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
