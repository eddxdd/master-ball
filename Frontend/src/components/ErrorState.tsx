import { ArrowLeft, Home } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  /** HTTP-style status shown large — usually 404 for missing resources. */
  status?: number;
  title: string;
  description?: string;
  /** Primary recovery link. Defaults to home. */
  actionTo?: string;
  actionLabel?: string;
  className?: string;
  id?: string;
};

/**
 * Centered “MissingNo” error surface for not-found / failed detail pages.
 * Keeps status code, message, and a clear escape hatch in one composition.
 */
export function ErrorState({
  status = 404,
  title,
  description = "This entry isn't in the Master Ball dex — it may have never existed, or the link is stale.",
  actionTo = "/",
  actionLabel = "Back to home",
  className,
  id = "error-state",
}: ErrorStateProps) {
  const ActionIcon = actionTo === "/" ? Home : ArrowLeft;

  return (
    <div
      id={id}
      role="alert"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:py-24",
        "min-h-[min(60vh,32rem)]",
        className,
      )}
    >
      <img
        src="/images/missingno.png"
        alt=""
        width={160}
        height={160}
        className="size-36 object-contain drop-shadow-[0_0_24px_rgb(168_85_247_/_0.35)] sm:size-40"
        style={{ imageRendering: "pixelated" }}
      />

      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-[#f8d030] uppercase">
          Error {status}
        </p>
        <h1 className="max-w-lg text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="max-w-md text-balance text-muted-foreground">{description}</p>
      </div>

      <p className="max-w-sm text-xs text-muted-foreground/80">
        Wild MissingNo. appeared — a glitch in the data. Try another search or head back.
      </p>

      <Button render={<Link to={actionTo} />} variant="gradient" size="lg">
        <ActionIcon />
        {actionLabel}
      </Button>
    </div>
  );
}
