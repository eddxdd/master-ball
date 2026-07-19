import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Send, Square, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import MarkdownMessage from "@/components/MarkdownMessage";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { streamChatMessage, submitChatFeedback } from "@/lib/chatApi";
import { importTeam } from "@/lib/teamApi";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useProfessorChatStore } from "@/store/professorChatStore";
import { useProfessorLauncherStore } from "@/store/professorLauncherStore";
import type { ChatMessage } from "@/types/chat";
import type { Team } from "@/types/team";

const SUGGESTIONS = [
  "What's a good check for Kingambit in OU?",
  "Should I run a Choice Scarf or Choice Band on Dragapult?",
  "How does Terastallization change matchup math?",
  "What does Great Tusk's typical set look like?",
];

const TEAM_BUILDER_SUGGESTIONS = [
  "Build me a Gen 9 OU balance team",
  "Fill the rest of my team",
  "Give Dragapult a standard competitive set",
  "Suggest a teammate for my team",
];

// A fenced ```showdown block is app/agent/graph.py's TEAM_BUILDER_INSTRUCTIONS
// contract for a full, applyable team export — see that module's docstring.
const SHOWDOWN_BLOCK_PATTERN = /```showdown\s*\n([\s\S]*?)```/i;

function extractShowdownBlock(content: string): string | null {
  const match = content.match(SHOWDOWN_BLOCK_PATTERN);
  return match ? match[1].trim() : null;
}

// A light heuristic for "the user clearly asked to build/replace their
// team" — used only to decide whether to auto-apply a returned showdown
// block rather than waiting for an explicit "Apply this team" click. A
// false negative just means the user clicks the button themselves; a false
// positive would silently overwrite their team, so this stays narrow.
const BUILD_TEAM_INTENT_PATTERN =
  /\b(build|create|make|generate|assemble)\b[^.?!]*\b(team|roster|squad)\b|\bfill\b[^.?!]*\bteam\b/i;

function looksLikeBuildTeamRequest(message: string): boolean {
  return BUILD_TEAM_INTENT_PATTERN.test(message);
}

// How close to the bottom (px) counts as "still following the conversation"
// for auto-scroll purposes — see the scroll effect below.
const STICK_TO_BOTTOM_THRESHOLD_PX = 96;

type ProfessorChatProps = {
  /** Homepage embed: fixed height so long threads scroll inside the card
   * instead of stretching the page. Full `/professor` page leaves this off. */
  compact?: boolean;
  /** Auto-send once on mount (e.g. `/professor?ask=` deep-links). */
  autoAsk?: string | null;
  /** Team Builder embed: sends `team_builder: true` + `contextTeam`'s
   * species over WS (app/agent/graph.py's TEAM_BUILDER_INSTRUCTIONS) and
   * surfaces an "Apply to my team" action on any reply containing a fenced
   * ```showdown block. */
  teamBuilderMode?: boolean;
  contextTeam?: Team;
  onApplyTeam?: (team: Team) => void;
  /** Use the site-wide Rotom transcript store so chat survives navigation. */
  persistSession?: boolean;
  className?: string;
};

/**
 * The Professor chat widget — shared by `/professor`, the homepage embed,
 * and the Team Builder embed. Streams over WS /chat/ws (see
 * app/agent/graph.py). See Docs/frontend/README.md's "Professor /
 * Conversational Team Doctor" section.
 */
