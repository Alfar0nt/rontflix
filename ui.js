// ============================================
// DOM REFERENCES & SHARED UI HELPERS
// ============================================
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const statusMsg = document.getElementById('statusMessage');
const apiSelect = document.getElementById('apiSelect');

const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn = document.getElementById('loadMoreBtn');

const playerMeta = document.getElementById('playerMeta');
const playerRating = document.getElementById('playerRating');
const playerRuntime = document.getElementById('playerRuntime');

const continueSection = document.getElementById('continueSection');
const continueContainer = document.getElementById('continueContainer');

const recommendationsContainer = document.getElementById('recommendations');

const playerPopup = document.getElementById('playerPopup');
const playerIframe = document.getElementById('playerIframe');
const playerTitle = document.getElementById('playerTitle');
const closePlayerBtn = document.getElementById('closePlayer');
const popupApiInfo = document.getElementById('popupApiInfo');
const popupApiPrev = document.getElementById('popupApiPrev');
const popupApiNext = document.getElementById('popupApiNext');

const modal = document.getElementById('episodeModal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.querySelector('.modal-close');

// ============================================
// HELPERS
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

function formatRuntime(min) {
    if (!min || min <= 0) return '';
    const hours = Math.floor(min / 60);
    const mins = min % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
}

// Calls fn at most once per delay; trailing call still runs.
function throttle(fn, delay) {
    let last = 0;
    let timer = null;
    return function (...args) {
        const now = Date.now();
        const remaining = delay - (now - last);
        if (remaining <= 0) {
            last = now;
            fn.apply(this, args);
        } else if (!timer) {
            timer = setTimeout(() => {
                last = Date.now();
                fn.apply(this, args);
                timer = null;
            }, remaining);
        }
    };
}

// ============================================
// CARDS
// ============================================
function mediaCardHTML(item) {
    const title = item.title || item.name || 'Untitled';
    const year = item.release_date ? item.release_date.substring(0, 4) :
        item.first_air_date ? item.first_air_date.substring(0, 4) : '';

    const typeLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
    const badge = item.media_type === 'tv' ? `<div class="badge">TV Series</div>` : '';
    const safeTitle = escapeHtml(title);

    let img = `<img src="${POSTER_PLACEHOLDER}" alt="${safeTitle}" loading="lazy" />`;
    if (item.poster_path) {
        img = `<img src="${IMG_BASE}${item.poster_path}"
        srcset="${IMG_BASE_SMALL}${item.poster_path} 200w, ${IMG_BASE}${item.poster_path} 342w"
        sizes="(max-width: 600px) 130px, 160px"
        alt="${safeTitle}" loading="lazy" />`;
    }

    return `
    <div class="movie-card" data-id="${item.id}" data-type="${item.media_type}" data-title="${safeTitle}" data-poster="${item.poster_path || ''}" data-year="${year}">
    ${img}
    <div class="info">
    <div class="title">${safeTitle}</div>
    <div class="sub">${year} • ${typeLabel}</div>
    ${badge}
    </div>
    </div>
    `;
}

function attachCardListeners(container) {
    container.querySelectorAll('.movie-card').forEach(card => {
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

function bindCardEvents(container) {
    attachCardListeners(container);
}
