// ============================================
// SEARCH + PAGING
// ============================================
let searchState = { query: '', page: 1, totalPages: 1, loading: false, debounceTimer: null };

async function searchMedia(query, page = 1, append = false) {
    if (!query.trim()) {
        setStatus('Please enter a title.', 'error');
        return;
    }

    searchState.loading = true;
    searchBtn.disabled = true;
    loadMoreBtn.disabled = true;

    if (!append) {
        setStatus(`Searching for "${query}"...`, '');
        resultsContainer.innerHTML = Array(12).fill('').map(skeletonCardHTML).join('');
        loadMoreWrap.style.display = 'none';
    }

    try {
        const [movieData, tvData] = await Promise.all([
            tmdbGet('/search/movie', { query, page }),
            tmdbGet('/search/tv', { query, page })
        ]);

        let results = [
            ...(movieData.results || []).map(item => ({ ...item, media_type: 'movie' })),
            ...(tvData.results || []).map(item => ({ ...item, media_type: 'tv' }))
        ];
        results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        searchState.query = query;
        searchState.page = page;
        searchState.totalPages = Math.max(movieData.total_pages || 1, tvData.total_pages || 1);

        if (results.length === 0) {
            renderEmptyState(query);
            setStatus('No results found.', 'error');
            return;
        }

        appendResults(results, append);
        setStatus(`Found ${results.length} result${results.length === 1 ? '' : 's'} (page ${page}). Click a poster to play.`, 'success');
        updateLoadMore();
    } catch (err) {
        console.error(err);
        if (!append) resultsContainer.innerHTML = '';
        setStatus(`Search error: ${err.message}`, 'error');
    } finally {
        searchState.loading = false;
        searchBtn.disabled = false;
        loadMoreBtn.disabled = false;
    }
}

function renderEmptyState(query) {
    resultsContainer.innerHTML = `
    <div class="empty-state" role="status">
    <div class="empty-title">No results for "${escapeHtml(query)}"</div>
    <div class="empty-sub">Check the spelling, try a different title, or browse the recommendations above.</div>
    </div>
    `;
}

function appendResults(items, append) {
    if (!append) {
        resultsContainer.innerHTML = items.map(mediaCardHTML).join('');
        bindCardEvents(resultsContainer);
        return;
    }

    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = items.map(mediaCardHTML).join('');
    while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);

    bindCardEvents(fragment);
    resultsContainer.appendChild(fragment);
}

function updateLoadMore() {
    if (searchState.page >= searchState.totalPages) {
        loadMoreWrap.style.display = 'none';
        return;
    }
    loadMoreWrap.style.display = 'flex';
    loadMoreBtn.textContent = `Load More (${searchState.page} of ${searchState.totalPages})`;
    loadMoreBtn.disabled = false;
}

// ============================================
// EVENT LISTENERS
// ============================================
function updateHomeVisibility() {
    const searching = searchInput.value.trim().length > 0 || document.activeElement === searchInput;
    recommendationsContainer.style.display = searching ? 'none' : '';
}

searchInput.addEventListener('focus', updateHomeVisibility);
searchInput.addEventListener('blur', updateHomeVisibility);
searchInput.addEventListener('input', updateHomeVisibility);

// Debounced live search — results update while typing (300ms)
searchInput.addEventListener('input', () => {
    clearTimeout(searchState.debounceTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
        if (!query) {
            resultsContainer.innerHTML = '';
            loadMoreWrap.style.display = 'none';
            updateHomeVisibility();
        }
        return;
    }
    searchState.debounceTimer = setTimeout(() => {
        searchMedia(query, 1, false);
    }, 300);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchState.debounceTimer);
        searchMedia(searchInput.value);
    }
});

searchBtn.addEventListener('click', () => {
    clearTimeout(searchState.debounceTimer);
    searchMedia(searchInput.value);
});

loadMoreBtn.addEventListener('click', () => {
    if (searchState.loading || !searchState.query) return;
    searchMedia(searchState.query, searchState.page + 1, true);
});
