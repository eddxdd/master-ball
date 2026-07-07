import { TypeBadge } from "@/components/TypeBadge";
import type { TypeEffectiveness } from "@/types/pokemon";

const GROUPS: { label: string; test: (m: number) => boolean }[] = [
  { label: "Weak x4", test: (m) => m === 4 },
  { label: "Weak x2", test: (m) => m === 2 },
  { label: "Resists x0.5", test: (m) => m === 0.5 },
  { label: "Resists x0.25", test: (m) => m === 0.25 },
  { label: "Immune", test: (m) => m === 0 },
];

export function TypeMatchupChart({ matchups }: { matchups: TypeEffectiveness[] }) {
  const groups = GROUPS.map((group) => ({
    ...group,
    types: matchups.filter((m) => group.test(m.multiplier)).map((m) => m.type),
  })).filter((group) => group.types.length > 0);

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">No notable weaknesses or resistances.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-sm text-muted-foreground">{group.label}</span>
          <div className="flex flex-wrap gap-1">
            {group.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
