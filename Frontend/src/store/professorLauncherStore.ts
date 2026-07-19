import { create } from "zustand";

type ProfessorLauncherStore = {
  open: boolean;
  expanded: boolean;
  /** Prompt to auto-send once when the panel opens (does not remount chat). */
  autoAsk: string | null;
  /** Ignore outside-click dismiss until this timestamp (avoids open→close on same click). */
  ignoreOutsideUntil: number;
  openChat: (ask?: string | null) => void;
  clearAutoAsk: () => void;
  closeChat: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleOpen: () => void;
};

/** Site-wide Rotom Professor panel — open from nav-less CTAs (Pokedex, home).
 * Chat transcript lives in `professorChatStore` so it survives navigation. */
export const useProfessorLauncherStore = create<ProfessorLauncherStore>((set) => ({
  open: false,
  expanded: false,
  autoAsk: null,
  ignoreOutsideUntil: 0,
  openChat: (ask = null) =>
    set({
      open: true,
      autoAsk: ask,
      ignoreOutsideUntil: Date.now() + 500,
    }),
  clearAutoAsk: () => set({ autoAsk: null }),
  closeChat: () => set({ open: false, expanded: false, autoAsk: null }),
  setExpanded: (expanded) => set({ expanded }),
  toggleOpen: () =>
    set((state) =>
      state.open
        ? { open: false, expanded: false, autoAsk: null }
        : { open: true, ignoreOutsideUntil: Date.now() + 500 },
    ),
}));
