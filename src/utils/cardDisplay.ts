/**
 * Map TCGdex setId to local set folder and display name for cards.
 * Card images are ONLY served from local paths; external URLs are never used.
 */
import fs from 'fs';
import path from 'path';

const SET_ID_TO_FOLDER: Record<string, string> = {
  base1: 'base',
  base2: 'jungle',
  base3: 'fossil',
  base5: 'team-rocket',
};

/** Preferred folder search order when resolving by name only */
const FOLDER_ORDER = ['base', 'jungle', 'fossil', 'team-rocket'];

const PLACEHOLDER_URL = '/images/cards/sets/Pokemon-Card-Back.png';

/** Root directory for card set images (frontend-dist in prod, frontend/public in dev) */
function getSetsBaseDir(): string {
  const cwd = process.cwd();
  const distDir = path.join(cwd, 'frontend-dist', 'images', 'cards', 'sets');
  const publicDir = path.join(cwd, 'frontend', 'public', 'images', 'cards', 'sets');
  if (fs.existsSync(path.join(cwd, 'frontend-dist'))) return distDir;
  return publicDir;
}

export function getSetFolder(setId: string): string | null {
  return SET_ID_TO_FOLDER[setId] ?? null;
}

/** Sanitize Pokemon/card name for use in filenames (matches syncLocalCardImages logic). */
export function sanitizeForFilename(name: string): string {
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
 * - Only local paths or placeholder are ever returned; external URLs are never used.
 * - If the card has a local path, we verify the file exists; if not, we try to find a matching file.
 * - If the card has an external or empty URL, we search the set folders for a matching file
 *   (e.g. Exeggcute.jpg, Exeggcute-2.jpg) so cards load even when DB path doesn't match disk.
 */
function findInFolderSync(setsBaseDir: string, setFolder: string, cardName: string): string | null {
  const dir = path.join(setsBaseDir, setFolder);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const safe = sanitizeForFilename(cardName).toLowerCase();
  for (let n = 0; n < 20; n++) {
    const target = n === 0 ? `${safe}.jpg` : `${safe}-${n + 1}.jpg`;
    const found = files.find((f) => f.toLowerCase() === target);
    if (found) return `/images/cards/sets/${setFolder}/${found}`;
  }
  return null;
}

function resolveFromFilesystem(setsBaseDir: string, setId: string, pokemonName: string): string | null {
  if (pokemonName.toLowerCase() === 'mew') {
    const promoPath = path.join(setsBaseDir, 'promo', 'ancientmew.jpg');
    if (fs.existsSync(promoPath)) return '/images/cards/sets/promo/ancientmew.jpg';
  }
  const folder = SET_ID_TO_FOLDER[setId] ?? setId;
  const inSet = findInFolderSync(setsBaseDir, folder, pokemonName);
  if (inSet) return inSet;
  for (const f of FOLDER_ORDER) {
    if (f === folder) continue;
    const found = findInFolderSync(setsBaseDir, f, pokemonName);
    if (found) return found;
  }
  return null;
}

export function getLocalCardImageUrl(card: {
  imageUrl: string | null;
  imageUrlLarge?: string | null;
  setId: string;
  pokemonName: string;
}): { imageUrl: string; imageUrlLarge: string } {
  const url = card.imageUrl?.trim() || '';
  const urlLarge = (card.imageUrlLarge?.trim() || url) || '';
  const setsBaseDir = getSetsBaseDir();

  // If we already have a local path, verify the file exists
  if (url.startsWith('/') && url.includes('/images/cards/sets/')) {
    const relative = url.replace(/^\/images\/cards\/sets\//, '');
    const fullPath = path.join(setsBaseDir, relative);
    if (fs.existsSync(fullPath)) {
      const largeOk = urlLarge.startsWith('/') && urlLarge.includes('/images/cards/sets/');
      const largePath = largeOk ? path.join(setsBaseDir, urlLarge.replace(/^\/images\/cards\/sets\//, '')) : fullPath;
      return {
        imageUrl: url,
        imageUrlLarge: (largeOk && fs.existsSync(largePath)) ? urlLarge : url,
      };
    }
    // File missing (e.g. wrong name like Exeggcute.jpg vs Exeggcute-2.jpg) — resolve from disk
  }

  // External URL, empty, or local path that didn't exist: resolve from filesystem by setId + pokemonName
  const resolved = resolveFromFilesystem(setsBaseDir, card.setId, card.pokemonName);
  if (resolved) return { imageUrl: resolved, imageUrlLarge: resolved };
  return { imageUrl: PLACEHOLDER_URL, imageUrlLarge: PLACEHOLDER_URL };
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
  const folder = SET_ID_TO_FOLDER[setId] ?? setId;
  if (folder) return folderToDisplayName(folder);
  return '';
}
