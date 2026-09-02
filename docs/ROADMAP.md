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
- [x] **Register endpoint** (`/api/register`) — validate email + password, PBKDF2-hash password, insert user, start session
- [x] **Login endpoint** (`/api/login`) — verify credentials, issue session token
- [x] **Logout endpoint** (`/api/logout`) — invalidate/delete session
- [x] **Session check endpoint** (`/api/me`) — return current user for persisted login
- [x] Password security: server-side PBKDF2 hashing (Web Crypto, 100k iterations), min 8-char rule, no plaintext storage
- [x] Rate-limit login/register attempts — `auth_attempts` table, 5-fail lockout/429 (migration `0002_auth_attempts.sql`)

### Phase 3 — Auth UI (Register + Login)
- [x] Login form modal/screen with email + password (labels, show/hide password toggle, `autocomplete`, loading->success/error feedback)
- [x] Register form modal/screen with email, username, password + confirm
- [x] Toggle between login/register, accessible (labels, aria-live errors, focus management, keyboard friendly)
- [x] "Logged in" UI state — show user's name / avatar in header with a logout control
- [x] Persist login across reload (session token in httpOnly cookie via Secure settings)
- [x] Prevent access to watchlist when logged out (guard UI) — logged-out users see a "Sign in to save your watchlist" prompt instead of the saved items; the card toggle opens the sign-in modal. (Profile UI is not yet built; recheck when a profile screen lands.)

### Phase 4 — Watchlist
- [x] **Add to watchlist endpoint** (`/api/watchlist`, POST) — store tmdb_id + media_type + title + poster per user (idempotent upsert)
- [x] **Get watchlist endpoint** (`/api/watchlist`, GET) — fetch current user's list, newest first
- [x] **Remove/watchlist-toggling endpoint** (DELETE, by tmdb_id + media_type)
- [x] **Watchlist UI** — "+ Watchlist"/"✓ Saved" toggle button on every media card + a dedicated "My Watchlist" row on the homepage
- [x] Optimistic UI updates (toggle instantly, sync with server, rollback on error) + loading/error feedback
- [x] Watchlist persistence in D1 (not localStorage) once logged in; guarded when logged out (prompts sign-in)

### Phase 5 — Persist Continue Watching / Progress / History to DB
- [x] Sync `continue_watching` + progress from localStorage → D1 when a user logs in (migration) — `POST /api/import` batch upsert (local wins) on login
- [x] Player progress writes to D1 (in addition to/ instead of localStorage) when authenticated — every 2s progress tick → `POST /api/continue`
- [x] **Watch history** — store every played item, sorted by last watched — `POST /api/history`/`GET /api/history` (replays bump `played_at` in place via a unique index)
- [x] **Watch history UI** — dedicated section listing everything played, with resume/continue (currently a homepage row; planned to move onto the Profile page in Phase 7)
- [x] Offline/degraded mode — keep working from localStorage cache when not logged in or offline (localStorage remains the always-on render source; all D1 writes are gated behind a signed-in user)

### Phase 6 — Harden, Test & Polish
- [x] Input validation + sanitization on all API endpoints (never trust the client) — added `functions/_http.js` shared helpers (`error`, `json`, `dbError`, `MEDIA_TYPES`, `intOr`, `clampNum`, `s`); all endpoints now validate media type, clamp numeric bounds, and length-cap strings
- [x] Authz checks on every endpoint (user can only read/write their own data) — every query scoped by `context.data.user.id`; verified user isolation end-to-end (second user sees empty data and cannot affect the first user's rows)
- [x] Error handling + consistent JSON responses from all Functions — DB access wrapped in try/catch returning stable JSON 500; every endpoint returns `{ error }` or `{ ... }` JSON with proper status codes; e2e verified 400/401/409/429/201/200
- [x] Manual e2e test: register → login → add watchlist → play → resume via another session — ran against local `wrangler pages dev`; verified two-user authz isolation, 401 gates, validation rejects, import cap (200), and progress clamps
- [x] Update `docs/DATABASE.md` with final schema + deployment steps
- [x] Decide whether to keep localStorage path for guest/not-logged-in users or require login — **decision (initially): keep the guest localStorage path** for continue-watching. **Revised in v0.0.19:** Continue Watching is **D1-only for signed-in users** — no guest localStorage path; it appears on login and disappears on logout. Browsing/search still work signed-out; the watchlist and history remain D1-gated.

### Phase 7 — Profile
- [x] **Profile page** — dedicated "Profile" screen the signed-in user can open; make the header username/avatar link to it
- [x] **View & edit profile** — show profile picture (avatar), username, email; allow the user to change their **profile picture**, **username**, **email**, and **password**
- [x] Backend endpoints — `PATCH/PUT /api/profile` (update username/email/avatar) and `POST /api/profile/password` (change password, requires current password); re-issue session cookie on email change
- [x] **Avatar/picture storage** — pick a mechanism (e.g. upload → Cloudflare R2 / image URL in `users.avatar_url`, or a set of presets/color-initial avatars); extend the `users` table migration
- [x] Guard — profile only accessible when signed in (mirrors the watchlist guard); sign-in prompt otherwise
- [x] **Move Watch History onto the Profile page** — remove the homepage "Watch History" row; render it (with resume/continue) on the profile page instead. (Currently on the homepage from Phase 5.)

### Phase 8 — Platform Migration to Vercel + Supabase (PLANNED, not to be executed)
- [ ] Migrate hosting from **Cloudflare Pages** to **Vercel** and the database from **Cloudflare D1 (SQLite)** to **Supabase (PostgreSQL)**.
- [ ] This is **planning-only** — the full phased, step-by-step plan (schema conversion, data migration, auth decision, endpoint porting, DNS/cutover, rollback) lives in **`docs/migration-deployement.md`**.
- [ ] Do **not** begin any of the migration steps until explicitly approved; keep Cloudflare + D1 live for parity/rollback until Phase 8 cleanup.
