# AGENTS.md — r0ntflix

## What This Is

Vanilla HTML/CSS/JS Netflix-like streaming app. No framework, no bundler, no dependencies. Scripts loaded via `<script>` tags in `index.html`.

## Entry Point & Script Order

`index.html` loads scripts in dependency order — do not reorder:

```
config.js → tmdb.js → ui.js → continue.js → player.js → episodes.js → search.js → recommendations.js → app.js
```

`app.js` bootstraps on `window.load` (calls `renderContinueWatching()` + `loadRecommendations()`).

## Commands

There are none. No `package.json`, no build step, no linter, no tests, no CI. Open `index.html` in a browser to run.

## Module Responsibilities

| File | Purpose |
|---|---|
| `config.js` | Constants: TMDB API key, base URLs, localStorage keys, cache TTL, `ROW_SIZE` |
| `tmdb.js` | TMDB API layer with localStorage caching + retry; builds Viduki streaming URLs |
| `ui.js` | DOM refs, shared helpers (`escapeHtml`, `setStatus`, `formatRuntime`, `mediaCardHTML`) |
| `continue.js` | "Continue Watching" persistence and card rendering |
| `player.js` | Popup iframe player, API switching, meta loading |
| `episodes.js` | TV season/episode picker modal |
| `recommendations.js` | Homepage recommendation rows (last 2 lazy-render via `IntersectionObserver`) |
| `app.js` | Global listeners, init, `postMessage` handling from Viduki |

## Key Architecture Facts

- **Two external services**: TMDB (metadata/search) and Viduki (video streaming, embedded in iframe)
- **All state is `localStorage`** — no backend. Keys are prefixed `viduki-net-*` (defined in `config.js`)
- **Player progress** arrives via `window.postMessage` from `viduki.net` origin, throttled to save every 2s
- **`viduki:all-servers-failed`** triggers automatic API variant switching (4 variants available)
- TMDB responses cached in localStorage with a 10-min TTL

## Gotchas

- TMDB API key is hardcoded in `config.js:5` — expected for a client-side-only app but do not commit real keys for public deployments
- No TypeScript, no transpilation — browser console errors are your only debugging tool
- Shared global state: `currentMedia`, `searchState`, `currentShowData`, `selectedSeason` — check these before adding new globals
- Video playback only works when Viduki servers are reachable; test with network access
