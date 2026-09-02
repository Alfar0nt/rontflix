// ============================================
// Brute-force protection for auth endpoints.
// - Per-email lockout in `auth_attempts` (primary defense).
// - Per-IP lockout in `ip_attempts` (public-internet defense).
// Both are keyed on stable values (email / CF-Connecting-IP), so the
// same origin can never fingerprint by spoofing X-Forwarded-For.
// ============================================

export const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Returns { allowed: boolean, error?: string }
export async function checkRateLimit(db, email) {
  const row = await db.prepare(
    "SELECT failed_count, locked_until FROM auth_attempts WHERE email = ?"
  ).bind(email).first();

  if (row && row.locked_until && nowSeconds() < row.locked_until) {
    const mins = Math.ceil((row.locked_until - nowSeconds()) / 60);
    return { allowed: false, error: `Too many attempts. Try again in ${mins} min.`, status: 429 };
  }
  return { allowed: true };
}

// Record a failed attempt; apply lockout once over the threshold.
export async function recordFailure(db, email) {
  const t = nowSeconds();
  const row = await db.prepare(
    "SELECT failed_count FROM auth_attempts WHERE email = ?"
  ).bind(email).first();

  const next = (row ? row.failed_count : 0) + 1;

  await db.prepare(
    `INSERT INTO auth_attempts (email, failed_count, locked_until, last_attempt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       last_attempt = excluded.last_attempt`
  ).bind(email, next, next >= MAX_ATTEMPTS ? t + LOCKOUT_SECONDS : null, t).run();
}

// Clear failures after a successful login/registration.
export async function clearFailures(db, email) {
  await db.prepare("DELETE FROM auth_attempts WHERE email = ?").bind(email).run();
}

// ---- Per-IP rate limiting (public-internet defense) ----

// Normalize a client IP string (strip any port, trim).
export function normalizeIp(ip) {
  if (!ip) return "";
  return ip.trim().split(":")[0];
}

// Returns { allowed: boolean, error?: string }
export async function checkIpRateLimit(db, ip) {
  const key = normalizeIp(ip);
  if (!key) return { allowed: true }; // no IP header → defer to email lockout

  const row = await db.prepare(
    "SELECT failed_count, locked_until FROM ip_attempts WHERE ip = ?"
  ).bind(key).first();

  if (row && row.locked_until && nowSeconds() < row.locked_until) {
    const mins = Math.ceil((row.locked_until - nowSeconds()) / 60);
    return { allowed: false, error: `Too many attempts. Try again in ${mins} min.`, status: 429 };
  }
  return { allowed: true };
}

// Record a failed attempt for an IP; apply lockout once over the threshold.
export async function recordIpFailure(db, ip) {
  const key = normalizeIp(ip);
  if (!key) return;

  const t = nowSeconds();
  const row = await db.prepare(
    "SELECT failed_count FROM ip_attempts WHERE ip = ?"
  ).bind(key).first();

  const next = (row ? row.failed_count : 0) + 1;

  await db.prepare(
    `INSERT INTO ip_attempts (ip, failed_count, locked_until, last_attempt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       last_attempt = excluded.last_attempt`
  ).bind(key, next, next >= MAX_ATTEMPTS ? t + LOCKOUT_SECONDS : null, t).run();
}

// Clear failures for an IP after a successful login/registration.
export async function clearIpFailures(db, ip) {
  const key = normalizeIp(ip);
  if (!key) return;
  await db.prepare("DELETE FROM ip_attempts WHERE ip = ?").bind(key).run();
}