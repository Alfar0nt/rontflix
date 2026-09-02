// ============================================
// /api/tmdb — server-side TMDB proxy
//
// The TMDB API key must never ship in the browser bundle. Instead the frontend
// calls this local proxy and the key is injected here from a wrangler secret
// (TMDB_API_KEY). This route:
//   - accepts the TMDB endpoint + query params
//   - validates the path against an allowlist (no arbitrary URL fetching / SSRF)
//   - forwards to api.themoviedb.org with the key appended server-side
//
// Usage (GET):  /api/tmdb?path=/movie/popular&language=en-US
// Produces:     https://api.themoviedb.org/3/movie/popular?language=en-US&api_key=SECRET
// ============================================

import { json } from "../_http.js";

// Only these TMDB path prefixes are reachable through the proxy. Anything else
// is rejected, which keeps SSRF and arbitrary-endpoint abuse out.
const ALLOWED_PREFIXES = [
  "/search/movie",
  "/search/tv",
  "/movie/",
  "/tv/",
];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const rawPath = (url.searchParams.get("path") || "").trim();

  if (!rawPath.startsWith("/")) {
    return json({ error: "Invalid path" }, 400);
  }

  if (!ALLOWED_PREFIXES.some(p => rawPath.startsWith(p))) {
    return json({ error: "Invalid path" }, 400);
  }

  const apiKey = context.env.TMDB_API_KEY;
  if (!apiKey) {
    return json({ error: "TMDB API key is not configured." }, 500);
  }

  // Forward all other query params (language, page, region, query, ...) so the
  // proxy mirrors the original request shape, then append the secret key.
  url.searchParams.delete("path");
  url.searchParams.append("api_key", apiKey);

  let upstream;
  try {
    const upstreamUrl = new URL(`https://api.themoviedb.org/3${rawPath}`);
    upstreamUrl.search = url.search;
    upstream = await fetch(upstreamUrl.toString(), { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("TMDB proxy upstream error:", err);
    return json({ error: "Upstream error" }, 502);
  }

  const status = upstream.status;
  const body = await upstream.text(); // proxy as-is (JSON or error doc)
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}