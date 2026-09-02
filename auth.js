// ============================================
// AUTH — state, API wrapper, sign-in modal UI
// ============================================
let currentUser = null;

const AUTH_API = window.location.origin; // same-origin as Pages Functions

// -- thin API wrapper (sends + receives JSON, includes cookies) ------------
async function api(path, options = {}) {
    const res = await fetch(`${AUTH_API}${path}`, {
        credentials: 'include', // send/accept the httpOnly session cookie
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (res.status === 204) return null; // no content (logout)

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Request failed. Please try again.');
    return data;
}

// -- API calls --------------------------------------------------------------
async function register(email, username, password) {
    const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
    });
    return data.user;
}

async function login(email, password) {
    const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    return data.user;
}

async function logout() {
    await api('/api/logout', { method: 'POST' });
    currentUser = null;
    renderAuthArea();
    if (typeof initWatchlist === 'function') initWatchlist();
}

async function checkSession() {
    try {
        const data = await api('/api/me');
        currentUser = data?.user || null;
    } catch (err) {
        currentUser = null;
    }
    return currentUser;
}

// ============================================
// HEADER AUTH AREA
// ============================================
function renderAuthArea() {
    if (!authArea) return;

    if (currentUser) {
        authArea.innerHTML = `
        <div class="auth-user" aria-label="Signed in as ${escapeHtml(currentUser.username)}">
          <span class="auth-avatar" aria-hidden="true">${escapeHtml(firstLetter(currentUser.username))}</span>
          <span class="auth-username">${escapeHtml(currentUser.username)}</span>
          <button type="button" class="auth-logout-btn" id="logoutBtn">Log out</button>
        </div>`;

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', onLogout);
    } else {
        authArea.innerHTML = `
        <button type="button" class="auth-signin-btn" id="openAuthBtn">Sign in</button>`;

        const openBtn = document.getElementById('openAuthBtn');
        if (openBtn) openBtn.addEventListener('click', () => openAuthModal('login'));
    }
}

function firstLetter(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

async function onLogout() {
    try {
        await logout();
        setStatus('Signed out.', 'success');
    } catch (err) {
        // Even if the server call fails, clear local session state.
        currentUser = null;
        renderAuthArea();
        setStatus('Signed out (session may not have cleared).', 'error');
    }
}

// ============================================
// AUTH MODAL
// ============================================
let authReturnFocus = null;

function openAuthModal(mode) {
    if (!authModal) return;

    // remember what had focus so we can restore it on close
    if (document.activeElement && document.activeElement !== document.body) {
        authReturnFocus = document.activeElement;
    }

    renderAuthForm(mode);
    authModal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // move focus into the form's first field
    const first = authBody.querySelector('input');
    if (first) first.focus();
}

function closeAuthModal() {
    authModal.classList.remove('show');
    document.body.style.overflow = '';
    authBody.innerHTML = '';

    if (authReturnFocus && document.contains(authReturnFocus)) {
        authReturnFocus.focus();
    }
    authReturnFocus = null;
}

// Toggle between the two modes without closing the modal.
function switchAuthMode(mode) {
    renderAuthForm(mode);
}

function renderAuthForm(mode) {
    const isLogin = mode === 'login';
    const heading = isLogin ? 'Welcome back' : 'Create your account';
    const submitLabel = isLogin ? 'Sign in' : 'Create account';

    authBody.innerHTML = `
    <h2 class="auth-heading" id="authHeading">${heading}</h2>
    <form id="authForm" class="auth-form" novalidate>
      ${isLogin ? '' : `
      <div class="auth-field">
        <label for="authUsername">Username</label>
        <input
          type="text" id="authUsername" name="username" autocomplete="username"
          required minlength="3" placeholder="Your display name" />
      </div>`}
      <div class="auth-field">
        <label for="authEmail">Email</label>
        <input
          type="email" id="authEmail" name="email" autocomplete="email"
          required placeholder="you@example.com" />
      </div>
      <div class="auth-field">
        <label for="authPassword">Password</label>
        <div class="auth-pass-wrap">
          <input
            type="password" id="authPassword" name="password"
            autocomplete="${isLogin ? 'current-password' : 'new-password'}"
            required minlength="8" placeholder="${isLogin ? 'Your password' : 'At least 8 characters'}" />
          <button type="button" class="auth-pass-toggle" id="passToggle" aria-label="Show password" aria-pressed="false">Show</button>
        </div>
      </div>
      ${isLogin ? '' : `
      <div class="auth-field">
        <label for="authConfirm">Confirm password</label>
        <input
          type="password" id="authConfirm" name="confirm"
          autocomplete="new-password" required minlength="8" placeholder="Repeat password" />
      </div>`}
      <p class="auth-msg" id="authMsg" role="status" aria-live="polite"></p>
      <button type="submit" class="auth-submit" id="authSubmit">${submitLabel}</button>
      <p class="auth-switch">
        ${isLogin
            ? `New here? <button type="button" class="auth-switch-btn" id="toRegister">Create an account</button>`
            : `Already have an account? <button type="button" class="auth-switch-btn" id="toLogin">Sign in</button>`}
      </p>
    </form>`;

    // field config for wire-up below
    const isPasswordLess = isLogin;
    authBody.classList.toggle('login-mode', isPasswordLess);

    // toggle button
    const toggle = document.getElementById('passToggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const input = document.getElementById('authPassword');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            input.focus();
            toggle.setAttribute('aria-pressed', String(show));
            toggle.textContent = show ? 'Hide' : 'Show';
        });
    }

    const swimmer = document.getElementById('toRegister') || document.getElementById('toLogin');
    if (swimmer) {
        swimmer.addEventListener('click', () => switchAuthMode(isLogin ? 'register' : 'login'));
    }

    document.getElementById('authForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleAuthSubmit(mode);
    });
}

