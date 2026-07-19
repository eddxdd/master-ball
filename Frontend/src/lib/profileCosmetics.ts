/** Trainer avatar / banner pack (ported from the old Master Ball dashboard). */

export type ProfileCosmeticKind = "avatar" | "banner";

export type ProfileCosmetic = {
  num: number;
  type: string;
  name: string;
  title: string;
};

export const PROFILE_COSMETICS: readonly ProfileCosmetic[] = [
  { num: 1, type: "fire", name: "Chili", title: "Fire Chef" },
  { num: 2, type: "grass", name: "Erika", title: "Nature Keeper" },
  { num: 3, type: "water", name: "Nessa", title: "Wave Rider" },
  { num: 4, type: "electric", name: "Elesa", title: "Spark Model" },
  { num: 5, type: "ghost", name: "Allister", title: "Shadow Spirit" },
  { num: 6, type: "fairy", name: "Diantha", title: "Fairy Champion" },
  { num: 7, type: "psychic", name: "Sabrina", title: "Mind Master" },
  { num: 8, type: "poison", name: "Marnie", title: "Rebel Punk" },
  { num: 9, type: "dragon", name: "Zinnia", title: "Dragon Tamer" },
] as const;

export type CosmeticChoice = {
  num: number;
  type: string;
};

export function avatarSrc(choice: CosmeticChoice): string {
  return `/images/profiles/avatars/${choice.num}-${choice.type}.png`;
}

export function bannerSrc(choice: CosmeticChoice): string {
  return `/images/profiles/banners/${choice.num}-${choice.type}.png`;
}

export function findCosmetic(choice: CosmeticChoice | null | undefined): ProfileCosmetic | null {
  if (!choice) return null;
  return PROFILE_COSMETICS.find((c) => c.num === choice.num && c.type === choice.type) ?? null;
}
