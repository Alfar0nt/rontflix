// ============================================
// /api/import — batch sync of local (pre-login) continue-watching
// progress from localStorage into D1. Called on login.
// Request body: { items: [ { tmdb_id, media_type, season?, episode?,
//                            title, poster_path?, watched?, duration? }, ... ] }
// All queries scoped by user_id (authz).
// ============================================
import { error, dbError, json, MEDIA_TYPES, s, intOr, clampNum } from "../_http.js";

// Cap the number of rows a single request may import.
const MAX_ITEMS = 200;

export async function onRequestPost(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];

  if (items.length === 0) return json({ ok: true, imported: 0 });

  const DB = context.env.DB;
  const batch = [];

  for (const it of items) {
    const tmdb_id = intOr(it?.tmdb_id, null);
    const media_type = it?.media_type;
    if (!tmdb_id || !MEDIA_TYPES.includes(media_type)) continue;

    const season = intOr(it?.season, null);
    const episode = intOr(it?.episode, null);
    const title = s(it?.title, 300) || "Untitled";
    const poster_path = s(it?.poster_path, 500) || null;
    const watched = clampNum(it?.watched, 0, 1e8, 0);
    const duration = clampNum(it?.duration, 0, 1e8, 0);

    // delete-then-insert (local value wins on login) — robust to SQLite's
    // NULL-distinct-in-UNIQUE behaviour for movies (season/episode NULL).
    batch.push(
      DB.prepare(
        `DELETE FROM continue_watching
         WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
           AND COALESCE(season, 0) = COALESCE(?, 0)
           AND COALESCE(episode, 0) = COALESCE(?, 0)`
      ).bind(userId, tmdb_id, media_type, season, episode)
    );
    batch.push(
      DB.prepare(
        `INSERT INTO continue_watching
           (user_id, tmdb_id, media_type, season, episode, title, poster_path, watched, duration, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
      ).bind(userId, tmdb_id, media_type, season, episode, title, poster_path, watched, duration)
    );
  }

  try {
    if (batch.length > 0) await DB.batch(batch);
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true, imported: batch.length / 2 });
}