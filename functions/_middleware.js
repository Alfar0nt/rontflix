// ============================================
// Pages Functions shared middleware
// Runs for every request to /api/* under functions/
//
// Provides:
//   context.env.DB        - bound D1 database (config via dashboard / wrangler)
//   context.data.user     - { id, email, username } or null (from session cookie)
//
// NOTE: Pages Functions gives each middleware/handler a fresh `context`.
// State passed down the chain MUST go through `context.data`.
// ============================================

const SESSION_COOKIE = 'token';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export async function onRequest(context) {
  // Only mark the cookie Secure when the connection is HTTPS.
  // Overplain http (e.g. phone testing on a LAN) browsers refuse to
  // store a Secure cookie, which breaks persisted login. Production on
  // Cloudflare Pages is always HTTPS, so Secure is applied there.
  const isSecure = new URL(context.request.url).protocol === 'https:';
  context.data.secureCookie = isSecure;

  // -- CORS preflight (same-origin Pages frontend usually doesn't need this,
  //    but keep it for flexibility across subdomains) --
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  context.data.user = null;
  context.env.SESSION_COOKIE = SESSION_COOKIE;
  context.env.SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;

  const token = readCookie(context.request.headers.get('Cookie'), SESSION_COOKIE);

  if (token && context.env.DB) {
    try {
      const session = await context.env.DB.prepare(
        `SELECT s.user_id AS id, u.email, u.username
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > unixepoch()`
      ).bind(token).first();

      if (session) context.data.user = session;
    } catch (err) {
      console.error('Session lookup failed:', err);
    }
  }

  return context.next();
}

// -- shared cookie helpers --------------------------------------------------
// `secure` is derived from the request scheme (see onRequest). Pass
// context.data.secureCookie from each endpoint.

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS, secure = true) {
  const s = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${s}`;
}

export function clearCookie(secure = true) {
  const s = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${s}`;
}

function readCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}