// ============================================
// WATCHLIST — D1-backed, per logged-in user
// ============================================

// Map keyed by `${media_type}-${id}` → { tmdb_id, media_type, title, poster_path }
let watchlistItems = new Map();
let watchlistLoaded = false;

function watchKey(id, type) {
    return `${type}-${id}`;
}

function isInWatchlist(id, type) {
    return watchlistItems.has(watchKey(id, type));
}

// Current authenticated user (mirrors auth.js). Exposed so ui.js can guard the button.
function getWatchUser() {
    return typeof currentUser !== 'undefined' ? currentUser : null;
}

// Fetch the user's watchlist from D1 (only meaningful when logged in).
async function loadWatchlist() {
    const user = getWatchUser();
    if (!user) {
        watchlistItems = new Map();
        watchlistLoaded = true;
        renderWatchlistRow();
        return;
    }
    if (watchlistLoaded) return;

    try {
        const data = await api('/api/watchlist');
        watchlistItems = new Map(
            (data?.items || []).map(item => [watchKey(item.tmdb_id, item.media_type), item])
        );
        watchlistLoaded = true;
    } catch (err) {
        console.warn('Could not load watchlist:', err);
        watchlistItems = new Map();
        watchlistLoaded = true;
    }
    renderWatchlistRow();
}

// Refresh the in-watchlist button state across all currently-rendered cards.
function refreshWatchlistButtons() {
    document.querySelectorAll('.movie-card').forEach(card => {
        const btn = card.querySelector('.watch-btn');
        if (!btn) return;
        const inList = isInWatchlist(card.dataset.id, card.dataset.type);
        btn.classList.toggle('active', inList);
        btn.setAttribute('aria-pressed', String(inList));
        btn.textContent = inList ? '✓ Saved' : '+ Watchlist';
        btn.title = inList ? 'Remove from watchlist' : 'Add to watchlist';
    });
}

// Optimistic toggle: update UI immediately, then reconcile with the server.
async function toggleWatchlist(id, type, title, posterPath) {
    const user = getWatchUser();
    if (!user) {
        openAuthModal('login');
        setStatus('Sign in to save to your watchlist.', '');
        return;
    }

    const key = watchKey(id, type);
    const adding = !isInWatchlist(id, type);
    const item = { tmdb_id: Number(id), media_type: type, title, poster_path: posterPath || null };

    // Optimistic update
    if (adding) {
        watchlistItems.set(key, item);
    } else {
        watchlistItems.delete(key);
    }
    refreshWatchlistButtons();

    try {
        if (adding) {
            await api('/api/watchlist', {
                method: 'POST',
                body: JSON.stringify(item),
            });
        } else {
            await api(`/api/watchlist?tmdb_id=${encodeURIComponent(id)}&media_type=${encodeURIComponent(type)}`, {
                method: 'DELETE',
            });
        }
    } catch (err) {
        // Roll back on failure
        if (adding) watchlistItems.delete(key);
        else watchlistItems.set(key, item);
        refreshWatchlistButtons();
        setStatus(err.message || 'Could not update watchlist.', 'error');
        return;
    }

    setStatus(adding ? `Added "${title}" to your watchlist.` : `Removed "${title}" from your watchlist.`, 'success');
    renderWatchlistRow();
}

// ============================================
// HOMEPAGE WATCHLIST ROW
// ============================================
const watchlistSection = document.getElementById('watchlistSection');
const watchlistContainer = document.getElementById('watchlistContainer');

function renderWatchlistRow() {
    if (!watchlistSection || !watchlistContainer) return;

    // Guard: when logged out, don't leak/serve the watchlist — show a
    // sign-in prompt instead of the saved items.
    const user = getWatchUser();
    if (!user) {
        watchlistItems = new Map();
        watchlistSection.style.display = 'block';
        watchlistSection.setAttribute('aria-label', 'My watchlist - sign in required');
        watchlistSection.classList.remove('has-items');
        watchlistSection.classList.add('is-guarded');
        watchlistContainer.className = 'watchlist-guard';
        watchlistContainer.innerHTML = `
        <p class="watchlist-guard-text" role="status">Sign in to save your watchlist and keep it in sync across your devices.</p>
        <button type="button" class="watchlist-guard-btn" data-open-login="true">Sign in</button>`;
        refreshWatchlistButtons();
        return;
    }

    const items = Array.from(watchlistItems.values());
    if (items.length === 0) {
        watchlistSection.style.display = 'none';
        watchlistContainer.className = 'watchlist-grid';
        watchlistContainer.innerHTML = '';
        return;
    }

    watchlistSection.style.display = 'block';
    watchlistSection.setAttribute('aria-label', 'My watchlist');
    watchlistSection.classList.add('has-items');
    watchlistSection.classList.remove('is-guarded');
    watchlistContainer.className = 'watchlist-grid';
    watchlistContainer.innerHTML = items.map(item => {
        const safePoster = escapeHtml(item.poster_path || '');
        const safeTitle = escapeHtml(item.title);
        const typeLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
        const poster = safePoster ? `${IMG_BASE}${safePoster}` : POSTER_PLACEHOLDER;

        return `
        <article class="movie-card" data-id="${item.tmdb_id}" data-type="${item.media_type}" data-title="${safeTitle}" data-poster="${safePoster}" data-year="" tabindex="0" role="button" aria-label="Play ${safeTitle} (${typeLabel})">
        ${watchButtonHTML(item.tmdb_id, item.media_type, item.title, item.poster_path)}
        <img src="${poster}" alt="${safeTitle}" loading="lazy" decoding="async" />
        <div class="info">
        <div class="title">${safeTitle}</div>
        <div class="sub">${typeLabel}</div>
        </div>
        </article>
        `;
    }).join('');

    bindCardEvents(watchlistContainer);
    refreshWatchlistButtons();
}

// Button used inside a media card (also rendered by ui.js mediaCardHTML).
function watchButtonHTML(id, type, title, posterPath) {
    const inList = isInWatchlist(id, type);
    return `
    <button class="watch-btn${inList ? ' active' : ''}" data-watch-id="${id}" data-watch-type="${type}" data-watch-title="${escapeHtml(title || '')}" data-watch-poster="${escapeHtml(posterPath || '')}" aria-pressed="${inList}" title="${inList ? 'Remove from watchlist' : 'Add to watchlist'}" aria-label="Watchlist">${inList ? '✓ Saved' : '+ Watchlist'}</button>
    `;
}

// ============================================
// DELEGATED CLICK HANDLING
// ============================================
document.addEventListener('click', (e) => {
    const loginBtn = e.target.closest('[data-open-login="true"]');
    if (loginBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof openAuthModal === 'function') openAuthModal('login');
        return;
    }

    const btn = e.target.closest('.watch-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    toggleWatchlist(
        btn.dataset.watchId,
        btn.dataset.watchType,
        btn.dataset.watchTitle,
        btn.dataset.watchPoster
    );
});

// ============================================
// INIT (called from app.js on load)
// ============================================
function initWatchlist() {
    // Reset so each auth-state change (login, logout, session-restore) re-syncs
    // from the current user instead of trusting a stale flag from a prior state.
    watchlistLoaded = false;
    loadWatchlist().then(refreshWatchlistButtons);
}