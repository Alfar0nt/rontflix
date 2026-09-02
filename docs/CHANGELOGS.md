# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/) conventions with semantic versioning. This project is still in **beta** (pre-1.0), so all versions use the `0.x.y` format. The `y` (patch) bumps represent incremental single-feature or bugfix releases.

---

## [Unreleased] - Planned

**Phase 8 — Platform Migration to Vercel + Supabase** (planning-only, **not to be executed**): move hosting from **Cloudflare Pages** to **Vercel** and the database from **Cloudflare D1 (SQLite)** to **Supabase (PostgreSQL)**. The full phased, step-by-step task plan (schema + data migration, auth strategy decision, endpoint porting, DNS/cutover, rollback) is documented in **`docs/migration-deployement.md`**. No migration steps run without explicit approval; Cloudflare + D1 stay live for parity/rollback until Phase 8 cleanup.

Other future work (pending UI features + remaining phases) is tracked in **`docs/ROADMAP.md`**.

---

## [0.0.20] - 2026-09-02

Security audit & hardening before public launch (see `security/AUDIT_SUMMARY.md`). No CRITICAL issues; multiple hardening fixes landed.

### Security — added
- **TMDB key removed from the browser bundle.** `config.js` no longer hardcodes the key; a new `functions/api/tmdb.js` Pages Function proxies TMDB requests and injects the key from the `TMDB_API_KEY` secret server-side (`wrangler pages secret put TMDB_API_KEY`; local via git-ignored `.dev.vars`). The proxy path is allow-listed (SSRF-safe; rejects cloud-metadata/absolute paths).
- **Security headers on all responses** via a single global middleware: `Content-Security-Policy` (self + TMDB/Viduki/Google Fonts), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` — plus a Cloudflare `_headers` file for static assets.
- **CORS allowlist** replaced the wildcard `Access-Control-Allow-Origin: *` (preflight + responses); only allow-listed origins are reflected, never a wildcard.
- **Global error catch** in the middleware: unhandled exceptions return a generic 500; details logged server-side.
- **Per-IP rate limiting** on login/register (`functions/_rateLimit.js`, migration `0006`, `ip_attempts` table) keyed on Cloudflare's `CF-Connecting-IP` (not spoofable by clients); per-IP + per-email lockouts work independently, same 5-fail → 15-min behavior.
- **Password hashing hardened** (`_password.js`): versioned `v1:<iterations>:<salt>:<hash>` format, work factor raised from 100k → **310k** iterations, legacy hashes still verify, and `login.js` **transparently rehashes** weak/legacy hashes on successful login.

### Security — fixed
- **XSS (episodes.js):** removed an unescaped `${err.message}` interpolation in the episode-modal error branch; poster path / data attributes now escaped (`escapeHtml`) across `ui.js`, `watchlist.js`, `history.js`, `continue.js` for defense-in-depth.

### Verified
- Local e2e (`wrangler pages dev`): register/login/logout, session cookie `HttpOnly; SameSite=Lax`, 401 on protected routes for guests, per-user access isolation, rate limit 429 after 5 failures, TMDB proxy 200 + SSRF rejected 400, all five security headers present, password hash `v1:310000:` + legacy migration, `pnpm audit` clean.

---

## [0.0.19] - 2026-09-02

Continue Watching is now **server-side (D1) only**, tied to the signed-in account — it is no longer persisted to localStorage on the device. It appears when a user is signed in and disappears on logout.

### Changed
- `continue.js` rewritten: the local (device) Continue Watching list was removed. Continue Watching state now lives entirely in D1 (`/api/continue`) and is held in memory only:
  - **Shown only when signed in** — `renderContinueWatching()` renders nothing (and hides the section) for guests.
  - **On login / page load** → `loadContinueWatching()` pulls the account's rows from D1.
  - **On logout** → the in-memory list is cleared and the section hides (`loadContinueWatching()` re-run in `auth.js`).
  - Progress saves (`POST /api/continue`) and removes (`DELETE /api/continue`) go straight to the server, never to localStorage.
  - Guests are not tracked at all (`updateContinueEntry`/`removeContinueEntry` are no-ops when logged out).
- `app.js` no longer writes the raw Viduki progress to `vidukinet-Progress`; the throttled flush only mirrors progress to the server via `updateContinueEntry()`. On load it also removes any stale `vidukinet-ContinueWatching` / `vidukinet-Progress` keys left by older versions.
- `config.js` — removed the unused `CONTINUE_KEY` constant.
- `episodes.js` — the season/episode picker progress badges now read from the server-backed continue watching state (`getEpisodeProgressMap()` in `continue.js`) instead of localStorage; like the Continue Watching row, they are only populated for signed-in users.
- `auth.js` — logout (and the fallback "clear local session" path) now refreshes continue watching so the row disappears immediately.

### Verified
- Server-side lifecycle via `wrangler pages dev`: register → add progress → `GET /api/continue` returns the entry; logout → old cookie returns `401` (guest path hides the row); re-login → the same entry reappears from D1. A second user sees an empty list (per-user isolation). No localStorage continues to be written.

---

## [0.0.18] - 2026-09-02

Bugfix: profile modal content was top-cropped on mobile.

### Fixed
- The modal content was vertically centered with `align-items: center` on `.modal.show`. When the centered content was taller than the visible viewport (e.g. the profile modal on a short mobile screen / browser URL-bar height), the **top of the profile content (heading + avatar area) was clipped above the view and unreachable** because only the inner content box scrolled, not the overlay.
- Changed modal centering from flex `align-items: center`/`justify-content: center` to `margin: auto` on `.modal-content`, and made the `.modal` overlay itself `overflow-y: auto`. The modal now centers when it fits and, when taller than the viewport, stays pinned to the top with the overlay scrollable — so the profile top (Profile heading, avatar, username/email) is always reachable, including on mobile.

### Verified
- Manual check of the `.modal`/`.modal-content` spacing model: `.modal.show { display: flex }` + `.modal-content { margin: auto }` + `.modal { overflow-y: auto }`. Content taller than the viewport no longer clips its top edge; short content still centers.

---

## [0.0.17] - 2026-09-02

**Phase 7 — Profile.** A signed-in user can now open a Profile screen from the header to view and edit their avatar, username, email, and password, and to browse their watch history.

### Added
- **Profile modal** — new `profile.js` frontend module (opened from the header username/avatar button). Shows the user's avatar, username and email, and lets them:
  - Change **avatar** — pick from 10 named color-initial presets (red/orange/amber/green/teal/blue/indigo/violet/pink/slate) or paste a custom image URL; "Use default" reverts to the initial avatar.
  - Edit **username** and **email**.
  - Change **password** (requires the current password; new password verified + length-checked client- and server-side).
- **Backend endpoints**:
  - `PATCH /api/profile` (`functions/api/profile.js`) — validate + update username/email/avatar_url; enforces email format + uniqueness (conflict → 409); rejects `javascript:`/`data:` avatar values (only allows `preset:<name>` or `http(s)` URLs); **rotates the session cookie on email change** and returns a fresh `Set-Cookie`.
  - `POST /api/profile/password` (`functions/api/profile/password.js`) — verifies the current password (401 if wrong) before updating to the new PBKDF2 hash.
- **`users.avatar_url` column** — migration `0005_avatar.sql` (applied to local + remote D1). `avatar_url` holds either `NULL`, `preset:<name>`, or an image URL. Included in `/api/me`, register, login, and the auth middleware user object.
- **Watch History moved onto the Profile page** — the homepage "Watch History" row was removed from `index.html`; `history.js` now renders history inside the profile modal (`#profileHistoryContainer`).

