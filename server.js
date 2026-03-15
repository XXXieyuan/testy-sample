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
const VALID_TAGS = ['老板', '学校', '生活', '感情', '其他'];

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
  const prefixes = ['匿名', '暴走', '冷焰', '隐身', '赛博', '碎碎念', '熔炉', '夜行', '高压', '电弧'];
  const suffixes = ['熔炉者', '吐槽体', '火花精', '冷笑人', '拆台师', '喷火龙', '碎碎侠', '情绪包', '导火索', '爆破手'];
  return `${pick(prefixes)}${pick(suffixes)}#${randomInt(1000, 9999)}`;
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
  category TEXT NOT NULL DEFAULT '其他',
  nickname TEXT NOT NULL DEFAULT '匿名熔炉者#0000',
  avatar_seed TEXT NOT NULL DEFAULT 'seed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.exec(initStmt);

const existingColumns = db.prepare("PRAGMA table_info(vents)").all().map((row) => row.name);
if (!existingColumns.includes('category')) {
  db.exec("ALTER TABLE vents ADD COLUMN category TEXT NOT NULL DEFAULT '其他'");
}
if (!existingColumns.includes('nickname')) {
  db.exec("ALTER TABLE vents ADD COLUMN nickname TEXT NOT NULL DEFAULT '匿名熔炉者#0000'");
}
if (!existingColumns.includes('avatar_seed')) {
  db.exec("ALTER TABLE vents ADD COLUMN avatar_seed TEXT NOT NULL DEFAULT 'seed'");
}

const ventSelect = `SELECT id, content, likes, category, nickname, avatar_seed, created_at FROM vents`;
const insertVentStmt = db.prepare('INSERT INTO vents (content, category, nickname, avatar_seed) VALUES (?, ?, ?, ?)');
const getVentsStmt = db.prepare(`${ventSelect} ORDER BY likes DESC, created_at DESC`);
const getVentsByCategoryStmt = db.prepare(`${ventSelect} WHERE category = ? ORDER BY likes DESC, created_at DESC`);
const getVentStmt = db.prepare(`${ventSelect} WHERE id = ?`);
const likeVentStmt = db.prepare('UPDATE vents SET likes = likes + 1 WHERE id = ?');
const todayDestroyedStmt = db.prepare(`SELECT COUNT(*) AS count FROM vents WHERE date(created_at, 'localtime') = date('now', 'localtime')`);
const totalsByCategoryStmt = db.prepare('SELECT category, COUNT(*) AS count FROM vents GROUP BY category');

function getCategoryStats() {
  const rows = totalsByCategoryStmt.all();
  const stats = Object.fromEntries(VALID_TAGS.map((tag) => [tag, 0]));
  rows.forEach((row) => {
    stats[row.category] = row.count;
  });
  return stats;
}

function buildSnapshot(category = '全部') {
  const normalizedCategory = VALID_TAGS.includes(category) ? category : '全部';
  const vents = normalizedCategory === '全部' ? getVentsStmt.all() : getVentsByCategoryStmt.all(normalizedCategory);
  return {
    vents,
    meta: {
      todayDestroyed: todayDestroyedStmt.get().count,
      category: normalizedCategory,
      validCategories: VALID_TAGS,
      categoryTotals: getCategoryStats(),
      totalDestroyed: db.prepare('SELECT COUNT(*) AS count FROM vents').get().count,
    },
  };
}

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
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

// Get all vents ordered by likes desc
app.get('/api/vents', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '全部';
  res.json(buildSnapshot(category));
});

// Create a new vent
app.post('/api/vents', (req, res) => {
  const { content, category } = req.body || {};
  const trimmed = (content || '').trim();
  const normalizedCategory = VALID_TAGS.includes(category) ? category : '其他';

  if (!trimmed) {
    return res.status(400).json({ error: 'Content is required.' });
  }
  if (trimmed.length > MAX_CONTENT_LEN) {
    return res.status(400).json({ error: `Content too long (max ${MAX_CONTENT_LEN} characters).` });
  }

  const info = insertVentStmt.run(trimmed, normalizedCategory, req.viewer.nickname, req.viewer.avatarSeed);
  const vent = getVentStmt.get(info.lastInsertRowid);
  broadcast('vents:update', buildSnapshot('全部'));
  res.status(201).json({ vent, profile: req.viewer, meta: buildSnapshot('全部').meta });
});

// Like a vent
app.post('/api/vents/:id/like', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id.' });
  }

  const result = likeVentStmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Vent not found.' });
  }

  const vent = getVentStmt.get(id);
  broadcast('vents:update', buildSnapshot('全部'));
  res.json({ vent });
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
  socket.send(JSON.stringify({ type: 'hello', payload: buildSnapshot('全部') }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
