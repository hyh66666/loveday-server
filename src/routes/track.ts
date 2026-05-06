import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// POST /api/track — log user behavior
router.post('/', (req: Request, res: Response) => {
  const { user_id, type, target_id, data } = req.body;
  if (!user_id || !type) return res.status(400).json({ error: 'Missing fields' });
  db.prepare('INSERT INTO events (user_id, type, target_id, data) VALUES (?, ?, ?, ?)')
    .run(user_id, type, target_id || null, data ? JSON.stringify(data) : null);
  res.json({ ok: true });
});

// GET /api/track/stats — get aggregated stats
router.get('/stats', (_req: Request, res: Response) => {
  const topGifts = db.prepare(`
    SELECT g.name, COUNT(*) as views FROM events e
    JOIN gifts g ON e.target_id = g.id
    WHERE e.type = 'gift_view'
    GROUP BY e.target_id ORDER BY views DESC LIMIT 10
  `).all();

  const topFavs = db.prepare(`
    SELECT g.name, COUNT(*) as favs FROM favorites f
    JOIN gifts g ON f.gift_id = g.id
    GROUP BY f.gift_id ORDER BY favs DESC LIMIT 10
  `).all();

  const sceneStats = db.prepare(`
    SELECT data, COUNT(*) as cnt FROM events WHERE type = 'scene_select' GROUP BY data ORDER BY cnt DESC
  `).all();

  res.json({ topGifts, topFavs, sceneStats });
});

export default router;
