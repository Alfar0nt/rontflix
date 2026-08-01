// ============================================
// CONFIGURATION
// ============================================
// 🔑 IMPORTANT: Replace with your actual TMDB API key
const TMDB_API_KEY = 'c3d81bd297b16637076c17d7d3cd8a79';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w200';

// DOM References
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const statusMsg = document.getElementById('statusMessage');
const apiSelect = document.getElementById('apiSelect');

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
    episode: null
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
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"%3E%3Crect width="200" height="300" fill="%23222"/%3E%3Ctext x="100" y="150" font-family="sans-serif" font-size="16" fill="%23666" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';

        const typeLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
        const badge = item.media_type === 'tv' ? `<div class="badge">TV Series</div>` : '';

        return `
        <div class="movie-card" data-id="${item.id}" data-type="${item.media_type}" data-title="${title.replace(/"/g, '&quot;')}">
        <img src="${poster}" alt="${title}" loading="lazy" />
        <div class="info">
        <div class="title">${title}</div>
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

            if (type === 'tv') {
                openEpisodePicker(id, title);
            } else {
                openPlayer(id, 'movie', title);
            }
        });
    });
}

// ============================================
// OPEN POPUP PLAYER
// ============================================
function openPlayer(id, type, title, season = null, episode = null) {
    const apiVersion = apiSelect.value;

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
    currentMedia = { id, type, title, season, episode };

    // Set iframe source and show popup
    playerIframe.src = src;
    playerTitle.textContent = title || 'Now Playing';
    popupApiInfo.textContent = `API ${apiVersion}`;
    playerPopup.classList.add('show');
    document.body.style.overflow = 'hidden';

    setStatus(`Now playing: ${title} using API ${apiVersion}`, '');
}

// ============================================
// CLOSE POPUP PLAYER
// ============================================
function closePlayer() {
    playerPopup.classList.remove('show');
    playerIframe.src = '';
    document.body.style.overflow = '';
    currentMedia = { id: null, type: null, title: null, season: null, episode: null };
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
async function openEpisodePicker(tmdbId, showTitle) {
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
        openPlayer(tmdbId, 'tv', `${showTitle} - S1E1`, 1, 1);
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
    const genres = show.genres ? show.genres.map(g => g.name).join(', ') : '';
    const overview = show.overview || 'No overview available.';

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
    ${poster ? `<img src="${poster}" alt="${show.name}" style="width:120px; height:180px; object-fit:cover; border-radius:8px;" />` : ''}
    <div style="flex:1; min-width:200px;">
    <div class="modal-show-title">${show.name}</div>
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

        const savedProgress = JSON.parse(localStorage.getItem('vidukinet-Progress') || '{}');
        const showProgress = savedProgress[tmdbId]?.show_progress || {};

        let episodesHtml = episodes.map(ep => {
            const epKey = `s${seasonNumber}e${ep.episode_number}`;
            const progress = showProgress[epKey];
            const isWatched = progress && progress.progress && progress.progress.watched > 0;
            const watchedPercent = isWatched ? Math.round((progress.progress.watched / progress.progress.duration) * 100) : 0;

            return `
            <div class="episode-item" data-season="${seasonNumber}" data-episode="${ep.episode_number}">
            <div class="ep-number">E${ep.episode_number}</div>
            <div class="ep-title">
            <span class="ep-name">${ep.name || `Episode ${ep.episode_number}`}</span>
            <span class="ep-sub">${ep.air_date || 'Unknown date'}${ep.runtime ? ` • ${ep.runtime}m` : ''}</span>
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
                closeModal();
                openPlayer(tmdbId, 'tv', title, season, episode);
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
// WATCH PROGRESS & FALLBACK LISTENERS
// ============================================
window.addEventListener('message', (event) => {
    if (event.origin !== 'https://viduki.net' && event.origin !== 'https://www.viduki.net') return;

        if (event.data?.type === 'MEDIA_DATA') {
            const mediaData = event.data.data;
            try {
                localStorage.setItem('vidukinet-Progress', JSON.stringify(mediaData));
                console.log('✅ Progress saved:', mediaData);
            } catch (e) {
                console.warn('Could not save progress:', e);
            }
        }

        if (event.data?.type === 'viduki:all-servers-failed') {
            const { media, stage, status, message } = event.data;
            console.warn('⚠️ Viduki servers failed:', { media, stage, status, message });

            const currentApi = parseInt(apiSelect.value);
            const nextApi = currentApi < 4 ? currentApi + 1 : 1;
            setStatus(`⚠️ Stream failed (${status}). Switching to API ${nextApi}...`, 'error');

            if (currentMedia.id) {
                apiSelect.value = nextApi;
                popupApiInfo.textContent = `API ${nextApi}`;
                const { id, type, title, season, episode } = currentMedia;
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
});
