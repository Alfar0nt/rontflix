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

## Forward

- **Pending UI features** and the **Database + Accounts (Cloudflare D1)** phased plan are tracked in **`docs/ROADMAP.md`**.
- Database implementation guide: **`docs/DATABASE.md`**.

## Notes

- No automated test framework or CI exists — manual browser verification is required for each feature
- Database phases require a Cloudflare account; `wrangler.toml`, `functions/`, and migrations land once Phase 1 starts