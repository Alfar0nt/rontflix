# Database Implementation Guide — Cloudflare D1 + Pages Functions

This project is hosted on **Cloudflare Pages** (static hosting). To add authentication, a watchlist, and persisted per-user state, we use **Cloudflare Pages Functions** (serverless Workers) plus **Cloudflare D1** (serverless SQLite). Everything stays within the Cloudflare platform already hosting this project.

> **Why this stack?** Cloudflare Pages only serves static files — it cannot run a long-lived Express/local-auth server or write a SQLite file to disk. D1 is Cloudflare's built-in serverless SQLite, and Pages Functions give you API endpoints without a separate server.

---

## 1. D1 Limits (are they a problem?)

| Limit | Value | For this app |
|---|---|---|
| Storage size | **10 GB / database** | Effectively unlimited (users + watchlist rows, not video) |
| Row count | No hard cap (bounded by 10 GB) | Fine |
| Reads (Free plan) | 5 million rows / day | Far more than needed |
| Writes (Free plan) | 100k rows / day | Plenty |
| Max query size | ~100 KB | Fine |
| Concurrency | Single-region default | Fine for personal use |

For a personal streaming app, **D1 limits are a non-issue.**

---

## 2. Prerequisites

- Cloudflare account (free)
- Node.js 18+ installed locally
- Project already deployed to Cloudflare Pages (or ready to)
- `wrangler` installed:
  ```bash
  npm install -g wrangler
  ```

---

## 3. Project Structure

Pages Functions live in a `functions/` directory at the project root. A file `functions/api/login.js` becomes the endpoint `POST /api/login`. Static assets (`index.html`, `*.js`, `*.css`) continue to be served normally.

```
rontflix/
├── functions/
│   ├── api/
│   │   ├── register.js      # POST /api/register
│   │   ├── login.js         # POST /api/login
│   │   ├── logout.js        # POST /api/logout
│   │   ├── me.js            # GET  /api/me
│   │   ├── watchlist.js     # GET/POST/DELETE /api/watchlist
│   │   ├── continue.js      # GET/POST/DELETE /api/continue  (resume/progress)
│   │   ├── history.js       # GET/POST /api/history          (watch history)
│   │   └── import.js        # POST /api/import               (localStorage → D1 sync)
│   ├── _http.js             # shared response/validation helpers (error, json, dbError, intOr, clampNum, s, MEDIA_TYPES)
│   ├── _middleware.js       # shared session/auth helpers
│   ├── _password.js         # PBKDF2 hashing
│   └── _rateLimit.js        # login/register rate limiting
├── migrations/
│   ├── 0001_init.sql                 # users, sessions, watchlist, continue_watching, watch_history
│   ├── 0002_auth_attempts.sql        # rate-limit table
│   ├── 0003_history_unique.sql       # watch_history unique index
│   └── 0004_continue_unique.sql      # continue_watching unique index
├── index.html
├── app.js
├── ... (existing static files)
└── wrangler.toml            # D1 binding config
```

---

## 4. Database Schema (migrations/0001_init.sql)

```sql
-- Users
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sessions (httpOnly cookie token)
CREATE TABLE IF NOT EXISTS sessions (
  token     TEXT PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

-- Watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  title      TEXT NOT NULL,
  poster_path TEXT,
  added_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, tmdb_id, media_type)
);

-- Continue Watching (resume per user per media / episode)
CREATE TABLE IF NOT EXISTS continue_watching (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  season     INTEGER,
  episode    INTEGER,
  title      TEXT NOT NULL,
  poster_path TEXT,
  watched    REAL DEFAULT 0,
  duration   REAL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, tmdb_id, media_type, season, episode)
);

-- Watch history
CREATE TABLE IF NOT EXISTS watch_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  title      TEXT NOT NULL,
  poster_path TEXT,
  played_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user     ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_continue_user      ON continue_watching(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user       ON watch_history(user_id);
```

