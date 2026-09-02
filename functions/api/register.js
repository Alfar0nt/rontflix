// POST /api/register — create a user + start a session
import { createPasswordHash } from "../_password.js";
import { checkRateLimit, recordFailure, clearFailures } from "../_rateLimit.js";
import { sessionCookie } from "../_middleware.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL = 30 * 24 * 60 * 60; // seconds (matches SESSION_TTL_SECONDS)

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  // -- validate (never trust the client) --
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // -- rate limit --
  const rl = await checkRateLimit(context.env.DB, email);
  if (!rl.allowed) return Response.json({ error: rl.error }, { status: 429 });

  // -- duplicate check --
  const existing = await context.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(email).first();
  if (existing) {
    await recordFailure(context.env.DB, email);
    return Response.json({ error: "Email already registered." }, { status: 409 });
  }

  // -- hash + insert --
  const password_hash = await createPasswordHash(password);
  const res = await context.env.DB.prepare(
    "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)"
  ).bind(email, username, password_hash).run();
  const userId = res.meta.last_row_id;

  // -- create session --
  const token = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await context.env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, userId, now + TOKEN_TTL).run();

  await clearFailures(context.env.DB, email);

  return Response.json(
    { user: { id: userId, email, username } },
    { status: 201, headers: { "Set-Cookie": sessionCookie(token, TOKEN_TTL) } }
  );
}