import { CircleCheck, Skull, TriangleAlert } from "lucide-react";
import { InfoLink } from "@/components/InfoLink";
import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { MoveInfoLink } from "@/components/MoveInfoLink";
import { PokemonSprite } from "@/components/PokemonSprite";
import { Reveal } from "@/components/Reveal";
import { TypeBadge } from "@/components/TypeBadge";
import { cn } from "@/lib/utils";
import type { DamageCalcResult } from "@/types/calculator";
import type { MoveSummary, PokemonProfile } from "@/types/pokemon";

/** Icon + color for the KO verdict, keyed off the backend's own
 * `ko_chance_description` string (app/tools/damage_calc.py's `_describe_ko`)
 * rather than re-deriving thresholds client-side. */
function koVerdict(description: string) {
  if (description === "Guaranteed KO") {
    return { Icon: Skull, className: "text-destructive" };
  }
  if (description === "No KO") {
    return { Icon: CircleCheck, className: "text-success" };
  }
  return { Icon: TriangleAlert, className: "text-warning" };
}

/** A defender-HP bar showing exactly where the roll range (min-max damage)
 * lands — the segment itself is the range of possible outcomes, colored by
 * how threatening the top of that range is; everything past 100% is off the
 * visible bar since the defender's HP can't go negative. */
function DamageBar({ minPercent, maxPercent }: { minPercent: number; maxPercent: number }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const min = clamp(minPercent);
  const max = clamp(maxPercent);
  const severity =
    maxPercent >= 100 ? "bg-destructive" : maxPercent >= 50 ? "bg-warning" : "bg-success";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>Defender HP</span>
        <span>
          {maxPercent >= 100 ? "Faints" : `${round1(100 - max)}%–${round1(100 - min)}% remaining`}
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-success/30">
        <div
          className={cn("absolute inset-y-0 rounded-full", severity)}
          style={{ left: `${min}%`, width: `${Math.max(max - min, 1)}%` }}
        />
      </div>
    </div>
  );
}

export function DamageResult({
  result,
  attacker,
  defender,
  move,
}: {
  result: DamageCalcResult;
  attacker?: PokemonProfile;
  defender?: PokemonProfile;
  move?: MoveSummary;
}) {
  if (result.is_immune) {
    return (
      <Reveal>
        <div
          id="calculator-result"
          className="rounded-lg border border-border bg-card p-4 shadow-sm"
        >
          <p className="font-semibold text-muted-foreground">
            {result.move_name} has no effect — the defender is immune.
          </p>
        </div>
      </Reveal>
    );
  }

  const { Icon: KoIcon, className: koClassName } = koVerdict(result.ko_chance_description);

  return (
    <Reveal key={`${result.move_name}-${result.min_damage}-${result.max_damage}`}>
      <div
        id="calculator-result"
        className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-between">
          {attacker && (
            <div className="flex flex-col items-center gap-1">
              <PokemonSprite spriteUrl={attacker.sprite_url} name={attacker.name} />
              <InfoLink
                to={`/pokedex/${attacker.id}`}
                title={attacker.description}
                className="text-sm font-medium"
              >
                {attacker.name}
              </InfoLink>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">
                {move ? <MoveInfoLink move={move} /> : result.move_name}
              </h3>
              <TypeBadge type={result.move_type} />
            </div>
            <MoveCategoryBadge category={result.category} />
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          </div>

          {defender && (
            <div className="flex flex-col items-center gap-1">
              <PokemonSprite spriteUrl={defender.sprite_url} name={defender.name} />
              <InfoLink
                to={`/pokedex/${defender.id}`}
                title={defender.description}
                className="text-sm font-medium"
              >
                {defender.name}
              </InfoLink>
            </div>
          )}
        </div>

        <p className="text-center text-3xl font-bold">
          <span className="bg-[image:var(--gradient-brand)] bg-clip-text text-transparent">
            {result.min_damage}–{result.max_damage}
          </span>{" "}
          <span className="text-muted-foreground text-lg font-normal">
            ({result.min_percent}%–{result.max_percent}%)
          </span>
        </p>

        <div className={cn("flex items-center justify-center gap-2 font-medium", koClassName)}>
          <KoIcon className="size-5" />
          <span>{result.ko_chance_description}</span>
        </div>

        <DamageBar minPercent={result.min_percent} maxPercent={result.max_percent} />

        <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <span>Type effectiveness: {result.type_effectiveness}x</span>
          <span>STAB: {result.stab_multiplier}x</span>
          <span>Defender max HP: {result.defender_max_hp}</span>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">All 16 rolls</summary>
          <p className="mt-1 font-mono text-xs">{result.rolls.join(", ")}</p>
        </details>
      </div>
    </Reveal>
  );
}
