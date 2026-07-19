import { Activity, ArrowRight, BarChart3, Layers, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { InfoLink } from "@/components/InfoLink";
import { LoadingState } from "@/components/LoadingState";
import { SpriteImg } from "@/components/PokemonSprite";
import { Reveal } from "@/components/Reveal";
import { TypeBadge } from "@/components/TypeBadge";
import { useMetaLeaderboard } from "@/hooks/usePokedex";
import { typeColor } from "@/lib/typeColors";
import { cn } from "@/lib/utils";
import type { MetaLeaderboardEntry, TypeUsageShare } from "@/types/meta";

function formatMonth(month: string | null): string {
  if (!month) return "—";
  const [year, mon] = month.split("-");
  const date = new Date(Number(year), Number(mon) - 1, 1);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function useCountUp(target: number, enabled: boolean, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setValue(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled, durationMs]);

  return value;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-6 size-24 rounded-full bg-[image:var(--gradient-brand)] opacity-[0.14] blur-2xl"
      />
      <div className="relative flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-white shadow-sm">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function UsageCurve({ entries }: { entries: MetaLeaderboardEntry[] }) {
  if (entries.length < 2) return null;
  const max = Math.max(...entries.map((e) => e.usage_percent), 1);
  const w = 320;
  const h = 88;
  const pad = 6;
  const points = entries.map((entry, i) => {
    const x = pad + (i / (entries.length - 1)) * (w - pad * 2);
    const y = h - pad - (entry.usage_percent / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  const area = `M ${pad},${h - pad} L ${points.join(" L ")} L ${w - pad},${h - pad} Z`;

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative usage curve
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" aria-hidden>
      <defs>
        <linearGradient id="meta-curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="meta-curve-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f8d030" />
          <stop offset="100%" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#meta-curve-fill)" className="meta-curve-area" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="url(#meta-curve-stroke)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="meta-curve-line"
      />
    </svg>
  );
}

function TypeDonut({ distribution, active }: { distribution: TypeUsageShare[]; active: boolean }) {
  const top = distribution.slice(0, 10);
  const rest = distribution.slice(10);
  const restPercent = rest.reduce((sum, t) => sum + t.percent, 0);
  const slices = restPercent > 0.5 ? [...top, { type: "Other", percent: restPercent }] : top;
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += slice.percent;
    const color = slice.type === "Other" ? "#6b7280" : typeColor(slice.type);
    return `${color} ${start}% ${cursor}%`;
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className={cn(
          "relative mx-auto size-40 shrink-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0_/0.06)] transition-[opacity,transform] duration-700",
          active ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
        style={{
          background: stops.length ? `conic-gradient(from -90deg, ${stops.join(", ")})` : undefined,
        }}
      >
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card shadow-inner">
          <span className="font-mono text-lg font-semibold">{slices.length}</span>
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">types</span>
        </div>
      </div>
      <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
        {slices.map((slice) => (
          <li key={slice.type} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{
                backgroundColor: slice.type === "Other" ? "#6b7280" : typeColor(slice.type),
              }}
            />
            <span className="truncate font-medium">{slice.type}</span>
            <span className="ml-auto font-mono text-muted-foreground">
              {slice.percent.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsageRow({
  entry,
  maxUsage,
  selected,
  onSelect,
  animate,
}: {
  entry: MetaLeaderboardEntry;
  maxUsage: number;
  selected: boolean;
  onSelect: () => void;
  animate: boolean;
}) {
  const width = maxUsage > 0 ? (entry.usage_percent / maxUsage) * 100 : 0;
  const barColor = entry.type1 ? typeColor(entry.type1) : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
        selected ? "bg-muted/70 ring-1 ring-primary/30" : "hover:bg-muted/40",
      )}
    >
      <span className="w-6 text-center font-mono text-xs text-muted-foreground">#{entry.rank}</span>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2">
          <Link
            to={`/pokedex/${entry.species_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex min-w-0 items-center gap-2 hover:opacity-90"
          >
            <SpriteImg
              spriteUrl={
                entry.sprite_url ??
                `https://play.pokemonshowdown.com/sprites/dex/${entry.species_id}.png`
              }
              name={entry.species_name}
              className="size-8 object-contain"
              placeholderClassName="size-8 text-xs"
            />
            <span className="truncate text-sm font-semibold hover:underline">
              {entry.species_name}
            </span>
          </Link>
          <div className="hidden items-center gap-1 sm:flex">
            {entry.type1 && <TypeBadge type={entry.type1} linkable={false} />}
            {entry.type2 && <TypeBadge type={entry.type2} linkable={false} />}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "meta-usage-bar h-full rounded-full",
              !barColor && "bg-[image:var(--gradient-accent)]",
            )}
            style={{
              width: animate ? `${width}%` : "0%",
              backgroundColor: barColor,
              transitionDelay: `${Math.min(entry.rank - 1, 11) * 45}ms`,
            }}
          />
        </div>
      </div>
      <span className="w-14 text-right font-mono text-sm font-medium">
        {entry.usage_percent.toFixed(1)}%
      </span>
    </button>
  );
}

function Spotlight({ entry }: { entry: MetaLeaderboardEntry }) {
  const maxMove = Math.max(...entry.top_moves.map((m) => m.percent), 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: entry.type1
            ? `radial-gradient(circle at 85% 20%, ${typeColor(entry.type1)}55, transparent 55%)`
            : undefined,
        }}
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Link
            to={`/pokedex/${entry.species_id}`}
            className="flex size-20 items-center justify-center rounded-2xl bg-muted/60 ring-1 ring-border transition-opacity hover:opacity-90"
          >
            <SpriteImg
              spriteUrl={
                entry.sprite_url ??
                `https://play.pokemonshowdown.com/sprites/dex/${entry.species_id}.png`
              }
              name={entry.species_name}
              preferHome
              className="size-16 object-contain drop-shadow-lg"
              placeholderClassName="size-16 text-xl"
            />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Ladder spotlight · #{entry.rank}
            </p>
            <Link
              to={`/pokedex/${entry.species_id}`}
              className="block truncate text-xl font-semibold hover:underline"
            >
              {entry.species_name}
            </Link>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.type1 && <TypeBadge type={entry.type1} />}
              {entry.type2 && <TypeBadge type={entry.type2} />}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Common moves
          </p>
          <ul className="flex flex-col gap-2">
            {entry.top_moves.length === 0 && (
              <li className="text-sm text-muted-foreground">No move splits synced.</li>
            )}
            {entry.top_moves.map((move) => (
              <li key={move.move_id ?? move.name} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-sm">
                  {move.move_id ? (
                    <InfoLink
                      to={`/moves/${move.move_id}`}
                      title={move.description}
                      className="truncate"
                    >
                      {move.name}
                    </InfoLink>
                  ) : (
                    <span className="truncate">{move.name}</span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {move.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[image:var(--gradient-accent)]"
                    style={{ width: `${(move.percent / maxMove) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {entry.top_items.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Held items
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.top_items.map((item) => (
                <span
                  key={item.item_id ?? item.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs"
                >
                  {item.item_id ? (
                    <InfoLink to={`/items/${item.item_id}`} title={item.short_effect}>
                      {item.name}
                    </InfoLink>
                  ) : (
                    <span>{item.name}</span>
                  )}
                  <span className="font-mono text-muted-foreground">
                    {item.percent.toFixed(0)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <Link
          to={`/pokedex/${entry.species_id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          Open in Pokedex <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

type MetaDashboardProps = {
  /** DOM id for the section root. */
  id?: string;
  /** How many leaderboard rows to fetch/show. */
  limit?: number;
  /** Compact homepage blurb vs fuller analytics-page copy. */
  variant?: "embed" | "page";
  /** Show a link through to `/analytics` (homepage embed). */
  showAnalyticsLink?: boolean;
};

/** Gen 9 OU analytics — Smogon-synced usage when available, otherwise the
 * backend's interview demo pack so this section is never an empty box. */
export function MetaDashboard({
  id = "home-meta-dashboard",
  limit = 12,
  variant = "embed",
  showAnalyticsLink = false,
}: MetaDashboardProps) {
  const { data, isPending, isError } = useMetaLeaderboard("gen9ou", limit);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [barsReady, setBarsReady] = useState(false);

  const selected = useMemo(() => {
    if (!data?.entries.length) return null;
    return data.entries.find((e) => e.species_id === selectedId) ?? data.entries[0];
  }, [data, selectedId]);

  useEffect(() => {
    if (!data?.entries.length) {
      setBarsReady(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setBarsReady(true), 80);
    return () => window.clearTimeout(timeoutId);
  }, [data]);

  const speciesCount = useCountUp(data?.species_count ?? 0, Boolean(data) && !isPending);
  const topUsage = useCountUp(data?.top_usage_percent ?? 0, Boolean(data) && !isPending);
  const typeCount = useCountUp(data?.type_distribution.length ?? 0, Boolean(data) && !isPending);
  const maxUsage = Math.max(...(data?.entries.map((e) => e.usage_percent) ?? [1]), 1);
  const isDemo = Boolean(data?.is_demo);
  const isPage = variant === "page";

  return (
    <section id={id} className="flex flex-col gap-6">
      <Reveal>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-widest text-primary uppercase">
              Live ladder analytics
            </p>
            <h2
              className={cn(
                "font-semibold tracking-tight",
                isPage ? "text-3xl sm:text-4xl" : "text-2xl",
              )}
            >
              Gen 9 OU Meta Snapshot
            </h2>
            <p
              className={cn(
                "mt-1 max-w-2xl text-muted-foreground",
                isPage ? "text-base" : "text-sm",
              )}
            >
              {isDemo
                ? "Usage ranks, move splits, and type pressure across the format — demo ladder data for local/interview demos until Smogon stats are synced."
                : "Real Smogon chaos stats — usage ranks, move splits, and type pressure across the format. Synced ladder data, not mock charts."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data?.month && (
              <span className="inline-flex w-fit items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                {isDemo ? "Demo snapshot" : "Snapshot"} · {formatMonth(data.month)}
              </span>
            )}
            {showAnalyticsLink && (
              <Link
                to="/analytics"
                className="inline-flex w-fit items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/15"
              >
                Full analytics <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </Reveal>

      {isPending && <LoadingState label="Loading meta stats" size="inline" />}

      {isError && (
        <p className="text-sm text-destructive">
          Couldn't load meta stats. Is the backend running?
        </p>
      )}

      {!isPending && !isError && data && data.species_count === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <BarChart3 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No usage stats available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Seed the Pokedex, then run{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              uv run python -m scripts.sync_usage_stats
            </code>{" "}
            for live ladder data.
          </p>
        </div>
      )}

      {!isPending && !isError && data && data.species_count > 0 && (
        <>
          <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              icon={Layers}
              label="Pokemon tracked"
              value={Math.round(speciesCount).toLocaleString()}
              hint={`${data.format.toUpperCase()} ladder rows`}
            />
            <KpiCard
              icon={Trophy}
              label="Top usage"
              value={`${topUsage.toFixed(1)}%`}
              hint={data.entries[0] ? `#1 ${data.entries[0].species_name}` : "Highest share"}
            />
            <KpiCard
              icon={Activity}
              label="Types in play"
              value={Math.round(typeCount).toString()}
              hint="Usage-weighted across the format"
            />
          </Reveal>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Reveal className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Usage leaderboard</h3>
                <span className="text-xs text-muted-foreground">Click a row to spotlight</span>
              </div>
              <UsageCurve entries={data.entries} />
              <div className="mt-2 flex flex-col gap-0.5">
                {data.entries.map((entry) => (
                  <UsageRow
                    key={entry.species_id}
                    entry={entry}
                    maxUsage={maxUsage}
                    selected={selected?.species_id === entry.species_id}
                    onSelect={() => setSelectedId(entry.species_id)}
                    animate={barsReady}
                  />
                ))}
              </div>
            </Reveal>

            <div className="flex flex-col gap-4">
              <Reveal className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h3 className="mb-4 text-sm font-semibold">Type pressure</h3>
                <TypeDonut distribution={data.type_distribution} active={barsReady} />
                <p className="mt-4 text-xs text-muted-foreground">
                  Weighted by each Pokemon's ladder usage — dual-types count for both.
                </p>
              </Reveal>

              {selected && (
                <Reveal delayMs={80}>
                  <Spotlight entry={selected} />
                </Reveal>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
