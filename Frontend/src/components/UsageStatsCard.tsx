import { Swords, Target, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { InfoLink } from "@/components/InfoLink";
import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { MoveStatsRow } from "@/components/MoveInfoLink";
import { SpriteImg } from "@/components/PokemonSprite";
import { TypeBadge } from "@/components/TypeBadge";
import { Card, CardContent } from "@/components/ui/card";
import { useMetaStats } from "@/hooks/usePokedex";
import { typeColor } from "@/lib/typeColors";
import { cn } from "@/lib/utils";
import type {
  AbilityUsageShare,
  CheckOrCounter,
  ItemUsageShare,
  MoveUsageShare,
  PokemonUsageShare,
} from "@/types/meta";

/** A single labeled usage bar — percent-width fill against the highest
 * share in its own list, so the *shape* of a Pokemon's set (its clearly
 * favored ability/move vs. a long tail of niche picks) is visible at a
 * glance instead of just a column of numbers. `color` defaults to the brand
 * gradient; tera types pass their own real type color instead, since that
 * data is already on hand (`typeColors.ts`) and far more informative than a
 * generic bar. `title` and `linkTo` route the name through `InfoLink` —
 * the same dotted-underline-when-there's-more-to-know convention the
 * Pokedex's own movepool table uses — and `badges` slots in a type/category
 * row for moves. Used for abilities/moves/tera types — the categories with
 * no natural artwork of their own (see `ItemUsageList`/`PokemonUsageList`
 * below for the sprite-card treatment items and Pokemon get instead). */
function UsageBar({
  label,
  title,
  percent,
  maxPercent,
  color,
  linkTo,
  badges,
  stats,
}: {
  label: string;
  title?: string | null;
  percent: number;
  maxPercent: number;
  color?: string;
  linkTo?: string | null;
  badges?: ReactNode;
  stats?: ReactNode;
}) {
  const width = maxPercent > 0 ? Math.max(4, (percent / maxPercent) * 100) : 0;
  const labelContent = linkTo ? (
    <InfoLink to={linkTo} title={title} stats={stats} className="truncate capitalize">
      {label}
    </InfoLink>
  ) : (
    <span className="truncate capitalize">{label}</span>
  );

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        {labelContent}
        <span className="shrink-0 font-mono text-muted-foreground text-xs">
          {percent.toFixed(1)}%
        </span>
      </div>
      {badges}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", !color && "bg-[image:var(--gradient-accent)]")}
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}

/** Abilities — same compact bar treatment as tera types, now clickable
 * (through to the same ability page the Pokedex's own "Abilities" card
 * links to) with the real description as a hover tooltip, instead of bare
 * unclickable text. */
function AbilityUsageList({ items }: { items: AbilityUsageShare[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const maxPercent = Math.max(...items.map((i) => i.percent));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <UsageBar
          key={item.name}
          label={item.name}
          title={item.description}
          percent={item.percent}
          maxPercent={maxPercent}
          linkTo={item.ability_id && `/abilities/${item.ability_id}`}
        />
      ))}
    </ul>
  );
}

/** Moves — the same bar treatment, plus the type + category badges the
 * Pokedex's movepool table shows, so this reads as "the same move data,
 * shown compactly" rather than a completely different, less informative
 * list living right next to it. */
function MoveUsageList({ items }: { items: MoveUsageShare[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const maxPercent = Math.max(...items.map((i) => i.percent));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <UsageBar
          key={item.name}
          label={item.name}
          title={item.description}
          percent={item.percent}
          maxPercent={maxPercent}
          linkTo={item.move_id && `/moves/${item.move_id}`}
          badges={
            (item.type || item.category) && (
              <div className="flex items-center gap-1">
                {item.type && <TypeBadge type={item.type} linkable={false} />}
                {item.category && <MoveCategoryBadge category={item.category} />}
              </div>
            )
          }
          stats={item.move_id && <MoveStatsRow move={item} />}
        />
      ))}
    </ul>
  );
}

function TeraTypeBarList({ items }: { items: { name: string; percent: number }[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const maxPercent = Math.max(...items.map((i) => i.percent));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <UsageBar
          key={item.name}
          label={item.name}
          percent={item.percent}
          maxPercent={maxPercent}
          color={typeColor(item.name)}
          linkTo={`/types/${item.name}`}
        />
      ))}
    </ul>
  );
}

