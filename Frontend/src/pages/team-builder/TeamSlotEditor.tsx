import { PokemonPicker } from "@/components/PokemonPicker";
import { StatSpreadInput } from "@/components/StatSpreadInput";
import { TypeBadge } from "@/components/TypeBadge";
import { Button } from "@/components/ui/button";
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
import type { PokemonSet } from "@/types/team";

const MOVE_SLOTS = [0, 1, 2, 3];

export function TeamSlotEditor({
  index,
  member,
  onChange,
  onRemove,
}: {
  index: number;
  member: PokemonSet;
  onChange: (member: PokemonSet) => void;
  onRemove: () => void;
}) {
  const { data: profile } = usePokemonProfile(member.species_id || undefined);
  const damagingAndStatusMoves = profile?.learnable_moves ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Slot {index + 1}</h3>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PokemonPicker
          label="Pokemon"
          speciesId={member.species_id}
          onSelect={(speciesId) =>
            onChange({ ...member, species_id: speciesId, ability: null, moves: [] })
          }
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nickname</span>
          <Input
            value={member.nickname ?? ""}
            onChange={(e) => onChange({ ...member, nickname: e.target.value || null })}
          />
        </div>
      </div>

      {profile && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <img src={profile.sprite_url} alt={profile.name} className="h-10 w-10 object-contain" />
          <TypeBadge type={profile.type1} />
          {profile.type2 && <TypeBadge type={profile.type2} />}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Item</span>
          <Input
            placeholder="e.g. Choice Band"
            value={member.item ?? ""}
            onChange={(e) => onChange({ ...member, item: e.target.value || null })}
          />
        </div>

        {profile && profile.abilities.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ability</span>
            <Select
              items={Object.fromEntries(profile.abilities.map((a) => [a.id, a.name]))}
              value={member.ability ?? profile.abilities[0].id}
              onValueChange={(v) => onChange({ ...member, ability: v })}
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
          <span className="text-sm font-medium">Nature</span>
          <Select
            items={Object.fromEntries(
              NATURES.map((n) => [
                n.id,
                n.increased ? `${n.name} (+${n.increased}/-${n.decreased})` : n.name,
              ]),
            )}
            value={member.nature}
            onValueChange={(v) => onChange({ ...member, nature: v ?? "hardy" })}
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
            value={member.tera_type ?? "__none__"}
            onValueChange={(v) => onChange({ ...member, tera_type: v === "__none__" ? null : v })}
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
      </div>

      <StatSpreadInput
        label="EVs"
        values={member.evs}
        defaultValue={0}
        max={252}
        onChange={(evs) => onChange({ ...member, evs })}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MOVE_SLOTS.map((slot) => (
          <div key={slot} className="flex flex-col gap-1">
            <span className="text-sm font-medium">Move {slot + 1}</span>
            <Select
              items={{
                __none__: "—",
                ...Object.fromEntries(damagingAndStatusMoves.map((m) => [m.id, m.name])),
              }}
              value={member.moves[slot] ?? "__none__"}
              onValueChange={(v) => {
                const moves = [...member.moves];
                if (v === "__none__" || !v) {
                  moves.splice(slot, 1);
                } else {
                  moves[slot] = v;
                }
                onChange({ ...member, moves: moves.filter(Boolean) });
              }}
              disabled={damagingAndStatusMoves.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {damagingAndStatusMoves.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
