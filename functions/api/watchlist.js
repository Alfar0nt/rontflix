// ============================================
// /api/watchlist — GET (list), POST (add), DELETE (remove)
// All queries scoped by user_id (authz).
// ============================================

// POST: add a title to the user's watchlist
export async function onRequestPost(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const tmdb_id = Number(body?.tmdb_id);
  const media_type = body?.media_type;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const poster_path = typeof body?.poster_path === "string" && body.poster_path ? body.poster_path : null;

  if (!tmdb_id || !["movie", "tv"].includes(media_type)) {
    return Response.json({ error: "Invalid media" }, { status: 400 });
  }
  if (!title) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  await context.env.DB.prepare(
    `INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_path)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, tmdb_id, media_type) DO UPDATE SET
       title = excluded.title,
       poster_path = excluded.poster_path`
  ).bind(userId, tmdb_id, media_type, title, poster_path).run();

  return Response.json({ ok: true, saved: true }, { status: 201 });
}

// GET: list the current user's watchlist
export async function onRequestGet(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;

  const { results } = await context.env.DB.prepare(
    `SELECT tmdb_id, media_type, title, poster_path, added_at
     FROM watchlist WHERE user_id = ? ORDER BY added_at DESC`
  ).bind(userId).all();

  return Response.json({ items: results });
}

// DELETE: remove a title from the watchlist (via query params)
export async function onRequestDelete(context) {
  if (!context.data.user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const userId = context.data.user.id;

  const url = new URL(context.request.url);
  const tmdb_id = Number(url.searchParams.get("tmdb_id"));
  const media_type = url.searchParams.get("media_type");

  if (!tmdb_id || !["movie", "tv"].includes(media_type)) {
    return Response.json({ error: "Invalid media" }, { status: 400 });
  }

  await context.env.DB.prepare(
    `DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?`
  ).bind(userId, tmdb_id, media_type).run();

  return Response.json({ ok: true, removed: true });
}