/** A square sprite tile shared by the item/Pokemon usage cards below — same
 * muted rounded box as the homepage's `FeaturedPokemonCard`, sized `size-14`
 * for both so rows line up, regardless of what's inside. The *image* size
 * inside that box isn't shared, though: PokeAPI's item icons are only
 * natively 30x30, so blowing one up to `size-12` (48px) the way Showdown's
 * much higher-res (120x120) Pokemon art can handle just upscales and blurs
 * it. `imageClassName` lets item callers opt into a smaller, closer-to-
 * native image size while keeping the same outer tile footprint. `href`,
 * when resolvable, wraps the tile in the same link its neighboring name
 * uses — the image is a click target too, not just decoration. */
function UsageSpriteTile({
  spriteUrl,
  name,
  href,
  imageClassName = "size-12 object-contain",
}: {
  spriteUrl: string | null;
  name: string;
  href?: string | null;
  imageClassName?: string;
}) {
  const tile = (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
      <SpriteImg
        spriteUrl={spriteUrl ?? ""}
        name={name}
        className={imageClassName}
        placeholderClassName="size-12 text-base"
      />
    </div>
  );

  if (!href) {
    return tile;
  }

  return (
    <Link to={href} className="shrink-0 rounded-lg transition-opacity hover:opacity-80">
      {tile}
    </Link>
  );
}

/** Item usage entries — a sprite plus a one-line effect blurb in place of a
 * bare item name ("Choice Specs" on its own says nothing to someone who
 * hasn't memorized every item), matching the homepage's strategy-card
 * treatment rather than a plain text list. The name links through
 * `InfoLink` with the *full* effect text as a hover tooltip (the blurb
 * itself is clamped to one line for space). Falls back to plain text (no
 * link, no blurb) for the rare item name Smogon's stats know about that
 * this app's own seeded Items table doesn't resolve. */
