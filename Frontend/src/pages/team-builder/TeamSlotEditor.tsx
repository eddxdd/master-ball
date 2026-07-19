import { Plus, Sparkles, X } from "lucide-react";
import type { CSSProperties } from "react";
import { ItemCombobox, useItemSpriteGuess } from "@/components/ItemCombobox";
import { PokeballWatermark } from "@/components/PokeballWatermark";
import { PokemonSprite } from "@/components/PokemonSprite";
import { SpeciesCombobox } from "@/components/SpeciesCombobox";
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
import { TYPE_COLORS, typeCardBackground } from "@/lib/typeColors";
import { cn, humanizeShowdownId } from "@/lib/utils";
import type { PokemonProfile } from "@/types/pokemon";
import type { PokemonSet } from "@/types/team";

const MOVE_SLOTS = [0, 1, 2, 3];
const ALL_TYPES = Object.keys(TYPE_COLORS);

/** Builds a `Select`'s id->name `items` map from a list of `{ id, name }`
 * options, plus (if it's not already one of them) the currently selected
 * id — labeled via `humanizeShowdownId` rather than left out, so a
 * just-imported move/ability that hasn't resolved yet (profile still
 * loading) or genuinely isn't in this Pokemon's movepool never falls
 * through to `Select.Value`'s own raw-id fallback. */
function selectItems(
  options: { id: string; name: string }[],
  selectedId: string | null | undefined,
): Record<string, string> {
  const items = Object.fromEntries(options.map((o) => [o.id, o.name]));
  if (selectedId && !(selectedId in items)) {
    items[selectedId] = humanizeShowdownId(selectedId);
  }
  return items;
}

/**
 * A 6-slot team member card — collapsed to a sprite-forward tile by
 * default, expanding into the full set editor (species/item/ability/
 * nature/Tera/EVs/moves, all picked visually) when tapped. See
 * Docs/frontend/README.md's Team Builder section.
 */
export function TeamSlotEditor({
  index,
  member,
  isExpanded,
  onExpand,
  onCollapse,
  onChange,
  onRemove,
}: {
  index: number;
  member: PokemonSet;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onChange: (member: PokemonSet) => void;
  onRemove: () => void;
}) {
  const { data: profile } = usePokemonProfile(member.species_id || undefined);

  if (isExpanded) {
    return (
      <ExpandedSlotEditor
        index={index}
        member={member}
        profile={profile}
        onChange={onChange}
        onRemove={onRemove}
        onCollapse={onCollapse}
      />
    );
  }

  return (
    <CollapsedSlotTile
      index={index}
      member={member}
      profile={profile}
      onExpand={onExpand}
      onRemove={onRemove}
    />
  );
}

