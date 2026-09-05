# Roadmap — r0ntflix

Single source of truth for future work. `.ai/tasks.md` tracks completed work; shipped changes are logged in `docs/CHANGELOGS.md` (its `[Unreleased]` section points here). When an item ships, move it from this file into a versioned changelog entry.

---

## Pending UI Features

Small, client-side-only enhancements. They do not require a backend.

- [ ] **Trending hero banner** — backdrop image + play button, top of homepage
- [ ] **"Recently Added" / "Upcoming" row** — alongside existing recommendation rows
- [x] **Next/Previous episode navigation** — when watching a TV show or anime, allow the user to jump directly to the next or previous episode from the player
- [x] **Dedicated title detail page** — clicking a movie or TV show opens a full detail page (instead of going straight to the video player) with the player, rating, and similar title recommendations
- [x] **Hide homepage rows while searching** — when the user is searching, hide the "Continue Watching" and "My Watchlist" rows so search results display cleanly instead of appearing beneath them
- [ ] **Genre filters / sort dropdown** — on search results (by year, rating, popularity)
- [ ] **Full keyboard shortcuts (arrows)** — arrow keys to move between cards (currently Enter/Space/Esc only)
- [ ] **Dark/light theme toggle** — persisted in localStorage

---

## Multi-API Provider Support (Viduki + 1Embed + 111Movies) — PLANNED (do NOT implement yet)

> **Status:** Planning only. This section is the comprehensive source of truth for adding multiple streaming providers. Do **not** implement until explicitly approved. When implemented, move this into a versioned changelog entry and update `docs/CHANGELOGS.md`.
>
> **Goal:** Today the player only streams from **Viduki** (4 numbered sub-servers: API 1–4). We want the user to be able to switch between **Viduki**, **1Embed**, and **111Movies** as separate streaming sources.

### Overview — Feasibility & Scope

- **This is a 100% client-side change.** No backend/D1/Cloudflare reconfiguration is required. See "Backend/D1 impact" below.
- All three providers accept the **TMDB numeric id** already present in `currentMedia.id`, so **no IMDb-id conversion is needed** for the happy path.
  - Viduki: uses TMDB id. Movie `https://viduki.net/{api}/movie/{id}`, TV `https://viduki.net/{api}/tv/{id}/{season}/{episode}`.
  - 1Embed: uses TMDB id. Movie `https://1embed.cc/embed/movie/{id}`, TV `https://1embed.cc/embed/tv/{id}/{season}/{episode}`.
  - 111Movies: accepts TMDB id **or** IMDb id (`tt...`). Movie `https://111movies.net/movie/{id}`, TV `https://111movies.net/tv/{id}/{season}/{episode}`.
- Concept remap: the current "API 1–4" are 4 Viduki *variants*. We re-model into a flat list of **sources** (provider + variant flattened), because 1Embed and 111Movies are single embeds each.

### Provider URL reference

| Provider | Movie URL | TV URL | Notes |
|---|---|---|---|
| Viduki | `https://viduki.net/{api}/movie/{id}` | `https://viduki.net/{api}/tv/{id}/{s}/{e}` | 4 variants, `{api}` = 1–4 |
| 1Embed | `https://1embed.cc/embed/movie/{id}` | `https://1embed.cc/embed/tv/{id}/{s}/{e}` | Single embed |
| 111Movies | `https://111movies.net/movie/{id}` | `https://111movies.net/tv/{id}/{s}/{e}` | Accepts TMDB or IMDb id (`tt...`) |

### Key design decision — source registry

- Introduce a **source registry** describing every selectable source: `key`, `label`, and URL-building route.
- Proposed flat `SOURCES` array in `config.js` (order defines Prev/Next stepping order):

```js
const SOURCES = [
  { key: 'viduki-1',  label: 'Viduki 1 (Multi Server)' },
  { key: 'viduki-2',  label: 'Viduki 2 (Multi Language)' },
  { key: 'viduki-3',  label: 'Viduki 3 (Multi Embeds)' },
  { key: 'viduki-4',  label: 'Viduki 4 (Premium Embeds)' },
  { key: '1embed',    label: '1Embed' },
  { key: '111movies', label: '111Movies' },
];
```

### Implementation steps (frontend only)

