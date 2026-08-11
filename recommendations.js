// ============================================
// HOME RECOMMENDATIONS
// ============================================
async function loadRecommendations() {
    try {
        const [popularMovies, popularTv, nowPlaying, onAir] = await Promise.all([
            tmdbGet('/movie/popular'),
            tmdbGet('/tv/popular'),
            tmdbGet('/movie/now_playing'),
            tmdbGet('/tv/on_the_air')
        ]);

        recommendationsContainer.innerHTML = '';

        // First two rows render immediately
        renderRow('Popular Right Now', [
            ...(popularMovies.results || []).map(item => ({ ...item, media_type: 'movie' })),
            ...(popularTv.results || []).map(item => ({ ...item, media_type: 'tv' }))
        ]);

        renderRow('Just Released', [
            ...(nowPlaying.results || []).map(item => ({ ...item, media_type: 'movie' })),
            ...(onAir.results || []).map(item => ({ ...item, media_type: 'tv' }))
        ]);

        // Last two rows lazy-render when scrolled into view
        renderRow('Popular Movies', (popularMovies.results || []).map(item => ({ ...item, media_type: 'movie' })), true);

        renderRow('Popular TV Shows', (popularTv.results || []).map(item => ({ ...item, media_type: 'tv' })), true);
    } catch (err) {
        console.error('Could not load recommendations:', err);
    }
}

function renderRow(title, items, lazy = false) {
    if (!items.length) return;

    const row = document.createElement('div');
    row.className = 'media-row';
    row.innerHTML = `
    <h2 class="row-title">${escapeHtml(title)}</h2>
    <div class="row-grid">${lazy ? '' : items.slice(0, ROW_SIZE).map(mediaCardHTML).join('')}</div>
    `;

    recommendationsContainer.appendChild(row);

    const grid = row.querySelector('.row-grid');
    if (lazy) {
        lazyRenderRow(grid, items);
    } else {
        bindCardEvents(grid);
    }
}

function lazyRenderRow(grid, items) {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            grid.innerHTML = items.slice(0, ROW_SIZE).map(mediaCardHTML).join('');
            bindCardEvents(grid);
        }
    }, { rootMargin: '300px' });
    observer.observe(grid);
}
