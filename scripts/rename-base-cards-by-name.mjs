/**
 * Rename files in frontend/public/images/cards/sets/base/
 * from numeric IDs (e.g. 001.jpg, 006t.jpg) to card names (e.g. Alakazam.jpg, Gyarados-t.jpg).
 * Uses TCGdex API for Base Set (base1) card names.
 */
import fs from 'fs';
import path from 'path';

const BASE_DIR = path.join(process.cwd(), 'frontend', 'public', 'images', 'cards', 'sets', 'base');

function sanitizeForFilename(name) {
  return name
    .replace(/[\u2642]/g, '-m')   // ♂
    .replace(/[\u2640]/g, '-f')   // ♀
    .replace(/['']/g, '')          // apostrophes (Farfetch'd -> Farfetchd)
    .replace(/\./g, '')            // Mr. Mime -> Mr Mime
    .replace(/\s+/g, '-')          // spaces -> hyphens
    .replace(/[<>:"/\\|?*]/g, '')  // invalid filename chars
    .replace(/-+/g, '-')           // collapse multiple hyphens
    .replace(/^-|-$/g, '');        // trim hyphens
}

async function main() {
  const res = await fetch('https://api.tcgdex.net/v2/en/sets/base1');
  if (!res.ok) throw new Error(`TCGdex API failed: ${res.status}`);
  const data = await res.json();
  const idToName = {};
  for (const card of data.cards || []) {
    const id = String(parseInt(card.localId, 10));
    idToName[id] = card.name;
  }

  const files = fs.readdirSync(BASE_DIR).filter((f) => f.endsWith('.jpg'));
  let renamed = 0;
  let skipped = 0;

  for (const file of files) {
    const base = file.slice(0, -4); // without .jpg
    const match = base.match(/^(\d+)(.*)$/);
    let newName;
    if (match) {
      const numStr = match[1];
      const num = String(parseInt(numStr, 10));
      const name = idToName[num];
      if (!name) {
        console.warn(`  No name for localId ${num}, skip: ${file}`);
        skipped++;
        continue;
      }
      const safeName = sanitizeForFilename(name);
      newName = `${safeName}.jpg`;
    } else {
      // already named (e.g. Alakazam.jpg) - skip
      skipped++;
      continue;
    }

    if (newName === file) continue;
    const oldPath = path.join(BASE_DIR, file);
    let newPath = path.join(BASE_DIR, newName);
    if (fs.existsSync(newPath)) {
      const baseName = newName.slice(0, -4);
      const ext = path.extname(newName);
      newName = `${baseName}-${numStr}${ext}`;
      newPath = path.join(BASE_DIR, newName);
    }
    fs.renameSync(oldPath, newPath);
    console.log(`  ${file} -> ${newName}`);
    renamed++;
  }

  console.log(`\nRenamed: ${renamed}, skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
