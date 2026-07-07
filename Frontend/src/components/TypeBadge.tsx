import { typeColor } from "@/lib/typeColors";

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: typeColor(type) }}
    >
      {type}
    </span>
  );
}
