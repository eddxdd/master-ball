import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePokemonProfile } from "@/hooks/usePokedex";
import { ApiError } from "@/lib/api";
import { postDamageCalc } from "@/lib/calculatorApi";
import { DamageResult } from "@/pages/calculator/DamageResult";
import { PokemonConfigForm } from "@/pages/calculator/PokemonConfigForm";
import type { FieldConditions } from "@/types/calculator";
import { defaultBattleState, defaultFieldConditions } from "@/types/calculator";

export function CalculatorPage() {
  const [attacker, setAttacker] = useState(defaultBattleState);
  const [defender, setDefender] = useState(defaultBattleState);
  const [moveId, setMoveId] = useState("");
  const [field, setField] = useState<FieldConditions>(defaultFieldConditions);

  const { data: attackerProfile } = usePokemonProfile(attacker.species_id || undefined);
  const damagingMoves =
    attackerProfile?.learnable_moves.filter((m) => m.category !== "Status") ?? [];

  const mutation = useMutation({
    mutationFn: () => postDamageCalc({ attacker, defender, move_id: moveId, field }),
  });

  const canSubmit = attacker.species_id && defender.species_id && moveId;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Damage Calculator</h1>
        <p className="text-muted-foreground text-sm">
          A real deterministic calc engine — never an LLM guessing numbers.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PokemonConfigForm title="Attacker" state={attacker} onChange={setAttacker} showStatus />
        <PokemonConfigForm title="Defender" state={defender} onChange={setDefender} showCurrentHp />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <h2 className="font-semibold">Move &amp; field conditions</h2>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Move</span>
          <Select
            items={Object.fromEntries(
              damagingMoves.map((m) => [m.id, `${m.name} (${m.type}, ${m.base_power ?? "—"} BP)`]),
            )}
            value={moveId}
            onValueChange={(v) => setMoveId(v ?? "")}
            disabled={damagingMoves.length === 0}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="Pick the attacker first..." />
            </SelectTrigger>
            <SelectContent>
              {damagingMoves.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.type}, {m.base_power ?? "—"} BP)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Weather</span>
            <Select
              items={{ __none__: "None", sun: "Sun", rain: "Rain" }}
              value={field.weather ?? "__none__"}
              onValueChange={(v) =>
                setField({ ...field, weather: v === "__none__" ? null : (v as "sun" | "rain") })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="sun">Sun</SelectItem>
                <SelectItem value="rain">Rain</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="field-reflect"
              checked={field.reflect}
              onCheckedChange={(v) => setField({ ...field, reflect: v === true })}
            />
            <label htmlFor="field-reflect">Reflect</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="field-light-screen"
              checked={field.light_screen}
              onCheckedChange={(v) => setField({ ...field, light_screen: v === true })}
            />
            <label htmlFor="field-light-screen">Light Screen</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="field-aurora-veil"
              checked={field.aurora_veil}
              onCheckedChange={(v) => setField({ ...field, aurora_veil: v === true })}
            />
            <label htmlFor="field-aurora-veil">Aurora Veil</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="field-critical"
              checked={field.is_critical}
              onCheckedChange={(v) => setField({ ...field, is_critical: v === true })}
            />
            <label htmlFor="field-critical">Critical hit</label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="field-spread"
              checked={field.spread_move}
              onCheckedChange={(v) => setField({ ...field, spread_move: v === true })}
            />
            <label htmlFor="field-spread">Spread move (doubles)</label>
          </div>
        </div>

        <Button
          className="w-fit"
          disabled={!canSubmit || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Calculating..." : "Calculate damage"}
        </Button>
      </div>

      {mutation.isError && (
        <p className="text-destructive">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : "Something went wrong running the calculation."}
        </p>
      )}

      {mutation.data && <DamageResult result={mutation.data} />}
    </div>
  );
}
