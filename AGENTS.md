# AGENTS.md — r0ntflix

## What This Is

Vanilla HTML/CSS/JS Netflix-like streaming app. No framework, no bundler, no dependencies. Scripts loaded via `<script>` tags in `index.html`.

## Entry Point & Script Order

`index.html` loads scripts in dependency order — do not reorder:

```
config.js → tmdb.js → ui.js → auth.js → watchlist.js → history.js → profile.js → continue.js → player.js → episodes.js → detail.js → search.js → recommendations.js → app.js
```

`app.js` bootstraps on `window.load` (calls `loadContinueWatching()` + `loadRecommendations()`).

## Commands

**Node prerequisite:** the user always runs `nvm use 24.20.0` before any node/npm/npx/pnpm command. Do the same before running anything from `package.json`.

See `package.json` for scripts. In CI-free local dev, use `pnpm` (the repo's package manager — a `pnpm-lock.yaml` + `pnpm-workspace.yaml` are present):

```
pnpm dev                # wrangler pages dev . (serves the app + functions on :8788 by default)
pnpm deploy             # wrangler pages deploy .
pnpm db:migrate:local   # apply D1 migrations to the local DB
pnpm db:migrate:remote  # apply D1 migrations to the remote DB
```

There is no build step, no linter, and no test runner — the browser console is the main debugging surface (manual QA via the dev server).

## Node Version

- The project targets **Node 24.20.0** (via `nvm`). Always activate it first with `nvm use 24.20.0`.
- If `nvm` is not available in a shell, source it first, e.g. `. ~/.nvm/nvm.sh && nvm use 24.20.0`.

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

Autocomplete: the app started **100% client-side** (state in `localStorage`, no backend) and the **Database + Accounts** phases are now **implemented** via **Cloudflare D1 + Pages Functions** (auth, watchlist, continue watching, history — see `docs/DATABASE.md`). Guest browsing/search still works fully client-side. A future move to **Vercel (hosting) + Supabase (Postgres)** is planned (not to be executed) in `docs/migration-deployement.md`.

## Module Responsibilities

| File | Purpose |
|---|---|
| `config.js` | Constants: TMDB API key, base URLs, localStorage keys, cache TTL, `ROW_SIZE` |
| `tmdb.js` | TMDB API layer with localStorage caching + retry; builds Viduki streaming URLs |
| `ui.js` | DOM refs, shared helpers (`escapeHtml`, `setStatus`, `formatRuntime`, `mediaCardHTML`) |
| `continue.js` | "Continue Watching" card rendering + in-memory state, backed by D1 (`/api/continue`). D1-only — shown only when signed in, cleared on logout; no localStorage persistence |
| `player.js` | Popup iframe player, API switching, meta loading, watch-history recording, prev/next-episode navigation |
| `episodes.js` | TV season/episode grid renderer (`renderEpisodeGrid` — shared by the episode modal and the detail view) |
| `detail.js` | Title detail view — hero (poster, rating, runtime, genres, overview), Play button, inline season/episode picker for TV, and a Similar Titles row; opened from every media card |
| `recommendations.js` | Homepage recommendation rows (last 2 lazy-render via `IntersectionObserver`) |
| `history.js` | D1-backed "Watch History" (resume cards, `recordHistory` on play), rendered on the Profile page, shown only when signed in |
| `profile.js` | Profile modal — view/edit avatar (presets + image URL), username, email, password change; opened from the header profile button |
| `app.js` | Global listeners, init, `postMessage` handling from Viduki |

## Key Architecture Facts

- **Two external services**: TMDB (metadata/search) and Viduki (video streaming, embedded in iframe)
- **Client state is in `localStorage`** — keys prefixed `viduki-net-*` (defined in `config.js`). Signed-in users also have D1-backed state (watchlist, watch history, continue watching) via Pages Functions (`/api/*`)
- **Player progress** arrives via `window.postMessage` from `viduki.net` origin, throttled to save every 2s
- **`viduki:all-servers-failed`** triggers automatic API variant switching (4 variants available)
- TMDB responses cached in localStorage with a 10-min TTL

## Gotchas

- TMDB API key is NOT in the browser bundle — it lives server-side (Pages Function proxy `/api/tmdb` injects it from the `TMDB_API_KEY` secret). Do not commit real keys; keep them out of `config.js`.
- No TypeScript, no transpilation — browser console errors are your only debugging tool
- Shared global state: `currentMedia`, `searchState`, `currentShowData`, `selectedSeason` — check these before adding new globals
- Video playback only works when Viduki servers are reachable; test with network access
