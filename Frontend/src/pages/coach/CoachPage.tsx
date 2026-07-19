import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ProfessorChat } from "@/components/ProfessorChat";
import { Seo } from "@/components/Seo";

/**
 * Phase 2's flagship Professor page (Conversational Team Doctor) — wraps the
 * shared chat widget with page chrome and `/professor?ask=` deep-link handling.
 * See Docs/frontend/README.md's "Professor / Conversational Team Doctor" section.
 */
export function CoachPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Capture once on mount so stripping `ask` from the URL doesn't clear the
  // value before ProfessorChat's auto-send effect runs.
  const [autoAsk] = useState(() => searchParams.get("ask"));

  useEffect(() => {
    if (!autoAsk) return;
    setSearchParams(
      (prev) => {
        if (!prev.has("ask")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("ask");
        return next;
      },
      { replace: true },
    );
  }, [autoAsk, setSearchParams]);

  return (
    <div id="coach-page" className="mx-auto flex max-w-3xl flex-col gap-4">
      <Seo
        title="Professor"
        description="Ask Master Ball's Professor anything about competitive Pokemon — grounded, cited answers powered by RAG and a LangGraph agent, backed by real stat/damage tools, not just guesses."
      />
      <div id="coach-header">
        <h1 className="text-2xl font-semibold">Professor</h1>
        <p className="text-sm text-muted-foreground">
          Ask about matchups, sets, or strategy. Answers are grounded in real tools (damage calc,
          Pokedex data, strategy notes) — not just an LLM guessing.
        </p>
      </div>

      <ProfessorChat autoAsk={autoAsk} />
    </div>
  );
}
