-- ============================================
-- r0ntflix D1 schema — migration 0001
-- Initial schema: users, sessions, watchlist,
-- continue_watching, watch_history
-- ============================================

-- Users ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sessions (httpOnly cookie token, server-side revocable) ---------------
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

-- Watchlist --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  added_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, tmdb_id, media_type)
);

-- Continue watching (resume per user, per media, optionally per episode) --
CREATE TABLE IF NOT EXISTS continue_watching (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  season      INTEGER,
  episode     INTEGER,
  title       TEXT NOT NULL,
  poster_path TEXT,
  watched     REAL NOT NULL DEFAULT 0,   -- seconds watched
  duration    REAL NOT NULL DEFAULT 0,   -- total seconds
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, tmdb_id, media_type, season, episode)
);

-- Watch history ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watch_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  title       TEXT NOT NULL,
  poster_path TEXT,
  season      INTEGER,
  episode     INTEGER,
  played_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user    ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_continue_user     ON continue_watching(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user      ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_played_at ON watch_history(user_id, played_at DESC);