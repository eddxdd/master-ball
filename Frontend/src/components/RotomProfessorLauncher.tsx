import { Eraser, Maximize2, Minimize2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfessorChatStore } from "@/store/professorChatStore";
import { useProfessorLauncherStore } from "@/store/professorLauncherStore";

/** Chat (markdown, streaming client, …) only loads once the panel has been
 * opened — otherwise every page paid for that bundle via AppLayout. */
const ProfessorChat = lazy(() =>
  import("@/components/ProfessorChat").then((m) => ({ default: m.ProfessorChat })),
);

/**
 * Site-wide floating Rotom launcher — the primary Professor surface (the
 * dedicated `/professor` page is retired). Open via the Rotom button or
 * `useProfessorLauncherStore.getState().openChat(ask)`.
 * Transcript persists across routes via `professorChatStore`.
 */
export function RotomProfessorLauncher() {
  const open = useProfessorLauncherStore((s) => s.open);
  const expanded = useProfessorLauncherStore((s) => s.expanded);
  const autoAsk = useProfessorLauncherStore((s) => s.autoAsk);
  const closeChat = useProfessorLauncherStore((s) => s.closeChat);
  const setExpanded = useProfessorLauncherStore((s) => s.setExpanded);
  const toggleOpen = useProfessorLauncherStore((s) => s.toggleOpen);
  const clearChat = useProfessorChatStore((s) => s.clearChat);
  const messageCount = useProfessorChatStore((s) => s.messages.length);

  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  /** Keep the chat mounted after first open so closing the panel doesn't wipe
   * in-flight UI; transcript itself lives in the store either way. */
  const [panelReady, setPanelReady] = useState(false);

  useEffect(() => {
    if (open) setPanelReady(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeChat();
    };
    // Use `click` (not mousedown) so openChat from page CTAs can set
    // ignoreOutsideUntil before a dismiss handler runs on the same gesture.
    const onOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (Date.now() < useProfessorLauncherStore.getState().ignoreOutsideUntil) return;
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        closeChat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onOutsideClick);
    window.addEventListener("touchend", onOutsideClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onOutsideClick);
      window.removeEventListener("touchend", onOutsideClick);
    };
  }, [open, closeChat]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    } else if (wasOpenRef.current) {
      buttonRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <div
      ref={rootRef}
      id="rotom-professor-launcher"
      className={cn(
        "pointer-events-none fixed z-50 flex flex-col items-end gap-2",
        expanded && open
          ? "inset-0 items-center justify-center p-3 sm:p-6"
          : "right-3 bottom-3 sm:right-5 sm:bottom-5",
      )}
    >
      {open && expanded && (
        <button
          type="button"
          aria-label="Close Professor chat"
          className="pointer-events-auto absolute inset-0 cursor-pointer bg-background/60 backdrop-blur-[1px]"
          onClick={closeChat}
        />
      )}

      {panelReady && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Ask the Professor"
          aria-modal={expanded && open}
          aria-hidden={!open}
          tabIndex={-1}
          className={cn(
            "pointer-events-auto relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl outline-none",
            "origin-bottom-right",
            open && "animate-in fade-in-0 zoom-in-95 duration-150",
            !open && "hidden",
            expanded
              ? "h-[75dvh] w-[min(100%,75vw)] max-w-5xl"
              : "h-[min(33.75rem,calc(100dvh-9rem))] w-[min(100vw-1.5rem,36rem)]",
          )}
        >
          <div className="relative flex shrink-0 items-center gap-3 overflow-hidden border-b border-border/70 px-3 py-2.5 sm:px-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.12]"
            />
            <img
              src="/images/professor-avatar.png"
              alt=""
              aria-hidden
              className="relative size-9 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-border"
            />
            <div className="relative min-w-0 flex-1">
              <h2 className="text-sm font-semibold leading-tight">Professor</h2>
              <p className="truncate text-xs text-muted-foreground">
                Ask about matchups, sets, or strategy.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="relative h-7 shrink-0 gap-1 px-2 text-xs"
              aria-label="Clear chat"
              disabled={messageCount === 0}
              onClick={clearChat}
            >
              <Eraser className="size-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="relative shrink-0"
              aria-label={expanded ? "Shrink chat window" : "Expand chat window"}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="relative shrink-0"
              aria-label="Close Professor chat"
              onClick={closeChat}
            >
              <X />
            </Button>
          </div>
          <Suspense fallback={<LoadingState label="Loading chat" size="inline" />}>
            <ProfessorChat
              compact
              persistSession
              autoAsk={autoAsk}
              className="min-h-0 flex-1 !h-full sm:!h-full"
            />
          </Suspense>
        </div>
      )}

      {!expanded && (
        <button
          ref={buttonRef}
          type="button"
          aria-label={
            open
              ? "Close Professor chat"
              : "Ask the Professor — get help with matchups, sets, and team building"
          }
          title={open ? "Close chat" : "Ask the Professor — matchups, sets, strategy, anytime"}
          aria-expanded={open}
          aria-controls={panelReady ? panelId : undefined}
          onClick={toggleOpen}
          className={cn(
            "group/rotom pointer-events-auto relative cursor-pointer rounded-xl bg-transparent p-0 transition-transform duration-150",
            "hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            open && "scale-95",
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md",
              "origin-right scale-95 opacity-0 transition duration-150",
              "group-hover/rotom:scale-100 group-hover/rotom:opacity-100 group-focus-visible/rotom:scale-100 group-focus-visible/rotom:opacity-100",
            )}
          >
            {open ? "Close chat" : "Ask the Professor"}
          </span>
          <img
            src="/images/rotom.png"
            alt=""
            aria-hidden
            draggable={false}
            decoding="async"
            className={cn(
              "rotom-phone-idle h-24 w-auto select-none drop-shadow-lg sm:h-[7.5rem]",
              open && "rotom-phone-idle-paused",
            )}
          />
        </button>
      )}
    </div>
  );
}
