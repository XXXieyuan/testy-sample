const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MAX_CONTENT_LEN = 500;
// Canonical category values (stored as English in DB; mapped from legacy Chinese on startup)
const VALID_TAGS = ['Work', 'School', 'Life', 'Relationships', 'Other'];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[randomInt(0, list.length - 1)];
}

function generateNickname() {
  const prefixes = [
    'Anon Furnace',
    'Midnight Dragon',
    'Keyboard Smasher',
    'Midnight Howler',
    'Slacking Rebel',
    'Grumpy Dude',
    'Roaring Emperor',
    'Raging Warrior',
    'Midnight Drifter',
    'Angry Bird',
  ];
  const prefix = pick(prefixes);
  return `${prefix}#${randomInt(1000, 9999)}`;
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const index = pair.indexOf('=');
      if (index === -1) return acc;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function makeAvatarSeed(seedInput) {
  return crypto.createHash('sha256').update(String(seedInput)).digest('hex').slice(0, 24);
}

function getClientProfile(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  let nickname = cookies.nickname;
  if (!nickname) {
    nickname = generateNickname();
    res.append('Set-Cookie', `nickname=${encodeURIComponent(nickname)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`);
  }
  return { nickname, avatarSeed: makeAvatarSeed(nickname) };
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
ensureDir(dataDir);

const dbPath = path.join(dataDir, 'vents.db');
const db = new Database(dbPath);

// Initialize database schema
const initStmt = `
CREATE TABLE IF NOT EXISTS vents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Other',
  nickname TEXT NOT NULL DEFAULT 'Anon Furnace#0000',
  avatar_seed TEXT NOT NULL DEFAULT 'seed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.exec(initStmt);

// Lightweight, idempotent migrations for older databases
// (explicit ALTERs kept for compatibility with earlier versions)
try {
  db.exec("ALTER TABLE vents ADD COLUMN category TEXT DEFAULT 'Other'");
} catch (e) {}
try {
  db.exec("ALTER TABLE vents ADD COLUMN nickname TEXT DEFAULT 'Anon Furnace#0000'");
} catch (e) {}

// More detailed migrations and indexes
try {
  db.exec("ALTER TABLE vents ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'");
} catch (err) {
  // ignore if column already exists
}

try {
  db.exec('ALTER TABLE vents ADD COLUMN nickname TEXT');
} catch (err) {
  // ignore if column already exists
}

try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_vents_created_at ON vents(created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_vents_category ON vents(category)");
} catch (err) {
  // indexes are a perf optimization; log but do not crash
  console.error('index migration error', err);
}

const existingColumns = db.prepare('PRAGMA table_info(vents)').all().map((row) => row.name);
if (!existingColumns.includes('avatar_seed')) {
  db.exec("ALTER TABLE vents ADD COLUMN avatar_seed TEXT NOT NULL DEFAULT 'seed'");
}

// Migration: normalize historic Chinese category values into English
// so the rest of the app can always treat categories as English.
try {
  const legacyToEnglish = {
    // Legacy Chinese categories -> English
    '\u8001\u677f': 'Work',
    '\u5b66\u6821': 'School',
    '\u751f\u6d3b': 'Life',
    '\u611f\u60c5': 'Relationships',
    '\u5176\u4ed6': 'Other',
    '\u5168\u90e8': 'All',
  };
  const updateCategory = db.prepare('UPDATE vents SET category = ? WHERE category = ?');
  db.transaction(() => {
    Object.entries(legacyToEnglish).forEach(([cn, en]) => {
      updateCategory.run(en, cn);
    });
  })();
} catch (err) {
  console.error('category migration error', err);
}

// Note: stats still need to understand legacy Chinese values that may remain
// (e.g. imported DB files). We keep a mapping for that below.
const CATEGORY_LABELS = {
  Work: 'Work',
  School: 'School',
  Life: 'Life',
  Relationships: 'Relationships',
  Other: 'Other',
};
const LEGACY_CATEGORY_MAP = {
  '\u8001\u677f': 'Work',
  '\u5b66\u6821': 'School',
  '\u751f\u6d3b': 'Life',
  '\u611f\u60c5': 'Relationships',
  '\u5176\u4ed6': 'Other',
  '\u5168\u90e8': 'All',
};
const ALL_CATEGORY = 'All';

const ventSelect = `SELECT id, content, likes, category, nickname, avatar_seed, created_at FROM vents`;
const insertVentStmt = db.prepare('INSERT INTO vents (content, category, nickname, avatar_seed) VALUES (?, ?, ?, ?)');
const getVentsStmt = db.prepare(`${ventSelect} ORDER BY likes DESC, created_at DESC`);
const getVentsByCategoryStmt = db.prepare(`${ventSelect} WHERE category = ? ORDER BY likes DESC, created_at DESC`);
const getVentStmt = db.prepare(`${ventSelect} WHERE id = ?`);
const likeVentStmt = db.prepare('UPDATE vents SET likes = likes + 1 WHERE id = ?');
const todayDestroyedStmt = db.prepare(
  "SELECT COUNT(*) AS count FROM vents WHERE date(created_at) = date('now')"
);
const totalsByCategoryStmt = db.prepare('SELECT category, COUNT(*) AS count FROM vents GROUP BY category');

function getCategoryStats() {
  const rows = totalsByCategoryStmt.all().map((row) => {
    const englishKey = LEGACY_CATEGORY_MAP[row.category] || row.category;
    return { category: englishKey, count: row.count };
  });
  const stats = Object.fromEntries(VALID_TAGS.map((tag) => [tag, 0]));
  rows.forEach((row) => {
    if (stats[row.category] != null) {
      stats[row.category] = row.count;
    }
  });
  return stats;
}

function normalizeCategory(input) {
  if (!input) return ALL_CATEGORY;
  if (VALID_TAGS.includes(input)) return input;
  const mapped = LEGACY_CATEGORY_MAP[input];
  if (mapped && mapped !== 'All') return mapped;
  return ALL_CATEGORY;
}

function buildSnapshot(category = ALL_CATEGORY) {
  const normalizedCategory = normalizeCategory(category);
  const vents =
    normalizedCategory === ALL_CATEGORY
      ? getVentsStmt.all()
      : getVentsByCategoryStmt.all(normalizedCategory);
  const todayDestroyed = todayDestroyedStmt.get().count;
  const totalDestroyed = db.prepare('SELECT COUNT(*) AS count FROM vents').get().count;
  return {
    vents,
    meta: {
      todayDestroyed,
      category: normalizedCategory,
      validCategories: VALID_TAGS,
      categoryTotals: getCategoryStats(),
      totalDestroyed,
    },
  };
}

function broadcast(type, payload) {
  const enrichedPayload = {
    ...payload,
    daily_count: todayDestroyedStmt.get().count,
  };
  const message = JSON.stringify({ type, payload: enrichedPayload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

app.use(morgan('dev'));
app.use(express.json());

app.use((req, res, next) => {
  req.viewer = getClientProfile(req, res);
  next();
});

// Serve SPA assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/profile', (req, res) => {
  res.json({ profile: req.viewer, validCategories: VALID_TAGS });
});

// Daily destroyed total
app.get('/api/daily-count', (req, res) => {
  const row = todayDestroyedStmt.get();
  res.json({ count: row.count });
});

// Backwards-compatible leaderboard endpoint (alias of /api/leaderboard)
app.get('/api/vents', (req, res) => {
  const category =
    typeof req.query.category === 'string' ? req.query.category.trim() : ALL_CATEGORY;
  res.json(buildSnapshot(category));
});

app.get('/api/leaderboard', (req, res) => {
  const category =
    typeof req.query.category === 'string' ? req.query.category.trim() : ALL_CATEGORY;
  res.json(buildSnapshot(category));
});

function handleCreateVent(req, res) {
  const { content, category, nickname } = req.body || {};
  const trimmed = (content || '').trim();
  const normalizedCategory = normalizeCategory(category) === ALL_CATEGORY ? 'Other' : normalizeCategory(category);
  const safeNickname =
    typeof nickname === 'string' && nickname.trim() ? nickname.trim() : req.viewer.nickname;

  if (!trimmed) {
    return res.status(400).json({ error: 'Content cannot be empty.' });
  }
  if (trimmed.length > MAX_CONTENT_LEN) {
    return res
      .status(400)
      .json({ error: `Content too long (max ${MAX_CONTENT_LEN} characters).` });
  }

  const avatarSeed = makeAvatarSeed(safeNickname);
  const info = insertVentStmt.run(trimmed, normalizedCategory, safeNickname, avatarSeed);
  const vent = getVentStmt.get(info.lastInsertRowid);
  const todayDestroyed = todayDestroyedStmt.get().count;

  // Fine-grained push: new vent + today count
  broadcast('new_vent', {
    vent,
    category: normalizedCategory,
    nickname: safeNickname,
    daily_count: todayDestroyed,
  });
  broadcast('daily_count', { count: todayDestroyed });

  // Backwards-compatible snapshot broadcast
  const snapshot = buildSnapshot(ALL_CATEGORY);
  broadcast('vents:update', {
    snapshot,
    category: normalizedCategory,
    nickname: safeNickname,
  });

  return res.status(201).json({ vent, profile: req.viewer, meta: snapshot.meta });
}

function handleLikeVent(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid ID.' });
  }

  const result = likeVentStmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Vent not found.' });
  }

  const vent = getVentStmt.get(id);

  // Real-time like updates
  broadcast('like_update', { id: vent.id, likes: vent.likes });
  broadcast('vents:update', buildSnapshot(ALL_CATEGORY));

  return res.json({ vent });
}

// Create a new vent
app.post('/api/vents', (req, res) => {
  return handleCreateVent(req, res);
});

// Backwards-compatible: singular create endpoint
app.post('/api/vent', (req, res) => {
  return handleCreateVent(req, res);
});

// Like a vent
app.post('/api/vents/:id/like', (req, res) => {
  return handleLikeVent(req, res);
});

// Backwards-compatible: original like path /api/like/:id
app.post('/api/like/:id', (req, res) => {
  return handleLikeVent(req, res);
});

// SPA fallback: always serve index.html for non-API GETs
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'hello', payload: buildSnapshot(ALL_CATEGORY) }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
