# Product Requirements Document — r0ntflix

## Vision

A client-side-only, Netflix-like personal movie and TV streaming web app. No backend, no accounts, no login — all state lives in `localStorage`.

## Users

Single user running locally. No multi-user support.

## Design Language

Dark cinematic OTT aesthetic informed by the `ui-ux-pro-max` skill design-system for "Video Streaming/OTT":
- **Palette**: near-black background (`#000000`), elevated surfaces (`#0C0C0D`), play red accent (`#E11D48`), slate foregrounds with 4.5:1+ text contrast
- **Typography**: Inter (400/500/600/700) with `display=swap`, negative tracking on headings
- **Cards**: rounded 10px, 1px border, hover lift with shadow, reserved 2:3 poster aspect ratio (no CLS)
- **Motion**: 150-250ms transitions, `translateY`/`opacity` only, `prefers-reduced-motion` respected
- **Breakpoints**: mobile-first at 480 / 768 / 1024 / 1440px with 44px+ touch targets

## Core Features (Shipped)

- **Search** — movies + TV shows via TMDB API, debounced live results, paging / "Load More"
- **Homepage Recommendations** — 4 rows: "Popular Right Now", "Just Released", "Popular Movies", "Popular TV Shows" (last 2 lazy-render via `IntersectionObserver` with skeleton placeholders)
- **Continue Watching** — tracks in-progress movies/shows locally; renders cards on homepage with progress bars
- **Video Player** — fullscreen popup iframe embedding Viduki streaming URLs (4 API variants, switchable at runtime)
- **TV Episode Picker** — modal with season/episode selection
- **API Switching** — user can switch Viduki API variant; last selection persisted; auto-switch on server failure
- **Progress Tracking** — `postMessage` from Viduki iframe, throttled to save every 2s; auto-removes entries at 95%+ completion

## Accessibility (Shipped)

- Semantic HTML5 (`header`, `main`, `section`, `article`)
- Keyboard navigation: cards and episode items activate with Enter/Space, Esc closes overlays, focus returns to opener
- `aria-live` status region, `role="dialog"` on modals, `aria-pressed` on season buttons, `role="progressbar"`, visible focus rings
- `prefers-reduced-motion` disables animations and scroll-snap
- Labels on all form controls, no placeholder-only labels

## Performance (Shipped)

- `loading="lazy"` + `decoding="async"` on below-fold images
- Reserved `aspect-ratio` for posters prevents layout shift (CLS)
- Skeleton shimmer loading states instead of blocking "Loading..." text
- TMDB responses cached in localStorage with 10-min TTL
- Debounced search input (300ms) reduces API calls

## Pending Features (TODO)

Future work is tracked in **`docs/ROADMAP.md`** (source of truth). High-level summary:

| Area | Status |
|---|---|
| UI enhancements (hero banner, upcoming row, genre/sort, arrow keys, theme toggle) | Not started |
| **Database + Accounts** (Cloudflare D1 auth, watchlist, persisted state) | Planned — 6 phases |

**Database + Accounts overview:** the app is currently 100% client-side (state in `localStorage`). A real backend is being added via **Cloudflare D1 + Pages Functions** to support login/register and per-user watchlist/state. See `docs/ROADMAP.md` (phased plan) and `docs/DATABASE.md` (implementation guide).

## Non-Goals

- Traditional self-hosted backend server (Cloudflare Pages is static; use D1 + Pages Functions instead)
- Mobile native app
- Content licensing or hosting (relies on TMDB for metadata, Viduki for streaming)

## Constraints

- Zero dependencies — vanilla HTML/CSS/JS only, no npm, no bundler
- TMDB API key is hardcoded in `config.js` (client-side-only app)
- Video playback requires Viduki servers to be reachable
- No TypeScript, no transpilation — browser console is the only debugging tool
- Backend (when added) stays within Cloudflare: Pages Functions + D1, no separate always-on server
- Database work requires a Cloudflare account; `wrangler`, `functions/`, and migrations land once Phase 1 starts
