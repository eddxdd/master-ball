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
