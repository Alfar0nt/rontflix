// ============================================
// Password hashing — PBKDF2 via Web Crypto
// Zero external dependencies (consistent with the
// project's no-framework style).
//
// Storage format:  "v1:<iterations>:<base64 salt>:<base64 hash>"
// Legacy format:   "<base64 salt>:<base64 hash>"   (assumes 100k iterations)
//
// PBKDF2 = HMAC-SHA-256 with a per-user random salt, N iterations.
// NB: This is a strong, salted, iterated KDF (not a single-pass SHA-256).
// ============================================

const enc = new TextEncoder();

// Default work factor for NEW hashes. PBKDF2-HMAC-SHA256@310k is a solid
// middle-ground for Cloudflare Workers (strong against brute-force without
// exhausting per-request CPU time). The actual count used is stored with the
// hash, so raising this later does not invalidate existing hashes.
const DEFAULT_ITERATIONS = 310_000;
// Legacy hashes (pre-security-audit) were written at 100k.
const LEGACY_ITERATIONS = 100_000;

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key,
    256
  );
  return bufToB64(bits);
}

export async function createPasswordHash(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufToB64(saltBytes.buffer);
  const hash = await derive(password, salt, DEFAULT_ITERATIONS);
  return `v1:${DEFAULT_ITERATIONS}:${salt}:${hash}`;
}

// Verify a password against a stored hash. Supports both the current versioned
// format and the legacy "salt:hash" format (assumed 100k iterations).
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");

  let iterations;
  let salt;
  let hash;
  if (parts[0] === "v1" && parts.length === 4) {
    iterations = Math.max(1, Number(parts[1]) || LEGACY_ITERATIONS);
    salt = parts[2];
    hash = parts[3];
  } else if (parts.length === 2) {
    // legacy "<salt>:<hash>"
    iterations = LEGACY_ITERATIONS;
    salt = parts[0];
    hash = parts[1];
  } else {
    return false;
  }

  const check = await derive(password, salt, iterations);
  return check === hash;
}

// Called after a successful login so weak/legacy hashes are migrated to the
// current work factor in place (defense-in-depth rehash-on-login).
export function needsRehash(stored) {
  return !stored ||
    typeof stored !== "string" ||
    !(stored.startsWith(`v1:${DEFAULT_ITERATIONS}:`));
}