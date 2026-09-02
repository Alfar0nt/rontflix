// ============================================
// /api/profile — view/edit the signed-in user's profile.
//
// PATCH /api/profile  — update username / email / avatar_url
//   { username?, email?, avatar_url? }
//   On email change the session token is rotated and a fresh
//   Set-Cookie header is returned.
// POST  /api/profile/password — change password
//   { current, password }  (password = new password)
//
// Every query scoped by user_id (authz).
// ============================================
import { sessionCookie } from "../_middleware.js";
import { error, dbError } from "../_http.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TTL = 30 * 24 * 60 * 60;
const HASH_TTL = SESSION_TTL; // simply reuse the same TTL when rotating

// Allowed avatar preset names (client must send "preset:<name>").
// These map 1:1 to CSS avatar classes so we can name them, not URL-whitelist them.
const AVATAR_PRESETS = new Set([
  "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink", "slate",
]);

// Validate + normalize an avatar value to NULL, a preset id, or an https/http image URL.
function normalizeAvatar(raw) {
  if (!raw) return null;
  const val = typeof raw === "string" ? raw.trim() : "";
  if (!val) return null;

  if (val.startsWith("preset:")) {
    const name = val.slice(7).toLowerCase();
    return AVATAR_PRESETS.has(name) ? `preset:${name}` : null;
  }

  // allow http(s) image URLs (custom uploads/images). Prevent javascript:/data: etc.
  if (/^https?:\/\/\S+$/i.test(val)) return val;

  return null;
}

export async function onRequestPatch(context) {
  if (!context.data.user) return error(401, "Not authenticated");
  const userId = context.data.user.id;

  const body = await context.request.json().catch(() => null);
  const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const usernameRaw = typeof body?.username === "string" ? body.username.trim() : "";
  const avatar = normalizeAvatar(body?.avatar_url);

  const DB = context.env.DB;
  let newToken = null;
  let newEmail;
  let newUsername;
  try {
    // -- Load current values (for partial updates & email collision check) --
    const current = await DB.prepare(
      "SELECT email, username, avatar_url FROM users WHERE id = ?"
    ).bind(userId).first();
    if (!current) return error(404, "User not found.");

    newEmail = emailRaw ? emailRaw : current.email;
    newUsername = usernameRaw ? usernameRaw : current.username;

    if (newUsername.length < 3 || newUsername.length > 40) {
      return error(400, "Username must be between 3 and 40 characters.");
    }
    if (!EMAIL_RE.test(newEmail)) {
      return error(400, "Please enter a valid email address.");
    }

    // -- Email uniqueness (ignore the user's own row) --
    if (newEmail !== current.email) {
      const dup = await DB.prepare(
        "SELECT id FROM users WHERE email = ? AND id != ?"
      ).bind(newEmail, userId).first();
      if (dup) return error(409, "Email already registered.");
    }

    await DB.prepare(
      "UPDATE users SET email = ?, username = ?, avatar_url = coalesce(?, avatar_url) WHERE id = ?"
    )
      .bind(newEmail, newUsername, avatar, userId)
      .run();

    // -- Rotate the session cookie when the email changes (roadmap requirement) --
    if (newEmail !== current.email) {
      const headerToken = readToken(context.request.headers.get("Cookie"));
      if (headerToken) {
        await DB.prepare("DELETE FROM sessions WHERE token = ?").bind(headerToken).run();
      }
      newToken = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await DB.prepare(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
      ).bind(newToken, userId, now + HASH_TTL).run();
    }
  } catch (err) {
    return dbError(err);
  }

  const headers = {};
  if (newToken) {
    headers["Set-Cookie"] = sessionCookie(newToken, SESSION_TTL, context.data.secureCookie);
  }

  return new Response(
    JSON.stringify({
      user: { id: userId, email: newEmail || undefined, username: newUsername || undefined, avatar_url: avatar || undefined },
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...headers } }
  );
}

function readToken(header) {
  if (!header) return null;
  const match = header.match(/(?:^|;\s*)token=([^;]+)/);
  return match ? match[1] : null;
}