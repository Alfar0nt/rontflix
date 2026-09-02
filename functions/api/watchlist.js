// ============================================
// /api/watchlist — GET (list), POST (add), DELETE (remove)
// All queries scoped by user_id (authz).
// ============================================
import { error, dbError, json, MEDIA_TYPES, s, intOr } from "../_http.js";

// POST: add a title to the user's watchlist
export async function onRequestPost(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const tmdb_id = intOr(body?.tmdb_id, null);
  const media_type = body?.media_type;
  const title = s(body?.title, 300);
  const poster_path = s(body?.poster_path, 500) || null;

  if (!tmdb_id || !MEDIA_TYPES.includes(media_type)) {
    return error(400, "Invalid media");
  }
  if (!title) {
    return error(400, "Title is required");
  }

  try {
    await context.env.DB.prepare(
      `INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_path)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, tmdb_id, media_type) DO UPDATE SET
         title = excluded.title,
         poster_path = excluded.poster_path`
    ).bind(userId, tmdb_id, media_type, title, poster_path).run();
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true, saved: true }, 201);
}

// GET: list the current user's watchlist
export async function onRequestGet(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  let results;
  try {
    ({ results } = await context.env.DB.prepare(
      `SELECT tmdb_id, media_type, title, poster_path, added_at
       FROM watchlist WHERE user_id = ? ORDER BY added_at DESC`
    ).bind(userId).all());
  } catch (err) {
    return dbError(err);
  }

  return json({ items: results });
}

// DELETE: remove a title from the watchlist (via query params)
export async function onRequestDelete(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const url = new URL(context.request.url);
  const tmdb_id = intOr(url.searchParams.get("tmdb_id"), null);
  const media_type = url.searchParams.get("media_type");

  if (!tmdb_id || !MEDIA_TYPES.includes(media_type)) {
    return error(400, "Invalid media");
  }

  try {
    await context.env.DB.prepare(
      `DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?`
    ).bind(userId, tmdb_id, media_type).run();
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true, removed: true });
}