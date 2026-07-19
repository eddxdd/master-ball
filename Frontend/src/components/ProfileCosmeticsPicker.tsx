import { Check, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  avatarSrc,
  bannerSrc,
  type CosmeticChoice,
  PROFILE_COSMETICS,
  type ProfileCosmeticKind,
} from "@/lib/profileCosmetics";
import { typeColor } from "@/lib/typeColors";
import { cn } from "@/lib/utils";

type ProfileCosmeticsPickerProps = {
  kind: ProfileCosmeticKind;
  selected: CosmeticChoice | null;
  onSelect: (choice: CosmeticChoice) => void;
  onClose: () => void;
};

/**
 * Modal grid to pick a trainer avatar or banner. Images are used as-is with
 * CSS cover (no crop UI) — centered by default.
 */
export function ProfileCosmeticsPicker({
  kind,
  selected,
  onSelect,
  onClose,
}: ProfileCosmeticsPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const title = kind === "avatar" ? "Choose Avatar" : "Choose Banner";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        aria-label="Close avatar picker"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-cosmetics-title"
        className="relative flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="profile-cosmetics-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div
            className={cn(
              "grid gap-3",
              kind === "avatar" ? "grid-cols-3 sm:grid-cols-3" : "grid-cols-1",
            )}
          >
            {PROFILE_COSMETICS.map((cosmetic) => {
              const choice: CosmeticChoice = { num: cosmetic.num, type: cosmetic.type };
              const isSelected = selected?.num === cosmetic.num && selected?.type === cosmetic.type;
              const accent = typeColor(
                cosmetic.type.charAt(0).toUpperCase() + cosmetic.type.slice(1),
              );

              if (kind === "banner") {
                return (
                  <button
                    key={cosmetic.num}
                    type="button"
                    onClick={() => {
                      onSelect(choice);
                      onClose();
                    }}
                    className={cn(
                      "group relative aspect-[16/4.5] overflow-hidden rounded-xl border-2 text-left transition-all",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isSelected
                        ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                        : "border-border/80 hover:border-primary/60",
                    )}
                    style={{
                      backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.45), transparent 55%), url(${bannerSrc(choice)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
                      <span>
                        <span className="block text-sm font-semibold text-white drop-shadow">
                          {cosmetic.name}
                        </span>
                        <span className="block text-xs text-white/75">{cosmetic.title}</span>
                      </span>
                      {isSelected && (
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="size-4" />
                        </span>
                      )}
                    </span>
                    {!isSelected && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                        Select
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={cosmetic.num}
                  type="button"
                  onClick={() => {
                    onSelect(choice);
                    onClose();
                  }}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-xl border border-border/80 bg-muted/30 p-3 transition-all",
                    "hover:border-primary/50 hover:bg-muted/50",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isSelected && "border-primary bg-primary/10 ring-1 ring-primary/40",
                  )}
                >
                  <span
                    className="relative size-[4.5rem] rounded-full p-[3px] shadow-md sm:size-20"
                    style={{
                      background: `linear-gradient(145deg, ${accent}, color-mix(in srgb, ${accent} 40%, #111))`,
                    }}
                  >
                    <span
                      className="block size-full rounded-full bg-card bg-cover bg-center"
                      style={{ backgroundImage: `url(${avatarSrc(choice)})` }}
                      role="img"
                      aria-label={`${cosmetic.name} avatar`}
                    />
                    {isSelected && (
                      <span className="absolute -right-0.5 -bottom-0.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-card">
                        <Check className="size-3.5" />
                      </span>
                    )}
                    {!isSelected && (
                      <span className="pointer-events-none absolute inset-[3px] flex items-center justify-center rounded-full bg-black/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
                        Select
                      </span>
                    )}
                  </span>
                  <span className="text-center">
                    <span className="block text-xs font-semibold leading-tight">
                      {cosmetic.name}
                    </span>
                    <span className="block text-[0.65rem] leading-tight text-muted-foreground">
                      {cosmetic.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
