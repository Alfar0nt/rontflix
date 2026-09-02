// ============================================
// WATCH HISTORY — D1-backed, per logged-in user
// Every played item, sorted by most recently watched.
// Shown only when logged in (guarded UI).
// ============================================

function getHistoryUser() {
    return typeof currentUser !== 'undefined' ? currentUser : null;
}

function historyKey(row) {
    return `${row.media_type}-${row.tmdb_id}-${row.season || 0}-${row.episode || 0}`;
}

// Fetch the user's history from D1 and render it.
async function loadHistory() {
    const user = getHistoryUser();
    const section = document.getElementById('historySection');
    const container = document.getElementById('historyContainer');
    if (!section || !container) return;

    // Guard: only show history for a signed-in user.
    if (!user) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    try {
        const res = await api('/api/history');
        const items = (res?.items || []).slice(0, 20);

        section.style.display = 'block';
        container.innerHTML = items.map(row => {
            const poster = row.poster_path ? `${IMG_BASE}${row.poster_path}` : POSTER_PLACEHOLDER;
            const safeTitle = escapeHtml(row.title);
            const typeLabel = row.media_type === 'tv' ? 'TV' : 'Movie';
            const epLabel = row.season ? ` • S${row.season}E${row.episode}` : '';
            const played = row.played_at ? new Date(row.played_at * 1000).toLocaleDateString() : '';

            return `
            <article class="continue-card history-card" data-id="${row.tmdb_id}" data-type="${row.media_type}" data-title="${safeTitle}" data-poster="${row.poster_path || ''}" data-season="${row.season || ''}" data-episode="${row.episode || ''}" tabindex="0" role="button" aria-label="Watch ${safeTitle}${epLabel}">
            <img src="${poster}" alt="${safeTitle}" loading="lazy" decoding="async" />
            <div class="info">
            <div class="title">${safeTitle}</div>
            <div class="sub">${typeLabel}${epLabel}${played ? ` • ${escapeHtml(played)}` : ''}</div>
            </div>
            </article>
            `;
        }).join('');

        bindCardEvents(container);

        if (items.length === 0) {
            section.style.display = 'none';
            container.innerHTML = '';
        }
    } catch (err) {
        console.warn('Could not load watch history:', err);
        section.style.display = 'none';
        container.innerHTML = '';
    }
}

// Record a play and refresh the row.
async function recordHistory(media) {
    if (!media || !media.id || !media.type) return;
    if (!getHistoryUser()) return; // guests are not tracked server-side

    try {
        await api('/api/history', {
            method: 'POST',
            body: JSON.stringify({
                tmdb_id: media.id,
                media_type: media.type,
                season: media.season || null,
                episode: media.episode || null,
                title: media.title || '',
                poster_path: media.poster_path || null,
            }),
        });
        loadHistory();
    } catch (err) {
        console.warn('Could not record watch history:', err);
    }
}

// Called on login/register/session-restore so the row appears for signed-in users.
function initHistory() {
    loadHistory();
}