export function ProfessorChat({
  compact = false,
  autoAsk = null,
  teamBuilderMode = false,
  contextTeam,
  onApplyTeam,
  persistSession = false,
  className,
}: ProfessorChatProps) {
  // Falls back to the anonymous "Guest" label (see src/lib/clientId.ts) when
  // signed out — the real display_name once signed in.
  const userDisplayName = useAuthStore((state) => state.user?.display_name) ?? "Guest";
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const storeMessages = useProfessorChatStore((s) => s.messages);
  const setStoreMessages = useProfessorChatStore((s) => s.setMessages);
  const setStopHandler = useProfessorChatStore((s) => s.setStopHandler);
  const messages = persistSession ? storeMessages : localMessages;
  const setMessages = persistSession ? setStoreMessages : setLocalMessages;
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const streamBufferRef = useRef<{
    received: string;
    displayed: string;
    rafId: number | null;
    finished: boolean;
    citations: ChatMessage["citations"];
    turnId?: string;
    userMessage: string;
    assistantId: string;
    lastTs: number;
    carry: number;
    autoApply: boolean;
  } | null>(null);
  // Refs (not the callback props directly) so runQuery's closures — created
  // once per `send()` call and referenced from the finalize()/reveal() RAF
  // loop — always see the latest team/handler without needing to be
  // recreated on every contextTeam edit while a response is streaming.
  const contextTeamRef = useRef(contextTeam);
  const onApplyTeamRef = useRef(onApplyTeam);
  useEffect(() => {
    contextTeamRef.current = contextTeam;
    onApplyTeamRef.current = onApplyTeam;
  }, [contextTeam, onApplyTeam]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on every `messages` change purely as a trigger to re-check scroll position — the effect body itself only reads refs, not `messages`.
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollAnchorRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
      const buffer = streamBufferRef.current;
      if (buffer?.rafId !== null && buffer) cancelAnimationFrame(buffer.rafId);
    };
  }, []);

  // The LLM emits multi-word chunks with tens-to-hundreds of ms between
  // them. Draining each chunk as fast as rAF allows (then idling until the
  // next WS message) is what reads as "write… pause… write… pause". Instead
  // we reveal at a steady chars/sec rate and *slow down* as the undisplayed
  // backlog shrinks, so consecutive chunks blend into one continuous write
  // rather than racing to empty between arrivals.
  const runQuery = useCallback(
    (
      query: string,
      assistantId: string,
      autoApply = false,
      history: { role: "user" | "assistant"; content: string }[] = [],
    ) => {
      setIsStreaming(true);
      const buffer = {
        received: "",
        displayed: "",
        rafId: null as number | null,
        finished: false,
        citations: undefined as ChatMessage["citations"],
        turnId: undefined as string | undefined,
        userMessage: query,
        assistantId,
        lastTs: 0,
        carry: 0,
        autoApply,
      };
      streamBufferRef.current = buffer;

      const TARGET_CPS = 90;
      const SLOWDOWN_BACKLOG = 48;
      const CATCHUP_BACKLOG = 200;

      const finalize = () => {
        const finalContent = buffer.received || buffer.displayed;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalContent,
                  citations: buffer.citations,
                  turnId: buffer.turnId,
                  userMessage: buffer.userMessage,
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsStreaming(false);
        streamBufferRef.current = null;

        if (buffer.autoApply && onApplyTeamRef.current) {
          const block = extractShowdownBlock(finalContent);
          if (block) {
            importTeam(block)
              .then((response) => onApplyTeamRef.current?.(response.team))
              .catch(() => {
                // Auto-apply is a nicety — if it fails, the "Apply this team"
                // button below the message still lets the user retry manually.
              });
          }
        }
      };

      const reveal = (timestamp: number) => {
        buffer.rafId = null;
        if (streamBufferRef.current !== buffer) return;

        let dt = buffer.lastTs === 0 ? 16 : timestamp - buffer.lastTs;
        if (dt < 1) dt = 16;
        dt = Math.min(dt, 48);
        buffer.lastTs = timestamp;

        const backlog = buffer.received.length - buffer.displayed.length;
        if (backlog <= 0) {
          if (buffer.finished) finalize();
          return;
        }

        let rate = TARGET_CPS;
        if (!buffer.finished && backlog < SLOWDOWN_BACKLOG) {
          rate = Math.max(18, TARGET_CPS * (backlog / SLOWDOWN_BACKLOG));
        } else if (backlog > CATCHUP_BACKLOG) {
          rate += (backlog - CATCHUP_BACKLOG) * 0.4;
        } else if (buffer.finished) {
          rate = TARGET_CPS * 1.35;
        }

        buffer.carry += (rate * dt) / 1000;
        const chars = Math.min(backlog, Math.floor(buffer.carry));
        if (chars < 1) {
          buffer.rafId = requestAnimationFrame(reveal);
          return;
        }
        buffer.carry -= chars;
        buffer.displayed = buffer.received.slice(0, buffer.displayed.length + chars);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: buffer.displayed } : m)),
        );

        buffer.rafId = requestAnimationFrame(reveal);
      };

      const scheduleReveal = () => {
        if (buffer.rafId === null) {
          buffer.rafId = requestAnimationFrame(reveal);
        }
      };

      cancelRef.current = streamChatMessage(
        query,
        {
          onToken: (content) => {
            buffer.received += content;
            scheduleReveal();
          },
          onDone: ({ citations, answer, turnId }) => {
            // Always prefer the server's final answer — quality guards may
            // rewrite/shorten the streamed text after the fact.
            if (answer) {
              buffer.received = answer;
            }
            buffer.citations = citations;
            buffer.turnId = turnId;
            buffer.finished = true;
            scheduleReveal();
          },
          onError: (detail) => {
            if (buffer.rafId !== null) cancelAnimationFrame(buffer.rafId);
            buffer.rafId = null;
            streamBufferRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: detail, isStreaming: false, isError: true }
                  : m,
              ),
            );
            setIsStreaming(false);
          },
        },
        {
          teamBuilder: teamBuilderMode,
          team: contextTeamRef.current?.members.map((m) => m.species_id).filter(Boolean) ?? [],
          history,
        },
      );
    },
    [teamBuilderMode, setMessages],
  );

  const send = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isStreaming) return;

      // Snapshot prior turns before appending the new user/assistant pair so
      // the agent gets conversation context (follow-ups like "link that").
      const history = messagesRef.current
        .filter((m) => !m.isError && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const assistantId = crypto.randomUUID();
      stickToBottomRef.current = true;
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "", isStreaming: true },
      ]);
      setInput("");
      const autoApply = teamBuilderMode && looksLikeBuildTeamRequest(trimmed);
      runQuery(trimmed, assistantId, autoApply, history);
    },
    [isStreaming, runQuery, teamBuilderMode, setMessages],
  );

  const regenerate = useCallback(
    (assistantId: string) => {
      if (isStreaming) return;
      const currentMessages = messagesRef.current;
      const index = currentMessages.findIndex((m) => m.id === assistantId);
      const priorUserMessage = currentMessages
        .slice(0, index)
        .reverse()
        .find((m) => m.role === "user");
      if (!priorUserMessage) return;

      // History for a regenerate is everything before that user turn.
      const priorUserIndex = currentMessages.findIndex((m) => m.id === priorUserMessage.id);
      const history = currentMessages
        .slice(0, priorUserIndex)
        .filter((m) => !m.isError && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

      stickToBottomRef.current = true;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "", citations: undefined, isError: false, isStreaming: true }
            : m,
        ),
      );
      runQuery(priorUserMessage.content, assistantId, false, history);
    },
    [isStreaming, runQuery, setMessages],
  );

  const stop = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    const buffer = streamBufferRef.current;
    if (buffer) {
      if (buffer.rafId !== null) cancelAnimationFrame(buffer.rafId);
      buffer.rafId = null;
      const flushed = buffer.received || buffer.displayed;
      streamBufferRef.current = null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === buffer.assistantId
            ? { ...m, content: flushed || m.content, isStreaming: false }
            : m,
        ),
      );
    } else {
      setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
    }
    setIsStreaming(false);
  }, [setMessages]);

  useEffect(() => {
    if (!persistSession) return;
    setStopHandler(() => stop());
    return () => setStopHandler(null);
  }, [persistSession, setStopHandler, stop]);

  const lastAssistantMessageId = useMemo(
    () => messages.filter((m) => m.role === "assistant").at(-1)?.id,
    [messages],
  );

  // Delay auto-ask until after Strict Mode's mount→unmount→remount settles.
  // Use a cancelled flag (not a sticky askedRef) so the cleanup of the first
  // Strict pass doesn't permanently skip the real send on remount. `send` is
  // read via ref so isStreaming identity churn can't reset the timer.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!autoAsk) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (cancelled) return;
      sendRef.current(autoAsk);
      useProfessorLauncherStore.getState().clearAutoAsk();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [autoAsk]);

  const baseSuggestions = teamBuilderMode ? TEAM_BUILDER_SUGGESTIONS : SUGGESTIONS;
  const suggestions = compact ? baseSuggestions.slice(0, 2) : baseSuggestions;

  const chatBody = (
    <>
      {messages.length === 0 ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            compact ? "gap-3" : "items-center justify-center gap-3 py-10 text-center",
          )}
        >
          {compact ? (
            <div className="flex flex-1 items-center justify-center gap-3 px-2">
              <img
                src="/images/professor-avatar.png"
                alt=""
                aria-hidden
                className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
              <p className="text-lg font-medium text-foreground/90">
                Hello, I am the Professor — an{" "}
                <span className="font-semibold text-yellow-500">AI assistant</span> for team
                building, matchups, and competitive strategy. How can I help you today?
              </p>
            </div>
          ) : null}
          <div className={cn("flex flex-col gap-2", compact ? "shrink-0" : "items-center")}>
            <p className={cn("text-sm text-muted-foreground", compact ? "px-0.5" : undefined)}>
              Try asking something like:
            </p>
            <div
              className={cn(
                "flex flex-wrap gap-2",
                compact ? "flex-col sm:flex-row" : "justify-center",
              )}
            >
              {suggestions.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    compact && "h-auto justify-start whitespace-normal px-3 py-2 text-left",
                  )}
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        >
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              isLast={message.role === "assistant" && message.id === lastAssistantMessageId}
              onRegenerate={regenerate}
              userDisplayName={userDisplayName}
              teamBuilderMode={teamBuilderMode}
              onApplyTeam={onApplyTeam}
            />
          ))}
          <div ref={scrollAnchorRef} />
        </div>
      )}

      <form
        className={cn("flex shrink-0 gap-2", compact && "border-t border-border/60 pt-3")}
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the Professor anything..."
          className="max-h-28 min-h-10 resize-none overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        {isStreaming ? (
          <Button type="button" variant="outline" onClick={stop}>
            <Square className="fill-current" />
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="gradient" disabled={!input.trim()}>
            <Send />
          </Button>
        )}
      </form>
    </>
  );

  // Compact (homepage): chrome-less body inside the parent section frame.
  // Full page: own Card with room to breathe.
  if (compact) {
    return (
      <div
        id="professor-chat"
        className={cn(
          "flex h-[28rem] flex-col gap-3 px-4 pb-4 pt-3 sm:h-[25rem] sm:px-5",
          className,
        )}
      >
        {chatBody}
      </div>
    );
  }

  return (
    <Card id="professor-chat" className={cn("min-h-[28rem]", className)}>
      <CardContent className="flex h-full flex-col gap-4">{chatBody}</CardContent>
    </Card>
  );
}

