// ============================================
// EPISODE PICKER / TV SHOW MODAL
// ============================================
let currentShowData = null;
let selectedSeason = 1;

// In-memory cache for TV show details to avoid repeated API calls
const showCache = {};

async function openEpisodePicker(tmdbId, showTitle, posterPath = '', year = '') {
    try {
        setStatus(`Loading ${showTitle}...`, '');
        modalBody.innerHTML = '<div class="modal-show-title">Loading...</div>' + Array(5).fill('').map(() => skeletonCardHTML()).join('');
        modal.classList.add('show');

        // Check cache first
        if (showCache[tmdbId]) {
            currentShowData = showCache[tmdbId];
            buildModalFromShow(currentShowData);
            return;
        }

        // Fetch show details - this includes season information
        const showData = await tmdbGet(`/tv/${tmdbId}`);

        // Cache the result
        showCache[tmdbId] = showData;
        currentShowData = showData;

        buildModalFromShow(showData);

        setStatus(`Select an episode of ${showTitle}`, '');
    } catch (err) {
        console.error('Error loading show:', err);
        if (modal.classList.contains('show')) closeModal();
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
    document.body.style.overflow = 'hidden';

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
    <button class="season-btn" data-season="${s.season_number}" type="button">
    Season ${s.season_number} ${s.episode_count ? `(${s.episode_count} eps)` : ''}
    </button>
    `).join('');

    if (!seasonButtons) {
        seasonButtons = '<span class="no-episodes">No seasons available</span>';
    }

    return `
    <div class="modal-show-head">
    ${poster ? `<img src="${poster}" alt="${safeName}" class="modal-show-poster" loading="lazy" decoding="async" />` : ''}
    <div class="modal-show-body">
    <div class="modal-show-title">${safeName}</div>
    <div class="modal-show-meta">${year} • ${genres}</div>
    <div class="modal-overview">${overview}</div>
    </div>
    </div>
    <div class="season-selector" id="seasonSelector">
    ${seasonButtons}
    </div>
    <div id="episodeContainer">
    <div class="no-episodes">Loading episodes...</div>
    </div>
    `;
}

async function renderEpisodesFromShow(tmdbId, seasonNumber) {
    const container = document.getElementById('episodeContainer');
    if (!container) return;

    container.innerHTML = '<div class="no-episodes">Loading episodes...</div>';
    container.setAttribute('aria-busy', 'true');

    try {
        // Fetch season details
        const seasonData = await tmdbGet(`/tv/${tmdbId}/season/${seasonNumber}`);
        const episodes = seasonData.episodes || [];

        if (episodes.length === 0) {
            container.innerHTML = '<div class="no-episodes">No episodes found for this season.</div>';
            container.setAttribute('aria-busy', 'false');
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
            <div class="episode-item" data-season="${seasonNumber}" data-episode="${ep.episode_number}" tabindex="0" role="button" aria-label="Play episode ${ep.episode_number} ${epName}">
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

        function playEpisode(item) {
            const season = item.dataset.season;
            const episode = item.dataset.episode;
            const title = `${currentShowData?.name || 'TV Show'} - S${season}E${episode}`;
            const showPoster = currentShowData?.poster_path || '';
            const showYear = currentShowData?.first_air_date ? currentShowData.first_air_date.substring(0, 4) : '';
            closeModal();
            openPlayer({ id: tmdbId, type: 'tv', title, season, episode, poster_path: showPoster, year: showYear });
        }

        document.querySelectorAll('.episode-item').forEach(item => {
            item.addEventListener('click', () => playEpisode(item));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    playEpisode(item);
                }
            });
        });

        // Update active season button
        document.querySelectorAll('.season-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.season) === seasonNumber);
            btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
        });

        container.setAttribute('aria-busy', 'false');

    } catch (err) {
        // If the season was not found, fall back to the show's season list
        if (err.status === 404 && currentShowData && currentShowData.seasons) {
            const season = currentShowData.seasons.find(s => s.season_number === seasonNumber);
            if (season && season.episode_count === 0) {
                container.innerHTML = '<div class="no-episodes">No episodes available for this season.</div>';
                container.setAttribute('aria-busy', 'false');
                return;
            }
        }
        console.error('Error loading episodes:', err);
        container.innerHTML = `<div class="no-episodes">Error loading episodes: ${err.message}. Try selecting a different season.</div>`;
        container.setAttribute('aria-busy', 'false');
    }
}

// ============================================
// MODAL CONTROLS
// ============================================
function closeModal() {
    modal.classList.remove('show');
    modalBody.innerHTML = '';
    currentShowData = null;
    document.body.style.overflow = '';
}
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
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
