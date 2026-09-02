# Roadmap — r0ntflix

Single source of truth for future work. `.ai/tasks.md` tracks completed work; shipped changes are logged in `docs/CHANGELOGS.md` (its `[Unreleased]` section points here). When an item ships, move it from this file into a versioned changelog entry.

---

## Pending UI Features

Small, client-side-only enhancements. They do not require a backend.

- [ ] **Trending hero banner** — backdrop image + play button, top of homepage
- [ ] **"Recently Added" / "Upcoming" row** — alongside existing recommendation rows
- [ ] **Genre filters / sort dropdown** — on search results (by year, rating, popularity)
- [ ] **Full keyboard shortcuts (arrows)** — arrow keys to move between cards (currently Enter/Space/Esc only)
- [ ] **Dark/light theme toggle** — persisted in localStorage

---

## Database + Accounts (Cloudflare D1) — Phased

> The app is currently 100% client-side (all state in `localStorage`, no backend). These phases add a real backend using **Cloudflare Pages Functions (Workers) + D1 (serverless SQLite)** for authentication, watchlist, and persisted state. Full implementation guide: `docs/DATABASE.md`.
> Deploy note: Cloudflare Pages is static hosting; it cannot run a traditional Express/local-auth backend. Cloudflare D1 + Pages Functions keep everything within the Cloudflare platform already hosting this project.
> Defer note: Creating/binding the D1 database in the Cloudflare dashboard is **deferred to the start of Phase 1** — no need to create it earlier. Only prerequisite is a Cloudflare account + `wrangler` installed.

### Phase 1 — Foundation & Database Schema
- [x] Scaffold Cloudflare Pages Functions `functions/` directory with a shared DB binding helper (`functions/_middleware.js`)
- [x] Add D1 binding config (`wrangler.toml` with `[[d1_databases]]`, real `database_id` set)
- [x] Create the remote D1 database and bind it to the Pages project — `wrangler d1 migrations apply rontflix-db --remote` executed successfully (DB id `f0dd43bc-…`)
- [x] Define schema: `users`, `sessions`, `watchlist`, `continue_watching`, `watch_history` tables
- [x] Add schema migration file `migrations/0001_init.sql` + `wrangler d1 migrations apply` step (verified against local D1)
- [x] Add session/token handling design — server-side `sessions` table + httpOnly cookie flow (see `docs/DATABASE.md`)
- [x] Verify `wrangler pages dev` runs the Worker locally with the D1 binding attached

### Phase 2 — Authentication (Register + Login + Logout)
- [ ] **Register endpoint** (`/api/register`) — validate email + password, hash password (bcrypt/Argon2), insert user
- [ ] **Login endpoint** (`/api/login`) — verify credentials, issue session token
- [ ] **Logout endpoint** — invalidate/delete session
- [ ] **Session check endpoint** (`/api/me`) — return current user for persisted login
- [ ] Password security: server-side hashing, min-length rule, no plaintext storage
- [ ] Rate-limit login/register attempts to reduce brute force

### Phase 3 — Auth UI (Register + Login)
- [ ] Login form modal/screen with email + password (labels, show/hide password toggle, `autocomplete`, loading->success/error feedback)
- [ ] Register form modal/screen with email, username, password + confirm
- [ ] Toggle between login/register, accessible (labels, aria-live errors, focus management, keyboard friendly)
- [ ] "Logged in" UI state — show user's name / avatar in header with a logout control
- [ ] Persist login across reload (session token in httpOnly cookie via Secure settings, or localStorage fallback with documented tradeoff)
- [ ] Prevent access to watchlist/profile when logged out (guard UI)

### Phase 4 — Watchlist
- [ ] **Add to watchlist endpoint** (`/api/watchlist`, POST) — store tmdb_id + media_type + title + poster per user
- [ ] **Get watchlist endpoint** (`/api/watchlist`, GET) — fetch current user's list
- [ ] **Remove/watchlist-toggling endpoint** (DELETE)
- [ ] **Watchlist UI** — "+ Watchlist" toggle on cards + a dedicated watchlist row/section on the homepage
- [ ] Optimistic UI updates (toggle instantly, sync with server) + loading/error feedback
- [ ] Watchlist persistence in D1 (not localStorage) once logged in

### Phase 5 — Persist Continue Watching / Progress / History to DB
- [ ] Sync `continue_watching` + progress from localStorage → D1 when a user logs in (migration)
- [ ] Player progress writes to D1 (in addition to/ instead of localStorage) when authenticated
- [ ] **Watch history** — store every played item, sorted by last watched
- [ ] **Watch history UI** — dedicated section listing everything played, with resume/continue
- [ ] Offline/degraded mode — keep working from localStorage cache when not logged in or offline

### Phase 6 — Harden, Test & Polish
- [ ] Input validation + sanitization on all API endpoints (never trust the client)
- [ ] Authz checks on every endpoint (user can only read/write their own data)
- [ ] Error handling + consistent JSON responses from all Functions
- [ ] Manual e2e test: register → login → add watchlist → play → resume via another session
- [ ] Update `docs/DATABASE.md` with final schema + deployment steps
- [ ] Decide whether to keep localStorage path for guest/not-logged-in users or require login
