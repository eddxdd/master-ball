/**
 * Seed Cards from Local Folders (Kanto 151 source of truth)
 *
 * Uses the canonical Kanto 151 list to:
 * 1. Resolve each Pokémon from the DB (by name or pokedex number).
 * 2. For each local set folder (base, jungle, fossil, team-rocket, promo), check for
 *    a matching image file (e.g. Charmander.jpg, charmander-2.jpg).
 * 3. Create exactly ONE Card per (pokemonId, setId) — no duplicates per set.
 * 4. For Pokémon with no local image, create placeholder cards so they appear in the Pokedex.
 *
 * No TCGdex API calls; all data from local files + DB. Run after seedWordle (biomes + Pokemon).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { KANTO_151_NAMES } from '../data/kanto151.js';
import { sanitizeForFilename } from '../utils/cardDisplay.js';
import { getWeightForRarity, isFloorCard, isCeilingCard } from '../services/cardTiers.js';

const FOLDER_ORDER = ['base', 'jungle', 'fossil', 'team-rocket'] as const;
const PROMO_FOLDER = 'promo';
const PLACEHOLDER_URL = '/images/cards/sets/Pokemon-Card-Back.png';

function getSetsBaseDir(): string {
  const cwd = process.cwd();
  const distDir = path.join(cwd, 'frontend-dist', 'images', 'cards', 'sets');
  const publicDir = path.join(cwd, 'frontend', 'public', 'images', 'cards', 'sets');
  if (fs.existsSync(path.join(cwd, 'frontend-dist'))) return distDir;
  return publicDir;
}

function folderToSetName(folder: string): string {
  return folder
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Find first matching image in a set folder for a Pokémon name.
 * Tries name.jpg, name-2.jpg, ... (same logic as cardDisplay / syncLocalCardImages).
 */
function findImageInFolder(setsBaseDir: string, folder: string, pokemonName: string): string | null {
  const dir = path.join(setsBaseDir, folder);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const safe = sanitizeForFilename(pokemonName).toLowerCase();
  for (let n = 0; n < 20; n++) {
    const target = n === 0 ? `${safe}.jpg` : `${safe}-${n + 1}.jpg`;
    const found = files.find((f) => f.toLowerCase() === target);
    if (found) return `/images/cards/sets/${folder}/${found}`;
  }
  return null;
}

/**
 * One card per (pokemonId, setId). Tier 4 for local cards so they're in the offer pool.
 */
const DEFAULT_TIER = 4;
const DEFAULT_RARITY = 'Common';

export async function seedCardsFromLocal(): Promise<{ created: number; placeholders: number; skipped: number }> {
  const setsBaseDir = getSetsBaseDir();
  if (!fs.existsSync(setsBaseDir)) {
    try {
      fs.mkdirSync(setsBaseDir, { recursive: true });
      fs.mkdirSync(path.join(setsBaseDir, 'base'), { recursive: true });
      fs.mkdirSync(path.join(setsBaseDir, 'jungle'), { recursive: true });
      fs.mkdirSync(path.join(setsBaseDir, 'fossil'), { recursive: true });
      fs.mkdirSync(path.join(setsBaseDir, 'team-rocket'), { recursive: true });
    } catch {
      throw new Error(`Sets directory not found and could not be created: ${setsBaseDir}`);
    }
  }

  let created = 0;
  let placeholders = 0;
  let skipped = 0;

  for (const pokemonName of KANTO_151_NAMES) {
    let pokemon = await prisma.pokemon.findUnique({ where: { name: pokemonName } });
    if (!pokemon) {
      const pokedexNumber = KANTO_151_NAMES.indexOf(pokemonName) + 1;
      pokemon = await prisma.pokemon.findFirst({ where: { pokedexNumber } });
    }
    if (!pokemon) {
      console.log(`  ⚠ ${pokemonName} not in DB, skipping`);
      skipped++;
      continue;
    }

    let hadLocalCard = false;

    // Mew: special case promo folder
    if (pokemonName.toLowerCase() === 'mew') {
      const promoPath = path.join(setsBaseDir, PROMO_FOLDER, 'ancientmew.jpg');
      if (fs.existsSync(promoPath)) {
        const imageUrl = `/images/cards/sets/${PROMO_FOLDER}/ancientmew.jpg`;
        await prisma.card.upsert({
          where: { tcgdexId: `local-${pokemon.id}-${PROMO_FOLDER}` },
          update: { pokemonName: pokemon.name, imageUrl, imageUrlLarge: imageUrl },
          create: {
            tcgdexId: `local-${pokemon.id}-${PROMO_FOLDER}`,
            pokemonId: pokemon.id,
            pokemonName: pokemon.name,
            setId: PROMO_FOLDER,
            setName: 'Promo',
            rarity: DEFAULT_RARITY,
            tier: DEFAULT_TIER,
            imageUrl,
            imageUrlLarge: imageUrl,
            weight: getWeightForRarity(DEFAULT_RARITY),
            isFloor: isFloorCard(DEFAULT_RARITY, DEFAULT_TIER),
            isCeiling: isCeilingCard(DEFAULT_RARITY, DEFAULT_TIER),
          },
        });
        created++;
        hadLocalCard = true;
      }
    }

    // Each set folder: at most one card per (pokemonId, setId)
    for (const folder of FOLDER_ORDER) {
      const imageUrl = findImageInFolder(setsBaseDir, folder, pokemon.name);
      if (!imageUrl) continue;

      const tcgdexId = `local-${pokemon.id}-${folder}`;
      const setName = folderToSetName(folder);
      await prisma.card.upsert({
        where: { tcgdexId },
        update: {
          pokemonName: pokemon.name,
          imageUrl,
          imageUrlLarge: imageUrl,
        },
        create: {
          tcgdexId,
          pokemonId: pokemon.id,
          pokemonName: pokemon.name,
          setId: folder,
          setName,
          rarity: DEFAULT_RARITY,
          tier: DEFAULT_TIER,
          imageUrl,
          imageUrlLarge: imageUrl,
          weight: getWeightForRarity(DEFAULT_RARITY),
          isFloor: isFloorCard(DEFAULT_RARITY, DEFAULT_TIER),
          isCeiling: isCeilingCard(DEFAULT_RARITY, DEFAULT_TIER),
        },
      });
      created++;
      hadLocalCard = true;
    }

    if (!hadLocalCard) {
      for (let tier = 1; tier <= 6; tier++) {
        const placeholderTcgdexId = `placeholder-${pokemon.id}-t${tier}`;
        await prisma.card.upsert({
          where: { tcgdexId: placeholderTcgdexId },
          update: {
            pokemonName: pokemon.name,
            imageUrl: pokemon.imageUrl ?? PLACEHOLDER_URL,
            imageUrlLarge: pokemon.imageUrl ?? PLACEHOLDER_URL,
          },
          create: {
            tcgdexId: placeholderTcgdexId,
            pokemonId: pokemon.id,
            pokemonName: pokemon.name,
            setId: 'PLACEHOLDER',
            setName: 'Placeholder Set',
            rarity: DEFAULT_RARITY,
            tier,
            imageUrl: pokemon.imageUrl ?? PLACEHOLDER_URL,
            imageUrlLarge: pokemon.imageUrl ?? PLACEHOLDER_URL,
            weight: 10,
            isFloor: true,
            isCeiling: false,
          },
        });
        placeholders++;
      }
    }
  }

  return { created, placeholders, skipped };
}

