# Tasks — r0ntflix

Tracks completed work. Future work lives in `docs/ROADMAP.md`; shipped changes are logged in `docs/CHANGELOGS.md`.

## Completed

- [x] **Continue Watching is now D1-only (0.0.19)** — removed localStorage persistence (`vidukinet-ContinueWatching`/`vidukinet-Progress`). Continue Watching lives entirely in `/api/continue` and an in-memory list: shown only when signed in, loaded on login (`loadContinueWatching()`), cleared + hidden on logout (auth.js). Guests are not tracked. `app.js` no longer writes raw progress to localStorage (and clears stale keys on load); `config.js` `CONTINUE_KEY` removed; `episodes.js` season-picker progress badges now source from the server-backed map (`getEpisodeProgressMap()`) instead of localStorage. Verified via `wrangler pages dev`: register→progress→GET; logout→401 (row hidden); re-login→same entry returns; second user sees empty.

- [x] **Bugfix (0.0.18) — profile modal top-cropped on mobile** — the profile modal (and other centered modals) vertically centered via flex `align-items:center`, which clipped the top of content taller than the viewport on mobile. Changed centering to `margin:auto` on `.modal-content` and made the `.modal` overlay `overflow-y:auto`, so a too-tall modal pins to the top and scrolls (profile heading/avatar always reachable) while short content still centers.

