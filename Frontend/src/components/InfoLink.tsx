import type { ReactNode } from "react";
import { Link } from "react-router";
import { SpriteImg } from "@/components/PokemonSprite";
import { PreviewCard, PreviewCardContent, PreviewCardTrigger } from "@/components/ui/preview-card";
import { cn } from "@/lib/utils";

/** The one name-link convention used everywhere on the site: a dotted
 * underline plus a hover preview whenever there's real extra info to reveal
 * — a move's effect text and power/accuracy/PP, an item's full effect, an
 * ability's description, or (when `spriteUrl` is passed) a real image the
 * way a hover preview of a Pokemon or item should look — or a plain
 * hover-underline when there isn't anything more to show than the name
 * itself. Every list of clickable names (movepool, abilities, usage-stats
 * items/moves/Pokemon) should route through this instead of rolling its own
 * Link classes, so a name reads the same whether it's in the Pokedex, the
 * Ladder Usage card, or anywhere else.
 *
 * `spriteUrl` upgrades the preview with a real image the way a Pokemon/item
 * hover should look — pass it whenever the linked thing actually has a
 * sprite, omit it for text-only entities (moves, abilities) that have none;
 * either way, `title`/`badges`/`stats` alone are enough to get the same rich
 * popup instead of falling back to a plain native tooltip. `badges` sits
 * right under the name (type/category pills); `stats` renders below that as
 * its own row — pass a small stat-chip grid (see MoveInfoLink) for things
 * like a move's power/accuracy/PP. `spriteImageClassName` defaults to a
 * size that suits Showdown's high-resolution Pokemon art; pass a smaller
 * one (items) so PokeAPI's natively-30x30 item icons don't get blown up and
 * blurred. */
export function InfoLink({
  to,
  title,
  spriteUrl,
  spriteImageClassName = "size-14 object-contain",
  badges,
  stats,
  className,
  children,
}: {
  to: string;
  title?: string | null;
  spriteUrl?: string | null;
  spriteImageClassName?: string;
  badges?: ReactNode;
  stats?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const hasPreview = Boolean(title || spriteUrl || badges || stats);
  const linkClassName = cn(
    hasPreview
      ? "underline decoration-dotted decoration-muted-foreground underline-offset-4 hover:text-primary"
      : "link-underline hover:text-primary",
    className,
  );

  if (!hasPreview) {
    return (
      <Link to={to} className={linkClassName}>
        {children}
      </Link>
    );
  }

  const name = typeof children === "string" ? children : to;
  return (
    <PreviewCard>
      <PreviewCardTrigger render={<Link to={to} className={linkClassName} />}>
        {children}
      </PreviewCardTrigger>
      <PreviewCardContent>
        <div className="flex items-center gap-3">
          {spriteUrl && (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted">
              <SpriteImg
                spriteUrl={spriteUrl}
                name={name}
                className={spriteImageClassName}
                placeholderClassName="size-14 text-base"
              />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate font-semibold">{children}</p>
            {badges}
          </div>
        </div>
        {stats}
        {title && <p className="mt-2 text-xs text-muted-foreground">{title}</p>}
      </PreviewCardContent>
    </PreviewCard>
  );
}
