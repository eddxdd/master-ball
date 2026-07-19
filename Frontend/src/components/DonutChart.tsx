import { cn } from "@/lib/utils";

export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/**
 * Compact conic-gradient donut with a legend — same visual language as the
 * Analytics type donut, reusable for role / usage / type mix elsewhere.
 */
export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  className,
  sizeClassName = "size-36",
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
  sizeClassName?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let cursor = 0;
  const stops =
    total > 0
      ? slices.map((slice) => {
          const start = cursor;
          const pct = (slice.value / total) * 100;
          cursor += pct;
          return `${slice.color} ${start}% ${cursor}%`;
        })
      : [];

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center", className)}>
      <div
        className={cn(
          "relative mx-auto shrink-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0_/0.06)]",
          sizeClassName,
        )}
        style={{
          background: stops.length
            ? `conic-gradient(from -90deg, ${stops.join(", ")})`
            : "var(--color-muted)",
        }}
        role="img"
        aria-label={
          centerLabel
            ? `${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`
            : undefined
        }
      >
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card shadow-inner">
          {centerValue != null && (
            <span className="font-mono text-lg font-semibold leading-none">{centerValue}</span>
          )}
          {centerLabel && (
            <span className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
              {centerLabel}
            </span>
          )}
        </div>
      </div>
      <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-1">
        {slices.map((slice) => {
          const pct = total > 0 ? (slice.value / total) * 100 : 0;
          return (
            <li key={slice.key} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: slice.color }}
              />
              <span className="min-w-0 truncate font-medium">{slice.label}</span>
              <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                {pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