### Changed
- Header auth area: the username/avatar now renders as a **profile button** that opens the profile modal (avatar uses the new color-preset/system, consistent across header + profile).
- `auth.js` `renderAuthArea()` uses the shared `renderAvatar()` (from `profile.js`).

### Verified (manual e2e against local `wrangler pages dev`)
- Register/login `/api/me` include `avatar_url`.
- `PATCH /api/profile`: change username + preset avatar (200); invalid `javascript:` avatar rejected (saved as prior value); short username (400); bad email (400); duplicate email (409); custom image URL (200).
- Email change returned a new `Set-Cookie` and invalidated the old session token.
- `POST /api/profile/password`: wrong current (401), short new (400), success (200); old password no longer works, new password logs in.
- Logged-out `PATCH`/password → 401.

---

## [0.0.16] - 2026-09-02

**Phase 6 — Harden, Test & Polish.** All API endpoints refactored for consistent input validation, authz, and error handling, then verified end-to-end.

### Added
- `functions/_http.js` — shared HTTP helpers: `error(status, msg)`, `json(data, status)`, `dbError(err)` (safe JSON 500), plus validators `MEDIA_TYPES`, `intOr`, `clampNum`, and `s` (trim + length-cap).

### Changed
- `functions/api/*.js` (`register`, `login`, `logout`, `watchlist`, `continue`, `history`, `import`) now use the shared helpers and validate everything server-side:
  - Media type must be `movie`/`tv`; `tmdb_id` must be an integer.
  - String fields (title, poster, username) trimmed and length-capped; `watched`/`duration` number-clamped.
  - Username and password length bounds on register (3–40 username, 8–128 password).
  - DB access wrapped in try/catch returning a consistent, non-leaking JSON 500.
