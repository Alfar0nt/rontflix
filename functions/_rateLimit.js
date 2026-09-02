// ============================================
// Brute-force protection for auth endpoints.
// Tracks failed attempts per normalized email in
// the `auth_attempts` table and applies a soft lockout.
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