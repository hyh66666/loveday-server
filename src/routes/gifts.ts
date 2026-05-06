import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// GET /api/gifts — list all gifts, optional filters
router.get('/', (req: Request, res: Response) => {
  const { category, price, scene, search, user_id } = req.query;
  let sql = 'SELECT * FROM gifts WHERE 1=1';
  const params: any[] = [];

  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (price && price !== 'all') {
    sql += ' AND price_range = ?';
    params.push(price);
  }
  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }
  if (scene && scene !== 'all') {
    sql += ' AND tags LIKE ?';
    params.push(`%"${scene}"%`);
  }

  const gifts = db.prepare(sql + ' ORDER BY id').all(...params);

  // Attach favorite status if user_id provided
  if (user_id) {
    const favIds = new Set(
      db.prepare('SELECT gift_id FROM favorites WHERE user_id = ?')
        .all(user_id)
        .map((r: any) => r.gift_id)
    );
    (gifts as any[]).forEach((g: any) => {
      g.tags = JSON.parse(g.tags || '[]');
      g.is_favorited = favIds.has(g.id);
    });
  }

  res.json(gifts);
});

// GET /api/gifts/:id
router.get('/:id', (req: Request, res: Response) => {
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(req.params.id);
  if (!gift) return res.status(404).json({ error: 'Not found' });
  (gift as any).tags = JSON.parse((gift as any).tags || '[]');
  res.json(gift);
});

// POST /api/favorites — toggle favorite
router.post('/favorites', (req: Request, res: Response) => {
  const { user_id, gift_id } = req.body;
  if (!user_id || !gift_id) return res.status(400).json({ error: 'Missing user_id or gift_id' });

  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND gift_id = ?')
    .get(user_id, gift_id);

  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND gift_id = ?').run(user_id, gift_id);
    res.json({ favorited: false });
  } else {
    db.prepare('INSERT INTO favorites (user_id, gift_id) VALUES (?, ?)').run(user_id, gift_id);
    res.json({ favorited: true });
  }
});

// GET /api/favorites/:user_id
router.get('/favorites/:user_id', (req: Request, res: Response) => {
  const gifts = db.prepare(`
    SELECT g.*, 1 as is_favorited FROM gifts g
    INNER JOIN favorites f ON g.id = f.gift_id
    WHERE f.user_id = ?
  `).all(req.params.user_id);
  (gifts as any[]).forEach((g: any) => g.tags = JSON.parse(g.tags || '[]'));
  res.json(gifts);
});

export default router;
