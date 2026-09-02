# AGENTS.md — r0ntflix

## What This Is

Vanilla HTML/CSS/JS Netflix-like streaming app. No framework, no bundler, no dependencies. Scripts loaded via `<script>` tags in `index.html`.

## Entry Point & Script Order

`index.html` loads scripts in dependency order — do not reorder:

```
config.js → tmdb.js → ui.js → auth.js → watchlist.js → history.js → profile.js → continue.js → player.js → episodes.js → search.js → recommendations.js → app.js
```

`app.js` bootstraps on `window.load` (calls `loadContinueWatching()` + `loadRecommendations()`).

## Commands

There are none. No `package.json`, no build step, no linter, no tests, no CI. Open `index.html` in a browser to run.

## Project Docs & Tooling

| Path | Purpose |
|---|---|
| `.ai/PRD.md`, `.ai/tasks.md`, `.ai/ux-flow.md` | Product requirements, task tracker (completed work), UX/execution flow |
| `docs/ROADMAP.md` | Single source of truth for future work (pending UI + Database/Accounts phases) |
| `docs/CHANGELOGS.md` | Versioned changelog (Keep a Changelog + semantic versioning, newest on top, pre-1.0 `0.x.y` format since still in beta) |
| `docs/DATABASE.md` | Cloudflare D1 + Pages Functions implementation guide (auth, watchlist, DB schema) |
| `docs/migration-deployement.md` | **Planned (do NOT execute)** — migration of hosting to **Vercel** + database to **Supabase (Postgres)**: phased, step-by-step plan with a task checklist, decision points, and rollback plan |
| `.agents/skills/ui-ux-pro-max/` | Local UI/UX design-intelligence skill (search via `scripts/search.py`) |
| `.gitignore` | Ignores `__pycache__/`, `*.pyc`, and `data/` + `scripts/tests/` under the skills folder |

## Database / Accounts (Roadmap)

The app is currently **100% client-side** (state in `localStorage`, no backend). Database + login/register are planned via **Cloudflare D1 + Pages Functions** — see `docs/ROADMAP.md` ("Database + Accounts") for the phased plan and `docs/DATABASE.md` for implementation. Note: Cloudflare Pages is static hosting; it cannot run a traditional Express/local-auth backend, which is why D1 + Pages Functions is the chosen approach. A future move to **Vercel (hosting) + Supabase (Postgres)** is planned (not to be executed) in `docs/migration-deployement.md`.

## Module Responsibilities

| File | Purpose |
|---|---|
| `config.js` | Constants: TMDB API key, base URLs, localStorage keys, cache TTL, `ROW_SIZE` |
| `tmdb.js` | TMDB API layer with localStorage caching + retry; builds Viduki streaming URLs |
| `ui.js` | DOM refs, shared helpers (`escapeHtml`, `setStatus`, `formatRuntime`, `mediaCardHTML`) |
| `continue.js` | "Continue Watching" card rendering + in-memory state, backed by D1 (`/api/continue`). D1-only — shown only when signed in, cleared on logout; no localStorage persistence |
| `player.js` | Popup iframe player, API switching, meta loading, watch-history recording |
| `episodes.js` | TV season/episode picker modal |
| `recommendations.js` | Homepage recommendation rows (last 2 lazy-render via `IntersectionObserver`) |
| `history.js` | D1-backed "Watch History" (resume cards, `recordHistory` on play), rendered on the Profile page, shown only when signed in |
| `profile.js` | Profile modal — view/edit avatar (presets + image URL), username, email, password change; opened from the header profile button |
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