Apply it:
```bash
wrangler d1 migrations create rontflix-db
wrangler d1 migrations apply rontflix-db --remote
```
For local dev: `wrangler d1 migrations apply rontflix-db --local`.

---

## 5. Wrangler Config (wrangler.toml)

```toml
name = "rontflix"
main = "functions/index.js"   # only needed if using a Worker entrypoint
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "DB"
database_name = "rontflix-db"
database_id = "<your-database-id>"   # from: wrangler d1 info rontflix-db
migrations_dir = "migrations"
```

### 5b. Create + bind the database (dashboard)

1. Cloudflare Dashboard → **Workers & Pages** → **D1** → **Create database** (name `rontflix-db`).
2. **Bind** it to your Pages project:
   - Pages project → **Settings** → **Functions** → **D1 database bindings** → add `DB` → select `rontflix-db`.

---

## 6. Shared Session/Auth Helper (functions/_middleware.js)

Pages Functions support a shared `_middleware.js` that runs for all requests under its path. We use it to read/validate the session cookie and resolve the current user.

> **Important — how middleware shares data:** Cloudflare Pages Functions gives each middleware and downstream handler a **fresh** `context` object, so properties you set on `context` in `_middleware.js` are **not** visible to the route handler. To pass state down the chain, use **`context.data`** (e.g. `context.data.user`). This is the single official channel for enriching requests in middleware.

```js
// functions/_middleware.js
const cookie = (name, value, maxAge) =>
  `token=${value}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;

export async function onRequest(context) {
  // Allow OPTIONS for CORS (if frontend served from a subdomain)
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  context.data.user = null; // <-- use context.data, NOT context.userId
  context.data.sessionCookie = cookie;
  context.data.clearCookie = () => "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure";

  const header = context.request.headers.get("Cookie") || "";
  const token = (header.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];

  if (token) {
    try {
      const session = await context.env.DB.prepare(
        `SELECT s.user_id AS id, u.email, u.username
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > unixepoch()`
      ).bind(token).first();
      if (session) context.data.user = session;
    } catch (err) {
      console.error("session lookup failed:", err);
    }
  }

  return context.next();
}
```

> **Note on Cookies + Pages Functions:** Pages Functions run on your specified domain. `SameSite=Lax` prevents CSRF for top-level navigation. If you deploy the frontend on a different subdomain than the API, you'll need permissive CORS and a shared cookie domain — simplest is to serve both from the same Pages domain. The auth endpoints use the `sessionCookie()` / `clearCookie()` helpers exported from **`functions/_middleware.js`**, which set a `token` cookie with `HttpOnly; Path=/; Max-Age; SameSite=Lax`. The `Secure` flag is applied **only over HTTPS** (`context.data.secureCookie`, derived from the request scheme). This keeps `Secure` in production (Cloudflare Pages is always HTTPS) while allowing the cookie to persist over plain-http LAN dev (e.g. testing from a phone on your local network), where browsers otherwise refuse to store a `Secure` cookie.

---

## 6b. Shared Response/Validation Helper (functions/_http.js)

Added in **Phase 6 (v0.0.16)** to make every endpoint's responses and input handling consistent. Exports small, dependency-free helpers used by all API endpoints:

- `json(data, status = 200)` — `Response.json({ ...data })` with a status.
- `error(status, message)` — `Response.json({ error: message }, { status })` (also used for 401/400/404/409/429).
- `dbError(err)` — logs the real error server-side and returns a **safe, non-leaking** JSON `500 {"error":"Internal server error."}`. Wrap every `DB` call in try/catch and return on this.
- `MEDIA_TYPES` — `["movie", "tv"]`; check `media_type` against it.
- `intOr(value, fallback = null)` — parse an integer or return the fallback for `tmdb_id`/season/episode.
- `clampNum(value, min, max, fallback = 0)` — clamp `watched`/`duration` numeric fields.
- `s(value, maxLength = 200)` — trim + length-cap string fields (title, poster_path, username).

This guarantees (a) the client is never trusted — media type, integer IDs, string bounds, and numeric bounds are all validated server-side; (b) DB errors become consistent JSON 500s instead of opaque Worker failures; and (c) every endpoint returns a uniform `{ error }` / `{ ... }` JSON shape.

---

## 7. Password Hashing

Cloudflare Workers do **not** include Node's `crypto` by default, but you can use Web Crypto (`crypto.subtle`) for PBKDF2, or import a small pure-JS hashing lib. A simple, dependency-light approach is **PBKDF2 via Web Crypto** (no external package needed):

```js
// functions/_password.js
const enc = new TextEncoder();

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key, 256
  );
  return bufToB64(bits);
}

