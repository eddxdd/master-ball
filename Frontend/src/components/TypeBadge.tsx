import { Link } from "react-router";
import { typeColor, typeTextColor } from "@/lib/typeColors";

/** `linkable` defaults to true (wraps the badge in a link to its type detail
 * page). Pass `linkable={false}` when the badge already sits inside another
 * `<Link>` (e.g. a Pokemon card) — nesting `<a>` tags is invalid HTML and
 * breaks click targeting. See Docs/frontend/README.md. */
export function TypeBadge({ type, linkable = true }: { type: string; linkable?: boolean }) {
  const badge = (
    <span
      className="inline-flex items-center rounded-full border border-black/10 px-2 py-0.5 text-xs font-semibold dark:border-white/10"
      style={{ backgroundColor: typeColor(type), color: typeTextColor(type) }}
    >
      {type}
    </span>
  );

  if (!linkable) {
    return badge;
  }

  return (
    <Link to={`/types/${type}`} className="transition-opacity hover:opacity-80">
      {badge}
    </Link>
  );
}
