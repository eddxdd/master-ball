/**
 * Rename files in every folder under frontend/public/images/cards/sets/
 * from numeric IDs (e.g. 001.jpg, 006t.jpg) to card names (e.g. Alakazam.jpg).
 * Uses TCGdex API. Duplicates get -2, -3, etc.
 */
import fs from 'fs';
import path from 'path';

const SETS_DIR = path.join(process.cwd(), 'frontend', 'public', 'images', 'cards', 'sets');

// Folder name (directory name) -> TCGdex set ID
const FOLDER_TO_TCGDEX = {
  base: 'base1',
  jungle: 'base2',
  fossil: 'base3',
  'team-rocket': 'base5',
};

function sanitizeForFilename(name) {
  return name
    .replace(/[\u2642]/g, '-m')
    .replace(/[\u2640]/g, '-f')
    .replace(/['']/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '-')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchSetCardNames(tcgdexId) {
  const res = await fetch(`https://api.tcgdex.net/v2/en/sets/${tcgdexId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const idToName = {};
  for (const card of data.cards || []) {
    const id = String(parseInt(card.localId, 10));
    idToName[id] = card.name;
  }
  return idToName;
}

function getNextAvailableName(dir, baseName, ext) {
  let name = `${baseName}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${baseName}-${n}${ext}`;
    n++;
  }
  return name;
}

async function processFolder(folderName) {
  const tcgdexId = FOLDER_TO_TCGDEX[folderName];
  if (!tcgdexId) {
    console.log(`  [${folderName}] No TCGdex mapping, skip.`);
    return { renamed: 0, skipped: 0 };
  }

  const dir = path.join(SETS_DIR, folderName);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { renamed: 0, skipped: 0 };

  const idToName = await fetchSetCardNames(tcgdexId);
  if (!idToName || Object.keys(idToName).length === 0) {
    console.warn(`  [${folderName}] No cards from API for ${tcgdexId}, skip.`);
    return { renamed: 0, skipped: 0 };
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'));
  let renamed = 0;
  let skipped = 0;

  for (const file of files) {
    const base = file.slice(0, -4);
    const match = base.match(/^(\d+)(.*)$/);
    if (!match) {
      skipped++;
      continue;
    }
    const numStr = match[1];
    const num = String(parseInt(numStr, 10));
    const name = idToName[num];
    if (!name) {
      console.warn(`  [${folderName}] No name for localId ${num}, skip: ${file}`);
      skipped++;
      continue;
    }
    const safeName = sanitizeForFilename(name);
    const ext = '.jpg';
    const newName = getNextAvailableName(dir, safeName, ext);

    if (newName === file) continue;
    const oldPath = path.join(dir, file);
    const newPath = path.join(dir, newName);
    fs.renameSync(oldPath, newPath);
    console.log(`  [${folderName}] ${file} -> ${newName}`);
    renamed++;
  }

  return { renamed, skipped };
}

async function main() {
  if (!fs.existsSync(SETS_DIR)) {
    console.error('Sets directory not found:', SETS_DIR);
    process.exit(1);
  }

  const folders = fs.readdirSync(SETS_DIR).filter((f) => {
    const p = path.join(SETS_DIR, f);
    return fs.statSync(p).isDirectory();
  });

  console.log('Folders:', folders.join(', '));
  let totalRenamed = 0;
  let totalSkipped = 0;

  for (const folder of folders) {
    console.log(`\n--- ${folder} ---`);
    const { renamed, skipped } = await processFolder(folder);
    totalRenamed += renamed;
    totalSkipped += skipped;
  }

  console.log(`\nTotal renamed: ${totalRenamed}, skipped: ${totalSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
