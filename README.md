# testy-sample

An experimental dark-neon venting prototype: users type out whatever they want to vent about, hit **“Destroy”**, and watch it get incinerated while the text is stored in SQLite and ranked on a like-based leaderboard.

## What This Is

Testy Vent Lab is a tiny single-page app that behaves like a “Venting Furnace”:

- You write a short vent (up to 500 characters).
- You choose a category such as Work, School, Life, Relationships, or Other.
- You click **Destroy** to send it into the furnace.
- The entry is saved to a local SQLite database and shows up on a global leaderboard where others can “Struck a nerve” (like) your vent.

Everything is anonymous. Each browser gets a fun codename like `Anon Furnace#1234` or `Midnight Dragon#5678`, which is tracked via cookies only on the client.

## Features

- **Venting Furnace composer**: write a vent, pick a category, and hit **Destroy** to trigger a neon-style explosion animation.
- **SQLite persistence**: all vents are stored in `data/vents.db` using `better-sqlite3`.
- **Top Vents leaderboard**: shows all vents sorted by likes (and creation time as a tiebreaker), with live updates over WebSocket.
- **Anonymous nicknames & monster avatars**: nicknames are generated on the server, and each vent is rendered with a small pixel monster avatar derived from the nickname.
- **Dark neon UI**: dark background with electric accent colors and a minimal, game-like feel.
- **Single Page App**: Node.js + Express serve the API and a static HTML/CSS/JS front end.

## Tech Stack

- **Backend:** Node.js + Express + better-sqlite3
- **Database:** SQLite (file at `data/vents.db`)
- **Frontend:** HTML + CSS + vanilla JavaScript
- **Transport:** REST + WebSocket (`ws`)
- **Architecture:** SPA (Single Page Application)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

### 3. Open in browser

```bash
http://localhost:3000
```

You should see the Venting Furnace interface with a composer on the left and a Top Vents leaderboard on the right.

## API Endpoints

- `GET /api/health` — basic health check, returns `{ status: "ok" }`.
- `GET /api/profile` — returns the current viewer profile (nickname, avatar seed) and the list of valid categories.
- `GET /api/daily-count` — returns how many vents were created today.
- `GET /api/vents?category=...` — returns a snapshot containing:
  - `vents`: list of vents (id, content, likes, category, nickname, avatar_seed, created_at)
  - `meta`: leaderboard metadata (todayDestroyed, category, validCategories, categoryTotals, totalDestroyed)
- `GET /api/leaderboard` — alias of `GET /api/vents`.
- `POST /api/vents` — create a new vent.
- `POST /api/vent` — legacy alias for creating a vent.
- `POST /api/vents/:id/like` — like a vent.
- `POST /api/like/:id` — legacy alias for liking a vent.

### Example create payload

```json
{
  "content": "This meeting feels like an infinite recursion.",
  "category": "Work"
}
```

If `category` is omitted or not one of `Work | School | Life | Relationships | Other`, it will default to `Other`.

## Categories & Migration

The app uses English category names everywhere:

- `Work`
- `School`
- `Life`
- `Relationships`
- `Other`

On startup, the server runs a small migration that rewrites older database rows that used Chinese category names into their English equivalents. This keeps the leaderboard and filters consistent even if your `vents.db` was created in a previous Chinese-language version of the app.

## Project Structure

```bash
testy-sample/
├── public/
│   ├── index.html      # Main SPA shell (Venting Furnace UI)
│   ├── styles.css      # Dark neon styling
│   └── app.js          # Frontend logic, WebSocket handling, rendering
├── data/
│   └── vents.db        # SQLite database (created at runtime)
├── server.js           # Express server, WebSocket, SQLite access, migrations
├── package.json
├── AUTOPILOT_LOG.md
└── README.md
```

## Notes

- The SQLite file lives at `data/vents.db`. The directory is created automatically if missing.
- `node_modules/` and database files are ignored by Git.
- This is a lightweight prototype, not production-hardened. There is no auth, rate limiting, or content moderation.

## Future Ideas

- Add AI-based replies or empathetic copy generation.
- Introduce richer tagging and filters (e.g. Work / School / Relationships / Random chaos).
- Add a “Most savage vent of the day” section.
- Support pagination, full-text search, and more powerful filtering.
- Enhance the destroy animation with stronger timing, particles, and sound design.

## License

MIT

