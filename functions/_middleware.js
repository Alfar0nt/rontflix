// ============================================
// Pages Functions shared middleware
// Runs for every request to /api/* under functions/
//
// Provides:
//   context.env.DB        - bound D1 database (config via dashboard / wrangler)
//   context.data.user     - { id, email, username } or null (from session cookie)
//   context.data.secureCookie - whether the connection is HTTPS
//
// Also applies, to every /api/* response:
//   - Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
//     Referrer-Policy)
//   - CORS with an explicit origin allowlist (never a wildcard)
//
// NOTE: Pages Functions gives each middleware/handler a fresh `context`.
// State passed down the chain MUST go through `context.data`.
// ============================================

const SESSION_COOKIE = 'token';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// --- Security headers applied to every /api/* response ---------------
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: https://image.tmdb.org; frame-src https://viduki.net https://www.viduki.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// --- CORS allowlist (explicit origins; never *) ------------------------
// Add your deployed production origin(s)/custom domain here.
const CORS_ALLOWLIST = [
  'http://localhost:8787',
  'http://localhost:8812',
  'http://127.0.0.1:8787',
  'https://tv.dhiarharianto.work',
  'https://rontflix.pages.dev'
];

export async function onRequest(context) {
  // Only mark the cookie Secure when the connection is HTTPS.
  const isSecure = new URL(context.request.url).protocol === 'https:';
  context.data.secureCookie = isSecure;

  context.data.user = null;
  context.env.SESSION_COOKIE = SESSION_COOKIE;
  context.env.SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;

  // -- CORS preflight ------------------------------------------------
  if (context.request.method === 'OPTIONS') {
    const origin = context.request.headers.get('Origin');
    const allowOrigin = origin && CORS_ALLOWLIST.includes(origin) ? origin : null;
    const corsHeaders = {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS,
    };
    if (allowOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = allowOrigin;
      corsHeaders['Vary'] = 'Origin';
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // -- Resolve the session user ----------------------------------------
  const token = readCookie(context.request.headers.get('Cookie'), SESSION_COOKIE);

  if (token && context.env.DB) {
    try {
      const session = await context.env.DB.prepare(
        `SELECT s.user_id AS id, u.email, u.username, u.avatar_url
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > unixepoch()`
      ).bind(token).first();

      if (session) context.data.user = session;
    } catch (err) {
      console.error('Session lookup failed:', err);
    }
  }

  // -- Pass through, then stamp headers onto the final response --------
  let response;
  try {
    response = await context.next();
  } catch (err) {
    // Global catch: never expose stack traces / SQL errors / file paths to the
    // client. Log details server-side only.
    console.error('Unhandled error:', err);
    response = new Response(
      JSON.stringify({ error: 'Something went wrong' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const headers = new Headers(response.headers);
  // Apply security headers (never override an explicit Set-Cookie).
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }

  // CORS: never leak a wildcard; reflect only allow-listed origins.
  // Same-origin requests (the normal case) do not need ACAO at all.
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Vary');
  const origin = context.request.headers.get('Origin');
  if (origin && CORS_ALLOWLIST.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }

  // Rebuild the response, preserving Set-Cookie verbatim.
  const setCookie = headers.get('Set-Cookie');
  const outHeaders = new Headers(headers);
  if (setCookie) outHeaders.set('Set-Cookie', setCookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

// -- shared cookie helpers --------------------------------------------------

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS, secure = true) {
  const s = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${s}`;
}

export function clearCookie(secure = true) {
  const s = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${s}`;
}

// Cloudflare Pages Functions expose the client IP via the CF-Connecting-IP
// header and/or cf.connectingIp. Both are set by Cloudflare and cannot be
// spoofed by the client, so this is a safe per-IP rate-limit key.
export function clientIp(request) {
  const hdr = request.headers.get('CF-Connecting-IP');
  if (hdr) return hdr;
  return request.cf?.connectingIp || '';
}

function readCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}
