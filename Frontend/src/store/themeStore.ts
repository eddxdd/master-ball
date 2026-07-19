import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

/** Key shared with the inline anti-flash script in index.html — it reads
 * this same localStorage key (zustand's persist JSON shape) to set the
 * `.dark` class before first paint. Keep them in sync if this changes. */
export const THEME_STORAGE_KEY = "masterball-theme";

type ThemeStore = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

/** Dark is the default theme (see Docs/frontend/README.md's "Theming &
 * Design System" section) — Master Ball inspired, with a light theme
 * available via the toggle in AppLayout. */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
    }),
    { name: THEME_STORAGE_KEY },
  ),
);
