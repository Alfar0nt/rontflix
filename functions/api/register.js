// POST /api/register — create a user + start a session
import { createPasswordHash } from "../_password.js";
import { checkRateLimit, recordFailure, clearFailures } from "../_rateLimit.js";
import { sessionCookie } from "../_middleware.js";
import { error, dbError } from "../_http.js";

// Helper to log errors server-side for debugging
function logError(err, context) {
  console.error(`[register error] ${err.message}`, {
    stack: err.stack,
    env: {
      DB: !!context.env.DB,
      TMDB_API_KEY: context.env.TMDB_API_KEY ? 'SET (hidden)' : 'MISSING',
      SESSION_COOKIE: context.env.SESSION_COOKIE,
      SESSION_TTL_SECONDS: context.env.SESSION_TTL_SECONDS,
    },
    email: typeof err.email === 'string' ? err.email : 'N/A',
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL = 30 * 24 * 60 * 60; // seconds (matches SESSION_TTL_SECONDS)

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  // -- validate (never trust the client) --
  if (!EMAIL_RE.test(email)) {
    return error(400, "Please enter a valid email address.");
  }
  if (username.length < 3 || username.length > 40) {
    return error(400, "Username must be between 3 and 40 characters.");
  }
  if (password.length < 8 || password.length > 128) {
    return error(400, "Password must be between 8 and 128 characters.");
  }

  // -- rate limit (per-email only) --
  const rl = await checkRateLimit(context.env.DB, email);
  if (!rl.allowed) return error(429, rl.error);

  let userId;
  let token;
  try {
    // -- duplicate check --
    const existing = await context.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).bind(email).first();
    if (existing) {
      await recordFailure(context.env.DB, email);
      return error(409, "Email already registered.");
    }

    // -- hash + insert --
    const password_hash = await createPasswordHash(password);
    const res = await context.env.DB.prepare(
      "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)"
    ).bind(email, username, password_hash).run();
    userId = res.meta.last_row_id;

    // -- create session --
    token = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).bind(token, userId, now + TOKEN_TTL).run();

    await clearFailures(context.env.DB, email);
    await clearIpFailures(context.env.DB, ip);
  } catch (err) {
    logError(err, context);
    return dbError(err);
  }

  return new Response(JSON.stringify({ user: { id: userId, email, username, avatar_url: null } }), {
    status: 201,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(token, TOKEN_TTL, context.data.secureCookie),
    },
  });
}