- [x] Continue Watching — local persistence, progress badges, auto-remove at 95%
- [x] Homepage recommendations — 4 TMDB-powered rows (Popular, Just Released, Popular Movies, Popular TV)
- [x] Lazy rendering — last 2 recommendation rows use `IntersectionObserver`
- [x] Persistent API selection — saved to localStorage on change
- [x] No results empty state — friendly suggestion instead of error line
- [x] Search paging — "Load More" button for paginated results
- [x] Hide recommendations — homepage rows hidden when search box has focus/text
- [x] TMDB cache — localStorage with 10-min TTL
- [x] Auto API switching — `viduki:all-servers-failed` triggers cycling to next API variant
- [x] **Debounced live search** — results update as user types (300ms), Enter still triggers immediate search
- [x] **Loading skeleton** — shimmering placeholder cards replace "Loading..." text everywhere
- [x] **Keyboard accessibility** — cards and episode items are focusable (`tabindex=0`) and activate with Enter/Space; Esc closes modals/player; focus returns to opener on close
- [x] **Full UI redesign** — cinematic OTT dark palette, Inter typography, modern Netflix-style cards, design tokens, improved modals/player/empty states
- [x] **Responsive mobile-first breakpoints** — 480px / 768px / 1024px / 1440px with proper touch targets (44px+)
- [x] **Performance** — `decoding="async"` on images, reserved aspect-ratio (no CLS), lazy loading below the fold, Inter font with `display=swap`
- [x] **Accessibility** — semantic HTML (`header/main/section/article`), `aria-live` status, `role="dialog"` on modals, `aria-pressed` on season buttons, visible focus rings, `prefers-reduced-motion` support, `role="progressbar"` on progress bars
- [x] **Phase 1 — Foundation & Database Schema** — Pages Functions `functions/_middleware.js` (D1 binding + session cookie helpers), `wrangler.toml` with real D1 `database_id`, schema migration `migrations/0001_init.sql` (`users`, `sessions`, `watchlist`, `continue_watching`, `watch_history`) applied to local + remote D1 (`rontflix-db`), and verified locally via `wrangler pages dev`
- [x] **Phase 2 — Authentication (Register + Login + Logout)** — `functions/_password.js` (PBKDF2 hashing), `functions/_rateLimit.js` (5-fail lockout), `functions/api/register.js`, `login.js`, `logout.js`, `me.js`; `context.data.user` auth resolution in middleware + migration `0002_auth_attempts.sql`. Verified end-to-end locally (`201/409/401/429/204`, httpOnly cookie, `/api/me` user/null)
- [x] **Phase 3 — Auth UI (Register + Login)** — `auth.js` (API wrapper, `currentUser`, `register/login/logout/checkSession`), login/register modal with toggle, show/hide password, loading→success/error feedback, header signed-in username/avatar + Log out or Sign in button, session persists via httpOnly cookie. Accessible (labels, `aria-live`, focus return, Esc/backdrop close)
- [x] **Phase 3 — Watchlist logged-out guard** — logged-out users see a "Sign in to save your watchlist" prompt in the watchlist row instead of saved items; the card toggle button opens the sign-in modal. (Profile UI not yet built; recheck when one lands)
- [x] **Cookie `Secure` fix (0.0.12)** — auth cookie `Secure` flag now conditional on request scheme (HTTPS only), so login persists over plain-http LAN (phone testing); production remains HTTPS+`Secure`
- [x] **Phase 4 — Watchlist** — `functions/api/watchlist.js` (GET/POST/DELETE, user-scoped, 401 without auth), `watchlist.js` (D1-backed state, optimistic toggle, "My Watchlist" homepage row, delegated `.watch-btn` handler), toggle button on every media card via `mediaCardHTML`→`watchButtonHTML`. Verified: add/list/remove round-trip + 401 guards
- [x] **Phase 4 fix — stale logged-out guard** — removed the premature `initWatchlist()` from `app.js` load (auth.js owns it, after `checkSession()` resolves) and reset `watchlistLoaded` in `initWatchlist()` so a logged-in reload shows the watchlist instead of a stuck guard
- [x] **Phase 5 — Persist Continue Watching / Progress / History to DB** — `functions/api/continue.js` (GET/POST/DELETE), `functions/api/history.js` (GET/POST, replay bumps `played_at` via unique index), `functions/api/import.js` (login sync, batch delete-then-insert); frontend `history.js` (D1-backed Watch History row) + `continue.js` (import + D1 mirror on progress/remove). Migrations `0003_history_unique.sql` + `0004_continue_unique.sql`. Offline/degraded mode retained (localStorage is always the render source; D1 writes gated behind a signed-in user). Verified: import dedupe (movies with NULL season stay a single row), continue GET/POST/DELETE, history replay no-duplicate bump, 401 guards
- [x] **Bugfix (0.0.15) — watch-btn no longer plays the media** — `ui.js` `attachCardListeners()` ignores clicks/keyboard originating from the `.watch-btn`, so clicking "+ Watchlist"/"✓ Saved" only toggles the watchlist and never starts playback. Verified via event-flow simulation (served `ui.js` shows the guard).
- [x] **Phase 6 — Harden, Test & Polish** — added `functions/_http.js` shared helpers (`error`, `json`, `dbError`, `MEDIA_TYPES`, `intOr`, `clampNum`, `s`); refactored all endpoints (`register`, `login`, `logout`, `watchlist`, `continue`, `history`, `import`) for server-side validation (media type, integer `tmdb_id`, capped/trimmed strings, clamped numerics, username/password bounds), authz (every query scoped by `user_id`), and try/catch consistent JSON 500s; `/api/import` capped at 200 rows. Verified end-to-end via local `wrangler pages dev`: two-user authz isolation, 401 gates, validation rejects (400/409), 201/200/204, progress clamps, import cap. **Decision: keep the guest localStorage path** — browsing/search/continue work logged-out; login only required for cross-device sync. Docs updated (ROADMAP Phase 6, CHANGELOGS 0.0.16, DATABASE.md, tasks.md).
- [x] **Phase 7 — Profile** — `users.avatar_url` column (migration `0005_avatar.sql`, applied local+remote); `PATCH /api/profile` (update username/email/avatar; email uniqueness 409; avatar validated to `preset:<name>` or http(s) URL only; session cookie rotated on email change) and `POST /api/profile/password` (verifies current password, 401 on wrong); new `profile.js` modal (avatar presets + custom URL, edit username/email, change password) opened from a header **profile button**; **Watch History moved onto the Profile page** (homepage row removed; `history.js` renders inside the modal); `avatar_url` surfaced via `/api/me`, register, login, middleware. Verified end-to-end locally (register→me→patch avatar/username/email→session rotation→password change→old password invalidated, uniqueness 409, logged-out 401). Docs updated (ROADMAP Phase 7, CHANGELOGS 0.0.17, DATABASE.md, tasks.md).

## Forward

- **Pending UI features** and the **Database + Accounts (Cloudflare D1)** phasing are tracked in **`docs/ROADMAP.md`**.
- Database implementation guide: **`docs/DATABASE.md`**.
- Next up: **Pending UI features** (trending hero banner, Recently Added/Upcoming rows, genre filters, keyboard nav, dark/light toggle) in `docs/ROADMAP.md`.
- **Planned (do NOT execute): Platform migration** — hosting to **Vercel** + database to **Supabase (Postgres)**. Full phased plan + task checklist lives in **`docs/migration-deployement.md`** (ROADMAP Phase 8).

## Notes

- No automated test framework or CI exists — manual browser verification is required for each feature
- Local dev: `pnpm dev` (boots `wrangler pages dev .`); D1 migrations: `pnpm db:migrate:local` / `pnpm db:migrate:remote`