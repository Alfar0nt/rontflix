// POST /api/login — verify credentials + issue session token
import { verifyPassword } from "../_password.js";
import { checkRateLimit, recordFailure, clearFailures } from "../_rateLimit.js";
import { sessionCookie } from "../_middleware.js";
import { error, dbError } from "../_http.js";

const TOKEN_TTL = 30 * 24 * 60 * 60; // seconds

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return error(400, "Email and password are required.");
  }

  // -- rate limit based on email --
  const rl = await checkRateLimit(context.env.DB, email);
  if (!rl.allowed) return error(429, rl.error);

  let user = null;
  let token;
  try {
    user = await context.env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(email).first();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await recordFailure(context.env.DB, email);
      return error(401, "Invalid email or password.");
    }

    // -- issue session --
    token = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).bind(token, user.id, now + TOKEN_TTL).run();

    await clearFailures(context.env.DB, email);
  } catch (err) {
    return dbError(err);
  }

  return new Response(JSON.stringify({ user: { id: user.id, email: user.email, username: user.username, avatar_url: user.avatar_url || null } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token, TOKEN_TTL, context.data.secureCookie),
    },
  });
}