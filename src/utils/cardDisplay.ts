/**
 * Map TCGdex setId to local set folder and display name for cards.
 */
const SET_ID_TO_FOLDER: Record<string, string> = {
  base1: 'base',
  base2: 'jungle',
  base3: 'fossil',
  base5: 'team-rocket',
};

const PLACEHOLDER_URL = '/images/cards/sets/Pokemon-Card-Back.png';

export function getSetFolder(setId: string): string | null {
  return SET_ID_TO_FOLDER[setId] ?? null;
}

/** Sanitize Pokemon/card name for use in filenames (matches syncLocalCardImages logic). */
function sanitizeForFilename(name: string): string {
  return name
    .replace(/\u2642/g, '-m')
    .replace(/\u2640/g, '-f')
    .replace(/['']/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve card image URLs to local paths under /images/cards/sets/.
 * If the card already has a local path, use it. Otherwise derive from setId + pokemonName
 * so the frontend can load from the folder (e.g. /images/cards/sets/base/Bulbasaur.jpg).
 * When setId is not in our map, we try the "base" folder so cards from other sets
 * can still show if you have that Pokémon in base.
 */
export function getLocalCardImageUrl(card: {
  imageUrl: string | null;
  imageUrlLarge?: string | null;
  setId: string;
  pokemonName: string;
}): { imageUrl: string; imageUrlLarge: string } {
  const url = card.imageUrl?.trim() || '';
  const urlLarge = (card.imageUrlLarge?.trim() || url) || '';
  if (url.startsWith('/')) {
    return {
      imageUrl: url,
      imageUrlLarge: urlLarge.startsWith('/') ? urlLarge : url,
    };
  }
  const folder = SET_ID_TO_FOLDER[card.setId] ?? 'base';
  const base = `/images/cards/sets/${folder}/${sanitizeForFilename(card.pokemonName)}.jpg`;
  return { imageUrl: base, imageUrlLarge: base };
}

/**
 * Format a folder name as a display name (e.g. "team-rocket" -> "Team Rocket").
 */
function folderToDisplayName(folder: string): string {
  return folder
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Derive the set display name from the card's local imageUrl path.
 * e.g. "/images/cards/sets/team-rocket/Arbok.jpg" -> "Team Rocket"
 * Falls back to the setId only if the imageUrl has no recognisable folder.
 */
export function getSetDisplayName(setId: string, imageUrl?: string | null): string {
  if (imageUrl) {
    const match = imageUrl.match(/\/images\/cards\/sets\/([^/]+)\//);
    if (match) return folderToDisplayName(match[1]);
  }
  const folder = SET_ID_TO_FOLDER[setId];
  if (folder) return folderToDisplayName(folder);
  return '';          // unknown set — return empty so the tag is hidden
}
