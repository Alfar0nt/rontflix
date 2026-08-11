// ============================================
// CONFIGURATION
// ============================================
// 🔑 IMPORTANT: Replace with your actual TMDB API key
const TMDB_API_KEY = 'c3d81bd297b16637076c17d7d3cd8a79';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w200';
const POSTER_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23222"/%3E%3Ctext x="100" y="150" font-family="sans-serif" font-size="16" fill="%23666" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
const CONTINUE_KEY = 'vidukinet-ContinueWatching';

// DOM References
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const statusMsg = document.getElementById('statusMessage');
const apiSelect = document.getElementById('apiSelect');

// Continue Watching References
const continueSection = document.getElementById('continueSection');
const continueContainer = document.getElementById('continueContainer');

// Popup Player References
const playerPopup = document.getElementById('playerPopup');
const playerIframe = document.getElementById('playerIframe');
const playerTitle = document.getElementById('playerTitle');
const closePlayerBtn = document.getElementById('closePlayer');
const popupApiInfo = document.getElementById('popupApiInfo');
const popupApiPrev = document.getElementById('popupApiPrev');
const popupApiNext = document.getElementById('popupApiNext');

// Modal References
const modal = document.getElementById('episodeModal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');

// State
let currentShowData = null;
let selectedSeason = 1;
let currentMedia = {
    id: null,
    type: null,
    title: null,
    season: null,
    episode: null,
    poster_path: null,
    year: ''
};

// Cache for TV show details to avoid repeated API calls
const showCache = {};

