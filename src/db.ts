import Database from 'better-sqlite3';
import path from 'path';

const dataDir = path.join(__dirname, '..', 'data');
if (!require('fs').existsSync(dataDir)) require('fs').mkdirSync(dataDir, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(dataDir, 'data.db');

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price_range TEXT NOT NULL,
    price TEXT,
    image TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    reason TEXT,
    source TEXT,
    shihuo_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_id INTEGER NOT NULL,
    partner1_name TEXT NOT NULL,
    partner2_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    gift_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, gift_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (gift_id) REFERENCES gifts(id)
  );

  CREATE TABLE IF NOT EXISTS anniversaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'custom',
    repeat_type TEXT DEFAULT 'yearly',
    source_rule TEXT,
    reminder_7d INTEGER NOT NULL DEFAULT 1,
    reminder_3d INTEGER NOT NULL DEFAULT 1,
    reminder_day INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    target_id INTEGER,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS couples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user1_id INTEGER NOT NULL UNIQUE,
    user2_id INTEGER,
    invite_code TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user1_id) REFERENCES users(id),
    FOREIGN KEY (user2_id) REFERENCES users(id)
  );
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_couples_code ON couples(invite_code);
`);

// Migrations: add columns that may be missing on older DBs
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN name TEXT'); } catch {}

console.log('[DB] Initialized');
