-- ============================================
-- r0ntflix D1 schema — migration 0002
-- Rate limiting for auth attempts (brute-force protection)
-- ============================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  email         TEXT PRIMARY KEY,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,             -- unixepoch when the email is locked out
  last_attempt  INTEGER NOT NULL DEFAULT (unixepoch())
);