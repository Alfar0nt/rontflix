// ============================================
// /api/history — Watch history (every played item, sorted by last watched)
// GET  list the current user's history (most recently played first)
// POST record/upsert a played item (replay bumps played_at)
// All queries scoped by user_id (authz).
// ============================================
import { error, dbError, json, MEDIA_TYPES, s, intOr } from "../_http.js";

// POST / GET semantics rely on the unique index
// idx_history_unique(user_id, tmdb_id, media_type, season, episode)
// so a re-played title updates in place instead of duplicating.

export async function onRequestPost(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const tmdb_id = intOr(body?.tmdb_id, null);
  const media_type = body?.media_type;
  if (!tmdb_id || !MEDIA_TYPES.includes(media_type)) {
    return error(400, "Invalid media");
  }

  const season = intOr(body?.season, null);
  const episode = intOr(body?.episode, null);
  const title = s(body?.title, 300) || (media_type === "tv" ? `#${tmdb_id}` : "Untitled");
  const poster_path = s(body?.poster_path, 500) || null;

  const DB = context.env.DB;
  try {
    // Remove the existing row (if any), then insert fresh with played_at = now.
    // COALESCE NULLs to -1 to match the unique index's key for movies.
    await DB.prepare(
      `DELETE FROM watch_history
       WHERE user_id = ?
         AND tmdb_id = ?
         AND media_type = ?
         AND COALESCE(season, -1) = COALESCE(?, -1)
         AND COALESCE(episode, -1) = COALESCE(?, -1)`
    ).bind(userId, tmdb_id, media_type, season, episode).run();

    await DB.prepare(
      `INSERT INTO watch_history (user_id, tmdb_id, media_type, title, poster_path, season, episode, played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).bind(userId, tmdb_id, media_type, title, poster_path, season, episode).run();
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true });
}

export async function onRequestGet(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  let results;
  try {
    ({ results } = await context.env.DB.prepare(
      `SELECT tmdb_id, media_type, season, episode, title, poster_path, played_at
       FROM watch_history WHERE user_id = ? ORDER BY played_at DESC`
    ).bind(userId).all());
  } catch (err) {
    return dbError(err);
  }

  return json({ items: results });
}