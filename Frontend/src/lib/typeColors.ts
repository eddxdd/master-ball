/** Standard Pokemon type colors, used for type badges across the Pokedex/
 * Calculator/Team Builder UIs — kept as one shared map so a color only ever
 * needs updating in one place. */
export const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A878",
  Fire: "#F08030",
  Water: "#6890F0",
  Electric: "#F8D030",
  Grass: "#78C850",
  Ice: "#98D8D8",
  Fighting: "#C03028",
  Poison: "#A040A0",
  Ground: "#E0C068",
  Flying: "#A890F0",
  Psychic: "#F85888",
  Bug: "#A8B820",
  Rock: "#B8A038",
  Ghost: "#705898",
  Dragon: "#7038F8",
  Dark: "#705848",
  Steel: "#B8B8D0",
  Fairy: "#EE99AC",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#68A090";
}

/** Picks black or white text for a given type badge background using
 * relative luminance (WCAG formula), since several type colors (Electric,
 * Ice, Fairy) are too light for the white text that used to be hardcoded. */
export function typeTextColor(type: string): "#000000" | "#ffffff" {
  const hex = typeColor(type).replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

/** Soft mid-tone stop for type-colored list cards — lightens dark types and
 * darkens pale ones (Electric, Ice, Fairy) so white text stays readable. */
function typeCardStop(type: string, whiteMix: number): string {
  const hex = typeColor(type);
  if (typeTextColor(type) === "#000000") {
    return `color-mix(in srgb, ${hex} 58%, #5c4a12)`;
  }
  return `color-mix(in srgb, ${hex} ${100 - whiteMix}%, white)`;
}

/** Pastel type gradient + soft circular glow for mobile Pokedex list cards. */
export function typeCardBackground(type1: string, type2?: string | null): string {
  const c1 = typeCardStop(type1, 18);
  const c2 = type2 ? typeCardStop(type2, 28) : typeCardStop(type1, 36);
  return [
    "radial-gradient(circle at 88% 50%, rgba(255,255,255,0.28) 0%, transparent 42%)",
    `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
  ].join(", ");
}
