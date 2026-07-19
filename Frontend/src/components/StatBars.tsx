import type { StatBlock } from "@/types/pokemon";

const STAT_LABELS: { key: keyof StatBlock; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "Atk" },
  { key: "def", label: "Def" },
  { key: "spa", label: "SpA" },
  { key: "spd", label: "SpD" },
  { key: "spe", label: "Spe" },
];

const MAX_DISPLAY_STAT = 255;

/**
 * Base stat bars plus the min/max range each stat can actually reach at
 * level 100 — the standard Bulbapedia/Serebii "stat range" table, sourced
 * from the backend's app/tools/stats.py's min_max_stats (0/31 IVs, 0/252
 * EVs, a hindering/beneficial nature) rather than recomputed here, so the
 * Pokedex and the Damage Calculator can never disagree on the formula.
 */
export function StatBars({
  stats,
  minStats,
  maxStats,
}: {
  stats: StatBlock;
  minStats: StatBlock;
  maxStats: StatBlock;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[3rem_2.5rem_1fr] gap-2">
        <span />
        <span />
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>Min</span>
          <span>Max</span>
        </div>
      </div>
      {STAT_LABELS.map(({ key, label }) => {
        const value = stats[key];
        const pct = Math.min(100, (value / MAX_DISPLAY_STAT) * 100);
        return (
          <div key={key} className="grid grid-cols-[3rem_2.5rem_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-mono font-semibold text-primary">{value}</span>
            <div className="flex flex-col gap-0.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-brand)] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-muted-foreground text-xs">
                <span>{minStats[key]}</span>
                <span>{maxStats[key]}</span>
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-muted-foreground text-xs">
        Min/max = this stat at level 100 with 0 vs. 31 IVs, 0 vs. 252 EVs, and a hindering vs.
        beneficial nature.
      </p>
    </div>
  );
}
