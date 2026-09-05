// ============================================
// TITLE DETAIL VIEW
// A dedicated page-like overlay for a movie or TV show:
// hero (poster + meta + overview + play), an inline
// episode/season picker for TV, and similar titles.
// Clicking a card now lands here instead of going
// straight to the video player.
// ============================================
let detailState = {
    id: null,
    type: null,
    showName: '',
    posterPath: '',
    year: '',
    season: null,
    episode: null
};

let detailFocusReturn = null;

function openDetailView(id, type, title, posterPath = '', year = '') {
    if (document.activeElement && document.activeElement !== document.body) {
        detailFocusReturn = document.activeElement;
    }

    detailState = { id, type, showName: title, posterPath, year, season: null, episode: null };

    detailTitle.textContent = title || 'Details';
    detailBody.innerHTML = `
    <div class="detail-hero">
      <div class="detail-hero-poster skeleton"></div>
      <div class="detail-hero-info">
        <div class="skeleton-text" style="width:60%; max-width:320px;"></div>
        <div class="skeleton-text short"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text"></div>
      </div>
    </div>
    `;
    detailView.classList.add('show');
    document.body.style.overflow = 'hidden';
    detailCloseBtn.focus();

    loadDetail(id, type);
}

function closeDetailView() {
    if (!detailView.classList.contains('show')) return;

    detailView.classList.remove('show');
    detailBody.innerHTML = '';
    detailTitle.textContent = '';
    document.body.style.overflow = '';

    if (detailFocusReturn && document.contains(detailFocusReturn)) {
        detailFocusReturn.focus();
    }
    detailFocusReturn = null;
}

async function loadDetail(id, type) {
    try {
        const [detail, similarRes] = await Promise.all([
            tmdbGet(`/${type}/${id}`),
            tmdbGet(`/${type}/${id}/similar`)
        ]);
        renderDetail(detail, similarRes);
    } catch (err) {
        console.error('Error loading details:', err);
        const title = escapeHtml(detailState.showName || 'this title');
        detailBody.innerHTML = `
        <div class="empty-state" role="status">
        <div class="empty-title">Could not load details.</div>
        <div class="empty-sub">Something went wrong while loading ${title}. Please try again.</div>
        </div>
        `;
    }
}

function seasonButtonsHTML(detail) {
    const seasons = (detail.seasons || []).filter(s => s.season_number > 0);
    if (!seasons.length) return '<span class="no-episodes">No seasons available</span>';

    return seasons.map(s => `
    <button class="season-btn" data-season="${s.season_number}" type="button" aria-pressed="false">
    Season ${s.season_number} ${s.episode_count ? `(${s.episode_count} eps)` : ''}
    </button>
    `).join('');
}

