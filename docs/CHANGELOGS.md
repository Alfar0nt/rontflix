# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/) conventions with semantic versioning. This project is still in **beta** (pre-1.0), so all versions use the `0.x.y` format. The `y` (patch) bumps represent incremental single-feature or bugfix releases.

---

## [Unreleased] - Planned

### Pending
- [ ] Trending hero banner with backdrop image + play button
- [ ] "Recently Added" / "Upcoming" recommendation row
- [ ] Genre filters / sort dropdown on search results
- [ ] Arrow-key navigation between cards
- [ ] Dark/light theme toggle (persisted in localStorage)
- [ ] Watch history page (sorted by last watched)

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
