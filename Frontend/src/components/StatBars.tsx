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

export function StatBars({ stats }: { stats: StatBlock }) {
  return (
    <div className="flex flex-col gap-1.5">
      {STAT_LABELS.map(({ key, label }) => {
        const value = stats[key];
        const pct = Math.min(100, (value / MAX_DISPLAY_STAT) * 100);
        return (
          <div key={key} className="grid grid-cols-[3rem_2.5rem_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-mono">{value}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
