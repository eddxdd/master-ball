import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CosmeticChoice } from "@/lib/profileCosmetics";

export const PROFILE_COSMETICS_STORAGE_KEY = "masterball-profile-cosmetics";

type UserCosmetics = {
  avatar: CosmeticChoice | null;
  banner: CosmeticChoice | null;
};

type ProfileCosmeticsStore = {
  byUserId: Record<string, UserCosmetics>;
  setAvatar: (userId: number, avatar: CosmeticChoice | null) => void;
  setBanner: (userId: number, banner: CosmeticChoice | null) => void;
  getForUser: (userId: number) => UserCosmetics;
};

const EMPTY: UserCosmetics = { avatar: null, banner: null };

function keyFor(userId: number): string {
  return String(userId);
}

/** Client-only avatar/banner picks (same approach as the old dashboard —
 * no backend column yet). Persisted per user id in localStorage. */
export const useProfileCosmeticsStore = create<ProfileCosmeticsStore>()(
  persist(
    (set, get) => ({
      byUserId: {},
      setAvatar: (userId, avatar) =>
        set((state) => {
          const key = keyFor(userId);
          const prev = state.byUserId[key] ?? EMPTY;
          return {
            byUserId: {
              ...state.byUserId,
              [key]: { ...prev, avatar },
            },
          };
        }),
      setBanner: (userId, banner) =>
        set((state) => {
          const key = keyFor(userId);
          const prev = state.byUserId[key] ?? EMPTY;
          return {
            byUserId: {
              ...state.byUserId,
              [key]: { ...prev, banner },
            },
          };
        }),
      getForUser: (userId) => get().byUserId[keyFor(userId)] ?? EMPTY,
    }),
    { name: PROFILE_COSMETICS_STORAGE_KEY },
  ),
);

export function useUserCosmetics(userId: number | undefined): UserCosmetics {
  return useProfileCosmeticsStore((state) =>
    userId == null ? EMPTY : (state.byUserId[keyFor(userId)] ?? EMPTY),
  );
}
