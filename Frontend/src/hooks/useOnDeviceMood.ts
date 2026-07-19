import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { MoodLabel, MoodWorkerRequest, MoodWorkerResponse } from "@/workers/moodWorker";

export type { MoodLabel } from "@/workers/moodWorker";

export type OnDeviceMoodStatus =
  | "idle" // no text yet, or the worker hasn't been spun up
  | "loading-model" // one-time model download/warmup in progress (per browser session)
  | "classifying"
  | "ready"
  | "unsupported" // no Worker support (e.g. some test/SSR environments) — fails silently
  | "error";

export interface OnDeviceMoodResult {
  status: OnDeviceMoodStatus;
  label: MoodLabel | null;
  score: number | null;
  error: string | null;
}

const DEBOUNCE_MS = 700;

/**
 * Phase 7's on-device/edge AI demo — see Frontend/src/workers/moodWorker.ts's
 * module docstring for the full "why a worker, why this model" design note.
 * Classifies `text` (debounced, so this never fires on every keystroke) with
 * a small sentiment model running entirely in the browser via
 * `@huggingface/transformers` — after the model's one-time download, every
 * result here comes from pure local inference with no network round-trip.
 *
 * The worker is created lazily, only once `text` first becomes non-empty —
 * so simply visiting the Mental-Game Coach page never triggers a model
 * download; only actually writing a note does.
 */
export function useOnDeviceMood(text: string): OnDeviceMoodResult {
  const debounced = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const workerRef = useRef<Worker | null>(null);
  const nextRequestId = useRef(0);
  const latestRequestId = useRef(0);
  const [result, setResult] = useState<OnDeviceMoodResult>({
    status: "idle",
    label: null,
    score: null,
    error: null,
  });

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      setResult((prev) =>
        prev.status === "unsupported"
          ? prev
          : { status: "unsupported", label: null, score: null, error: null },
      );
      return;
    }
    if (!debounced) return;

    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/moodWorker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<MoodWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === "model-loading") {
          setResult((prev) => ({ ...prev, status: "loading-model" }));
        } else if (msg.type === "result") {
          if (msg.requestId !== latestRequestId.current) return; // stale, superseded response
          setResult({ status: "ready", label: msg.label, score: msg.score, error: null });
        } else if (msg.type === "error") {
          if (msg.requestId !== null && msg.requestId !== latestRequestId.current) return;
          setResult({ status: "error", label: null, score: null, error: msg.message });
        }
      };
      worker.onerror = () => {
        setResult({
          status: "error",
          label: null,
          score: null,
          error: "On-device mood model failed to load.",
        });
      };
      workerRef.current = worker;
    }

    const requestId = nextRequestId.current++;
    latestRequestId.current = requestId;
    setResult((prev) =>
      prev.status === "loading-model" ? prev : { ...prev, status: "classifying" },
    );
    const request: MoodWorkerRequest = { type: "classify", text: debounced, requestId };
    workerRef.current.postMessage(request);
  }, [debounced]);

  return result;
}