// ============================================
// SEARCH FUNCTION
// ============================================
async function searchMedia(query) {
    if (!query.trim()) {
        setStatus('Please enter a title.', 'error');
        return;
    }

    setStatus(`Searching for "${query}"...`, '');
    resultsContainer.innerHTML = '<div class="loading-placeholder">Loading...</div>';

    try {
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`),
                                                    fetch(`${TMDB_BASE}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`)
        ]);

        if (!movieRes.ok || !tvRes.ok) throw new Error('TMDB API error');

        const movieData = await movieRes.json();
        const tvData = await tvRes.json();

        let results = [
            ...movieData.results.map(item => ({ ...item, media_type: 'movie' })),
            ...tvData.results.map(item => ({ ...item, media_type: 'tv' }))
        ];
        results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="loading-placeholder">No results found.</div>';
            setStatus('No results found.', 'error');
            return;
        }

        setStatus(`Found ${results.length} results. Click a poster to play.`, '');
        renderResults(results);
    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = '';
        setStatus(`Search error: ${err.message}`, 'error');
    }
}

// ============================================
// RENDER RESULTS
// ============================================
function renderResults(items) {
    resultsContainer.innerHTML = items.map(item => {
        const title = item.title || item.name || 'Untitled';
        const year = item.release_date ? item.release_date.substring(0, 4) :
        item.first_air_date ? item.first_air_date.substring(0, 4) : '';
        const poster = item.poster_path ?
        `${IMG_BASE}${item.poster_path}` :
        POSTER_PLACEHOLDER;

        const typeLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
        const badge = item.media_type === 'tv' ? `<div class="badge">TV Series</div>` : '';
        const safeTitle = escapeHtml(title);

        return `
        <div class="movie-card" data-id="${item.id}" data-type="${item.media_type}" data-title="${safeTitle}" data-poster="${item.poster_path || ''}" data-year="${year}">
        <img src="${poster}" alt="${safeTitle}" loading="lazy" />
        <div class="info">
        <div class="title">${safeTitle}</div>
        <div class="sub">${year} • ${typeLabel}</div>
        ${badge}
        </div>
        </div>
        `;
    }).join('');

    document.querySelectorAll('.movie-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const type = card.dataset.type;
            const title = card.dataset.title;
            const posterPath = card.dataset.poster || '';
            const year = card.dataset.year || '';

            if (type === 'tv') {
                openEpisodePicker(id, title, posterPath, year);
            } else {
                openPlayer({ id, type: 'movie', title, poster_path: posterPath, year });
            }
        });
    });
}

// ============================================
// OPEN POPUP PLAYER
// ============================================
function openPlayer(media) {
    const apiVersion = apiSelect.value;
    const { id, type, title, season, episode } = media;

    // Build the correct Viduki URL format
    let src = '';
    if (type === 'movie') {
        src = `https://viduki.net/${apiVersion}/movie/${id}`;
    } else if (type === 'tv' && season && episode) {
        src = `https://viduki.net/${apiVersion}/tv/${id}/${season}/${episode}`;
    } else {
        setStatus('Invalid media selection.', 'error');
        return;
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

    updateContinueEntry(currentMedia, null);
    setStatus(`Now playing: ${title} using API ${apiVersion}`, '');
}

// ============================================
// CLOSE POPUP PLAYER
// ============================================
function closePlayer() {
    playerPopup.classList.remove('show');
    playerIframe.src = '';
    document.body.style.overflow = '';
    currentMedia = { id: null, type: null, title: null, season: null, episode: null, poster_path: null, year: '' };
}

// ============================================
// SWITCH API IN POPUP
// ============================================
function switchApi(direction) {
    if (!currentMedia.id) return;

    let currentApi = parseInt(apiSelect.value);
    let newApi = currentApi + direction;

    if (newApi < 1) newApi = 4;
    if (newApi > 4) newApi = 1;

    apiSelect.value = newApi;
    popupApiInfo.textContent = `API ${newApi}`;

    // Reload with new API
    const { id, type, title, season, episode } = currentMedia;
    let src = '';
    if (type === 'movie') {
        src = `https://viduki.net/${newApi}/movie/${id}`;
    } else if (type === 'tv' && season && episode) {
        src = `https://viduki.net/${newApi}/tv/${id}/${season}/${episode}`;
    }
    playerIframe.src = src;
}

// ============================================
// EPISODE PICKER (FIXED - No /seasons endpoint)
// ============================================
async function openEpisodePicker(tmdbId, showTitle, posterPath = '', year = '') {
    try {
        setStatus(`Loading ${showTitle}...`, '');

        // Check cache first
        if (showCache[tmdbId]) {
            currentShowData = showCache[tmdbId];
            buildModalFromShow(currentShowData);
            return;
        }

        // Fetch show details - this includes season information
        const detailRes = await fetch(
            `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
        );
        if (!detailRes.ok) {
            throw new Error(`Show not found (${detailRes.status})`);
        }
        const showData = await detailRes.json();

        // Cache the result
        showCache[tmdbId] = showData;
        currentShowData = showData;

        buildModalFromShow(showData);

        setStatus(`Select an episode of ${showTitle}`, '');
    } catch (err) {
        console.error('Error loading show:', err);
        setStatus(`Error loading show: ${err.message}`, 'error');
        // Still try to open the player with season 1, episode 1 as fallback
        setStatus(`Could not load seasons. Trying to play ${showTitle} S1E1...`, 'error');
        openPlayer({ id: tmdbId, type: 'tv', title: `${showTitle} - S1E1`, season: 1, episode: 1, poster_path: posterPath, year });
    }
}

function buildModalFromShow(show) {
    // Build modal content from show data
    modalBody.innerHTML = buildModalContent(show);
    modal.classList.add('show');

    // Get seasons from the show data
    const seasons = show.seasons || [];
    const regularSeasons = seasons.filter(s => s.season_number > 0);

    if (regularSeasons.length > 0) {
        selectedSeason = regularSeasons[0].season_number;
        renderEpisodesFromShow(show.id, selectedSeason);
    } else {
        // If no seasons found, try season 1 directly
        selectedSeason = 1;
        renderEpisodesFromShow(show.id, 1);
    }
}

function buildModalContent(show) {
    const poster = show.poster_path ?
    `${IMG_BASE}${show.poster_path}` :
    '';

    const year = show.first_air_date ? show.first_air_date.substring(0, 4) : 'Unknown';
    const safeName = escapeHtml(show.name);
    const genres = show.genres ? show.genres.map(g => escapeHtml(g.name)).join(', ') : '';
    const overview = escapeHtml(show.overview) || 'No overview available.';

    // Build season buttons from show.seasons
    const seasons = show.seasons || [];
    const regularSeasons = seasons.filter(s => s.season_number > 0);

    let seasonButtons = regularSeasons.map(s => `
    <button class="season-btn" data-season="${s.season_number}">
    Season ${s.season_number} ${s.episode_count ? `(${s.episode_count} eps)` : ''}
    </button>
    `).join('');

    if (!seasonButtons) {
        seasonButtons = '<span class="no-episodes">No seasons available</span>';
    }

    return `
    <div style="display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap;">
    ${poster ? `<img src="${poster}" alt="${safeName}" style="width:120px; height:180px; object-fit:cover; border-radius:8px;" />` : ''}
    <div style="flex:1; min-width:200px;">
    <div class="modal-show-title">${safeName}</div>
    <div class="modal-show-meta">${year} • ${genres}</div>
    <div class="modal-overview">${overview}</div>
    </div>
    </div>
    <div class="season-selector" id="seasonSelector">
    ${seasonButtons}
    </div>
    <div id="episodeContainer">
    <div class="loading-placeholder">Loading episodes...</div>
    </div>
    `;
}

async function renderEpisodesFromShow(tmdbId, seasonNumber) {
    const container = document.getElementById('episodeContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading-placeholder">Loading episodes...</div>';

    try {
        // Fetch season details
        const res = await fetch(
            `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
        );
        if (!res.ok) {
            // If season not found, try to get episodes from the show's seasons array
            if (currentShowData && currentShowData.seasons) {
                const season = currentShowData.seasons.find(s => s.season_number === seasonNumber);
                if (season && season.episode_count === 0) {
                    container.innerHTML = '<div class="no-episodes">No episodes available for this season.</div>';
                    return;
                }
            }
            throw new Error(`Season ${seasonNumber} not found`);
        }
        const seasonData = await res.json();

        const episodes = seasonData.episodes || [];

        if (episodes.length === 0) {
            container.innerHTML = '<div class="no-episodes">No episodes found for this season.</div>';
            return;
        }

        let savedProgress = {};
        try {
            savedProgress = JSON.parse(localStorage.getItem('vidukinet-Progress') || '{}') || {};
        } catch (e) {
            console.warn('Could not parse saved progress:', e);
        }
        const showProgress = savedProgress[tmdbId]?.show_progress || {};

        let episodesHtml = episodes.map(ep => {
            const epKey = `s${seasonNumber}e${ep.episode_number}`;
            const progress = showProgress[epKey];
            const isWatched = progress && progress.progress && progress.progress.watched > 0;
            const progressDuration = progress?.progress?.duration;
            const watchedPercent = isWatched && progressDuration > 0
                ? Math.round((progress.progress.watched / progressDuration) * 100)
                : 0;
            const epName = escapeHtml(ep.name) || `Episode ${ep.episode_number}`;
            const epAirDate = escapeHtml(ep.air_date) || 'Unknown date';
            const epRuntime = ep.runtime ? ` • ${escapeHtml(String(ep.runtime))}m` : '';

            return `
            <div class="episode-item" data-season="${seasonNumber}" data-episode="${ep.episode_number}">
            <div class="ep-number">E${ep.episode_number}</div>
            <div class="ep-title">
            <span class="ep-name">${epName}</span>
            <span class="ep-sub">${epAirDate}${epRuntime}</span>
            </div>
            ${isWatched ? `<div class="ep-watched">${watchedPercent}%</div>` : ''}
            </div>
            `;
        }).join('');

        container.innerHTML = `<div class="episode-grid">${episodesHtml}</div>`;

        document.querySelectorAll('.episode-item').forEach(item => {
            item.addEventListener('click', () => {
                const season = item.dataset.season;
                const episode = item.dataset.episode;
                const title = `${currentShowData?.name || 'TV Show'} - S${season}E${episode}`;
                const showPoster = currentShowData?.poster_path || '';
                const showYear = currentShowData?.first_air_date ? currentShowData.first_air_date.substring(0, 4) : '';
                closeModal();
                openPlayer({ id: tmdbId, type: 'tv', title, season, episode, poster_path: showPoster, year: showYear });
            });
        });

        // Update active season button
        document.querySelectorAll('.season-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.season) === seasonNumber);
        });

    } catch (err) {
        console.error('Error loading episodes:', err);
        container.innerHTML = `<div class="no-episodes">Error loading episodes: ${err.message}. Try selecting a different season.</div>`;
    }
}