function ItemUsageList({ items }: { items: ItemUsageShare[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const maxPercent = Math.max(...items.map((i) => i.percent));
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((item) => {
        const width = maxPercent > 0 ? Math.max(4, (item.percent / maxPercent) * 100) : 0;
        return (
          <li key={item.name} className="flex gap-2.5">
            <UsageSpriteTile
              spriteUrl={item.sprite_url}
              name={item.name}
              href={item.item_id && `/items/${item.item_id}`}
              imageClassName="size-8 object-contain"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                {item.item_id ? (
                  <InfoLink
                    to={`/items/${item.item_id}`}
                    title={item.short_effect}
                    spriteUrl={item.sprite_url}
                    spriteImageClassName="size-9 object-contain"
                    className="truncate font-medium"
                  >
                    {item.name}
                  </InfoLink>
                ) : (
                  <span className="truncate font-medium">{item.name}</span>
                )}
                <span className="shrink-0 font-mono text-muted-foreground text-xs">
                  {item.percent.toFixed(1)}%
                </span>
              </div>
              {item.short_effect && (
                <p className="line-clamp-1 text-muted-foreground text-xs">{item.short_effect}</p>
              )}
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-accent)]"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The common shape `PokemonUsageList` renders — `top_teammates` and
 * `top_checks_and_counters` carry different metrics (usage share vs. "beats
 * it" share) under different field names, so each caller below maps its own
 * data into this shape once rather than the list duplicating both branches.
 * `title` is an optional hover tooltip for data that's tracked but has no
 * room of its own in the row — checks/counters use it to surface Smogon's
 * own sample size ("Based on N recorded matchups"). */
type PokemonUsageEntry = {
  name: string;
  species_id: string | null;
  sprite_url: string | null;
  type1: string | null;
  type2: string | null;
  percent: number;
  percentLabel: string;
  title?: string;
};

/** Real Pokedex flavor text (when resolved) plus, for checks/counters,
 * Smogon's own sample size — joined into the one hover-preview blurb
 * `InfoLink` renders under the image/badges, rather than picking one or the
 * other. */
function usageEntryTitle(description: string | null, sampleSizeNote?: string): string | undefined {
  return [description, sampleSizeNote].filter(Boolean).join(" ") || undefined;
}

/** Teammate/check-and-counter entries — a sprite plus type badges in place
 * of a bare species name, same "this is a real Pokemon, not just a string"
 * treatment as the item list above. `accent` picks the bar/percent color:
 * the brand gradient for teammates (a positive, "pairs well with" stat) or
 * warning-orange for checks and counters (a "watch out for this" stat). */
function PokemonUsageList({
  entries,
  accent = "brand",
}: {
  entries: PokemonUsageEntry[];
  accent?: "brand" | "warning";
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No data.</p>;
  }
  const maxPercent = Math.max(...entries.map((e) => e.percent));
  return (
    <ul className="flex flex-col gap-3.5">
      {entries.map((entry) => {
        const width = maxPercent > 0 ? Math.max(4, (entry.percent / maxPercent) * 100) : 0;
        const typeBadges = (entry.type1 || entry.type2) && (
          <div className="flex gap-1">
            {entry.type1 && <TypeBadge type={entry.type1} linkable={false} />}
            {entry.type2 && <TypeBadge type={entry.type2} linkable={false} />}
          </div>
        );
        return (
          <li key={entry.name} className="flex gap-2.5">
            <UsageSpriteTile
              spriteUrl={entry.sprite_url}
              name={entry.name}
              href={entry.species_id && `/pokedex/${entry.species_id}`}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                {entry.species_id ? (
                  <InfoLink
                    to={`/pokedex/${entry.species_id}`}
                    title={entry.title}
                    spriteUrl={entry.sprite_url}
                    badges={typeBadges}
                    className="truncate font-medium"
                  >
                    {entry.name}
                  </InfoLink>
                ) : (
                  <span className="truncate font-medium">{entry.name}</span>
                )}
                <span
                  className={cn(
                    "shrink-0 font-mono text-xs",
                    accent === "warning" ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {entry.percentLabel}
                </span>
              </div>
              {typeBadges}
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    accent === "warning" ? "bg-warning" : "bg-[image:var(--gradient-accent)]",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function teammateEntry(t: PokemonUsageShare): PokemonUsageEntry {
  return {
    name: t.name,
    species_id: t.species_id,
    sprite_url: t.sprite_url,
    type1: t.type1,
    type2: t.type2,
    percent: t.percent,
    percentLabel: `${t.percent.toFixed(1)}%`,
    title: usageEntryTitle(t.description),
  };
}

function checkEntry(c: CheckOrCounter): PokemonUsageEntry {
  return {
    name: c.name,
    species_id: c.species_id,
    sprite_url: c.sprite_url,
    type1: c.type1,
    type2: c.type2,
    percent: c.beats_percent,
    percentLabel: `${c.beats_percent.toFixed(0)}% beats it`,
    title: usageEntryTitle(
      c.description,
      `Based on ${c.matchups_seen.toLocaleString()} recorded ladder matchups.`,
    ),
  };
}

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <Icon className="size-6 shrink-0 text-primary" />
      <div>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

/** Analytics / ladder-usage panel on a Pokemon detail page. Backed by synced
 * Smogon chaos stats when available, otherwise the backend's local demo
 * pack so the section is never blank. */
export function UsageStatsCard({ speciesId }: { speciesId: string }) {
  const { data: stats, isPending, isError } = useMetaStats(speciesId);

  if (isPending) {
    return (
      <Card className="overflow-hidden md:col-span-2" id="pokemon-detail-analytics">
        <GradientCardHeader icon={Trophy} title="Analytics" />
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading ladder analytics…
        </CardContent>
      </Card>
    );
  }

  if (isError || !stats) {
    return null;
  }

  return (
    <Card className="overflow-hidden md:col-span-2" id="pokemon-detail-analytics">
      <GradientCardHeader
        icon={Trophy}
        title={`Analytics — ${stats.format.toUpperCase()} (${stats.month})`}
      />
      <CardContent className="flex flex-col gap-5 pt-4">
        {stats.is_demo && (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Demo ladder snapshot — run the Smogon sync for live chaos stats.{" "}
            <Link to="/analytics" className="font-medium text-primary hover:underline">
              Open Analytics
            </Link>
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatPill icon={Trophy} label="Rank" value={`#${stats.rank}`} />
          <StatPill icon={Target} label="Usage" value={`${stats.usage_percent.toFixed(2)}%`} />
          <StatPill
            icon={Swords}
            label="Battles seen in"
            value={stats.raw_count.toLocaleString()}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Abilities
            </h4>
            <AbilityUsageList items={stats.top_abilities} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Items
            </h4>
            <ItemUsageList items={stats.top_items} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tera types
            </h4>
            <TeraTypeBarList items={stats.top_tera_types} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Moves
            </h4>
            <MoveUsageList items={stats.top_moves} />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Top teammates
            </h4>
            <PokemonUsageList entries={stats.top_teammates.map(teammateEntry)} accent="brand" />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Top checks &amp; counters
            </h4>
            <PokemonUsageList
              entries={stats.top_checks_and_counters.map(checkEntry)}
              accent="warning"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
