// ============================================
// CONFIGURATION
// ============================================
// IMPORTANT: Replace with your actual TMDB API key
const TMDB_API_KEY = 'c3d81bd297b16637076c17d7d3cd8a79';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const IMG_BASE_SMALL = 'https://image.tmdb.org/t/p/w200';
const POSTER_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23222"/%3E%3Ctext x="100" y="150" font-family="sans-serif" font-size="16" fill="%23666" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';

// Local storage keys
const API_SELECT_KEY = 'vidukinet-SelectedApi';
const CACHE_KEY = 'vidukinet-TMDBCache';
const CACHE_TTL = 10 * 60 * 1000;

// Recommendation rows show this many cards
const ROW_SIZE = 20;
