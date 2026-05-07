import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'crypto';

const router = Router();

// POST /api/couples/create — create invite code (user1)
router.post('/create', (req: Request, res: Response) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  // Check if already in an active bound couple
  const existing = db.prepare('SELECT * FROM couples WHERE (user1_id = ? OR user2_id = ?) AND user2_id IS NOT NULL').get(user_id, user_id) as any;
  if (existing) {
    return res.json({
      couple: existing,
      invite_code: existing.invite_code,
      partner_id: existing.user1_id == user_id ? existing.user2_id : existing.user1_id,
      is_bound: true,
    });
  }
  // Check for pending invite
  const pending = db.prepare('SELECT * FROM couples WHERE user1_id = ? AND user2_id IS NULL').get(user_id) as any;
  if (pending) {
    return res.json({ invite_code: pending.invite_code, partner_id: null, is_bound: false });
  }

  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  db.prepare('INSERT INTO couples (user1_id, invite_code) VALUES (?, ?)').run(user_id, code);
  res.json({ invite_code: code, partner_id: null });
});

// POST /api/couples/join — join via invite code (user2)
router.post('/join', (req: Request, res: Response) => {
  const user_id = Number(req.body.user_id);
  const { invite_code } = req.body;
  if (!user_id || !invite_code) return res.status(400).json({ error: 'Missing fields' });

  const couple = db.prepare('SELECT * FROM couples WHERE invite_code = ? AND user2_id IS NULL')
    .get(invite_code.toUpperCase()) as any;

  if (!couple) return res.status(404).json({ error: '邀请码无效或已被使用' });
  if (couple.user1_id == user_id) return res.status(400).json({ error: '不能绑定自己' });

  db.prepare('UPDATE couples SET user2_id = ? WHERE id = ?').run(Number(user_id), couple.id);

  // Get both users' info
  const joinerUser = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(Number(user_id)) as any;
  const initUser = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(couple.user1_id) as any;
  console.log('[Join] Joiner user:', JSON.stringify(joinerUser), 'Init user:', JSON.stringify(initUser));
  const initRel = db.prepare('SELECT * FROM relationships WHERE user_id = ?').get(couple.user1_id) as any;

  // Sync relationship to joiner: use initiator's date, joiner's own name + initiator's name
  const joinerName = joinerUser?.name || '';
  const initName = initUser?.name || '';
  const startDate = initRel?.start_date || '';

  db.prepare(`INSERT OR REPLACE INTO relationships (id, user_id, partner1_name, partner2_name, start_date)
    VALUES (1, ?, ?, ?, ?)`)
    .run(user_id, joinerName, initName, startDate);

  // Update initiator's partner2_name to joiner's real name
  if (joinerName && initRel) {
    db.prepare('UPDATE relationships SET partner2_name = ? WHERE user_id = ?')
      .run(joinerName, couple.user1_id);
  }

  res.json({
    success: true,
    partner: { id: couple.user1_id, name: initName || null, avatar: initUser?.avatar || null },
    joiner: { id: user_id, name: joinerName || null, avatar: joinerUser?.avatar || null },
  });
});

// GET /api/couples/:user_id — get couple info
router.get('/:user_id', (req: Request, res: Response) => {
  const couple = db.prepare('SELECT * FROM couples WHERE user1_id = ? OR user2_id = ?')
    .get(req.params.user_id, req.params.user_id) as any;
  if (!couple) return res.json(null);

  const partnerId = couple.user1_id == req.params.user_id ? couple.user2_id : couple.user1_id;
  const partner = partnerId ? db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(partnerId) as any : null;

  res.json({
    invite_code: couple.invite_code,
    partner_id: partnerId,
    partner_name: partner?.name || null,
    partner_avatar: partner?.avatar || null,
    is_bound: !!couple.user2_id,
  });
});

// DELETE /api/couples — unbind
router.delete('/', (req: Request, res: Response) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const couple = db.prepare('SELECT * FROM couples WHERE user1_id = ? OR user2_id = ?')
    .get(user_id, user_id) as any;
  if (!couple) return res.status(404).json({ error: 'Not bound' });

  // Notify partner
  const partnerId = couple.user1_id == user_id ? couple.user2_id : couple.user1_id;
  if (partnerId) {
    db.prepare('INSERT INTO events (user_id, type, target_id, data) VALUES (?, ?, ?, ?)')
      .run(partnerId, 'unbound', user_id, JSON.stringify({ msg: '对方已解除情侣绑定' }));
  }

  db.prepare('DELETE FROM couples WHERE id = ?').run(couple.id);
  res.json({ success: true });
});

// GET /api/couples/:user_id/notifications
router.get('/:user_id/notifications', (req: Request, res: Response) => {
  const notifs = db.prepare(
    "SELECT * FROM events WHERE user_id = ? AND type = 'unbound' AND created_at > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 5"
  ).all(req.params.user_id);
  res.json(notifs);
});

// GET /api/couples/:user_id/anniversaries — get shared anniversaries
router.get('/:user_id/anniversaries', (req: Request, res: Response) => {
  const couple = db.prepare('SELECT * FROM couples WHERE user1_id = ? OR user2_id = ?')
    .get(req.params.user_id, req.params.user_id) as any;
  if (!couple || !couple.user2_id) return res.json([]);

  const partnerId = couple.user1_id == req.params.user_id ? couple.user2_id : couple.user1_id;
  const anniversaries = db.prepare(
    `SELECT a.*, u.name as creator FROM anniversaries a
     JOIN users u ON a.user_id = u.id
     WHERE a.user_id IN (?, ?) AND a.type = 'custom'
     ORDER BY a.date`
  ).all(req.params.user_id, partnerId);

  const rel = db.prepare('SELECT * FROM relationships WHERE user_id = ?').get(partnerId) as any;

  res.json({ anniversaries, partner_relationship: rel || null });
});

export default router;
