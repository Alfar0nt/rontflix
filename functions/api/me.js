// GET /api/me — return the current user (resolved by _middleware.js)
export async function onRequestGet(context) {
  return Response.json({ user: context.data.user || null });
}