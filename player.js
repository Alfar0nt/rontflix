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

    // Show/hide episode navigation based on what's playing
    updateEpisodeNavButtons();

    loadPlayerMeta({ id, type });
    updateContinueEntry(currentMedia, null);
    if (typeof recordHistory === 'function') recordHistory(currentMedia);
    setStatus(`Now playing: ${title} using API ${apiVersion}`, '');
}

function closePlayer() {
    playerPopup.classList.remove('show');
    playerIframe.src = '';
    document.body.style.overflow = '';
    playerMeta.style.display = 'none';
    currentMedia = { id: null, type: null, title: null, season: null, episode: null, poster_path: null, year: '' };
    episodeNavLoading = false;
    updateEpisodeNavButtons();

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
// EPISODE NAVIGATION (prev / next episode)
// ============================================
let episodeNavLoading = false;

function currentShowName() {
    if (!currentMedia.title) return 'TV Show';
    return currentMedia.title.replace(/\s*-\s*S\d+E\d+\s*$/i, '') || 'TV Show';
}

function updateEpisodeNavButtons() {
    const isEpisode = currentMedia.type === 'tv'
        && currentMedia.id != null
        && currentMedia.season != null
        && currentMedia.episode != null;

    playerPrevEp.style.display = isEpisode ? '' : 'none';
    playerNextEp.style.display = isEpisode ? '' : 'none';
    const sep = document.querySelector('.player-controls-sep');
    if (sep) sep.style.display = isEpisode ? '' : 'none';

    if (isEpisode) {
        playerPrevEp.disabled = episodeNavLoading;
        playerNextEp.disabled = episodeNavLoading;
    }
}

async function playEpisodeNav(direction) {
    const { id, type, season, episode } = currentMedia;
    if (type !== 'tv' || !id || season == null || episode == null) return;
    if (episodeNavLoading) return;

    episodeNavLoading = true;
    playerPrevEp.disabled = true;
    playerNextEp.disabled = true;
    setStatus(`Loading ${direction > 0 ? 'next' : 'previous'} episode...`, '');

    try {
        let targetSeason = parseInt(season);
        let targetEpisode = parseInt(episode) + direction;

        // Clamp within the current season's bounds; cross seasons when needed
        const seasonData = await tmdbGet(`/tv/${id}/season/${targetSeason}`);
        const epsInSeason = (seasonData.episodes || []).length;

        if (targetEpisode < 1) {
            if (targetSeason <= 1) {
                setStatus('You are already on the first episode.', '');
                return;
            }
            const prevSeasonData = await tmdbGet(`/tv/${id}/season/${targetSeason - 1}`);
            const prevEps = (prevSeasonData.episodes || []).length;
            if (prevEps === 0) {
                setStatus('No previous episode available.', '');
                return;
            }
            targetSeason -= 1;
            targetEpisode = prevEps;
        } else if (targetEpisode > epsInSeason) {
            const nextSeasonData = await tmdbGet(`/tv/${id}/season/${targetSeason + 1}`);
            const nextEps = (nextSeasonData.episodes || []).length;
            if (nextEps === 0) {
                setStatus('You are already on the last episode.', '');
                return;
            }
            targetSeason += 1;
            targetEpisode = 1;
        }

        const showName = currentShowName();
        openPlayer({
            id,
            type: 'tv',
            title: `${showName} - S${targetSeason}E${targetEpisode}`,
            season: targetSeason,
            episode: targetEpisode,
            poster_path: currentMedia.poster_path,
            year: currentMedia.year
        });
    } catch (err) {
        console.error('Error navigating episodes:', err);
        setStatus('Could not load the adjacent episode.', 'error');
    } finally {
        episodeNavLoading = false;
        updateEpisodeNavButtons();
    }
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

playerPrevEp.addEventListener('click', () => playEpisodeNav(-1));
playerNextEp.addEventListener('click', () => playEpisodeNav(1));

// Keep nav buttons in sync when the API is switched mid-episode
playerPrevEp.style.display = 'none';
playerNextEp.style.display = 'none';

updateEpisodeNavButtons();
