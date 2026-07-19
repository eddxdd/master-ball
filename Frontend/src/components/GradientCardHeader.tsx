import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The colored, icon-led card header first introduced for the Pokedex detail
 * page's Ladder Usage panel (`UsageStatsCard`) — bleeds edge-to-edge via
 * negative margins (`Card` already clips overflow), so it reads as a
 * colored banner rather than a plain bordered box. Pulled out into its own
 * component so every other section card (evolution, base stats, type
 * matchups, abilities, natures, movepool, team-builder panels, ...) can
 * share the same treatment instead of each page re-deriving its own
 * `-mx-(--card-spacing) -mt-(--card-spacing) bg-...` incantation. A flat,
 * solid fill (not a gradient) — `gradient` just picks which brand color:
 * "brand" (the app's primary violet) is the default; "accent" (the cooler
 * blue used for `--ring`) is available for a spot where that reads better
 * next to other blue UI nearby.
 */
export function GradientCardHeader({
  icon: Icon,
  title,
  subtitle,
  gradient = "brand",
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  gradient?: "accent" | "brand";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-(--card-spacing) -mt-(--card-spacing) px-5 py-3 text-white",
        gradient === "accent" ? "bg-ring" : "bg-primary",
        className,
      )}
    >
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2.5 text-white">
          {Icon && <Icon className="size-5 shrink-0" />}
          {title}
        </CardTitle>
        {subtitle && <CardDescription className="text-white/80">{subtitle}</CardDescription>}
      </CardHeader>
    </div>
  );
}
