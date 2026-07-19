import { cn } from "@/lib/utils";

/** Low-opacity decorative Pokeball for type-colored heroes and list cards. */
export function PokeballWatermark({ className }: { className?: string }) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: purely decorative watermark
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className={cn(
        "pointer-events-none absolute -top-8 -right-10 h-64 w-64 text-white/20",
        className,
      )}
    >
      <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="14" />
      <path d="M10 100 H190" stroke="currentColor" strokeWidth="14" />
      <circle cx="100" cy="100" r="26" fill="none" stroke="currentColor" strokeWidth="14" />
      <circle cx="100" cy="100" r="12" fill="currentColor" />
    </svg>
  );
}
