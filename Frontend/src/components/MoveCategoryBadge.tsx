import { Shield, Sparkle, Sword } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same "physical = orange, special = blue, status = pink" convention the
 * games themselves use for a move's category icon — recognizable at a
 * glance rather than making someone read "Physical"/"Special"/"Status" as
 * plain text every time, same rationale as `TypeBadge` for move types.
 * Falls back to a plain gray badge for anything unexpected rather than
 * guessing an icon. */
const CATEGORY_STYLES: Record<string, { icon: typeof Sword; className: string }> = {
  Physical: {
    icon: Sword,
    className: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  },
  Special: {
    icon: Sparkle,
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  Status: {
    icon: Shield,
    className: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
};

export function MoveCategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const style = CATEGORY_STYLES[category];
  const Icon = style?.icon ?? Sword;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        style?.className ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" />
      {category}
    </span>
  );
}
