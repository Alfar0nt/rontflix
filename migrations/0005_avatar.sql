-- ============================================
-- r0ntflix D1 schema — migration 0005
-- Add avatar_url to users (profile picture).
--
-- avatar_url holds either:
--   NULL  → fall back to the initial-letter avatar
--   "preset:<name>" → a named color-preset avatar (e.g. "preset:amber")
--   a http(s) URL → an uploaded/custom image
-- ============================================

ALTER TABLE users ADD COLUMN avatar_url TEXT;