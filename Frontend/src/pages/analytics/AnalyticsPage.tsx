import { Activity, BarChart3, Layers, Sparkles, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { LoadingState } from "@/components/LoadingState";
import { MetaDashboard } from "@/components/MetaDashboard";
import { SpriteImg } from "@/components/PokemonSprite";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { TypeBadge } from "@/components/TypeBadge";
import { useMetaLeaderboard } from "@/hooks/usePokedex";
import { typeColor } from "@/lib/typeColors";
import { cn } from "@/lib/utils";

const FLOAT_SPRITES = [
  "kingambit",
  "greattusk",
  "gholdengo",
  "dragapult",
  "landorustherian",
  "corviknight",
] as const;

function FloatingSpriteField({ speciesIds }: { speciesIds: string[] }) {
  const ids = speciesIds.length >= 4 ? speciesIds.slice(0, 6) : [...FLOAT_SPRITES];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      id="analytics-hero-sprites"
    >
      {ids.map((id, index) => {
        const left = 6 + ((index * 17) % 78);
        const top = 12 + ((index * 23) % 58);
        const size = index % 3 === 0 ? "size-16 sm:size-20" : "size-12 sm:size-16";
        const delay = `${index * 0.35}s`;
        return (
          <div
            key={`${id}-${left}-${top}`}
            className="analytics-float absolute opacity-[0.22] dark:opacity-[0.28]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: delay,
            }}
          >
            <SpriteImg
              spriteUrl={`https://play.pokemonshowdown.com/sprites/home-centered/${id}.png`}
              name={id}
              preferHome
              className={cn(size, "object-contain drop-shadow-lg")}
              placeholderClassName={size}
            />
          </div>
        );
      })}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/55 to-background" />
    </div>
  );
}

function UsageSparkBars({
  entries,
}: {
  entries: {
    species_id: string;
    species_name: string;
    usage_percent: number;
    sprite_url: string | null;
  }[];
}) {
  const max = Math.max(...entries.map((e) => e.usage_percent), 1);
  const [ready, setReady] = useState(false);
  const entriesKey = entries.map((e) => e.species_id).join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-animate bars when the leaderboard row set changes
  useEffect(() => {
    setReady(false);
    const id = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(id);
  }, [entriesKey]);

  return (
    <div className="flex h-40 items-end gap-1.5 sm:gap-2" id="analytics-usage-spark">
      {entries.map((entry, index) => {
        const height = ready ? (entry.usage_percent / max) * 100 : 0;
        return (
          <Link
            key={entry.species_id}
            to={`/pokedex/${entry.species_id}`}
            title={`${entry.species_name} · ${entry.usage_percent.toFixed(1)}%`}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <span className="font-mono text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100 sm:text-xs">
              {entry.usage_percent.toFixed(0)}%
            </span>
            <div className="relative flex h-28 w-full items-end justify-center">
              <div
                className="analytics-bar w-full max-w-[2.25rem] rounded-t-md bg-[image:var(--gradient-accent)] shadow-sm"
                style={{
                  height: `${height}%`,
                  transitionDelay: `${index * 40}ms`,
                }}
              />
            </div>
            <SpriteImg
              spriteUrl={
                entry.sprite_url ??
                `https://play.pokemonshowdown.com/sprites/dex/${entry.species_id}.png`
              }
              name={entry.species_name}
              className="size-7 object-contain sm:size-8"
              placeholderClassName="size-7 text-[10px]"
            />
          </Link>
        );
      })}
    </div>
  );
}

function TypeHeatStrip({ distribution }: { distribution: { type: string; percent: number }[] }) {
  const top = distribution.slice(0, 12);
  const max = Math.max(...top.map((t) => t.percent), 1);

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" id="analytics-type-heat">
      {top.map((slice, index) => (
        <li key={slice.type}>
          <Link
            to={`/types/${slice.type.toLowerCase()}`}
            className="group flex flex-col gap-2 rounded-xl border border-border bg-card/80 p-3 transition hover:border-primary/40 hover:bg-card"
          >
            <div className="flex items-center justify-between gap-2">
              <TypeBadge type={slice.type} linkable={false} />
              <span className="font-mono text-xs text-muted-foreground">
                {slice.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="analytics-bar h-full rounded-full"
                style={{
                  width: `${(slice.percent / max) * 100}%`,
                  backgroundColor: typeColor(slice.type),
                  transitionDelay: `${index * 35}ms`,
                }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Dedicated Gen 9 OU Analytics surface — leaderboard, type pressure, and
 * usage visuals. Reuses MetaDashboard for the interactive spotlight board.
 */
export function AnalyticsPage() {
  const { data, isPending, isError } = useMetaLeaderboard("gen9ou", 20);
  const floatIds = useMemo(() => data?.entries.slice(0, 6).map((e) => e.species_id) ?? [], [data]);

  return (
    <div id="analytics-page" className="flex flex-col gap-10">
      <Seo
        title="Analytics"
        description="Gen 9 OU ladder analytics — usage leaderboard, type pressure, move splits, and spotlight sets from Smogon chaos stats."
      />

      <Breadcrumbs items={[{ label: "Analytics" }]} />

      <section
        id="analytics-hero"
        className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-10 sm:px-8 sm:py-14"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.12]"
        />
        <FloatingSpriteField speciesIds={floatIds} />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <Reveal>
            <p className="inline-flex items-center gap-1.5 text-xs font-medium tracking-widest text-primary uppercase">
              <Sparkles className="size-3.5" /> Ladder intelligence
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">Analytics</h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              Usage ranks, type pressure, and set trends across Gen 9 OU — the same ladder data that
              powers Pokedex analytics and the Professor.
            </p>
          </Reveal>
          <Reveal delayMs={80} className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <Trophy className="size-3.5 text-primary" /> Usage leaderboard
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <Layers className="size-3.5 text-primary" /> Type pressure
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <Activity className="size-3.5 text-primary" /> Move & item splits
            </span>
          </Reveal>
        </div>
      </section>

      {isPending && <LoadingState label="Loading analytics" />}

      {isError && (
        <p className="text-sm text-destructive">Couldn't load analytics. Is the backend running?</p>
      )}

      {!isPending && !isError && data && data.entries.length > 0 && (
        <>
          <Reveal className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Usage curve</h2>
                <p className="text-sm text-muted-foreground">
                  Top ladder share at a glance — click a bar to open the Pokedex entry.
                </p>
              </div>
              <BarChart3 className="size-5 shrink-0 text-muted-foreground" />
            </div>
            <UsageSparkBars entries={data.entries.slice(0, 12)} />
          </Reveal>

          <Reveal className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">Type heat</h2>
              <p className="text-sm text-muted-foreground">
                Usage-weighted type presence across the format — dual-types count for both.
              </p>
            </div>
            <TypeHeatStrip distribution={data.type_distribution} />
          </Reveal>
        </>
      )}

      <MetaDashboard id="analytics-meta-dashboard" limit={20} variant="page" />
    </div>
  );
}
