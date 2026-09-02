// ============================================
// Password hashing — PBKDF2 via Web Crypto
// Zero external dependencies (consistent with the
// project's no-framework style).
//
// Storage format: "<base64 salt>:<base64 hash>"
// 100k iterations SHA-256, 256-bit output.
// ============================================

const enc = new TextEncoder();

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256
  );
  return bufToB64(bits);
}

export async function createPasswordHash(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bufToB64(saltBytes.buffer);
  const hash = await hashPassword(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split(":");
  if (!stored || parts.length < 2) return false;
  const [salt, hash] = parts;
  const check = await hashPassword(password, salt);
  return check === hash;
}