import { Router, Request, Response } from 'express';
import { db } from '../db';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

// POST /api/users/login — login/register by device ID
router.post('/login', (req: Request, res: Response) => {
  const { device_id, name } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id required' });

  let user = db.prepare('SELECT * FROM users WHERE device_id = ?').get(device_id) as any;
  if (!user) {
    db.prepare('INSERT INTO users (device_id, name) VALUES (?, ?)').run(device_id, name || '');
    user = db.prepare('SELECT * FROM users WHERE device_id = ?').get(device_id) as any;
  } else if (name) {
    db.prepare('UPDATE users SET name = ? WHERE device_id = ?').run(name, device_id);
    user.name = name;
  }

  // Load relationship + partner info
  const rel = db.prepare('SELECT * FROM relationships WHERE user_id = ?').get(user.id) as any;

  // Get couple/partner info
  const couple = db.prepare('SELECT * FROM couples WHERE user1_id = ? OR user2_id = ?').get(user.id, user.id) as any;
  let partner: any = null;
  if (couple?.user2_id) {
    const partnerId = couple.user1_id == user.id ? couple.user2_id : couple.user1_id;
    const partnerUser = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(partnerId) as any;
    const partnerRel = db.prepare('SELECT * FROM relationships WHERE user_id = ?').get(partnerId) as any;
    partner = {
      id: partnerId,
      name: partnerUser?.name || null,
      avatar: partnerUser?.avatar || null,
      relationship: partnerRel || null,
    };
  }

  res.json({
    user: { id: user.id, device_id: user.device_id, name: user.name, avatar: user.avatar },
    relationship: rel || null,
    partner,
  });
});

// PUT /api/users/profile — update name
router.put('/profile', (req: Request, res: Response) => {
  const { user_id, name } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'Missing fields' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user_id);
  res.json({ success: true });
});

// POST /api/users/relationship — save (syncs to partner if bound)
router.post('/relationship', (req: Request, res: Response) => {
  const { user_id, partner1_name, partner2_name, start_date } = req.body;
  if (!user_id || !partner1_name || !partner2_name || !start_date) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  db.prepare(`
    INSERT OR REPLACE INTO relationships (id, user_id, partner1_name, partner2_name, start_date)
    VALUES (1, ?, ?, ?, ?)
  `).run(user_id, partner1_name, partner2_name, start_date);

  // Sync to partner if bound
  const couple = db.prepare('SELECT * FROM couples WHERE (user1_id = ? OR user2_id = ?) AND user2_id IS NOT NULL')
    .get(user_id, user_id) as any;
  if (couple) {
    const partnerId = couple.user1_id == user_id ? couple.user2_id : couple.user1_id;
    db.prepare(`INSERT OR REPLACE INTO relationships (id, user_id, partner1_name, partner2_name, start_date)
      VALUES (1, ?, ?, ?, ?)`).run(partnerId, partner2_name, partner1_name, start_date);
  }

  res.json({ success: true });
});

// GET /api/users/:id/anniversaries
router.get('/:id/anniversaries', (req: Request, res: Response) => {
  const anniversaries = db.prepare(
    'SELECT * FROM anniversaries WHERE user_id = ? ORDER BY date'
  ).all(req.params.id);
  res.json(anniversaries);
});

// POST /api/users/:id/anniversaries
router.post('/:id/anniversaries', (req: Request, res: Response) => {
  const { title, date, type, repeat_type, source_rule, reminder_7d, reminder_3d, reminder_day, note } = req.body;
  const result = db.prepare(`
    INSERT INTO anniversaries (user_id, title, date, type, repeat_type, source_rule, reminder_7d, reminder_3d, reminder_day, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, title, date, type || 'custom', repeat_type || 'yearly',
    source_rule || null, reminder_7d ? 1 : 0, reminder_3d ? 1 : 0, reminder_day ? 1 : 0, note || null);
  res.json({ id: result.lastInsertRowid });
});

// PUT /api/users/anniversaries/:id
router.put('/anniversaries/:id', (req: Request, res: Response) => {
  const { title, date, repeat_type, reminder_7d, reminder_3d, reminder_day, note } = req.body;
  db.prepare(`
    UPDATE anniversaries SET title=?, date=?, repeat_type=?, reminder_7d=?, reminder_3d=?, reminder_day=?, note=? WHERE id=?
  `).run(title, date, repeat_type, reminder_7d ? 1 : 0, reminder_3d ? 1 : 0, reminder_day ? 1 : 0, note, req.params.id);
  res.json({ success: true });
});

// DELETE /api/users/anniversaries/:id
router.delete('/anniversaries/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM anniversaries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/users/avatar — upload + compress avatar
router.post('/avatar', upload.single('avatar'), async (req: Request, res: Response) => {
  const { user_id } = req.body;
  if (!user_id || !req.file) return res.status(400).json({ error: 'Missing user_id or file' });

  // Compress to webp
  const sharp = (await import('sharp')).default;
  const compressedPath = req.file.path.replace(/\.\w+$/, '.webp');
  await sharp(req.file.path)
    .resize(200, 200, { fit: 'cover' })
    .webp({ quality: 70 })
    .toFile(compressedPath);

  const avatarPath = '/uploads/avatars/' + path.basename(compressedPath);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, user_id);
  res.json({ avatar: avatarPath });
});

export default router;
