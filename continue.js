// ============================================
// CONTINUE WATCHING
// Server-side only, per signed-in user.
//
// Continue Watching state lives in D1 (/api/continue), never localStorage:
//   - shown (and usable) only when a user is logged in
//   - progress ticks → POST /api/continue   (app.js flushProgress)
//   - remove           → DELETE /api/continue
//   - on login/load    → loadContinueWatching() pulls D1 rows into memory
//   - on logout        → the in-memory list is cleared and the section hides
//
// Because the data is per logged-in user, it disappears on logout and comes
// back when the same account signs in (and on any other device).
// ============================================

let continueEntries = []; // in-memory, seeded from D1 when signed in

function getCurrentUser() {
    return typeof currentUser !== 'undefined' ? currentUser : null;
}

// Map a D1 continue_watching row into the card entry shape.
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

// Convert an entry into the payload /api/continue expects.
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

// Fetch the signed-in user's continue watching from D1 into memory and render.
async function loadContinueWatching() {
    const user = getCurrentUser();
    continueEntries = [];

    if (user) {
        try {
            const res = await api('/api/continue');
            continueEntries = (res?.items || []).map(serverRowToEntry).slice(0, 12);
        } catch (err) {
            console.warn('Could not load continue watching from server:', err);
        }
    }

    renderContinueWatching();
}

// Record/update a media entry in Continue Watching (D1). Guests are not tracked.
function updateContinueEntry(media, progress) {
    if (!media || !media.id || !media.type) return;
    if (!getCurrentUser()) return;

    const existing = continueEntries.find(e => e.id === media.id && e.type === media.type) || {};
    const entry = {
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

    api('/api/continue', {
        method: 'POST',
        body: JSON.stringify(entryToDbItem(entry)),
    })
        .then(() => {
            // Refresh from the server so the list reflects what's stored.
            return loadContinueWatching();
        })
        .catch(err => console.warn('Could not sync progress to server:', err));
}

// Remove a media entry from Continue Watching (D1). Guests are not tracked.
function removeContinueEntry(id, type, season, episode) {
    if (!getCurrentUser()) return;

    const qs = new URLSearchParams({ tmdb_id: id, media_type: type });
    if (season) qs.set('season', season);
    if (episode) qs.set('episode', episode);

    api(`/api/continue?${qs.toString()}`, { method: 'DELETE' })
        .then(() => loadContinueWatching())
        .catch(err => console.warn('Could not remove continue entry on server:', err));
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

// Render the in-memory continue watching list (only when a user is signed in).
function renderContinueWatching() {
    const user = getCurrentUser();
    const entries = user ? [...continueEntries].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : [];

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

// ============================================
// Per-episode progress for the season picker.
// Sourced from the (server-backed) continue watching state, so it is only
// populated for signed-in users — never from stray localStorage.
// Returns a map in the shape: { [tmdbId]: { show_progress: { "sXeY": { progress: {watched,duration} } } } }
// ============================================
function getEpisodeProgressMap() {
    const map = {};
    for (const e of continueEntries) {
        if (e.type !== 'tv' || !e.season || !e.episode) continue;
        const key = `s${e.season}e${e.episode}`;
        const progress = e.progress && typeof e.progress.watched === 'number' && typeof e.progress.duration === 'number'
            ? { progress: e.progress }
            : null;
        if (!progress) continue;
        map[e.id] = map[e.id] || { show_progress: {} };
        map[e.id].show_progress[key] = progress;
    }
    return map;
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