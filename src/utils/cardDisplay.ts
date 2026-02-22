/**
 * Map TCGdex setId to local set folder and display name for cards.
 */
const SET_ID_TO_FOLDER: Record<string, string> = {
  base1: 'base',
  base2: 'jungle',
  base3: 'fossil',
  base5: 'team-rocket',
};

export function getSetFolder(setId: string): string | null {
  return SET_ID_TO_FOLDER[setId] ?? null;
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
