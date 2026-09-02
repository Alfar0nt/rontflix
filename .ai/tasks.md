# Tasks — r0ntflix

Track completed and pending work. Based on README.md checklist and current codebase state.

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

## Pending

- [ ] **Trending hero banner** — backdrop image + play button, top of homepage
- [ ] **"Recently Added" / "Upcoming" row** — alongside existing recommendation rows
- [ ] **Genre filters / sort dropdown** — on search results (by year, rating, popularity)
- [ ] **Full keyboard shortcuts (arrows)** — arrow keys to move between cards (currently Enter/Space/Esc only)
- [ ] **Dark/light theme toggle** — persisted in localStorage
- [ ] **Watch history page** — list all played content, sorted by last watched

## Notes

- No formal task tracker; this file serves as the source of truth for open work
- All pending items are low-risk, client-side-only changes
- No tests or CI exist — manual browser verification is required for each feature
