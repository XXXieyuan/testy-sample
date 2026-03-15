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
  const prefixes = [
    '匿名熔炉者',
    '暗夜喷火龙',
    '键盘毁灭者',
    '深夜怒吼兽',
    '摸鱼叛逆者',
    '暴躁老哥',
    '咆哮帝',
    '狂怒战士',
    '午夜游魂',
    '愤怒小鸟',
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
  category TEXT NOT NULL DEFAULT '其他',
  nickname TEXT NOT NULL DEFAULT '匿名熔炉者#0000',
  avatar_seed TEXT NOT NULL DEFAULT 'seed',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.exec(initStmt);

// Lightweight, idempotent migrations for older databases
// (explicit ALTERs kept for compatibility with earlier versions)
try {
  db.exec("ALTER TABLE vents ADD COLUMN category TEXT DEFAULT '其他'");
} catch (e) {}
try {
  db.exec("ALTER TABLE vents ADD COLUMN nickname TEXT DEFAULT '匿名'");
} catch (e) {}

// More detailed migrations and indexes
try {
  db.exec("ALTER TABLE vents ADD COLUMN category TEXT NOT NULL DEFAULT '其他'");
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

// 今日销毁总数
app.get('/api/daily-count', (req, res) => {
  const row = todayDestroyedStmt.get();
  res.json({ count: row.count });
});

// 兼容：排行榜数据（别名：/api/leaderboard）
app.get('/api/vents', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '全部';
  res.json(buildSnapshot(category));
});

app.get('/api/leaderboard', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '全部';
  res.json(buildSnapshot(category));
});

function handleCreateVent(req, res) {
  const { content, category, nickname } = req.body || {};
  const trimmed = (content || '').trim();
  const normalizedCategory = VALID_TAGS.includes(category) ? category : '其他';
  const safeNickname =
    typeof nickname === 'string' && nickname.trim() ? nickname.trim() : req.viewer.nickname;

  if (!trimmed) {
    return res.status(400).json({ error: '内容不能为空。' });
  }
  if (trimmed.length > MAX_CONTENT_LEN) {
    return res
      .status(400)
      .json({ error: `内容过长（最多 ${MAX_CONTENT_LEN} 字）。` });
  }

  const avatarSeed = makeAvatarSeed(safeNickname);
  const info = insertVentStmt.run(trimmed, normalizedCategory, safeNickname, avatarSeed);
  const vent = getVentStmt.get(info.lastInsertRowid);
  const todayDestroyed = todayDestroyedStmt.get().count;

  // 细粒度推送：新吐槽 + 今日计数
  broadcast('new_vent', {
    vent,
    category: normalizedCategory,
    nickname: safeNickname,
    daily_count: todayDestroyed,
  });
  broadcast('daily_count', { count: todayDestroyed });

  // 保持向后兼容的快照广播
  const snapshot = buildSnapshot('全部');
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
    return res.status(400).json({ error: 'ID 无效。' });
  }

  const result = likeVentStmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: '未找到对应的吐槽。' });
  }

  const vent = getVentStmt.get(id);

  // 点赞实时更新
  broadcast('like_update', { id: vent.id, likes: vent.likes });
  broadcast('vents:update', buildSnapshot('全部'));

  return res.json({ vent });
}

// Create a new vent
app.post('/api/vents', (req, res) => {
  return handleCreateVent(req, res);
});

// 兼容：单数形式的创建接口
app.post('/api/vent', (req, res) => {
  return handleCreateVent(req, res);
});

// Like a vent
app.post('/api/vents/:id/like', (req, res) => {
  return handleLikeVent(req, res);
});

// 兼容：原有接口路径 /api/like/:id
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
  socket.send(JSON.stringify({ type: 'hello', payload: buildSnapshot('全部') }));
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
