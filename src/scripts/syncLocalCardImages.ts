/**
 * Sync Card imageUrl from local folders under frontend/public/images/cards/sets/
 *
 * Strategy:
 * 1. For cards whose setId maps to a local folder (base1→base, base2→jungle, etc.):
 *    - Look up the card name via TCGdex localId
 *    - Find the renamed file (e.g. Pikachu.jpg, Pikachu-2.jpg)
 * 2. For all other cards (including PLACEHOLDER setId):
 *    - Search ALL set folders for any file matching the pokemonName
 *    - Prefer order: base → jungle → fossil → team-rocket
 * 3. If no local image is found at all: use Pokemon-Card-Back.png
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';

const SETS_DIR = path.join(process.cwd(), 'frontend', 'public', 'images', 'cards', 'sets');
const PLACEHOLDER_URL = '/images/cards/sets/Pokemon-Card-Back.png';

/** Mew: use only Ancient Mew from promo folder */
const MEW_IMAGE_URL = '/images/cards/sets/promo/ancientmew.jpg';

// TCGdex setId → local folder name
const SET_ID_TO_FOLDER: Record<string, string> = {
  base1: 'base',
  base2: 'jungle',
  base3: 'fossil',
  base5: 'team-rocket',
};

// Preferred folder search order when setId has no direct mapping
const FOLDER_ORDER = ['base', 'jungle', 'fossil', 'team-rocket'];

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

async function fetchSetCardNames(tcgdexId: string): Promise<Map<string, string>> {
  const res = await fetch(`https://api.tcgdex.net/v2/en/sets/${tcgdexId}`);
  if (!res.ok) return new Map();
  const data = (await res.json()) as { cards: Array<{ localId: string; name: string }> };
  const map = new Map<string, string>();
  for (const card of data.cards || []) {
    const id = String(parseInt(card.localId, 10));
    map.set(id, card.name);
  }
  return map;
}

function extractLocalIdFromTcgdexId(tcgdexId: string | null): string | null {
  if (!tcgdexId || typeof tcgdexId !== 'string') return null;
  const withoutTier = tcgdexId.split('-t')[0];
  const parts = withoutTier.split('-');
  const last = parts[parts.length - 1];
  return /^\d+$/.test(last) ? String(parseInt(last, 10)) : null;
}

// Cache directory listings for performance
const dirListingCache = new Map<string, string[]>();
function getDirListing(setFolder: string): string[] {
  if (dirListingCache.has(setFolder)) return dirListingCache.get(setFolder)!;
  const dir = path.join(SETS_DIR, setFolder);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).map((f) => f.toLowerCase());
  dirListingCache.set(setFolder, files);
  // Also cache the actual-cased names for URL building
  const realFiles = fs.readdirSync(dir);
  realDirListingCache.set(setFolder, realFiles);
  return files;
}
const realDirListingCache = new Map<string, string[]>();
function getRealDirListing(setFolder: string): string[] {
  if (!realDirListingCache.has(setFolder)) getDirListing(setFolder);
  return realDirListingCache.get(setFolder) ?? [];
}

/**
 * Find a local image for a specific set folder + card name.
 * Reads real filenames from disk so the URL always has correct casing.
 * Tries Name.jpg, Name-2.jpg, Name-3.jpg, ...
 */
function findInFolder(setFolder: string, cardName: string): string | null {
  const lowercaseFiles = getDirListing(setFolder);
  const realFiles = getRealDirListing(setFolder);
  const safe = sanitizeForFilename(cardName).toLowerCase();
  for (let n = 0; n < 20; n++) {
    const target = n === 0 ? `${safe}.jpg` : `${safe}-${n + 1}.jpg`;
    const idx = lowercaseFiles.indexOf(target);
    if (idx !== -1) {
      return `/images/cards/sets/${setFolder}/${realFiles[idx]}`;
    }
  }
  return null;
}

/**
 * Search ALL set folders for a file matching the pokemon name.
 * Uses FOLDER_ORDER preference.
 */
function findAcrossAllFolders(pokemonName: string): string | null {
  for (const folder of FOLDER_ORDER) {
    const url = findInFolder(folder, pokemonName);
    if (url) return url;
  }
  return null;
}

async function main() {
  console.log('Syncing Card imageUrl from local set folders...\n');

  if (!fs.existsSync(SETS_DIR)) {
    console.error('Sets directory not found:', SETS_DIR);
    process.exit(1);
  }

  // Build localId → card name maps for each known set
  const setIdToNameMap = new Map<string, Map<string, string>>();
  for (const [setId, folder] of Object.entries(SET_ID_TO_FOLDER)) {
    const nameMap = await fetchSetCardNames(setId);
    setIdToNameMap.set(setId, nameMap);
    console.log(`  ${setId} (${folder}): ${nameMap.size} card names`);
  }

  const cards = await prisma.card.findMany({
    select: { id: true, tcgdexId: true, setId: true, pokemonName: true },
  });

  let updated = 0;
  let usedPlaceholder = 0;
  let unchanged = 0;

  for (const card of cards) {
    let imageUrl: string | null = null;

    // Mew: use only Ancient Mew from promo folder
    if (card.pokemonName.toLowerCase() === 'mew') {
      imageUrl = MEW_IMAGE_URL;
    } else {
      const folder = SET_ID_TO_FOLDER[card.setId];
      if (folder) {
        // Card belongs to a set we have locally — look up by localId → name
        const nameMap = setIdToNameMap.get(card.setId);
        const localId = extractLocalIdFromTcgdexId(card.tcgdexId);
        if (nameMap && localId) {
          const cardName = nameMap.get(localId);
          if (cardName) imageUrl = findInFolder(folder, cardName);
        }
      }

      // For all other cards (PLACEHOLDER setId, or TCGdex sets we don't have locally):
      // search all local folders by pokemon name
      if (!imageUrl) {
        imageUrl = findAcrossAllFolders(card.pokemonName);
      }
    }

    const finalUrl = imageUrl ?? PLACEHOLDER_URL;
    if (finalUrl === PLACEHOLDER_URL) usedPlaceholder++;

    await prisma.card.update({
      where: { id: card.id },
      data: { imageUrl: finalUrl, imageUrlLarge: finalUrl },
    });
    updated++;
  }

  console.log(`\nResults:`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Placeholder: ${usedPlaceholder}`);
  console.log(`  Unchanged:   ${unchanged}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