// ============================================
// MODAL CONTROLS
// ============================================
function closeModal() {
    modal.classList.remove('show');
    modalBody.innerHTML = '';
    currentShowData = null;
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closePlayer();
    }
});

// ============================================
// EVENT DELEGATION FOR SEASON BUTTONS
// ============================================
modalBody.addEventListener('click', (e) => {
    const seasonBtn = e.target.closest('.season-btn');
    if (seasonBtn && currentShowData) {
        const season = parseInt(seasonBtn.dataset.season);
        selectedSeason = season;
        renderEpisodesFromShow(currentShowData.id, season);
    }
});

// ============================================
// POPUP PLAYER EVENT LISTENERS
// ============================================
closePlayerBtn.addEventListener('click', closePlayer);
playerPopup.addEventListener('click', (e) => {
    if (e.target === playerPopup) closePlayer();
});

popupApiPrev.addEventListener('click', () => switchApi(-1));
popupApiNext.addEventListener('click', () => switchApi(1));

// ============================================
// CONTINUE WATCHING
// ============================================
function getContinueData() {
    try {
        return JSON.parse(localStorage.getItem(CONTINUE_KEY) || '{}') || {};
    } catch (e) {
        return {};
    }
}

function saveContinueData(data) {
    try {
        localStorage.setItem(CONTINUE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save continue watching:', e);
    }
}

function updateContinueEntry(media, progress) {
    if (!media || !media.id || !media.type) return;

    const data = getContinueData();
    const key = `${media.type}-${media.id}`;
    const existing = data[key] || {};

    data[key] = {
        id: media.id,
        type: media.type,
        title: media.title || existing.title || 'Untitled',
        season: media.season || existing.season || null,
        episode: media.episode || existing.episode || null,
        poster_path: media.poster_path || existing.poster_path || null,
        year: media.year || existing.year || '',
        timestamp: Date.now(),
        progress: progress || existing.progress || null
    };

    saveContinueData(data);
    renderContinueWatching();
}

function removeContinueEntry(id, type) {
    const data = getContinueData();
    delete data[`${type}-${id}`];
    saveContinueData(data);
    renderContinueWatching();
}

function continueProgressPercent(entry) {
    if (!entry || !entry.progress || !(entry.progress.duration > 0)) return 0;
    return Math.min(100, Math.round((entry.progress.watched / entry.progress.duration) * 100));
}

function extractProgress(mediaData, media) {
    if (!mediaData || !media || !media.id) return null;
    const entry = mediaData[media.id];
    if (!entry) return null;

    if (media.type === 'tv' && media.season && media.episode) {
        const ep = entry.show_progress?.[`s${media.season}e${media.episode}`];
        const p = ep?.progress;
        return p && typeof p.watched === 'number' && typeof p.duration === 'number' ? p : null;
    }

    if (media.type === 'movie') {
        const p = entry.movie_progress || entry.progress;
        return p && typeof p.watched === 'number' && typeof p.duration === 'number' ? p : null;
    }

    return null;
}

function renderContinueWatching() {
    const data = getContinueData();
    const entries = Object.values(data).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (entries.length === 0) {
        continueSection.style.display = 'none';
        continueContainer.innerHTML = '';
        return;
    }

    continueSection.style.display = 'block';
    continueContainer.innerHTML = entries.slice(0, 12).map(entry => {
        const poster = entry.poster_path ? `${IMG_BASE}${entry.poster_path}` : POSTER_PLACEHOLDER;
        const safeTitle = escapeHtml(entry.title);
        const pct = continueProgressPercent(entry);
        const typeLabel = entry.type === 'tv' ? 'TV' : 'Movie';
        const epLabel = entry.type === 'tv' && entry.season ? ` • S${entry.season}E${entry.episode}` : '';

        return `
        <div class="continue-card" data-id="${entry.id}" data-type="${entry.type}" data-title="${safeTitle}" data-poster="${entry.poster_path || ''}" data-year="${entry.year}" data-season="${entry.season || ''}" data-episode="${entry.episode || ''}">
        <button class="continue-remove" data-remove-id="${entry.id}" data-remove-type="${entry.type}" title="Remove from list">×</button>
        <img src="${poster}" alt="${safeTitle}" loading="lazy" />
        <div class="info">
        <div class="title">${safeTitle}</div>
        <div class="sub">${typeLabel}${epLabel}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        </div>
        `;
    }).join('');
}

continueContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.continue-remove');
    if (removeBtn) {
        e.stopPropagation();
        removeContinueEntry(removeBtn.dataset.removeId, removeBtn.dataset.removeType);
        return;
    }

    const card = e.target.closest('.continue-card');
    if (!card) return;

    const id = card.dataset.id;
    const type = card.dataset.type;
    const title = card.dataset.title;
    const posterPath = card.dataset.poster || '';
    const year = card.dataset.year || '';

    if (type === 'tv') {
        openPlayer({
            id,
            type: 'tv',
            title: `${title} - S${card.dataset.season}E${card.dataset.episode}`,
            season: card.dataset.season,
            episode: card.dataset.episode,
            poster_path: posterPath,
            year
        });
    } else {
        openPlayer({ id, type: 'movie', title, poster_path: posterPath, year });
    }
});

