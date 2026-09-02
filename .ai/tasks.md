# Tasks — r0ntflix

Tracks completed work. Future work lives in `docs/ROADMAP.md`; shipped changes are logged in `docs/CHANGELOGS.md`.

## Completed

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

## Forward

- **Pending UI features** and the **Database + Accounts (Cloudflare D1)** phased plan are tracked in **`docs/ROADMAP.md`**.
- Database implementation guide: **`docs/DATABASE.md`**.
- Next up: **Phase 3 — Auth UI (Register + Login forms in the app)**.

## Notes

- No automated test framework or CI exists — manual browser verification is required for each feature
- Local dev: `pnpm dev` (boots `wrangler pages dev .`); D1 migrations: `pnpm db:migrate:local` / `pnpm db:migrate:remote`