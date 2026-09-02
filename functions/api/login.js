// POST /api/login — verify credentials + issue session token
import { verifyPassword, createPasswordHash, needsRehash } from "../_password.js";
import { checkRateLimit, recordFailure, clearFailures, checkIpRateLimit, recordIpFailure, clearIpFailures } from "../_rateLimit.js";
import { sessionCookie, clientIp } from "../_middleware.js";
import { error, dbError } from "../_http.js";

function logError(err, context) {
  console.error(`[login error] ${err.message}`, {
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

const TOKEN_TTL = 30 * 24 * 60 * 60; // seconds

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return error(400, "Email and password are required.");
  }

  // -- rate limit based on IP then email (defense in depth) --
  const ip = clientIp(context.request);
  const iprl = await checkIpRateLimit(context.env.DB, ip);
  if (!iprl.allowed) return error(429, iprl.error);

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
      await recordIpFailure(context.env.DB, ip);
      return error(401, "Invalid email or password.");
    }

    // Transparently upgrade weak/legacy hashes to the current work factor.
    if (needsRehash(user.password_hash)) {
      const stronger = await createPasswordHash(password);
      await context.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(stronger, user.id).run();
    }

    // -- issue session --
    token = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).bind(token, user.id, now + TOKEN_TTL).run();

    await clearFailures(context.env.DB, email);
    await clearIpFailures(context.env.DB, ip);
  } catch (err) {
    logError(err, context);
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