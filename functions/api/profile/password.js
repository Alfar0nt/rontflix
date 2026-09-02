// ============================================
// /api/profile/password — change the signed-in user's password
//   POST { current, password }  (password = new password)
// Requires the current password; always user-scoped (authz).
// ============================================
import { createPasswordHash, verifyPassword } from "../../_password.js";
import { error, dbError } from "../../_http.js";

export async function onRequestPost(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const current = typeof body?.current === "string" ? body.current : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!current || !password) return error(400, "Current and new password are required.");
  if (password.length < 8 || password.length > 128) {
    return error(400, "New password must be between 8 and 128 characters.");
  }

  const DB = context.env.DB;
  try {
    const user = await DB.prepare(
      "SELECT password_hash FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!user) return error(404, "User not found.");

    if (!(await verifyPassword(current, user.password_hash))) {
      return error(401, "Current password is incorrect.");
    }

    const password_hash = await createPasswordHash(password);
    await DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(password_hash, userId)
      .run();
  } catch (err) {
    return dbError(err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}