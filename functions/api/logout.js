// POST /api/logout — invalidate the current session
import { clearCookie } from "../_middleware.js";
import { error } from "../_http.js";

export async function onRequestPost(context) {
  const header = context.request.headers.get("Cookie") || "";
  const token = (header.match(/(?:^|;\s*)token=([^;]+)/) || [])[1];

  if (token) {
    try {
      await context.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    } catch (err) {
      console.error("Logout DB error:", err);
      return error(500, "Internal server error.");
    }
  }

  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookie(context.data.secureCookie) },
  });
}