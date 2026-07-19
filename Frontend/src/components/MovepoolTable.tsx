import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { MoveInfoLink } from "@/components/MoveInfoLink";
import { TypeBadge } from "@/components/TypeBadge";
import type { MoveSummary } from "@/types/pokemon";

export function MovepoolTable({ moves }: { moves: MoveSummary[] }) {
  if (moves.length === 0) {
    return <p className="text-muted-foreground text-sm">No gen-9-legal moves on record.</p>;
  }

  return (
    <div className="max-h-96 overflow-y-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="p-2 font-medium">Move</th>
            <th className="p-2 font-medium">Type</th>
            <th className="p-2 font-medium">Cat.</th>
            <th className="p-2 font-medium text-right">Pow.</th>
            <th className="p-2 font-medium text-right">Acc.</th>
            <th className="p-2 font-medium text-right">PP</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => (
            <tr key={move.id} className="border-b border-border last:border-0 odd:bg-muted/30">
              <td className="p-2 font-medium">
                <MoveInfoLink move={move} />
              </td>
              <td className="p-2">
                <TypeBadge type={move.type} />
              </td>
              <td className="p-2">
                <MoveCategoryBadge category={move.category} />
              </td>
              <td className="p-2 text-right font-mono">{move.base_power ?? "—"}</td>
              <td className="p-2 text-right font-mono">{move.accuracy ?? "—"}</td>
              <td className="p-2 text-right font-mono">{move.pp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
