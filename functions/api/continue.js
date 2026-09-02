// ============================================
// /api/continue — Continue Watching (server-side resume state)
// GET  list the current user's entries (newest first)
// POST upsert a single entry (one progress "tick")
// DELETE remove an entry
// All queries scoped by user_id (authz).
// ============================================
import { error, dbError, json, MEDIA_TYPES, s, intOr, clampNum } from "../_http.js";

// POST: create or update an entry for a media item.
// Fields: tmdb_id, media_type, season?, episode?, title, poster_path?, watched?, duration?
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
  const title = s(body?.title, 300);
  const poster_path = s(body?.poster_path, 500) || null;
  const watched = clampNum(body?.watched, 0, 1e8, 0);
  const duration = clampNum(body?.duration, 0, 1e8, 0);

  const DB = context.env.DB;
  try {
    // delete-then-insert is used instead of an upsert because SQLite treats NULL
    // as distinct in a UNIQUE constraint — so targeting the col UNIQUE key with
    // `ON CONFLICT(...)` would let duplicate movie rows (NULL season/episode) in.
    await DB.prepare(
      `DELETE FROM continue_watching
       WHERE user_id = ?
         AND tmdb_id = ?
         AND media_type = ?
         AND COALESCE(season, 0) = COALESCE(?, 0)
         AND COALESCE(episode, 0) = COALESCE(?, 0)`
    ).bind(userId, tmdb_id, media_type, season, episode).run();

    await DB.prepare(
      `INSERT INTO continue_watching
         (user_id, tmdb_id, media_type, season, episode, title, poster_path, watched, duration, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).bind(
      userId,
      tmdb_id,
      media_type,
      season,
      episode,
      title || "Untitled",
      poster_path,
      watched,
      duration
    ).run();
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true });
}

// GET: list the current user's continue-watching entries
export async function onRequestGet(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  let results;
  try {
    ({ results } = await context.env.DB.prepare(
      `SELECT tmdb_id, media_type, season, episode, title, poster_path, watched, duration, updated_at
       FROM continue_watching WHERE user_id = ? ORDER BY updated_at DESC`
    ).bind(userId).all());
  } catch (err) {
    return dbError(err);
  }

  return json({ items: results });
}

// DELETE: remove an entry via query params.
// ?tmdb_id=&media_type=    (movies, or a whole show)
// &season=&episode=        (optional; when given removes just that episode)
export async function onRequestDelete(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const url = new URL(context.request.url);
  const tmdb_id = intOr(url.searchParams.get("tmdb_id"), null);
  const media_type = url.searchParams.get("media_type");

  if (!tmdb_id || !MEDIA_TYPES.includes(media_type)) {
    return error(400, "Invalid media");
  }

  const season = url.searchParams.get("season");
  const episode = url.searchParams.get("episode");

  try {
    if (season || episode) {
      await context.env.DB.prepare(
        `DELETE FROM continue_watching
         WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
           AND season = ? AND episode = ?`
      ).bind(userId, tmdb_id, media_type, Number(season) || 0, Number(episode) || 0).run();
    } else {
      await context.env.DB.prepare(
        `DELETE FROM continue_watching WHERE user_id = ? AND tmdb_id = ? AND media_type = ?`
      ).bind(userId, tmdb_id, media_type).run();
    }
  } catch (err) {
    return dbError(err);
  }

  return json({ ok: true, removed: true });
}