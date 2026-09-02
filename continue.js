// ============================================
// CONTINUE WATCHING
// localStorage is always the render source (offline/degraded mode).
// When logged in, entries are also mirrored to D1 (per-user, cross-device):
//   - progress ticks → POST /api/continue  (app.js flushProgress)
//   - remove        → DELETE /api/continue
//   - on login      → loadContinueWatching() imports local→D1 then pulls D1→local
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

function getCurrentUser() {
    return typeof currentUser !== 'undefined' ? currentUser : null;
}

// Map a D1 continue_watching row into the localStorage entry shape.
function serverRowToEntry(row) {
    return {
        id: row.tmdb_id,
        type: row.media_type,
        title: row.title,
        season: row.season || null,
        episode: row.episode || null,
        poster_path: row.poster_path || null,
        year: '',
        timestamp: (row.updated_at || 0) * 1000,
        progress: row.duration > 0 ? { watched: row.watched, duration: row.duration } : null
    };
}

// Map a localStorage entry into a D1 import/continue-write item.
function entryToDbItem(entry) {
    return {
        tmdb_id: entry.id,
        media_type: entry.type,
        season: entry.season || null,
        episode: entry.episode || null,
        title: entry.title || 'Untitled',
        poster_path: entry.poster_path || null,
        watched: entry.progress && entry.progress.watched > 0 ? entry.progress.watched : 0,
        duration: entry.progress && entry.progress.duration > 0 ? entry.progress.duration : 0
    };
}

// Push the current localStorage continue data to D1 (used on login).
async function importContinueToServer() {
    const user = getCurrentUser();
    const data = getContinueData();
    const entries = Object.values(data);
    if (!user || entries.length === 0) return 0;
    try {
        const res = await api('/api/import', {
            method: 'POST',
            body: JSON.stringify({ items: entries.map(entryToDbItem) }),
        });
        return res?.imported || 0;
    } catch (err) {
        console.warn('Import continue watching to D1 failed:', err);
        return 0;
    }
}

// Load the server-side continue watching into localStorage (when logged in).
// Local entries are imported first so nothing is lost; then D1 is authoritative.
async function loadContinueWatching() {
    const user = getCurrentUser();
    if (!user) {
        renderContinueWatching();
        return;
    }

    await importContinueToServer();

    try {
        const res = await api('/api/continue');
        const items = (res?.items || []).slice(0, 12);

        const data = {};
        for (const row of items) {
            const entry = serverRowToEntry(row);
            data[`${entry.type}-${entry.id}`] = entry;
        }

        // Keep any local-only entries that the server doesn't have yet
        // (e.g. a just-started title queued on this device before sync).
        const serverKeys = new Set(items.map(r => `${r.media_type}-${r.tmdb_id}`));
        const local = getContinueData();
        for (const [key, entry] of Object.entries(local)) {
            if (!serverKeys.has(key)) {
                data[key] = entry;
            }
        }

        saveContinueData(data);
    } catch (err) {
        console.warn('Could not load continue watching from server:', err);
    }

    renderContinueWatching();
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

    if (getCurrentUser()) {
        const item = entryToDbItem(data[key]);
        api('/api/continue', {
            method: 'POST',
            body: JSON.stringify(item),
        }).catch(err => console.warn('Could not sync progress to server:', err));
    }
}

function removeContinueEntry(id, type, season, episode) {
    const data = getContinueData();
    delete data[`${type}-${id}`];
    saveContinueData(data);
    renderContinueWatching();

    if (getCurrentUser()) {
        const qs = new URLSearchParams({ tmdb_id: id, media_type: type });
        if (season) qs.set('season', season);
        if (episode) qs.set('episode', episode);
        api(`/api/continue?${qs.toString()}`, { method: 'DELETE' })
            .catch(err => console.warn('Could not remove continue entry on server:', err));
    }
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
        <article class="continue-card" data-id="${entry.id}" data-type="${entry.type}" data-title="${safeTitle}" data-poster="${entry.poster_path || ''}" data-year="${entry.year}" data-season="${entry.season || ''}" data-episode="${entry.episode || ''}" tabindex="0" role="button" aria-label="Continue playing ${safeTitle}${epLabel}">
        <button class="continue-remove" data-remove-id="${entry.id}" data-remove-type="${entry.type}" data-remove-season="${entry.season || ''}" data-remove-episode="${entry.episode || ''}" title="Remove from list" aria-label="Remove ${safeTitle} from list">×</button>
        <img src="${poster}" alt="${safeTitle}" loading="lazy" decoding="async" />
        <div class="info">
        <div class="title">${safeTitle}</div>
        <div class="sub">${typeLabel}${epLabel}</div>
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct}% watched"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        </article>
        `;
    }).join('');
}

function playContinueCard(card) {
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
}

continueContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.continue-remove');
    if (removeBtn) {
        e.stopPropagation();
        removeContinueEntry(
            removeBtn.dataset.removeId,
            removeBtn.dataset.removeType,
            removeBtn.dataset.removeSeason,
            removeBtn.dataset.removeEpisode
        );
        return;
    }

    const card = e.target.closest('.continue-card');
    if (!card) return;

    playContinueCard(card);
});

continueContainer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.continue-card');
        if (!card) return;
        e.preventDefault();
        playContinueCard(card);
    }
});