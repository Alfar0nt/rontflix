// ============================================
// GLOBAL LISTENERS & INITIALIZATION
// ============================================

// Throttled watch-progress persistence (at most once per 2s)
let pendingMediaData = null;

const flushProgress = throttle(() => {
    if (!pendingMediaData) return;
    try {
        localStorage.setItem('vidukinet-Progress', JSON.stringify(pendingMediaData));
    } catch (e) {
        console.warn('Could not save progress:', e);
    }

    if (currentMedia && currentMedia.id) {
        const progress = extractProgress(pendingMediaData, currentMedia);
        if (progress) {
            updateContinueEntry(currentMedia, progress);
            if (continueProgressPercent({ progress }) >= 95) {
                removeContinueEntry(currentMedia.id, currentMedia.type);
            }
        }
    }
}, 2000);

window.addEventListener('message', (event) => {
    if (event.origin !== 'https://viduki.net' && event.origin !== 'https://www.viduki.net') return;

    if (event.data?.type === 'MEDIA_DATA') {
        pendingMediaData = event.data.data;
        flushProgress();
    }

    if (event.data?.type === 'viduki:all-servers-failed') {
        const { status } = event.data;
        console.warn('Viduki servers failed:', event.data);

        const currentApi = parseInt(apiSelect.value);
        const nextApi = currentApi < 4 ? currentApi + 1 : 1;
        setStatus(`Stream failed (${status}). Switching to API ${nextApi}...`, 'error');

        if (currentMedia.id) {
            rebuildPlayerSrc(nextApi);
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal.classList.contains('show')) {
            closeModal();
        } else if (playerPopup.classList.contains('show')) {
            closePlayer();
        }
    }
});

apiSelect.addEventListener('change', () => {
    localStorage.setItem(API_SELECT_KEY, apiSelect.value);
});

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('load', () => {
    const savedApi = localStorage.getItem(API_SELECT_KEY);
    if (savedApi && savedApi >= '1' && savedApi <= '4') {
        apiSelect.value = savedApi;
    }

    setStatus('Search for a movie or TV show to get started.', '');
    initAuth();
    // NOTE: initWatchlist() is intentionally NOT called here. auth.js owns it
    // and triggers it only after checkSession() resolves, so currentUser is
    // correct before the D1 watchlist is fetched (avoids a stale logged-out guard).
    renderContinueWatching();
    loadRecommendations();
});
