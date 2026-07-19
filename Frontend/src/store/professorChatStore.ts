import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";

type ProfessorChatStore = {
  /** Site-wide Rotom Professor transcript — survives route changes. */
  messages: ChatMessage[];
  setMessages: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  /** Registered by the mounted Rotom ProfessorChat so Clear can stop a stream. */
  stopHandler: (() => void) | null;
  setStopHandler: (handler: (() => void) | null) => void;
  clearChat: () => void;
};

/** Shared Professor chat state for the floating Rotom panel only. Homepage /
 * Team Builder embeds keep their own local message state. */
export const useProfessorChatStore = create<ProfessorChatStore>((set, get) => ({
  messages: [],
  setMessages: (updater) =>
    set((state) => ({
      messages: typeof updater === "function" ? updater(state.messages) : updater,
    })),
  stopHandler: null,
  setStopHandler: (handler) => set({ stopHandler: handler }),
  clearChat: () => {
    get().stopHandler?.();
    set({ messages: [] });
  },
}));