export async function createPasswordHash(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufToB64(saltBytes.buffer);
  const hash = await hashPassword(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = await hashPassword(password, salt);
  return check === hash;
}
```

> **Alternative:** `npm install bcryptjs` (pure-JS, zero native deps) and bundle it via `wrangler`'s build step. PBKDF2 via Web Crypto keeps this project dependency-free, consistent with the repo's zero-dependency style.

---

## 8. Auth Endpoints

### 8a. Register — `POST /api/register`
```js
import { createPasswordHash } from "../_password.js";

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const { email, username, password } = body || {};

  // -- validate (never trust the client) --
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }
  if (!username || username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // -- check for duplicate --
  const existing = await context.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(normalizedEmail).first();
  if (existing) {
    return Response.json({ error: "Email already registered" }, { status: 409 });
  }

  const password_hash = await createPasswordHash(password);

  // -- insert --
  const res = await context.env.DB.prepare(
    `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)`
  ).bind(normalizedEmail, username.trim(), password_hash).run();

  const userId = res.meta.last_row_id;

  // -- create session --
  const token = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const session = await context.env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, userId, now + 60 * 60 * 24 * 30).run();

  return new Response(JSON.stringify({ user: { id: userId, email: normalizedEmail, username } }), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `token=${token}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax; Secure`,
    },
  });
}
```

### 8b. Login — `POST /api/login`
```js
import { verifyPassword } from "../_password.js";

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const { email, password } = body || {};
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return Response.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await context.env.DB.prepare(
    "SELECT * FROM users WHERE email = ?"
  ).bind(normalizedEmail).first();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await context.env.DB.prepare(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, user.id, now + 60 * 60 * 24 * 30).run();

  return new Response(JSON.stringify({ user: { id: user.id, email: user.email, username: user.username } }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `token=${token}; HttpOnly; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax; Secure`,
    },
  });
}
```

### 8c. Logout — `POST /api/logout`
```js
export async function onRequestPost(context) {
  const header = context.request.headers.get("Cookie") || "";
  const token = (header.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];
  if (token) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure" },
  });
}
```

### 8d. Current user — `GET /api/me`
```js
// The middleware already resolved the user into context.data.user.
export async function onRequestGet(context) {
  return Response.json({ user: context.data.user || null });
}
```

---

## 9. Watchlist Endpoints

### Toggle / Add — `POST /api/watchlist`
```js
export async function onRequestPost(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;

  const { tmdb_id, media_type, title, poster_path } = await context.request.json().catch(() => ({}));
  if (!tmdb_id || !["movie", "tv"].includes(media_type)) {
    return Response.json({ error: "Invalid media" }, { status: 400 });
  }

  await context.env.DB.prepare(
    `INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_path)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, tmdb_id, media_type) DO NOTHING`
  ).bind(userId, tmdb_id, media_type, title || null, poster_path || null).run();

  return Response.json({ ok: true });
}
```

### List — `GET /api/watchlist`
```js
export async function onRequestGet(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;
  const { results } = await context.env.DB.prepare(
    `SELECT tmdb_id, media_type, title, poster_path, added_at
     FROM watchlist WHERE user_id = ? ORDER BY added_at DESC`
  ).bind(userId).all();
  return Response.json({ items: results });
}
```

### Remove — `DELETE /api/watchlist`
```js
export async function onRequestDelete(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;
  const url = new URL(context.request.url);
  const tmdb_id = url.searchParams.get("tmdb_id");
  const media_type = url.searchParams.get("media_type");
  await context.env.DB.prepare(
    `DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?`
  ).bind(userId, Number(tmdb_id), media_type).run();
  return Response.json({ ok: true });
}
```

> **Always scope queries by `user_id`.** Never allow a user to read/write another user's rows (authz check).

---

## 9b. Continue Watching / Progress Endpoints

Player progress is written to D1 **in addition to** localStorage when a user is signed in. Every throttled progress tick → `POST /api/continue`; removing a title → `DELETE /api/continue`; on login the local list is pushed via `POST /api/import` (below).

### Upsert one entry — `POST /api/continue`
```js
// body: { tmdb_id, media_type, season?, episode?, title?, poster_path?, watched?, duration? }
export async function onRequestPost(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;
  const body = await context.request.json().catch(() => null);
  const tmdb_id = Number(body?.tmdb_id);
  const media_type = body?.media_type;
  if (!tmdb_id || !["movie", "tv"].includes(media_type))
    return Response.json({ error: "Invalid media" }, { status: 400 });

  const season = body?.season ? Number(body.season) : null;
  const episode = body?.episode ? Number(body.episode) : null;

  // delete-then-insert (NOT ON CONFLICT): SQLite treats NULL as DISTINCT in a
  // UNIQUE constraint, so targetting the (season, episode) key would let
  // duplicate movie rows (NULL season/episode) be inserted. Migration 0004
  // adds an expression unique index with COALESCE(,0) as a DB-level guard.
  const DB = context.env.DB;
  await DB.prepare(
    `DELETE FROM continue_watching
     WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
       AND COALESCE(season, 0) = COALESCE(?, 0)
       AND COALESCE(episode, 0) = COALESCE(?, 0)`
  ).bind(userId, tmdb_id, media_type, season, episode).run();

  await DB.prepare(
    `INSERT INTO continue_watching
       (user_id, tmdb_id, media_type, season, episode, title, poster_path, watched, duration, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(userId, tmdb_id, media_type, season, episode,
    body?.title || "Untitled", body?.poster_path || null,
    Number(body?.watched) > 0 ? Number(body.watched) : 0,
    Number(body?.duration) > 0 ? Number(body.duration) : 0).run();

  return Response.json({ ok: true });
}
```

### List — `GET /api/continue`
```sql
SELECT tmdb_id, media_type, season, episode, title, poster_path, watched, duration, updated_at
FROM continue_watching WHERE user_id = ? ORDER BY updated_at DESC
```

### Remove — `DELETE /api/continue?tmdb_id=&media_type=&season=&episode=`
No `season`/`episode` (movies or a whole show) removes every matching row; with them, just that episode.

---

## 9c. Watch History Endpoint
Every `openPlayer()` call records a history row (`POST /api/history`). Replays **bump `played_at`** in place rather than duplicating, enforced by the unique index `idx_history_unique(user_id, tmdb_id, media_type, season, episode)` (migration 0003, using `COALESCE(, -1)` so movie NULLs key consistently).

- **`GET /api/history`** — `SELECT ... FROM watch_history WHERE user_id = ? ORDER BY played_at DESC` (most recently watched first)
- **`POST /api/history`** — delete old row for `(user_id, tmdb_id, media_type, season, episode)`, then insert fresh with `played_at = unixepoch()`

---

## 9d. Import (login sync) — `POST /api/import`
Called on login to push the pre-login localStorage continue-watching list into D1.

```js
// body: { items: [ { tmdb_id, media_type, season?, episode?, title?, poster_path?, watched?, duration? } ] }
```
Each item does a delete-then-insert (local value wins). Uses `DB.batch()` for atomicity. Returns `{ ok, imported }`.

---

## 9e. Profile (planned — not yet implemented)

Future `users`-related endpoints (tracked in `docs/ROADMAP.md` Phase 7):
- **`PATCH/PUT /api/profile`** — update the signed-in user's username, email, and/or avatar (extend `users` with e.g. `avatar_url TEXT`). Changing email must re-issue the session cookie.
- **`POST /api/profile/password`** — change password; requires the current password (verify via `_password.js`) before updating `password_hash`.
- Guarded by `context.data.user` (401 when signed out), and every write scoped to the authenticated user's row (`WHERE id = context.data.user.id`).

---

## 10. Frontend Integration (vanilla JS)

Add a thin API wrapper (e.g. in a new `auth.js` file, loaded after `config.js`). Example:

```js
// auth.js
const AUTH_API = window.location.origin; // same origin as Pages Functions

async function api(path, options = {}) {
  const res = await fetch(`${AUTH_API}${path}`, {
    credentials: "include",             // send httpOnly cookie
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

let currentUser = null;

async function checkSession() {
  try { currentUser = (await api("/api/me")).user; } catch { currentUser = null; }
  return currentUser;
}

async function register(email, username, password) {
  return (await api("/api/register", {
    method: "POST", body: JSON.stringify({ email, username, password }),
  })).user;
}

async function login(email, password) {
  return (await api("/api/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  })).user;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  currentUser = null;
}
```

Guard watchlist/history UI: only fetch `/api/watchlist` when `currentUser` is set; otherwise show a "Sign in to save your watchlist" prompt.

---

## 11. Migration of Existing localStorage State

On successful login, the app calls **`POST /api/import`** (see §9d) to push the pre-login `vidukinet-ContinueWatching`/`vidukinet-Progress` data into D1:

1. Read `vidukinet-ContinueWatching` and `vidukinet-Progress` from localStorage and map each entry to `{ tmdb_id, media_type, season, episode, title, poster_path, watched, duration }`.
2. `POST /api/import` upserts each into `continue_watching`.
3. localStorage is kept as the always-on render source (offline/degraded mode) — it is *not* cleared; D1 is mirrored when signed in. Signing out reverts to the local list.

**D1 remains authoritative across devices when signed in:** on login, `continue.js`'s `loadContinueWatching()` imports local → D1, then pulls D1 → local and re-renders.

---

## 12. Local Development & Testing

```bash
# apply migrations locally
wrangler d1 migrations apply rontflix-db --local

# run Pages Functions + static assets locally
wrangler pages dev .
```

Then hit `http://localhost:8787/api/register`, `.../api/login`, etc., and open the app at `http://localhost:8787`.

Manual test flow: register → login → confirm cookie set → add a watchlist item → GET watchlist returns it → play media → check `continue_watching` updated → logout → `/api/me` returns `user: null`.

---

## 13. Deploy

```bash
# apply migrations to the remote D1 database
wrangler d1 migrations apply rontflix-db --remote

# build/deploy Pages (with functions)
npx wrangler pages deploy .
```

Or connect your Git repo to Cloudflare Pages → it auto-builds and deploys including the `functions/` folder and D1 bindings (set the D1 binding in the Pages dashboard as in §5b).

---

## 14. Security Checklist

Status as of **Phase 6 (v0.0.16)**.

- [x] Passwords hashed with PBKDF2 — never plaintext, never reversible
- [x] httpOnly + Secure + SameSite cookies for sessions (`Secure` only over HTTPS)
- [x] Rate-limit login/register (`auth_attempts`, 5-fail lockout → 429)
- [x] Validate + sanitize all inputs server-side — all endpoints use `functions/_http.js` helpers (`MEDIA_TYPES`, `intOr`, `clampNum`, `s`); DB access wrapped in try/catch returning consistent JSON 500s
- [x] Scope every query by `user_id` (authz) — verified user isolation end-to-end
- [x] No secrets in client code (session handled by httpOnly cookie; D1 binding is server-side only)
- [ ] (Optional) Consider a soft-delete or confirmation before destructive ops — not implemented; destructive ops are single-user scoped deletes, acceptable for this app

---

## 15. Rollback / Backups

D1 has built-in **time-travel / point-in-time backups** (Cloudflare dashboard → D1 → your database → Backups). Before destructive migrations, snapshot first.
