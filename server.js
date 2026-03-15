const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'vents.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS vents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/vents', (_req, res) => {
  db.all(
    `SELECT id, content, likes, created_at
     FROM vents
     ORDER BY likes DESC, created_at DESC, id DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch vents.' });
      }
      res.json(rows);
    }
  );
});

app.post('/api/vents', (req, res) => {
  const content = String(req.body?.content || '').trim();

  if (!content) {
    return res.status(400).json({ error: 'Vent content is required.' });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: 'Vent content must be 500 characters or less.' });
  }

  const stmt = `INSERT INTO vents (content) VALUES (?)`;
  db.run(stmt, [content], function onInsert(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to save vent.' });
    }

    db.get(
      'SELECT id, content, likes, created_at FROM vents WHERE id = ?',
      [this.lastID],
      (selectErr, row) => {
        if (selectErr) {
          return res.status(500).json({ error: 'Vent saved but failed to load record.' });
        }

        res.status(201).json(row);
      }
    );
  });
});

app.post('/api/vents/:id/like', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid vent id.' });
  }

  db.run(
    'UPDATE vents SET likes = likes + 1 WHERE id = ?',
    [id],
    function onUpdate(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to like vent.' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Vent not found.' });
      }

      db.get(
        'SELECT id, content, likes, created_at FROM vents WHERE id = ?',
        [id],
        (selectErr, row) => {
          if (selectErr) {
            return res.status(500).json({ error: 'Like applied but failed to load record.' });
          }

          res.json(row);
        }
      );
    }
  );
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`testy-sample listening on http://localhost:${PORT}`);
});