function renderDetail(detail, similarRes) {
    const type = detailState.type;
    const title = detail.name || detail.title || detailState.showName;
    (document.getElementById('detailTitle') || { textContent: '' }).textContent = title;
    detailState.showName = title;

    const year = type === 'tv'
        ? ((detail.first_air_date || '').substring(0, 4))
        : ((detail.release_date || '').substring(0, 4));
    const posterUrl = detail.poster_path ? `${IMG_BASE}${detail.poster_path}` : '';
    const rating = detail.vote_average ? Number(detail.vote_average).toFixed(1) : '';
    const runtimeMin = type === 'tv'
        ? (detail.episode_run_time && detail.episode_run_time[0])
        : detail.runtime;
    const runtimeTxt = formatRuntime(runtimeMin);
    const genres = (detail.genres || []).map(g => escapeHtml(g.name)).join(', ');
    const overview = detail.overview || 'No overview available.';
    const backdropUrl = detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : '';

    const metaParts = [];
    if (year) metaParts.push(year);
    metaParts.push(type === 'tv' ? 'TV Series' : 'Movie');
    if (rating) metaParts.push(`★ ${rating}`);
    if (runtimeTxt) metaParts.push(runtimeTxt);
    if (genres) metaParts.push(genres);

    const episodesSection = type === 'tv'
        ? `
        <section class="detail-section" aria-label="Episodes">
        <h2 class="detail-section-title">Episodes</h2>
        <div class="season-selector" id="detailSeasonSelector">
        ${seasonButtonsHTML(detail)}
        </div>
        <div id="detailEpisodeContainer" aria-live="polite"></div>
        </section>
        `
        : '';

    detailBody.innerHTML = `
    <div class="detail-hero"${backdropUrl ? ` style="--hero-bg:url('${backdropUrl}')"` : ''}>
    <div class="detail-hero-shade"></div>
    <div class="detail-hero-inner">
    ${posterUrl ? `<img src="${posterUrl}" alt="${escapeHtml(title)}" class="detail-hero-poster" loading="lazy" decoding="async" />` : '<div class="detail-hero-poster placeholder"></div>'}
    <div class="detail-hero-info">
    <h2 class="detail-name">${escapeHtml(title)}</h2>
    <div class="detail-meta">${escapeHtml(metaParts.join(' • '))}</div>
    <p class="detail-overview">${escapeHtml(overview)}</p>
    <div class="detail-actions">
    <button type="button" id="detailPlayBtn" class="detail-play-btn">▶ Play</button>
    <button type="button" class="detail-watchlist-btn" id="detailWatchlistBtn"></button>
    </div>
    </div>
    </div>
    </div>
    ${episodesSection}
    <section class="detail-section" id="detailSimilarSection" style="display:none;" aria-label="Similar titles">
    <h2 class="detail-section-title">Similar Titles</h2>
    <div id="detailSimilar" class="row-grid"></div>
    </section>
    `;

    // Watchlist toggle for this title (works when signed in)
    if (typeof watchButtonHTML === 'function') {
        const watchBtn = detailBody.querySelector('#detailWatchlistBtn');
        const heroBtn = document.createElement('span');
        heroBtn.innerHTML = watchButtonHTML(detailState.id, type, title, detail.poster_path || '');
        watchBtn.replaceWith(heroBtn.firstChild);
    } else {
        const watchBtn = detailBody.querySelector('#detailWatchlistBtn');
        if (watchBtn) watchBtn.style.display = 'none';
    }

    const playBtn = detailBody.querySelector('#detailPlayBtn');
    if (!playBtn) return;

    if (type === 'movie') {
        playBtn.addEventListener('click', () => {
            closeDetailView();
            openPlayer({
                id: detailState.id,
                type: 'movie',
                title,
                poster_path: detail.poster_path || '',
                year
            });
        });
    } else {
        const seasons = (detail.seasons || []).filter(s => s.season_number > 0);
        const firstSeason = seasons.length ? seasons[0].season_number : 1;
        detailState.season = firstSeason;
        detailState.episode = null;

        playBtn.addEventListener('click', () => {
            const season = detailState.season || firstSeason;
            const episode = detailState.episode || 1;
            playDetailEpisode(season, episode);
        });

        // Wire season selector buttons
        detailBody.querySelectorAll('.season-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                detailState.season = parseInt(btn.dataset.season);
                detailState.episode = null;
                renderEpisodeGrid(detailState.id, detailState.season, document.getElementById('detailEpisodeContainer'), {
                    showName: title,
                    seasonSelectorRoot: document.getElementById('detailSeasonSelector'),
                    onPlay: (season, episode) => playDetailEpisode(season, episode)
                });
            });
        });

        renderEpisodeGrid(detailState.id, firstSeason, document.getElementById('detailEpisodeContainer'), {
            showName: title,
            seasonSelectorRoot: document.getElementById('detailSeasonSelector'),
            onPlay: (season, episode) => playDetailEpisode(season, episode)
        });
    }

    // Similar titles row — clicking a card opens its own detail view
    const similarItems = (similarRes && similarRes.results || []).map(item => ({ ...item, media_type: type }));
    if (similarItems.length) {
        const similarSection = detailBody.querySelector('#detailSimilarSection');
        similarSection.style.display = '';
        const grid = detailBody.querySelector('#detailSimilar');
        grid.innerHTML = similarItems.slice(0, ROW_SIZE).map(mediaCardHTML).join('');
        bindCardEvents(grid);
    }
}

function playDetailEpisode(season, episode) {
    detailState.season = season;
    detailState.episode = episode;
    closeDetailView();
    openPlayer({
        id: detailState.id,
        type: 'tv',
        title: `${detailState.showName} - S${season}E${episode}`,
        season,
        episode,
        poster_path: detailState.posterPath,
        year: detailState.year
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
detailCloseBtn.addEventListener('click', closeDetailView);
detailView.addEventListener('click', (e) => {
    if (e.target === detailView) closeDetailView();
});

// Keep the hero watchlist button's ✓/+ state in sync after a toggle. The
// card-scoped refresher in watchlist.js only targets .movie-card buttons.
// Delegated on detailBody because the hero button is re-rendered on each toggle.
detailBody.addEventListener('click', (e) => {
    if (e.target.closest('.watch-btn')) {
        setTimeout(() => {
            const current = detailBody.querySelector('.watch-btn');
            if (current) {
                const next = document.createElement('span');
                next.innerHTML = watchButtonHTML(detailState.id, detailState.type, detailState.showName, detailState.posterPath);
                current.replaceWith(next.firstChild);
            }
        }, 0);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailView.classList.contains('show')) {
        // Only close when nothing more specific is on top.
        const playerOpen = typeof playerPopup !== 'undefined' && playerPopup.classList.contains('show');
        const modalOpen = typeof modal !== 'undefined' && modal.classList.contains('show');
        const authOpen = typeof authModal !== 'undefined' && authModal.classList.contains('show');
        if (!playerOpen && !modalOpen && !authOpen) closeDetailView();
    }
});