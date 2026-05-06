import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import giftsRouter from './routes/gifts';
import usersRouter from './routes/users';
import trackRouter from './routes/track';
import couplesRouter from './routes/couples';
import bootRouter from './routes/boot';
import { db } from './db';

// Auto-seed on first start
const giftCount = (db.prepare('SELECT COUNT(*) as cnt FROM gifts').get() as any)?.cnt || 0;
if (giftCount === 0) {
  console.log('[Server] No gifts found, running seed...');
  require('./seed');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// v1 routes
app.use('/api/v1/gifts', giftsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/track', trackRouter);
app.use('/api/v1/couples', couplesRouter);
app.use('/api/v1/boot', bootRouter);
app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', version: 'v1' }));

// Legacy routes (deprecated, remove after 2026-08-01)
const deprecate = (req: Request, _res: Response, next: NextFunction) => {
  console.log(`[DEPRECATED] ${req.method} ${req.path} — migrate to /api/v1`);
  next();
};
app.use('/api/gifts', deprecate, giftsRouter);
app.use('/api/users', deprecate, usersRouter);
app.use('/api/track', deprecate, trackRouter);
app.use('/api/couples', deprecate, couplesRouter);
app.get('/api/health', deprecate, (_req, res) => res.json({ status: 'ok', version: 'legacy' }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
