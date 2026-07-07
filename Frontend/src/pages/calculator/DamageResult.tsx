import { TypeBadge } from "@/components/TypeBadge";
import type { DamageCalcResult } from "@/types/calculator";

export function DamageResult({ result }: { result: DamageCalcResult }) {
  if (result.is_immune) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="font-semibold text-muted-foreground">
          {result.move_name} has no effect — the defender is immune.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{result.move_name}</h3>
        <TypeBadge type={result.move_type} />
        <span className="text-muted-foreground text-sm">{result.category}</span>
      </div>

      <p className="text-2xl font-bold">
        {result.min_damage}–{result.max_damage}{" "}
        <span className="text-muted-foreground text-base font-normal">
          ({result.min_percent}%–{result.max_percent}%)
        </span>
      </p>

      <p className="font-medium">{result.ko_chance_description}</p>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>Type effectiveness: {result.type_effectiveness}x</span>
        <span>STAB: {result.stab_multiplier}x</span>
        <span>Defender max HP: {result.defender_max_hp}</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">All 16 rolls</summary>
        <p className="mt-1 font-mono text-xs">{result.rolls.join(", ")}</p>
      </details>
    </div>
  );
}
