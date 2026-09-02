# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/) conventions with semantic versioning. This project is still in **beta** (pre-1.0), so all versions use the `0.x.y` format. The `y` (patch) bumps represent incremental single-feature or bugfix releases.

---

## [Unreleased] - Planned

Future work (pending UI features + the Cloudflare D1 Database & Accounts roadmap) is tracked in **`docs/ROADMAP.md`**.

---

## [0.0.12] - 2026-09-02

Bugfix: persisted login over plain-http LAN (phone testing).

### Fixed
- Auth cookie was hard-coded `Secure`, which browsers refuse to store over plain `http://`. On `localhost` it worked (browsers treat it as a secure context), but on a phone hitting `http://<LAN-IP>:<port>` the cookie was dropped and the session was lost on reload.
- `functions/_middleware.js` now derives `secure` from the request scheme (`https:` → `Secure`, http/LAN → no `Secure`). Production on Cloudflare Pages is always HTTPS, so `Secure` still applies there; local/LAN http dev now persists the session.

### Changed
- `functions/_middleware.js` — `sessionCookie()`/`clearCookie()` accept a `secure` flag; `onRequest` sets `context.data.secureCookie`
- `functions/api/register.js`, `login.js`, `logout.js` — pass `context.data.secureCookie`

---

## [0.0.11] - 2026-09-02

Phase 3 of the Database + Accounts roadmap — Auth UI (register + login forms in the app).

### Added
- **`auth.js`** — frontend auth layer: thin same-origin API wrapper (`credentials: 'include'`), `currentUser` state, `register`/`login`/`logout`/`checkSession`, header auth rendering (Signed-in username/avatar + Log out, or a Sign in button), and the login/register modal with toggle
- **Auth modal** — reusable sign-in/sign-up dialog (labels, show/hide password toggle, `autocomplete`, password confirm on register)
- **`style.css`** — auth area (avatar chip, sign-in/log-out buttons) + auth modal form styles (fields, password toggle, messages, submit)
- Header shows the signed-in user's username + avatar with a Log out control, or a Sign in button when logged out

### Changed
- `index.html` — added `#authArea` (header) and `#authModal`; `auth.js` loaded after `ui.js` in the dependency-order script chain
- `ui.js` — added DOM refs for the auth area/modal
- `app.js` — calls `initAuth()` on `window.load`

### Verified
- Page serves the auth markup and loads `auth.js`/`style.css` (200)
- Session persists across reloads: register sets an `HttpOnly` cookie that is auto-sent (via the browser, `credentials:'include'`), and `/api/me` resolves the logged-in user from it
- Escape key and backdrop-click close the modal; focus returns to the opener

---

## [0.0.10] - 2026-09-02

Phase 2 of the Database + Accounts roadmap — Authentication (register, login, logout, session check).

### Added
- **`functions/_password.js`** — PBKDF2 password hashing via Web Crypto (100k SHA-256 iterations, 256-bit, salted `salt:hash` storage, zero external deps)
- **`functions/_rateLimit.js`** — brute-force protection for auth endpoints (5 failed attempts → lockout)
- **`functions/api/register.js`** — `POST /api/register`: validates email/username/password, hashes password, detects duplicates (409), creates user + session
- **`functions/api/login.js`** — `POST /api/login`: verifies credentials (401 on mismatch), issues a session token
- **`functions/api/logout.js`** — `POST /api/logout`: deletes the session server-side and clears the cookie (204)
- **`functions/api/me.js`** — `GET /api/me`: resolves the current user from the session cookie (or `null`)
- **`migrations/0002_auth_attempts.sql`** — `auth_attempts` table for rate limiting (applied to local + remote D1)
- **`functions/_middleware.js`** — auth middleware now passes the resolved user via `context.data.user`

### Changed
- `docs/ROADMAP.md` — Phase 2 fully marked done

### Verified
- Full auth flow tested locally via `wrangler pages dev` + curl: register (201 + httpOnly cookie), duplicate register (409), login (200 + new token), wrong login (401), logout (204 + session invalidated), `/api/me` returns the user with cookie / `null` without
- Passwords stored as salted PBKDF2 hashes (never plaintext)
- Rate limiting: 5 failed logins → 429 lockout; validation errors return clear 400s

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