1. **`config.js`** — add the `SOURCES` registry (keys + labels). All provider logic stays out of HTML.
2. **`tmdb.js`** — replace/replace-augment `vidukiUrl(type, id, season, episode, api)` with a dispatcher `buildStreamUrl(sourceKey, type, id, season, episode)` that returns the URL per source key. Keep `vidukiUrl` or fold it in.
3. **`index.html`** — rewrite the `<select id="apiSelect">` options from the `SOURCES` registry (render every source; not hardcoded). Update the `aria-label` from "Select Viduki API variant" to a provider-neutral label. Player control labels already say "API N" — update `popupApiInfo`/status to show the provider/source label (e.g. "1Embed", "111Movies").
4. **`player.js`** — change all API-variant handling to source-key handling:
   - `openPlayer`: call `buildStreamUrl(selectedSourceKey, ...)` instead of `vidukiUrl(type, id, season, episode, apiVersion)`.
   - `rebuildPlayerSrc`, `switchApi`, `popupApiInfo`, `setStatus("Now playing: … using …")` — read the current **source key**, not a variant number.
   - `switchApi(direction)` iterates through the flat `SOURCES` array in order, wrapping around (Viduki→1Embed→111Movies→back to Viduki-1).
5. **`app.js`** — persistence + load migration:
   - Store the **source key** (string) in `localStorage` under `API_SELECT_KEY` (`vidukinet-SelectedApi`) instead of a number.
   - On load, migrate legacy stored values: `"1"`/`"2"`/`"3"`/`"4"` → `"viduki-1"`…`"viduki-4"` so existing users keep their Viduki variant.
   - Generalize the `viduki:all-servers-failed` postMessage handler to advance to the **next source** in `SOURCES` (auto-failover can now switch providers, not just Viduki variants).

### Backend / D1 / Cloudflare impact — NONE (verified)

- **D1 schema** (`migrations/0001_init.sql`): tables `watchlist`, `continue_watching`, `watch_history` store only `tmdb_id` + `media_type` (+ season/episode). **No provider/source/variant column exists or is needed.**
- **Pages Functions endpoints** (`functions/api/continue.js`, `watchlist.js`, `history.js`, etc.): only read/write `tmdb_id` + `media_type`; they never reference the streaming source. **No endpoint changes.**
- **No new migrations, no new endpoints, no wrangler/DB reconfiguration.**

### Non-DB concerns (may need edits, not DB)

- **CSP allow-list:** `functions/_middleware.js` (Content-Security-Policy `frame-src`/`child-src`) and `_headers` currently allow specific origins. Add `https://1embed.cc` and `https://111movies.net` so the new iframes are not blocked by the browser.
- **postMessage / progress caveat:** `app.js` only trusts the `viduki.net` origin for progress (`MEDIA_DATA`) and `viduki:all-servers-failed`. 1Embed and 111Movies do **not** emit these postMessages, so:
  - **Continue-watching progress will not update on non-Viduki providers.**
  - Must degrade gracefully (no crash, no console errors). `flushProgress` in `app.js` already guards on `currentMedia`; ensure non-Viduki src just never produces progress.
  - Decision (recommended): accept graceful degradation — only Viduki tracks progress. Optionally show a subtle status hint that progress isn't tracked on non-Viduki sources (not required).
- **Referrer/headers:** no other server-side change expected.

### Files touched (implementation)

- `config.js` (source registry)
- `tmdb.js` (URL builder dispatcher)
- `index.html` (dropdown options + labels)
- `player.js` (source-key switching/labels/nav)
- `app.js` (persistence + legacy migration + auto-failover)
- `style.css` (only if any control styling/label widths change — optional)
- `functions/_middleware.js` + `_headers` (CSP allow-list for 1embed/111movies) — if approvals confirm
- `docs/CHANGELOGS.md` (new version entry), `docs/ROADMAP.md` (mark done), `AGENTS.md` (module map if a new module is introduced)

### Verification checklist (when implemented)

- `node --check` on all modified JS.
- Serve via `wrangler pages dev`; confirm `1embed.cc` and `111movies.net` are reflected in the served CSP headers.
- jsdom smoke test: dropdown renders all 6 sources; `buildStreamUrl` returns correct URL per source for movie + tv; `switchApi` wraps through all sources; legacy `localStorage` `"3"` migrates to `viduki-3`.
- Manual: select 1Embed → play a movie → iframe src points to `1embed.cc`; play a TV episode on 111Movies → src points to `111movies.net`; verify no progress postMessages cause errors on non-Viduki.
- Confirm Viduki 1–4 still behave as before (existing users unaffected).

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
