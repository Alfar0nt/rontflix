// ============================================
// Shared HTTP helpers — consistent JSON responses
// and input validation across all API endpoints.
// ============================================

// Standard JSON response with the given status (default 200).
export function json(data, status = 200) {
  return Response.json({ ...data }, { status });
}

// Standard JSON error: `{ error: message }` with an HTTP status.
export function error(status, message) {
  return Response.json({ error: message }, { status });
}

// Normalize DB errors into a consistent + safe 500 JSON response.
export function dbError(err) {
  console.error("DB error:", err);
  return Response.json({ error: "Internal server error." }, { status: 500 });
}

// Reusable constants
export const MEDIA_TYPES = ["movie", "tv"];

// Parse (and bound) an optional integer from a value; returns default when null/NaN.
export function intOr(value, fallback = null) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

// Clamp a real number to [min, max]; returns fallback when not a finite number.
export function clampNum(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Trim + cap a string to maxLength; returns "" when not a string.
export function s(value, maxLength = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}