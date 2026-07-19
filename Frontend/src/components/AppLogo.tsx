import { APP_LOGO_SRC } from "@/config/branding";
import { cn } from "@/lib/utils";

const SIZE = {
  /** Auth shell wordmark companion */
  xs: { className: "size-[1.375rem]", px: 22 },
  /** Header / footer */
  sm: { className: "size-7", px: 28 },
  /** Homepage hero — 25% under the previous 80/88px mark */
  hero: { className: "size-[3.75rem] sm:size-[4.125rem]", px: 66 },
} as const;

type AppLogoSize = keyof typeof SIZE;

/**
 * Shared Master Ball mark with a soft glow + layered drop shadow so it reads
 * as a polished brand icon on both light chrome and dark heroes.
 */
export function AppLogo({
  size = "sm",
  className,
  imgClassName,
}: {
  size?: AppLogoSize;
  className?: string;
  imgClassName?: string;
}) {
  const { className: sizeClass, px } = SIZE[size];

  return (
    <span
      className={cn("app-logo", sizeClass, size === "hero" && "app-logo--hero", className)}
      aria-hidden
    >
      <span className="app-logo__glow" />
      <img
        src={APP_LOGO_SRC}
        alt=""
        width={px}
        height={px}
        decoding="async"
        className={cn("app-logo__mark size-full", imgClassName)}
      />
    </span>
  );
}
