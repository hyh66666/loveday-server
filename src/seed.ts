import { db } from './db';
import fs from 'fs';
import path from 'path';

// Try multiple paths: bundled in server > app source
const paths = [
  path.join(__dirname, '..', 'data', 'gifts.json'),
  path.join(__dirname, '..', '..', 'LoveDay', 'assets', 'data', 'gifts.json'),
];
const giftsPath = paths.find(p => fs.existsSync(p));

if (!giftsPath) {
  console.log('[Seed] No gifts.json found, skipping');
  process.exit(0);
}

const gifts = JSON.parse(fs.readFileSync(giftsPath, 'utf-8'));

// Clear existing gifts before importing (avoids duplicates)
db.exec('DELETE FROM gifts');

const stmt = db.prepare(`
  INSERT OR REPLACE INTO gifts (id, name, category, price_range, price, image, tags, description, reason, source, shihuo_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insert = db.transaction(() => {
  for (const g of gifts) {
    stmt.run(
      g.id || null,
      g.name,
      g.category,
      g.price_range || g.priceRange || '100-300',
      g.price || null,
      g.image || null,
      JSON.stringify(g.tags || []),
      g.description || null,
      g.reason || null,
      g.source || null,
      g.shihuo_url || g.shihuoUrl || null
    );
  }
});

insert();
console.log(`[Seed] Imported ${gifts.length} gifts`);

// Only exit when run directly (not when required)
if (require.main === module) process.exit(0);