function CollapsedSlotTile({
  index,
  member,
  profile,
  onExpand,
  onRemove,
}: {
  index: number;
  member: PokemonSet;
  profile: PokemonProfile | undefined;
  onExpand: () => void;
  onRemove: () => void;
}) {
  const { data: itemDetail } = useItemSpriteGuess(profile ? member.item : null);
  const abilityLabel = member.ability
    ? (profile?.abilities.find((a) => a.id === member.ability)?.name ??
      humanizeShowdownId(member.ability))
    : null;
  // Only the API display name ("Focus Sash") — never humanizeShowdownId leftovers.
  const itemLabel = itemDetail?.name ?? null;
  const moves = member.moves.filter(Boolean).slice(0, 4);

  // Empty slot — compact placeholder until a species is chosen.
  if (!profile) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: nested remove button forbids a real <button>
      <div
        id={`team-builder-slot-${index}`}
        role="button"
        tabIndex={0}
        onClick={onExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExpand();
          }
        }}
        className="motion-lift group relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-border bg-card/50 p-4 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-2 right-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X />
          <span className="sr-only">Remove Pokemon</span>
        </Button>
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
          ?
        </div>
        <span className="text-sm font-medium">Slot {index + 1}</span>
        <span className="text-xs text-muted-foreground">Tap to pick a Pokemon</span>
      </div>
    );
  }

  // Filled slot — mobile Pokedex card language: type wash, watermark, big
  // sprite. Competitive glanceables: ability, held item, moves.
  return (
    // biome-ignore lint/a11y/useSemanticElements: nested remove button forbids a real <button>
    <div
      id={`team-builder-slot-${index}`}
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
      className={cn(
        "motion-lift group relative flex min-h-[9.5rem] cursor-pointer items-stretch overflow-hidden rounded-3xl px-4 py-3.5 text-white",
        "[background-image:var(--team-slot-bg)]",
        "transition-[filter,transform] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
      style={
        {
          "--team-slot-bg": typeCardBackground(profile.type1, profile.type2),
        } as CSSProperties
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute top-2 right-2 z-20 text-white/80 opacity-0 transition-opacity hover:bg-black/25 hover:text-white group-hover:opacity-100 group-focus-visible:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X />
        <span className="sr-only">Remove Pokemon</span>
      </Button>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-2 pr-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xl font-bold leading-tight tracking-tight">
            {member.nickname || profile.name}
          </span>
          {itemDetail?.sprite_url && (
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f8d030] to-[#c9a227] p-[2px] shadow-[0_4px_12px_rgb(0_0_0_/_0.4)] ring-2 ring-white/30"
              title={itemLabel ?? undefined}
            >
              <div className="flex size-full items-center justify-center rounded-full bg-[#1a1428]">
                <img
                  src={itemDetail.sprite_url}
                  alt={itemLabel ?? "Held item"}
                  className="size-5 object-contain"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            <TypeBadge type={profile.type1} linkable={false} />
            {profile.type2 && <TypeBadge type={profile.type2} linkable={false} />}
          </div>
          {abilityLabel && (
            <p className="flex items-center gap-1.5 text-xs text-white/90">
              <Sparkles className="size-3.5 shrink-0 text-[#f8d030]" aria-hidden />
              <span className="truncate">
                <span className="text-white/65">Ability</span>{" "}
                <span className="font-semibold">{abilityLabel}</span>
              </span>
            </p>
          )}
        </div>

        {moves.length > 0 && (
          <ul className="flex flex-wrap gap-1 text-xs">
            {moves.map((moveId) => {
              const moveName =
                profile.learnable_moves.find((m) => m.id === moveId)?.name ??
                humanizeShowdownId(moveId);
              return (
                <li
                  key={moveId}
                  className="rounded-full bg-black/25 px-2 py-0.5 font-medium text-white/95 ring-1 ring-white/15"
                >
                  {moveName}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[48%] overflow-hidden"
      >
        <PokeballWatermark className="-top-8 -right-10 h-48 w-48 text-white/20" />
      </div>

      <div className="relative z-10 flex w-[6.5rem] shrink-0 items-center justify-center self-center">
        <PokemonSprite
          spriteUrl={profile.sprite_url}
          name={profile.name}
          preferHome
          artworkNum={profile.forme ? undefined : profile.num}
          className="size-24 object-contain drop-shadow-lg"
        />
      </div>
    </div>
  );
}

function ExpandedSlotEditor({
  index,
  member,
  profile,
  onChange,
  onRemove,
  onCollapse,
}: {
  index: number;
  member: PokemonSet;
  profile: PokemonProfile | undefined;
  onChange: (member: PokemonSet) => void;
  onRemove: () => void;
  onCollapse: () => void;
}) {
  const learnableMoves = profile?.learnable_moves ?? [];

  return (
    <div
      id={`team-builder-slot-${index}`}
      className="col-span-full flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Slot {index + 1}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
          <Button variant="outline" size="sm" onClick={onCollapse}>
            Done
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Pokemon</span>
          <SpeciesCombobox
            speciesId={member.species_id}
            onSelect={(option) =>
              onChange({
                ...member,
                species_id: option?.id ?? "",
                ability: null,
                moves: [],
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nickname</span>
          <Input
            value={member.nickname ?? ""}
            onChange={(e) => onChange({ ...member, nickname: e.target.value || null })}
          />
        </div>
      </div>

      {profile && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <PokemonSprite spriteUrl={profile.sprite_url} name={profile.name} />
          <div className="flex flex-col gap-1">
            <span className="font-medium">{profile.name}</span>
            <div className="flex gap-1">
              <TypeBadge type={profile.type1} />
              {profile.type2 && <TypeBadge type={profile.type2} />}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Item</span>
          <ItemCombobox
            itemName={member.item ?? null}
            onSelect={(name) => onChange({ ...member, item: name })}
          />
        </div>

        {profile && profile.abilities.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ability</span>
            <Select
              items={selectItems(profile.abilities, member.ability ?? profile.abilities[0].id)}
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
              ...Object.fromEntries(ALL_TYPES.map((t) => [t, t])),
            }}
            value={member.tera_type ?? "__none__"}
            onValueChange={(v) => onChange({ ...member, tera_type: v === "__none__" ? null : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not terastallized</SelectItem>
              {ALL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
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
                ...selectItems(learnableMoves, member.moves[slot]),
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
              disabled={learnableMoves.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {learnableMoves.map((m) => (
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

/** The empty-slot "Add Pokemon" tile — matches filled slot height. */
export function AddSlotTile({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[9.5rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-border">
        <Plus className="size-6" />
      </div>
      <span className="text-sm font-medium">Add Pokemon</span>
      <span className="text-xs">{count}/6</span>
    </button>
  );
}
