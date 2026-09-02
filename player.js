// ============================================
// PLAYER
// ============================================
let currentMedia = {
    id: null,
    type: null,
    title: null,
    season: null,
    episode: null,
    poster_path: null,
    year: ''
};

// Track where focus should return when player closes
let playerFocusReturn = null;

function openPlayer(media) {
    const apiVersion = apiSelect.value;
    const { id, type, title, season, episode } = media;
    const src = vidukiUrl(type, id, season, episode, apiVersion);

    if (!src) {
        setStatus('Invalid media selection.', 'error');
        return;
    }

    // Remember what had focus so we can restore it on close
    if (document.activeElement && document.activeElement !== document.body) {
        playerFocusReturn = document.activeElement;
    }

    // Store current media info
    currentMedia = {
        id,
        type,
        title,
        season,
        episode,
        poster_path: media.poster_path || null,
        year: media.year || ''
    };

    // Set iframe source and show popup
    playerIframe.src = src;
    playerTitle.textContent = title || 'Now Playing';
    popupApiInfo.textContent = `API ${apiVersion}`;
    playerPopup.classList.add('show');
    document.body.style.overflow = 'hidden';
    closePlayerBtn.focus();

    loadPlayerMeta({ id, type });
    updateContinueEntry(currentMedia, null);
    setStatus(`Now playing: ${title} using API ${apiVersion}`, '');
}

function closePlayer() {
    playerPopup.classList.remove('show');
    playerIframe.src = '';
    document.body.style.overflow = '';
    playerMeta.style.display = 'none';
    currentMedia = { id: null, type: null, title: null, season: null, episode: null, poster_path: null, year: '' };

    if (playerFocusReturn && document.contains(playerFocusReturn)) {
        playerFocusReturn.focus();
    }
    playerFocusReturn = null;
}

function rebuildPlayerSrc(apiVersion) {
    const { id, type, season, episode } = currentMedia;
    const src = vidukiUrl(type, id, season, episode, apiVersion);
    apiSelect.value = apiVersion;
    popupApiInfo.textContent = `API ${apiVersion}`;
    if (src) playerIframe.src = src;
}

function switchApi(direction) {
    if (!currentMedia.id) return;

    let currentApi = parseInt(apiSelect.value);
    let newApi = currentApi + direction;
    if (newApi < 1) newApi = 4;
    if (newApi > 4) newApi = 1;

    rebuildPlayerSrc(newApi);
}

// ============================================
// PLAYER META (rating & runtime below the video)
// ============================================
async function loadPlayerMeta(media) {
    playerMeta.style.display = 'none';
    try {
        const detail = await tmdbGet(`/${media.type}/${media.id}`);
        const rating = detail.vote_average;
        const runtime = media.type === 'movie'
            ? detail.runtime
            : (detail.episode_run_time && detail.episode_run_time[0]);

        let metaParts = [];
        if (rating) metaParts.push(`★ ${rating.toFixed(1)}`);
        if (runtime && runtime > 0) metaParts.push(formatRuntime(runtime));

        if (metaParts.length === 0) return;
        playerRating.textContent = metaParts[0];
        playerRuntime.textContent = metaParts[1] || '';
        playerMeta.style.display = 'flex';
    } catch (err) {
        console.warn('Could not load media details:', err);
    }
}

// ============================================
// POPUP PLAYER EVENT LISTENERS
// ============================================
closePlayerBtn.addEventListener('click', closePlayer);
playerPopup.addEventListener('click', (e) => {
    if (e.target === playerPopup) closePlayer();
});

popupApiPrev.addEventListener('click', () => switchApi(-1));
popupApiNext.addEventListener('click', () => switchApi(1));
