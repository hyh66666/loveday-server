import cron from 'node-cron';
import { db } from './db';
import https from 'https';
import http from 'http';

const SCENES = [
  { key: 'valentine', name: '情人节' },
  { key: 'birthday', name: '生日' },
  { key: 'anniversary', name: '周年纪念' },
  { key: '520', name: '520' },
  { key: 'qixi', name: '七夕' },
  { key: 'daily', name: '日常惊喜' },
];

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const PROMPT_TPL =
  `你是一个礼物推荐专家。请为「{scene}」推荐 {count} 个礼物，送男生和送女生的各一半。返回 JSON 数组：` +
  `[{"name":"品牌+型号","category":"beauty/digital/accessory/home/experience/custom",` +
  `"price_range":"0-100/100-300/300-500/500-1500/1500+","price":"¥299",` +
  `"tags":["{key}","男生/女生",...],"description":"描述","reason":"理由","source":"来源"}]` +
  `tags 首项必须为 "{key}"，纯 JSON 不要 markdown`;

function httpGet(url: string): Promise<string> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function searchBingImage(keyword: string): Promise<string | null> {
  try {
    const url = `https://cn.bing.com/images/search?q=${encodeURIComponent(keyword + ' 商品')}&form=HDRSC2&first=1`;
    const html = await httpGet(url);
    const m = html.match(/murl&quot;:&quot;(https?:\\?\/\\?\/[^&]+)&quot;/);
    if (!m) return null;
    const img = m[1].replace(/&quot;/, '').replace(/\\\//g, '/');
    // Filter known-bad sources
    if (img.includes('huaban.com') || img.includes('yangmatou.com')) return null;
    return img;
  } catch { return null; }
}

async function callClaude(prompt: string): Promise<any[]> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: prompt,
      messages: [{ role: 'user', content: '请生成礼物数据' }],
    }),
  });
  const data: any = await resp.json();
  let text = data?.content?.[0]?.text || '';
  if (text.startsWith('```')) text = text.split('```')[1].replace(/^json/, '');
  return JSON.parse(text.trim());
}

async function generateGifts() {
  console.log('[Cron] Starting gift generation...');
  if (!ANTHROPIC_KEY) { console.log('[Cron] No API key, skip'); return; }

  let totalNew = 0;
  for (const scene of SCENES) {
    try {
      const prompt = PROMPT_TPL.replace(/\{scene\}/g, scene.name).replace(/\{key\}/g, scene.key).replace(/\{count\}/g, '6');
      console.log(`[Cron] Generating for ${scene.name}...`);
      const gifts = await callClaude(prompt);
      const stmt = db.prepare(
        `INSERT INTO gifts (name, category, price_range, price, image, tags, description, reason, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const g of gifts) {
        const img = await searchBingImage(g.name);
        stmt.run(g.name, g.category, g.price_range, g.price, img || null,
          JSON.stringify(g.tags || []), g.description || null, g.reason || null, g.source || null);
        totalNew++;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (e: any) {
      console.log(`[Cron] ${scene.name} error:`, e.message);
    }
  }

  // Delete old auto-generated gifts (older than 90 days, not favorited)
  const del = db.prepare(`
    DELETE FROM gifts WHERE id NOT IN (SELECT DISTINCT gift_id FROM favorites)
    AND created_at < datetime('now', '-90 days')
  `).run();
  console.log(`[Cron] Done: ${totalNew} new, ${del.changes} old deleted`);
}

export function startCron() {
  // Run every Sunday at 3:00 AM
  cron.schedule('0 3 * * 0', generateGifts);
  console.log('[Cron] Scheduled: every Sunday 3:00 AM');
}
