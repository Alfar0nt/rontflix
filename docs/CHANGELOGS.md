# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/) conventions with semantic versioning. This project is still in **beta** (pre-1.0), so all versions use the `0.x.y` format. The `y` (patch) bumps represent incremental single-feature or bugfix releases.

---

## [Unreleased] - Planned

Future work (pending UI features + the Cloudflare D1 Database & Accounts roadmap) is tracked in **`docs/ROADMAP.md`**.

---

## [0.0.9] - 2026-09-02

Phase 1 of the Database + Accounts roadmap — Cloudflare foundation & schema.

### Added
- **`functions/_middleware.js`** — Pages Functions shared middleware: attaches the D1 binding, reads/validates the `token` session cookie, resolves the current `context.user`, plus `sessionCookie()`/`clearCookie()` helpers and CORS preflight
- **`functions/api/`** — directory scaffolded for Phase 2 auth + watchlist endpoints
- **`migrations/0001_init.sql`** — D1 schema: `users`, `sessions`, `watchlist`, `continue_watching`, `watch_history` tables + indexes
- **`wrangler.toml`** — Cloudflare Pages + D1 config (`pages_build_output_dir = "."`, real `[[d1_databases]]` `database_id` bound to `rontflix-db`)
- **`package.json`** — added `wrangler` devDependency + scripts (`dev`, `deploy`, `db:migrate:local`, `db:migrate:remote`); removed obsolete `pnpm` field
- **`pnpm-workspace.yaml`** — `allowBuilds` entries set so `esbuild`/`workerd` postinstall runs (fixes `pnpm db:migrate` failing on ignored build scripts)
- Updated `.gitignore` — ignores `node_modules/`, `.wrangler/`, `.env*`, logs

### Changed
- `docs/ROADMAP.md` — Phase 1 fully marked done (remote D1 created + migration applied)

### Verified
- Schema valid: `wrangler d1 migrations apply` executed all 11 commands against **local** and **remote** D1 (`rontflix-db`)
- Worker boots: `wrangler pages dev` compiles, attaches the `env.DB` D1 binding (local), and serves the frontend with static assets (`/`, `style.css`, `app.js` all 200)
- Unresolved API paths correctly fall back to the SPA shell until Phase 2 endpoints are implemented

---

## [0.0.8] - 2026-09-02

Consolidated future planning into `docs/ROADMAP.md`.

### Added
- **`docs/ROADMAP.md`** — single source of truth for future work: pending UI features + the 6-phase Cloudflare D1 "Database & Accounts" plan

### Changed
- `.ai/tasks.md` — now tracks completed work only; future work (pending UI + DB phases) delegated to `docs/ROADMAP.md`
- `docs/CHANGELOGS.md` `[Unreleased]` — now references `docs/ROADMAP.md` instead of duplicating the pending/DB lists
- `.ai/PRD.md` — pending-features section trimmed to an overview pointing at `docs/ROADMAP.md` (removed redundant phase detail)
- `AGENTS.md` — roadmap reference updated from `.ai/tasks.md` to `docs/ROADMAP.md`; `.ai/tasks.md` described as the completed-work tracker

---

## [0.0.7] - 2026-09-02

Database + accounts roadmap (planning).

### Added
- **Phased TODO plan** in `.ai/tasks.md` — "Database + Accounts (Cloudflare D1)" across 6 phases: foundation/schema → auth → auth UI → watchlist → persist continue-watching/progress/history → harden/test
- **`docs/DATABASE.md`** — full Cloudflare D1 + Pages Functions implementation guide: schema, wrangler/Pages bindings, session auth, PBKDF2 password hashing, register/login/logout/me/watchlist endpoints, frontend integration, localStorage migration, local dev, deploy, and security checklist
- Documented Cloudflare D1 data limits and confirmed the stack fits Cloudflare Pages (static hosting cannot run a local-auth backend)

### Changed
- `.ai/PRD.md` — moved auth/backend out of Non-Goals into a phased "Database + Accounts" roadmap section
- `AGENTS.md` — added a "Database / Accounts (Roadmap)" section and `docs/DATABASE.md` reference

---