const ChatBubble = memo(function ChatBubble({
  message,
  isLast,
  onRegenerate,
  userDisplayName,
  teamBuilderMode,
  onApplyTeam,
}: {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate: (assistantId: string) => void;
  userDisplayName: string;
  teamBuilderMode?: boolean;
  onApplyTeam?: (team: Team) => void;
}) {
  const isUser = message.role === "user";
  const isPending = message.isStreaming && !message.content;
  const showdownBlock =
    teamBuilderMode && !isUser && !message.isStreaming && !message.isError
      ? extractShowdownBlock(message.content)
      : null;

  const applyMutation = useMutation({
    mutationFn: (block: string) => importTeam(block),
    onSuccess: (response) => onApplyTeam?.(response.team),
  });

  return (
    <div
      className={cn(
        "flex items-start gap-3 duration-200 animate-in fade-in slide-in-from-bottom-1",
        isUser && "flex-row-reverse",
      )}
    >
      <MessageAvatar role={message.role} />
      <div
        className={cn("flex min-w-0 flex-1 flex-col gap-1", isUser ? "items-end" : "items-start")}
      >
        <span className="px-1 text-sm font-medium text-muted-foreground">
          {isUser ? userDisplayName : "Professor"}
        </span>
        <div
          className={cn(
            "max-w-[85%] rounded-xl px-3 py-2 text-base",
            isUser
              ? "bg-primary text-primary-foreground whitespace-pre-wrap"
              : message.isError
                ? "bg-destructive/10 text-destructive whitespace-pre-wrap"
                : "bg-muted text-foreground",
          )}
        >
          {isUser || message.isError ? (
            message.content
          ) : isPending ? (
            <TypingIndicator />
          ) : (
            <MarkdownMessage content={message.content} streaming={message.isStreaming} />
          )}
        </div>
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <Badge key={`${citation.source_id}-${citation.title}`} variant="outline">
                {citation.title}
              </Badge>
            ))}
          </div>
        )}
        {showdownBlock && (
          <Button
            type="button"
            variant={applyMutation.isSuccess ? "outline" : "gradient"}
            size="sm"
            className="w-fit"
            disabled={applyMutation.isPending || applyMutation.isSuccess}
            onClick={() => applyMutation.mutate(showdownBlock)}
          >
            {applyMutation.isSuccess ? (
              <>
                <CheckCircle2 /> Applied to your team
              </>
            ) : (
              <>
                <Wand2 /> {applyMutation.isPending ? "Applying..." : "Apply this team"}
              </>
            )}
          </Button>
        )}
        {applyMutation.isError && (
          <p className="text-destructive text-xs">Couldn't apply that team — try again.</p>
        )}
        {!isUser && !message.isError && !message.isStreaming && message.content && (
          <div className="flex items-center gap-0.5">
            <CopyButton text={message.content} label="Copy response" />
            {message.turnId && message.userMessage && (
              <MessageFeedback
                turnId={message.turnId}
                userMessage={message.userMessage}
                answer={message.content}
              />
            )}
            {isLast && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRegenerate(message.id)}
                title="Regenerate response"
              >
                <RefreshCw />
                <span className="sr-only">Regenerate response</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function MessageFeedback({
  turnId,
  userMessage,
  answer,
}: {
  turnId: string;
  userMessage: string;
  answer: string;
}) {
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const mutation = useMutation({
    mutationFn: (rating: "up" | "down") =>
      submitChatFeedback({
        turn_id: turnId,
        rating,
        message: userMessage,
        answer,
      }),
    onSuccess: (_data, rating) => setRated(rating),
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "text-muted-foreground hover:text-foreground",
          rated === "up" && "text-success",
        )}
        disabled={rated !== null || mutation.isPending}
        onClick={() => mutation.mutate("up")}
        title="Helpful"
      >
        <ThumbsUp />
        <span className="sr-only">Mark helpful</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "text-muted-foreground hover:text-foreground",
          rated === "down" && "text-destructive",
        )}
        disabled={rated !== null || mutation.isPending}
        onClick={() => mutation.mutate("down")}
        title="Not helpful — feeds the eval golden set"
      >
        <ThumbsDown />
        <span className="sr-only">Mark not helpful</span>
      </Button>
    </>
  );
}

function MessageAvatar({ role }: { role: ChatMessage["role"] }) {
  if (role === "assistant") {
    return (
      <img
        src="/images/professor-avatar.png"
        alt=""
        aria-hidden
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return <UserAvatar fallback="icon" className="size-10 after:border-transparent" />;
}

function TypingIndicator() {
  return (
    <span
      className="flex items-center gap-1 py-0.5"
      role="status"
      aria-label="The Professor is thinking"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
