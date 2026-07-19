import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A small "copy to clipboard" icon button — the one interaction every major
 * AI chat UI has on both a whole message and each code block. Shared by
 * both, so the confirmation behavior (swap to a checkmark for a moment)
 * can't drift between the two call sites.
 */
export function CopyButton({
  text,
  label = "Copy",
  className,
  size = "icon-xs",
}: {
  text: string;
  label?: string;
  className?: string;
  size?: "icon-xs" | "icon-sm";
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard access can be denied/unavailable (e.g. insecure context) —
      // there's nothing more useful to do than silently skip the "copied"
      // confirmation, same "fail quiet, never crash the surrounding UI"
      // convention as the rest of this app's optional-feature failure modes.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      onClick={copy}
      title={copied ? "Copied!" : label}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      <span className="sr-only">{copied ? "Copied" : label}</span>
    </Button>
  );
}