- `/api/import` caps a batch at 200 rows per request.

### Verified (manual e2e against local `wrangler pages dev`)
- Register (201) + validation rejects (400 short password / bad email, 409 duplicate), `GET /api/me` returns user.
- Watchlist POST/GET/DELETE, continue POST/GET, history POST/GET for user A all return expected data; `watched`/`duration` properly clamped.
- **Authz isolation**: user B sees empty watchlist/continue/history, and B's delete of A's row leaves A's data intact (all queries scoped by `user_id`).
- **401 gates**: logged-out POST/GET to watchlist/continue/history return 401 JSON.
- **Import cap**: 250-item payload imported exactly 200 rows.

### Decision
- Guest localStorage path is **kept**: browsing, search, and continue-watching work without an account; login is only required for cross-device sync (watchlist, history, server-side continue). localStorage remains the always-on render source; D1 writes are gated behind a signed-in user.

---

## [0.0.15] - 2026-09-02

Bugfix: clicking the Add-to-watchlist button on a card no longer also plays the media.

### Fixed
- Clicking the "+ Watchlist"/"✓ Saved" toggle on a movie/TV card was **also** starting the player. This happened because the card's play listener is attached directly to the card element, and the delegated watchlist handler's `stopPropagation()` only prevented further bubbling to ancestors of `document` — the card's own click handler had already run by the time the event reached `document`.
- `ui.js` `attachCardListeners()` (the single shared card play listener used by search, recommendation, and watchlist rows) now ignores clicks and keyboard activation that originate from the `.watch-btn`, so toggling the watchlist never triggers playback.

### Verified
- Local simulation of the event flow (click on `.watch-btn` inside a `.movie-card`): `toggleWatchlist()` runs, `playFromCard()` does **not**. Guard present in served `ui.js`.

---

## [0.0.14] - 2026-09-02

Phase 5 of the Database + Accounts roadmap — Persist Continue Watching / Progress / History to DB.

