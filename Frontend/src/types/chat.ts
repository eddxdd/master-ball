export type Citation = {
  source_id: string;
  title: string;
  url: string | null;
  content: string;
  species_id: string | null;
  score: number;
};

export type ChatResponse = {
  answer: string;
  needs_clarification: boolean;
  citations: Citation[];
  turn_id: string;
  quality_warnings: string[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  turnId?: string;
  userMessage?: string;
  isStreaming?: boolean;
  isError?: boolean;
};
