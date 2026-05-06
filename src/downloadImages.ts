import { db } from './db';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function fetchImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function bingSearchImage(keyword: string): Promise<string | null> {
  try {
    const url = `https://cn.bing.com/images/search?q=${encodeURIComponent(keyword + ' 商品')}&form=HDRSC2&first=1`;
    const data = await fetchImage(url);
    const html = data.toString('utf-8');
    const matches = html.match(/murl&quot;:&quot;(https?:\\?\/\\?\/[^&]+)&quot;/g);
    if (!matches || matches.length === 0) return null;
    const first = matches[0].replace(/murl&quot;:&quot;/, '').replace(/&quot;/, '');
    return first.replace(/\\\//g, '/');
  } catch {
    return null;
  }
}

async function downloadAndSave(imageUrl: string, giftId: number, giftName: string): Promise<string | null> {
  try {
    const data = await fetchImage(imageUrl);
    if (data.length < 1000) return null;

    // Determine extension
    const ext = imageUrl.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg';
    const filename = `gift_${giftId}.${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, data);
    console.log(`  Saved: ${filename} (${(data.length / 1024).toFixed(0)}KB)`);
    return `/uploads/${filename}`;
  } catch (e: any) {
    console.log(`  Download failed: ${e.message}`);
    return null;
  }
}

async function main() {
  const gifts = db.prepare('SELECT * FROM gifts').all() as any[];
  let updated = 0;

  for (const gift of gifts) {
    // Skip if already has a local image
    if (gift.image && gift.image.startsWith('/uploads/')) {
      console.log(`[${gift.id}] ${gift.name.slice(0, 40)} - already local`);
      continue;
    }

    console.log(`[${gift.id}] ${gift.name.slice(0, 40)}`);
    const imgUrl = await bingSearchImage(gift.name);
    if (!imgUrl) { console.log('  No image found'); continue; }

    console.log(`  URL: ${imgUrl.slice(0, 80)}`);
    const localPath = await downloadAndSave(imgUrl, gift.id, gift.name);
    if (localPath) {
      db.prepare('UPDATE gifts SET image = ? WHERE id = ?').run(localPath, gift.id);
      updated++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nDone! Updated ${updated}/${gifts.length} gifts`);
  process.exit(0);
}

main();
