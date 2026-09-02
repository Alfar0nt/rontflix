// POST /api/logout — invalidate the current session
import { clearCookie } from "../_middleware.js";

export async function onRequestPost(context) {
  const header = context.request.headers.get("Cookie") || "";
  const token = (header.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];

  if (token) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }

  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookie() },
  });
}