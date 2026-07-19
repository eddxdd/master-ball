import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/auth";

/** Persisted the same way as `useThemeStore` (`Frontend/src/store/themeStore.ts`)
 * — a stateless JWT + the user it decodes to, kept in localStorage so a page
 * refresh doesn't sign you out. There's no server-side session to revoke;
 * `logout()` just discards the local copy (see the auth plan's v1 scope
 * boundary). */
export const AUTH_STORAGE_KEY = "masterball-auth";

type AuthStore = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: AUTH_STORAGE_KEY },
  ),
);
