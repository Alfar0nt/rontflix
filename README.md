# My Stream

A simple browser app that lets you search for movies and TV shows and play them.

## What it does

- You type a title into the search box.
- The app looks up matching movies and shows using the TMDB database.
- Results appear as a grid of posters.
- Clicking a movie opens it in a built-in player window.
- Clicking a TV show opens a picker where you choose a season and an episode.
- You can switch between several streaming sources (called APIs) while watching if one does not work.
- A "Continue Watching" row at the top shows what you have started, with a progress bar, so you can jump back in. No login needed.

## How it works

- `index.html` is the page structure (search bar, results grid, player popup, and episode picker).
- `script.js` handles everything: searching, showing results, opening the player, choosing episodes, and saving your watch progress.
- `style.css` handles the look and feel (dark theme, cards, popups).

## Setup

1. Open `script.js`.
2. Replace the TMDB API key in the `TMDB_API_KEY` line with your own key from the TMDB website.
3. Open `index.html` in a web browser. No build step or server is required.

## Notes

- Watch progress and the Continue Watching list are stored in your browser's local storage on this device only, with no account required.
- The app relies on external services (TMDB for search, Viduki for playback), so both must be online for it to work.
- Items in Continue Watching disappear automatically once they are roughly fully watched.

## TODO

- [x] Add a Continue Watching list for both movies and TV shows. It should work without a login account and save everyone's watching list locally.
- [ ] Improve the homepage by adding watching recommendations, such as "Just Released" and "Popular Right Now" rows loaded from TMDB, shown before the user searches.

### UI/UX ideas (static, no database)

- [ ] Add a "Trending" hero banner or top pick with a backdrop image and a play button.
- [ ] Add a "Recently Added" or "Upcoming" row alongside Just Released and Popular.
- [ ] Show a lightweight detail popup with rating, runtime, and a short trailer when a poster is hovered or selected.
- [ ] Add genre filters or a sort dropdown (by year, rating, popularity) on search results.
- [ ] Add keyboard shortcuts (arrows to move between cards, Enter to play, Esc to close) for a Netflix-like feel.
- [ ] Persist the last selected Viduki API so it is remembered on reload.
- [ ] Add a loading spinner instead of plain "Loading..." text.
- [ ] Debounce the search input so results update while typing, without pressing Search.
- [ ] Show a "No results" empty state with a friendly suggestion instead of a plain error line.
- [ ] Add a dark/light theme toggle, kept in local storage.
- [ ] Add paging or "Load more" on search results instead of a single page.
- [ ] Add a simple watch history page listing everything played, sorted by last watched.
