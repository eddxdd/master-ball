import { InfoLink } from "@/components/InfoLink";
import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { TypeBadge } from "@/components/TypeBadge";

/** One power/accuracy/PP chip in a move's hover-preview stat row — "—" for
 * a null value (e.g. Swift's accuracy, a status move's power) rather than
 * hiding the chip entirely, so the row's three-column layout never shifts
 * between moves. */
function MoveStat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono font-semibold">{value ?? "—"}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export type MoveInfoLinkMove = {
  move_id?: string | null;
  id?: string;
  name: string;
  type?: string | null;
  category?: string | null;
  base_power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  description?: string | null;
};

/** The power/accuracy/PP stat row shared by every move hover preview —
 * exported on its own so `UsageStatsCard`'s `MoveUsageList` (which builds
 * its own `InfoLink` through the generic `UsageBar`, rather than through
 * `MoveInfoLink` below) still renders the identical row instead of a
 * near-duplicate. */
export function MoveStatsRow({
  move,
}: {
  move: Pick<MoveInfoLinkMove, "base_power" | "accuracy" | "pp">;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-2 text-center text-xs">
      <MoveStat label="Power" value={move.base_power ?? null} />
      <MoveStat label="Accuracy" value={move.accuracy ? `${move.accuracy}%` : null} />
      <MoveStat label="PP" value={move.pp ?? null} />
    </div>
  );
}

/** The one move-hover convention: name + type/category badges + a
 * power/accuracy/PP stat row + effect text, all in one popup — used
 * anywhere a move name is clickable (the movepool table, Ladder Usage's
 * top moves, the Damage Calculator's selected move) so a move reads and
 * behaves the same everywhere instead of each list rolling its own subset
 * of this info. Falls back to a plain link when there's no move id to
 * link to (Smogon usage-stats moves that didn't resolve against the seeded
 * Moves table). */
export function MoveInfoLink({ move, className }: { move: MoveInfoLinkMove; className?: string }) {
  const moveId = move.move_id ?? move.id;
  if (!moveId) {
    return <span className={className}>{move.name}</span>;
  }

  return (
    <InfoLink
      to={`/moves/${moveId}`}
      title={move.description}
      className={className}
      badges={
        (move.type || move.category) && (
          <div className="flex items-center gap-1.5">
            {move.type && <TypeBadge type={move.type} />}
            {move.category && <MoveCategoryBadge category={move.category} />}
          </div>
        )
      }
      stats={<MoveStatsRow move={move} />}
    >
      {move.name}
    </InfoLink>
  );
}
