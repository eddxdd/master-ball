/**
 * Phase 7's on-device/edge AI demo (Docs/tech-stack.md's "On-device/edge AI"
 * section, Docs/roadmap.md's Phase 7 item 2): a small sentiment-classification
 * model running entirely inside this Web Worker via `@huggingface/transformers`
 * (Transformers.js) — WebGPU-accelerated where available, WASM otherwise —
 * with zero network round-trip per classification. The model weights
 * themselves are fetched once from the Hugging Face CDN on first use and then
 * served from the browser's own cache; every classification after that is
 * pure local inference.
 *
 * Deliberately isolated in its own worker (rather than running on the main
 * thread, which `Frontend/src/hooks/useOnDeviceMood.ts` could technically do
 * directly): `@huggingface/transformers`' WASM/ONNX runtime does real
 * synchronous-feeling compute per call, and this is a live typing surface
 * (Frontend/src/pages/coach/MentalCoachPage.tsx's post-loss note) — running it
 * off the main thread means the UI never has a reason to jank while a
 * classification is in flight, which is also the honest "why a worker here"
 * answer for this being an interview-ready design decision, not a tacked-on
 * demo (see tech-stack.md's own framing of this feature).
 */
import { type PipelineType, pipeline } from "@huggingface/transformers";

const TASK: PipelineType = "sentiment-analysis";
const MODEL_ID = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

/** Below this confidence, the raw positive/negative label is treated as too
 * uncertain to call a real signal — this binary-only model has no native
 * "neutral" class, so low-confidence outputs are bucketed there instead of
 * over-stating a mood the model isn't actually sure about. */
const NEUTRAL_CONFIDENCE_THRESHOLD = 0.65;

export type MoodLabel = "positive" | "neutral" | "negative";

export type MoodWorkerRequest = { type: "classify"; text: string; requestId: number };

export type MoodWorkerResponse =
  | { type: "model-loading" }
  | { type: "result"; requestId: number; label: MoodLabel; score: number }
  | { type: "error"; requestId: number | null; message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<MoodWorkerRequest>) => void) | null;
  postMessage: (message: MoodWorkerResponse) => void;
}

// Cast rather than pulling in the "webworker" lib alongside this app's
// existing "DOM" lib (tsconfig.app.json) — the two ship conflicting global
// declarations (`self`, `postMessage`, etc.) and can't coexist in one
// program. This file only needs the two members declared above at the
// type level; everything else about worker globals is left untyped.
const ctx = globalThis as unknown as WorkerScope;

type Classifier = (text: string) => Promise<Array<{ label: string; score: number }>>;

let classifierPromise: Promise<Classifier> | null = null;

function getClassifier(): Promise<Classifier> {
  if (!classifierPromise) {
    ctx.postMessage({ type: "model-loading" });
    classifierPromise = pipeline(TASK, MODEL_ID).then((p) => p as unknown as Classifier);
  }
  return classifierPromise;
}

function toMoodLabel(rawLabel: string, score: number): MoodLabel {
  if (score < NEUTRAL_CONFIDENCE_THRESHOLD) return "neutral";
  return rawLabel.toUpperCase() === "POSITIVE" ? "positive" : "negative";
}

ctx.onmessage = async (event) => {
  const { type } = event.data;
  if (type !== "classify") return;
  const { text, requestId } = event.data;

  try {
    const classifier = await getClassifier();
    const [result] = await classifier(text);
    ctx.postMessage({
      type: "result",
      requestId,
      label: toMoodLabel(result.label, result.score),
      score: result.score,
    });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      requestId,
      message: err instanceof Error ? err.message : "On-device mood model failed to run.",
    });
  }
};
