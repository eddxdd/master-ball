import { PokemonPicker } from "@/components/PokemonPicker";
import { StatSpreadInput } from "@/components/StatSpreadInput";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePokemonProfile } from "@/hooks/usePokedex";
import { NATURES } from "@/lib/natures";
import type { PokemonBattleState, Status } from "@/types/calculator";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "brn", label: "Burned" },
  { value: "par", label: "Paralyzed" },
  { value: "psn", label: "Poisoned" },
  { value: "tox", label: "Badly poisoned" },
  { value: "slp", label: "Asleep" },
  { value: "frz", label: "Frozen" },
];

export function PokemonConfigForm({
  title,
  state,
  onChange,
  showStatus,
  showCurrentHp,
}: {
  title: string;
  state: PokemonBattleState;
  onChange: (state: PokemonBattleState) => void;
  showStatus?: boolean;
  showCurrentHp?: boolean;
}) {
  const { data: profile } = usePokemonProfile(state.species_id || undefined);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{title}</h2>

      <PokemonPicker
        label="Pokemon"
        speciesId={state.species_id}
        onSelect={(speciesId) => onChange({ ...state, species_id: speciesId, ability: null })}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Level</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={state.level}
            onChange={(e) => onChange({ ...state, level: Number(e.target.value) || 100 })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nature</span>
          <Select
            items={Object.fromEntries(
              NATURES.map((n) => [
                n.id,
                n.increased ? `${n.name} (+${n.increased}/-${n.decreased})` : n.name,
              ]),
            )}
            value={state.nature}
            onValueChange={(v) => onChange({ ...state, nature: v ?? "hardy" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NATURES.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                  {n.increased ? ` (+${n.increased}/-${n.decreased})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {profile && profile.abilities.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ability</span>
          <Select
            items={Object.fromEntries(profile.abilities.map((a) => [a.id, a.name]))}
            value={state.ability ?? profile.abilities[0].id}
            onValueChange={(v) => onChange({ ...state, ability: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {profile.abilities.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Held item</span>
        <Input
          placeholder="e.g. Choice Band, Life Orb"
          value={state.item ?? ""}
          onChange={(e) => onChange({ ...state, item: e.target.value || null })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Tera type</span>
        <Select
          items={{
            __none__: "Not terastallized",
            ...Object.fromEntries(
              [profile?.type1, profile?.type2]
                .filter((t): t is string => Boolean(t))
                .map((t) => [t, t]),
            ),
          }}
          value={state.tera_type ?? "__none__"}
          onValueChange={(v) => onChange({ ...state, tera_type: v === "__none__" ? null : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Not terastallized</SelectItem>
            {profile &&
              [profile.type1, profile.type2].filter(Boolean).map((t) => (
                <SelectItem key={t} value={t as string}>
                  {t}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <StatSpreadInput
        label="EVs"
        values={state.evs}
        defaultValue={0}
        max={252}
        onChange={(evs) => onChange({ ...state, evs })}
      />
      <StatSpreadInput
        label="IVs"
        values={state.ivs}
        defaultValue={31}
        max={31}
        onChange={(ivs) => onChange({ ...state, ivs })}
      />

      {showStatus && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Status</span>
          <Select
            items={{
              __none__: "Healthy",
              ...Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label])),
            }}
            value={state.status ?? "__none__"}
            onValueChange={(v) =>
              onChange({ ...state, status: v === "__none__" ? null : (v as Status) })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Healthy</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showCurrentHp && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Current HP %</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={state.current_hp_percent}
            onChange={(e) =>
              onChange({ ...state, current_hp_percent: Number(e.target.value) || 100 })
            }
          />
        </div>
      )}
    </div>
  );
}
