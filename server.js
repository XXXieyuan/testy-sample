const path = require('path');
const fs = require('fs');
const express = require('express');
const morgan = require('morgan');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'vents.db');
const db = new Database(dbPath);

// Initialize database schema
// Simple schema: id, content, likes, created_at
// No user identity; anonymous vents only
const initStmt = `
CREATE TABLE IF NOT EXISTS vents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.exec(initStmt);

// Prepared statements for performance & safety
const insertVentStmt = db.prepare('INSERT INTO vents (content) VALUES (?)');
const getVentsStmt = db.prepare('SELECT id, content, likes, created_at FROM vents ORDER BY likes DESC, created_at DESC');
const likeVentStmt = db.prepare('UPDATE vents SET likes = likes + 1 WHERE id = ?');

app.use(morgan('dev'));
app.use(express.json());

// Serve SPA assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all vents ordered by likes desc
app.get('/api/vents', (req, res) => {
  const vents = getVentsStmt.all();
  res.json({ vents });
});

// Create a new vent
app.post('/api/vents', (req, res) => {
  const { content } = req.body || {};

  const trimmed = (content || '').trim();

  // Safe length cap per planner assumption
  const MAX_LEN = 500;
  if (!trimmed) {
    return res.status(400).json({ error: 'Content is required.' });
  }
  if (trimmed.length > MAX_LEN) {
    return res.status(400).json({ error: `Content too long (max ${MAX_LEN} characters).` });
  }

  const info = insertVentStmt.run(trimmed);
  const id = info.lastInsertRowid;
  const vent = db.prepare('SELECT id, content, likes, created_at FROM vents WHERE id = ?').get(id);
  res.status(201).json({ vent });
});

// Like a vent (unconstrained likes per prototype assumption)
app.post('/api/vents/:id/like', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id.' });
  }

  const result = likeVentStmt.run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Vent not found.' });
  }

  const vent = db.prepare('SELECT id, content, likes, created_at FROM vents WHERE id = ?').get(id);
  res.json({ vent });
});

// SPA fallback: always serve index.html for non-API GETs
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
