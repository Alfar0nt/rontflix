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