### Added
- **`functions/api/continue.js`** — `GET` (list current user's continue-watching, newest first), `POST` (upsert one entry per progress tick), `DELETE` (remove by `tmdb_id`+`media_type`, optional `season`/`episode`); user-scoped (401 when logged out)
- **`functions/api/import.js`** — `POST /api/import` batch sync of the pre-login localStorage continue-watching entries into D1 (local value wins); called on login
- **`functions/api/history.js`** — `GET` (list current user's watch history, most recently played first), `POST` (record/upsert a played item; replays bump `played_at` in place instead of duplicating); user-scoped (401 when logged out)
- **`history.js`** (frontend) — D1-backed **Watch History** row on the homepage with resume cards, `loadHistory()` + `recordHistory()`; shown only when signed in (guard)
- **`continue.js`** (frontend) — `loadContinueWatching()` (imports local → D1 then pulls D1 → local on login), `importContinueToServer()`, and server mirroring: progress ticks → `POST /api/continue`, remove → `DELETE /api/continue` when signed in
- **`index.html`** — `#historySection`/`#historyContainer` row; `history.js` loaded after `watchlist.js` (script order: `config → tmdb → ui → auth → watchlist → history → continue → player → episodes → search → recommendations → app`)
- **`style.css`** — `.history-section` spacing (reuses watchlist grid + continue-card styles)

### Changed
- `player.js` — records watch history on play: `openPlayer()` calls `recordHistory(currentMedia)`
- `auth.js` — after session restore / login / register now also calls `initHistory()` and `loadContinueWatching()` (alongside `initWatchlist()`)
- `app.js` — progress → D1 write is handled inside `updateContinueEntry()` (guarded by signed-in user)

### Fixed
- SQLite treats `NULL` as **distinct** in a `UNIQUE` constraint, so the original `UNIQUE(user_id, tmdb_id, media_type, season, episode)` let duplicate **movie** rows (NULL season/episode) be inserted. Migration **`0004_continue_unique.sql`** adds an expression unique index (`COALESCE(,0)`) and dedupes; `continue.js`/`import.js` now use delete-then-insert. Movies and shows now both dedupe correctly.

### Verified
- Backend via `wrangler pages dev` + curl: register→cookie; `POST /api/import` batch (2 items, and importing the same movie again stays a single row); `POST /api/continue` progress tick updates `watched`; `GET /api/continue` lists newest-first; `DELETE /api/continue` removes; `POST /api/history` records movie + TV; replay bumps to top with **no duplicate** (`count` stays 1 each); all unauthenticated calls → 401
- Frontend: `history.js` + `continue.js` served (200); history section wired; continue-watching server sync functions present

---

## [0.0.13] - 2026-09-02

Phase 4 of the Database + Accounts roadmap — Watchlist.

### Added
- **`functions/api/watchlist.js`** — `GET` (list current user's items, newest first), `POST` (idempotent add/upsert by `user_id`+`tmdb_id`+`media_type`), `DELETE` (remove by `tmdb_id`+`media_type`); all scoped to the authenticated user (401 when logged out)
- **`watchlist.js`** (frontend) — `watchlistItems` state, `loadWatchlist()` (D1-backed, only when `currentUser`), `toggleWatchlist()` with optimistic UI + rollback on error, `renderWatchlistRow()` (homepage "My Watchlist" row), a delegated `.watch-btn` click handler, and a **logged-out guard** that shows a "Sign in to save your watchlist" prompt instead of the saved items
- **Watchlist toggle button** — "+ Watchlist"/"✓ Saved" overlay on every media card via `ui.js` `mediaCardHTML()` calling `watchButtonHTML()`
- **`index.html`** — `#watchlistSection`/`#watchlistContainer` row; `watchlist.js` loaded after `auth.js` (script order: `config → tmdb → ui → auth → watchlist → continue → player → episodes → search → recommendations → app`)
- **`style.css`** — watchlist section/grid + the `watch-btn` toggle (active/`✓ Saved` state), incl. mobile sizing

### Changed
- `auth.js` — calls `initWatchlist()` after session check on load and after login/logout so the row reflects auth state
- `app.js` — calls `initWatchlist()` on load
- `ui.js` — `mediaCardHTML()` renders the watchlist toggle button on every card

### Verified
- Backend round-trip via `wrangler pages dev` + curl: register→cookie, empty GET `{items:[]}`, POST add (201) for movie + TV, GET list (2 items), unauthenticated GET/POST → 401, DELETE removes, GET reflects removal
- Frontend: watchlist section + `watchlist.js` served (200); `watch-btn` wired through `mediaCardHTML` → `watchButtonHTML`; card buttons toggle optimistically and reconcile with D1

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
