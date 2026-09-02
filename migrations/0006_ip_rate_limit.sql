-- ============================================
-- r0ntflix D1 schema — migration 0006
-- Per-IP rate limiting for login/register
-- (public-internet resilience against distributed brute-force)
-- ============================================

CREATE TABLE IF NOT EXISTS ip_attempts (
  ip            TEXT PRIMARY KEY,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,             -- unixepoch when the IP is locked out
  last_attempt  INTEGER NOT NULL DEFAULT (unixepoch())
);