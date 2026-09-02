# Execution Flow — r0ntflix

## Startup

1. Browser loads `index.html` — a single-page app shell
2. Scripts load in order (no bundler, no deferred imports):
   `config.js → tmdb.js → ui.js → continue.js → player.js → episodes.js → search.js → recommendations.js → app.js`
3. `app.js` registers global listeners and fires on `window.load`:
   - Restores last-selected Viduki API from `localStorage`
   - Calls `renderContinueWatching()` — reads `localStorage`, renders cards
   - Calls `loadRecommendations()` — 4 parallel TMDB API calls, renders rows

## Homepage Recommendations

```
loadRecommendations()
  ├─ Promise.all([
  │    tmdbGet('/movie/popular'),
  │    tmdbGet('/tv/popular'),
  │    tmdbGet('/movie/now_playing'),
  │    tmdbGet('/tv/on_the_air')
  │  ])
  ├─ renderRow('Popular Right Now', merged movies + TV)
  ├─ renderRow('Just Released', merged now_playing + on_the_air)
  ├─ renderRow('Popular Movies', movies only, lazy)
  └─ renderRow('Popular TV Shows', TV only, lazy)
```

Lazy rows use `IntersectionObserver` with `300px` rootMargin — render on scroll proximity. Empty grids show skeleton shimmer cards until scrolled into view.

## Search

```
User types in search box (>= 2 chars)
  ├─ Debounce 300ms
  ├─ Reads searchInput.value
  ├─ Calls TMDB /search/movie + /search/tv in parallel
  ├─ Results sorted by popularity
  ├─ Hides recommendation section (on focus/input)
  ├─ Renders skeleton cards while loading
  ├─ Renders card articles in resultsContainer
  └─ "Load More" button fetches next page (existing query, next page)
```

Enter in the input triggers an immediate search (clears debounce timer).

## Playing Media

```
User clicks a card (or presses Enter/Space on a focused card)
  ├─ Card listener calls openPlayer(media)
  │   ├─ Builds Viduki URL: vidukiUrl(type, id, season, episode, apiVersion)
  │   ├─ Sets iframe src → viduki.net embed
  │   ├─ Shows player popup overlay (role="dialog", traps focus to close btn)
  │   ├─ Calls loadPlayerMeta() — fetches rating + runtime from TMDB
  │   └─ Creates/updates Continue Watching entry
  ├─ During playback, Viduki posts messages to parent window:
  │   ├─ MEDIA_DATA → throttled to localStorage every 2s
  │   │   └─ If progress >= 95% → removes from Continue Watching
  │   └─ viduki:all-servers-failed → auto-switches to next API variant
  └─ User closes player (Esc / X button / click outside)
      ├─ Clears iframe src
      ├─ Resets currentMedia state
      └─ Returns focus to the element that opened the player
```

## TV Episode Flow

```
User clicks a TV show card (or presses Enter/Space)
  └─ openEpisodePicker(showId)
      ├─ Shows modal with skeleton loading state
      ├─ Fetches show details from TMDB (cached per show in memory)
      ├─ Renders season buttons (aria-pressed on active) + episode list
      ├─ Locks body scroll while modal open
      └─ User clicks episode (or Enter/Space) → closeModal() then openPlayer({ type: 'tv', season, episode })
```

## Data Persistence

All state is `localStorage` — no backend:

| Key | Purpose |
|---|---|
| `vidukinet-ContinueWatching` | Array of in-progress media entries |
| `vidukinet-SelectedApi` | Last selected Viduki API variant (1-4) |
| `vidukinet-TMDBCache` | Cached TMDB responses with timestamps |
| `vidukinet-Progress` | Raw progress data from Viduki `postMessage` |

## External Dependencies (Runtime)

| Service | Role | Auth |
|---|---|---|
| TMDB API (`api.themoviedb.org`) | Metadata, search, posters, seasons | API key hardcoded in `config.js` |
| Viduki (`viduki.net`) | Video streaming, embedded in iframe | None (public embed URLs) |