// ============================================
// WATCH PROGRESS & FALLBACK LISTENERS
// ============================================
window.addEventListener('message', (event) => {
    if (event.origin !== 'https://viduki.net' && event.origin !== 'https://www.viduki.net') return;

    if (event.data?.type === 'MEDIA_DATA') {
        const mediaData = event.data.data;
        try {
            localStorage.setItem('vidukinet-Progress', JSON.stringify(mediaData));
            console.log('Progress saved:', mediaData);
        } catch (e) {
            console.warn('Could not save progress:', e);
        }

        if (currentMedia && currentMedia.id) {
            const progress = extractProgress(mediaData, currentMedia);
            if (progress) {
                updateContinueEntry(currentMedia, progress);
                if (continueProgressPercent({ progress }) >= 95) {
                    removeContinueEntry(currentMedia.id, currentMedia.type);
                }
            }
        }
    }

    if (event.data?.type === 'viduki:all-servers-failed') {
        const { media, stage, status, message } = event.data;
        console.warn('Viduki servers failed:', { media, stage, status, message });

        const currentApi = parseInt(apiSelect.value);
        const nextApi = currentApi < 4 ? currentApi + 1 : 1;
        setStatus(`Stream failed (${status}). Switching to API ${nextApi}...`, 'error');

        if (currentMedia.id) {
            apiSelect.value = nextApi;
            popupApiInfo.textContent = `API ${nextApi}`;
            const { id, type, season, episode } = currentMedia;
            let src = '';
            if (type === 'movie') {
                src = `https://viduki.net/${nextApi}/movie/${id}`;
            } else if (type === 'tv' && season && episode) {
                src = `https://viduki.net/${nextApi}/tv/${id}/${season}/${episode}`;
            }
            playerIframe.src = src;
        }
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setStatus(text, type = '') {
    statusMsg.textContent = text;
    statusMsg.className = 'info-msg' + (type ? ' ' + type : '');
}

// ============================================
// EVENT LISTENERS
// ============================================
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
});

searchBtn.addEventListener('click', () => searchMedia(searchInput.value));

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('load', () => {
    setStatus('Search for a movie or TV show to get started.', '');
    renderContinueWatching();
});
