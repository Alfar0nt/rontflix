// ============================================
// TMDB API LAYER
// ============================================
function getTMDBCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function setTMDBCache(cache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Could not save TMDB cache:', e);
    }
}

async function tmdbGet(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    // Requests go to the local /api/tmdb Pages Function, which injects the
    // secret API key server-side so no key is exposed in the browser bundle.
    const url = `${TMDB_BASE}?path=${encodeURIComponent(path)}${query ? '&' + query : ''}`;

    // Serve from cache when fresh
    const cache = getTMDBCache();
    const cached = cache[url];
    if (cached && Date.now() - cached.t < CACHE_TTL) {
        return cached.data;
    }

    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const err = new Error(`TMDB error (${res.status})`);
                err.status = res.status;
                throw err;
            }
            const data = await res.json();

            cache[url] = { t: Date.now(), data };
            const urls = Object.keys(cache);
            if (urls.length > 60) delete cache[urls[0]];
            setTMDBCache(cache);

            return data;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

// Builds a Viduki streaming URL for a media item
function vidukiUrl(type, id, season, episode, api) {
    if (type === 'movie') return `https://viduki.net/${api}/movie/${id}`;
    if (type === 'tv' && season && episode) return `https://viduki.net/${api}/tv/${id}/${season}/${episode}`;
    return '';
}
