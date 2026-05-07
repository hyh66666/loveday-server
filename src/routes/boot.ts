import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// GET /api/v1/boot — aggregated startup data
router.get('/', (req: Request, res: Response) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ error: 'user_id required' });

  // Gifts
  const gifts = db.prepare('SELECT * FROM gifts ORDER BY id').all();

  // Couple
  const couple = db.prepare('SELECT * FROM couples WHERE user1_id = ? OR user2_id = ?')
    .get(userId, userId) as any;

  let coupleData: any = null;
  if (couple) {
    const partnerId = couple.user1_id == userId ? couple.user2_id : couple.user1_id;
    const partnerUser = partnerId ? db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(partnerId) as any : null;
    const partnerRel = partnerId ? db.prepare('SELECT * FROM relationships WHERE user_id = ?').get(partnerId) as any : null;
    coupleData = {
      invite_code: couple.invite_code,
      partner_id: partnerId,
      partner_name: partnerUser?.name || null,
      partner_avatar: partnerUser?.avatar || null,
      partner_relationship: partnerRel || null,
      is_bound: !!couple.user2_id,
    };
  }

  // Notifications
  const notifs = db.prepare(
    "SELECT * FROM events WHERE user_id = ? AND type = 'unbound' AND created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 5"
  ).all(userId);

  // Favorites
  const favIds = db.prepare('SELECT gift_id FROM favorites WHERE user_id = ?')
    .all(userId)
    .map((r: any) => r.gift_id);

  // Annotate gifts with favorite status
  const annotatedGifts = (gifts as any[]).map((g: any) => ({
    ...g,
    tags: JSON.parse(g.tags || '[]'),
    is_favorited: favIds.includes(g.id),
  }));

  res.json({
    gifts: annotatedGifts,
    couple: coupleData,
    notifications: notifs.length > 0,
  });
});

export default router;
