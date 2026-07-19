import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Extra delay after the element enters view (ms). */
  delayMs?: number;
  /** Also stagger direct children (cards in a grid). */
  stagger?: boolean;
  /** Intersection threshold — keep near 0 so tall blocks (e.g. Pokedex grids)
   * still fire when only a sliver is on screen. Higher values can leave large
   * elements stuck at opacity 0 forever. */
  threshold?: number;
};

/**
 * Scroll-triggered entrance — fades/rises once when the block enters the
 * viewport, then stays put. Use for below-the-fold sections. Landing/route
 * transitions belong on `PageEnter`, not here.
 */
export function Reveal({
  children,
  className,
  id,
  delayMs = 0,
  stagger = false,
  threshold = 0,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      // Slight bottom inset so reveals feel tied to scroll, not the moment a
      // pixel peeks in — still fires for tall content because threshold is 0.
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      id={id}
      className={cn("reveal", stagger && "reveal-stagger", inView && "reveal-in", className)}
      style={delayMs ? ({ "--reveal-delay": `${delayMs}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
