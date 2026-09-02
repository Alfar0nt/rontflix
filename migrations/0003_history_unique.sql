-- ============================================
-- r0ntflix D1 schema — migration 0003
-- Watch history: one row per (user, media, episode)
-- so replaying bumps `played_at` instead of
-- inserting duplicate rows. "Sorted by last watched"
-- ============================================

-- Safety: collapse any pre-existing duplicates, keeping the most recent row.
DELETE FROM watch_history
WHERE id NOT IN (
  SELECT MAX(id) FROM watch_history
  GROUP BY user_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1)
);

-- Enforce one row per (user, media, media_type, episode).
-- COALESCE(-1) treats NULL season/episode (movies) consistently as a key value.
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_unique
  ON watch_history(user_id, tmdb_id, media_type, COALESCE(season, -1), COALESCE(episode, -1));