function setAuthMsg(text, type = '') {
    const msg = document.getElementById('authMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'auth-msg' + (type ? ' ' + type : '');
}

function setAuthLoading(loading) {
    const btn = document.getElementById('authSubmit');
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Please wait…' : (authBody.classList.contains('login-mode') ? 'Sign in' : 'Create account');
}

async function handleAuthSubmit(mode) {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const isLogin = mode === 'login';

    if (!email || !password) {
        setAuthMsg('Email and password are required.', 'error');
        return;
    }

    if (!isLogin) {
        const username = document.getElementById('authUsername').value.trim();
        const confirm = document.getElementById('authConfirm').value;
        if (username.length < 3) {
            setAuthMsg('Username must be at least 3 characters.', 'error');
            return;
        }
        if (password.length < 8) {
            setAuthMsg('Password must be at least 8 characters.', 'error');
            return;
        }
        if (password !== confirm) {
            setAuthMsg('Passwords do not match.', 'error');
            return;
        }
    }

    setAuthLoading(true);
    setAuthMsg('');

    try {
        currentUser = isLogin
            ? await login(email, password)
            : await register(email, document.getElementById('authUsername').value.trim(), password);

        renderAuthArea();
        closeAuthModal();
        setStatus(isLogin ? `Signed in as ${currentUser.username}.` : `Account created. Welcome, ${currentUser.username}!`, 'success');

        // Refresh the D1-backed watchlist for the new session.
        if (typeof initWatchlist === 'function') initWatchlist();
    } catch (err) {
        setAuthMsg(err.message || 'Something went wrong.', 'error');
        setAuthLoading(false);
    }
}

// ============================================
// EVENTS & INIT
// ============================================
function initAuth() {
    if (authClose) authClose.addEventListener('click', closeAuthModal);
    if (authModal) {
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) closeAuthModal();
        });
    }

    renderAuthArea();
}

// Esc closes the auth modal (mirrors app.js global handler for other modals).
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && authModal && authModal.classList.contains('show')) {
        closeAuthModal();
    }
});

window.addEventListener('load', () => {
    // Restore a logged-in session across reloads (httpOnly cookie auto-sends).
    checkSession().then(() => {
        renderAuthArea();
        if (typeof initWatchlist === 'function') initWatchlist();
    });
});