import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "@/lib/utils";

const PreviewCard = PreviewCardPrimitive.Root;
const PreviewCardTrigger = PreviewCardPrimitive.Trigger;

/** The popup half of a hover preview — same popover surface (bg/ring/shadow/
 * zoom-in animation) as `select.tsx`/`combobox.tsx`'s dropdowns, so a hover
 * preview reads as "the same kind of floating UI" as the rest of the site
 * rather than a one-off tooltip. */
function PreviewCardContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<PreviewCardPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="preview-card-content"
          className={cn(
            "w-64 origin-(--transform-origin) rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { PreviewCard, PreviewCardContent, PreviewCardTrigger };