## [0.0.6] - 2026-09-02

Repo hygiene: gitignore + docs organization.

### Added
- **`.gitignore`** — ignores Python `__pycache__/` / `*.pyc` and bulk skill reference data (`.agents/skills/ui-ux-pro-max/data/`, `.agents/skills/ui-ux-pro-max/scripts/tests/`) going forward
- **`docs/CHANGELOGS.md`** restructured to list newest version on top

### Changed
- Renamed `.ai/ex-flow.md` → `.ai/ux-flow.md` (typo fix)
- Moved changelog documentation into `docs/` folder

---

## [0.0.5] - 2026-09-02

UI/UX overhaul (powered by `ui-ux-pro-max` skill).

### Added
- **Debounced live search** (300ms) — results update as the user types; Enter still triggers immediate search
- **Loading skeleton shimmer** — replaces plain "Loading..." text across search, lazy recommendation rows, and episode modal
- **Keyboard accessibility** — cards and episode items activate with Enter/Space; focus returns to opener on close; visible focus rings
- **Responsive mobile-first breakpoints** — 480 / 768 / 1024 / 1440px with 44px+ touch targets
- **Inter typography** loaded via Google Fonts with `display=swap`
- **SEO/meta tags** — description, theme-color, robots noindex
- **`docs/CHANGELOGS.md`** — this file

### Changed
- **Full visual redesign** — dark cinematic OTT palette (pure-black bg, `#E11D48` play-red accent), CSS design tokens, refined cards/modals/player, backdrop blur on overlays
- **HTML semantics** — `header/main/section/article`, `role="dialog"`, `aria-live` status, `aria-pressed` on season buttons, `role="progressbar"`, labels on all form controls
- **Search** — swapped `GET /search/multi` for parallel `/search/movie` + `/search/tv` calls merged and sorted by popularity (existing behavior documented)
- **Performance** — `loading="lazy"` + `decoding="async"` on images, reserved `aspect-ratio` to prevent layout shift
- **Player** — traps focus to close button, returns focus to opener card on close
- **Episode modal** — body scroll lock, skeleton loading, semantic structure
- **Lazy recommendation rows** — now show skeleton placeholders until scrolled into view

### Fixed
- `100dvh` for mobile viewport instead of `100vh`
- `touch-action: manipulation` on buttons to eliminate mobile tap delay
- Escape key now closes only the top-most overlay (modal over player) instead of both at once

---

## [0.0.4] - 2026-08-13

Search result fix.

### Fixed
- Search result rendering issue that returned incorrect/empty results in some flows

---

## [0.0.3] - 2026-08-11

Homepage recommendations + multi-module refactor.

### Added
- **Homepage recommendations** — 4 TMDB-powered rows ("Popular Right Now", "Just Released", "Popular Movies", "Popular TV Shows")
- `recommendations.js` module; last 2 rows lazy-render via `IntersectionObserver`
- `tmdb.js` API layer with localStorage caching (10-min TTL) + retry
- `player.js` with rating/runtime metadata loading
- `episodes.js` TV season/episode picker modal with per-show in-memory cache
- `config.js` constants (TMDB key, base URLs, cache keys, `ROW_SIZE`)

---

## [0.0.2] - 2026-08-11

Continue Watching + initial refactors.

### Added
- **Continue Watching** — persists in-progress movies/shows to localStorage with progress tracking, auto-removal at 95%+ completion
- `continue.js` module for Continue Watching persistence and card rendering

### Changed
- Refactored monolithic `script.js` (667 lines) into modular files loaded via `<script>` tags:
  `config.js → tmdb.js → ui.js → continue.js → player.js → episodes.js → search.js → recommendations.js → app.js`

---

## [0.0.1] - 2026-08-01

Initial release of the project.

### Added
- Single-page app shell (`index.html`) with search box, results grid, player popup, and episode modal
- Monolithic `script.js` (474 lines) handling all logic: search, results rendering, and playback
- Baseline `style.css` with dark Netflix-like theme
- Basic TMDB integration for movie/TV metadata and posters
- Basic Viduki iframe streaming via hardcoded URL patterns
- MIT License
