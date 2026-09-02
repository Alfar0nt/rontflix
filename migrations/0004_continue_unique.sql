-- ============================================
-- r0ntflix D1 schema — migration 0004
-- Continue watching: fix NULL handling in the UNIQUE key.
--
-- SQLite treats NULLs as DISTINCT in a composite UNIQUE,
-- so the table-level `UNIQUE(user_id, tmdb_id, media_type,
-- season, episode)` let duplicate movie rows (season/episode NULL)
-- be inserted. This adds a unique index using COALESCE(,0) so
-- movies and shows both dedupe correctly, then dedupes existing rows.
-- ============================================

-- Collapse any pre-existing duplicates, keeping the most advanced progress.
DELETE FROM continue_watching
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, MAX(watched) AS mw,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, tmdb_id, media_type,
               COALESCE(season,0), COALESCE(episode,0)
             ORDER BY watched DESC, updated_at DESC
           ) AS rn
    FROM continue_watching
  ) WHERE rn = 1
);

-- One row per (user, media, episode); movies (NULL season/episode) treated as 0.
CREATE UNIQUE INDEX IF NOT EXISTS idx_continue_unique
  ON continue_watching(user_id, tmdb_id, media_type, COALESCE(season,0), COALESCE(episode,0));