/**
 * Remove duplicate cards: same (pokemonId, setId) — keep one row (lowest id).
 * Reassigns UserCard and Auction references to the kept card. For PokedexEntry, updates
 * one row to the kept card and deletes any other entries that would duplicate (userId, cardId).
 */
export async function dedupeCardsBySet(): Promise<{ deleted: number; merged: number }> {
  const duplicates = await prisma.$queryRaw<{ pokemonid: number; setid: string | null; minid: number; cnt: number }[]>`
    SELECT "pokemonId" AS pokemonid, "setId" AS setid, MIN(id) AS minid, COUNT(*) AS cnt
    FROM "Card"
    GROUP BY "pokemonId", "setId"
    HAVING COUNT(*) > 1
  `;

  let deleted = 0;
  let merged = 0;
  for (const row of duplicates) {
    let ids: number[];
    if (row.setid === null) {
      const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT id FROM "Card"
        WHERE "pokemonId" = ${row.pokemonid} AND "setId" IS NULL AND id <> ${row.minid}
      `;
      ids = rows.map((r) => r.id);
    } else {
      const idsToDelete = await prisma.card.findMany({
        where: {
          pokemonId: row.pokemonid,
          setId: row.setid,
          id: { not: row.minid },
        },
        select: { id: true },
      });
      ids = idsToDelete.map((c) => c.id);
    }
    if (ids.length === 0) continue;

    const keptId = row.minid;

    // Reassign UserCard and Auction to the kept card
    const ucUpdated = await prisma.userCard.updateMany({
      where: { cardId: { in: ids } },
      data: { cardId: keptId },
    });
    const auUpdated = await prisma.auction.updateMany({
      where: { wantedCardId: { in: ids } },
      data: { wantedCardId: keptId },
    });

    // PokedexEntry has unique (userId, cardId). Reassigning all to keptId would create duplicates.
    // So: update one entry per (userId, keptId) from a duplicate id, then delete the rest.
    const entriesToMove = await prisma.pokedexEntry.findMany({
      where: { cardId: { in: ids } },
      select: { id: true, userId: true },
    });
    const seenUser = new Set<number>();
    for (const e of entriesToMove) {
      if (seenUser.has(e.userId)) {
        await prisma.pokedexEntry.delete({ where: { id: e.id } });
      } else {
        seenUser.add(e.userId);
        await prisma.pokedexEntry.update({
          where: { id: e.id },
          data: { cardId: keptId },
        });
      }
    }

    const totalMerged = ucUpdated.count + auUpdated.count + entriesToMove.length;
    if (totalMerged > 0) {
      merged += totalMerged;
      console.log(`  Merged refs (pokemonId=${row.pokemonid}, setId=${row.setid ?? 'null'}) -> card ${keptId}`);
    }

    await prisma.card.deleteMany({ where: { id: { in: ids } } });
    deleted += ids.length;
  }
  return { deleted, merged };
}

async function main() {
  console.log('Seeding cards from local folders (Kanto 151 source of truth)...\n');
  const result = await seedCardsFromLocal();
  console.log(`  Created/updated: ${result.created}`);
  console.log(`  Placeholders:   ${result.placeholders}`);
  console.log(`  Skipped:        ${result.skipped}`);

  console.log('\nDeduplicating (one card per pokemon per set)...');
  const dedupe = await dedupeCardsBySet();
  console.log(`  Deleted:        ${dedupe.deleted}`);
  console.log(`  Refs merged:    ${dedupe.merged}`);

  console.log('\n✓ Seed from local completed.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
