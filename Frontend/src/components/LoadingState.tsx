import { cn } from "@/lib/utils";

type LoadingStateProps = {
  /** Visible caption under the wheel. Keep short. */
  label?: string;
  /** `page` = centered in a tall content area; `inline` = compact block. */
  size?: "page" | "inline";
  className?: string;
};

/**
 * Site-wide loading indicator — a dual-orbit wheel with a soft brand glow,
 * always centered. Prefer this over raw "Loading..." text or ad-hoc Loader2
 * icons for full-page / section waits.
 */
export function LoadingState({ label = "Loading", size = "page", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-5",
        size === "page" && "min-h-[min(50vh,28rem)] py-16",
        size === "inline" && "py-10",
        className,
      )}
    >
      <div className="loading-orbit" aria-hidden>
        <span className="loading-orbit-glow" />
        <span className="loading-orbit-ring loading-orbit-ring-outer" />
        <span className="loading-orbit-ring loading-orbit-ring-inner" />
        <span className="loading-orbit-core" />
      </div>
      <p className="animate-pulse text-sm font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
