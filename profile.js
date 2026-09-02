// ============================================
// PROFILE — view/edit the signed-in user's profile.
// Opens a modal showing the avatar, username, email,
// password change, and the user's watch history.
// Replaces the homepage Watch History row (Phase 7).
// ============================================

const PROFILE_PRESETS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink'];

// Return the HTML for a user's avatar. Presets render as a colored
// initial; external/custom avatars render as an <img>.
function avatarHtml(user, sizeClass = '') {
    const name = (user && user.username) || '?';
    const initial = (name.trim().charAt(0) || '?').toUpperCase();
    const url = user && user.avatar_url;

    if (url && url.startsWith('preset:')) {
        const p = url.slice(7);
        return `<span class="avatar ${sizeClass} avatar-preset-${p}">${escapeHtml(initial)}</span>`;
    }
    if (url) {
        return `<img class="avatar ${sizeClass}" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
    }
    return `<span class="avatar ${sizeClass} avatar-preset-slate">${escapeHtml(initial)}</span>`;
}

// Shared helper so the header (auth.js) and profile modal render avatars the same way.
const renderAvatar = avatarHtml;

// ============================================
// MODAL OPEN/CLOSE
// ============================================
let profileReturnFocus = null;

function openProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    if (!currentUser) {
        // Mirror the watchlist guard: prompt to sign in.
        if (typeof openAuthModal === 'function') openAuthModal('login');
        return;
    }

    if (document.activeElement && document.activeElement !== document.body) {
        profileReturnFocus = document.activeElement;
    }

    renderProfileBody(currentUser);
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    const body = document.getElementById('profileBody');
    if (body) body.innerHTML = '';

    if (profileReturnFocus && document.contains(profileReturnFocus)) {
        profileReturnFocus.focus();
    }
    profileReturnFocus = null;
}

// ============================================
// RENDER
// ============================================
function renderProfileBody(user) {
    const body = document.getElementById('profileBody');
    if (!body) return;

    body.innerHTML = `
    <h2 class="profile-heading">Profile</h2>
    <div class="profile-top">
      <div class="profile-avatar-wrap">
        ${renderAvatar(user, 'avatar-xl')}
      </div>
      <div class="profile-id">
        <div class="profile-name">${escapeHtml(user.username)}</div>
        <div class="profile-email">${escapeHtml(user.email)}</div>
      </div>
    </div>

    <form id="profileForm" class="profile-form" novalidate>
      <div class="profile-field">
        <label for="profileUsername">Username</label>
        <input type="text" id="profileUsername" autocomplete="username" minlength="3" maxlength="40" value="${escapeHtml(user.username)}" />
      </div>
      <div class="profile-field">
        <label for="profileEmail">Email</label>
        <input type="email" id="profileEmail" autocomplete="email" value="${escapeHtml(user.email)}" />
      </div>

      <div class="profile-field">
        <span class="profile-label">Avatar</span>
        <div class="profile-presets" role="radiogroup" aria-label="Avatar preset colors">
          ${PROFILE_PRESETS.map(p => {
              const active = user.avatar_url === `preset:${p}`;
              return `<button type="button" class="profile-preset ${active ? 'active' : ''}" data-preset="${p}" role="radio" aria-checked="${active}" aria-label="${p} color avatar">
                <span class="avatar avatar-preset-${p}">${escapeHtml((user.username.charAt(0) || '?').toUpperCase())}</span>
              </button>`;
          }).join('')}
        </div>
        <input type="url" id="profileAvatarUrl" placeholder="Custom image URL (optional)" value="${user.avatar_url && !user.avatar_url.startsWith('preset:') ? escapeHtml(user.avatar_url) : ''}" />
        <button type="button" class="profile-preset-clear" id="profileAvatarClear">Use default</button>
      </div>

      <p id="profileMsg" class="profile-msg" role="status" aria-live="polite"></p>
      <button type="submit" class="profile-submit" id="profileSubmit">Save changes</button>
    </form>

    <hr class="profile-divider" />

    <div class="profile-pass">
      <h3 class="profile-subheading">Change password</h3>
      <form id="passForm" class="profile-form" novalidate>
        <div class="profile-field">
          <label for="passCurrent">Current password</label>
          <input type="password" id="passCurrent" autocomplete="current-password" />
        </div>
        <div class="profile-field">
          <label for="passNew">New password</label>
          <input type="password" id="passNew" autocomplete="new-password" minlength="8" />
        </div>
        <div class="profile-field">
          <label for="passConfirm">Confirm new password</label>
          <input type="password" id="passConfirm" autocomplete="new-password" minlength="8" />
        </div>
        <p id="passMsg" class="profile-msg" role="status" aria-live="polite"></p>
        <button type="submit" class="profile-submit" id="passSubmit">Update password</button>
      </form>
    </div>

    <hr class="profile-divider" />

    <div class="profile-history">
      <h3 class="profile-subheading">Watch history</h3>
      <div id="profileHistoryContainer" class="watchlist-grid" role="status" aria-live="polite"></div>
    </div>
    `;

    wireProfileForm();
    wirePassForm();
    wirePresets(user);
    loadHistory(); // renders into #profileHistoryContainer
}

// Track the currently selected avatar value so submit can send the right one.
let selectedAvatar = null;

function wirePresets(user) {
    selectedAvatar = user.avatar_url || null;
    const urlInput = document.getElementById('profileAvatarUrl');
    const buttons = document.querySelectorAll('.profile-preset');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedAvatar = 'preset:' + btn.dataset.preset;
            urlInput.value = '';
            buttons.forEach(b => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-checked', String(on));
            });
        });
    });

    const clearBtn = document.getElementById('profileAvatarClear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selectedAvatar = null;
            urlInput.value = '';
            buttons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
        });
    }

    // Typing a custom URL overrides any preset selection.
    urlInput.addEventListener('input', () => {
        if (urlInput.value.trim()) {
            selectedAvatar = urlInput.value.trim();
            buttons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-checked', 'false');
            });
        }
    });
}

function wireProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('profileMsg');
        const submit = document.getElementById('profileSubmit');
        const username = document.getElementById('profileUsername').value.trim();
        const email = document.getElementById('profileEmail').value.trim();

        if (username.length < 3) { msg.textContent = 'Username must be at least 3 characters.'; msg.className = 'profile-msg error'; return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Please enter a valid email.'; msg.className = 'profile-msg error'; return; }

        submit.disabled = true;
        submit.textContent = 'Saving…';
        msg.textContent = '';

        try {
            const data = await api('/api/profile', {
                method: 'PATCH',
                body: JSON.stringify({ username, email, avatar_url: selectedAvatar }),
            });
            currentUser = { ...currentUser, ...data.user };
            renderAuthArea();
            msg.textContent = 'Profile saved.';
            msg.className = 'profile-msg success';
        } catch (err) {
            msg.textContent = err.message || 'Could not save profile.';
            msg.className = 'profile-msg error';
        } finally {
            submit.disabled = false;
            submit.textContent = 'Save changes';
        }
    });
}

function wirePassForm() {
    const form = document.getElementById('passForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('passMsg');
        const submit = document.getElementById('passSubmit');
        const current = document.getElementById('passCurrent').value;
        const password = document.getElementById('passNew').value;
        const confirm = document.getElementById('passConfirm').value;

        if (!current || !password) { msg.textContent = 'Enter current and new password.'; msg.className = 'profile-msg error'; return; }
        if (password.length < 8) { msg.textContent = 'New password must be at least 8 characters.'; msg.className = 'profile-msg error'; return; }
        if (password !== confirm) { msg.textContent = 'Passwords do not match.'; msg.className = 'profile-msg error'; return; }

        submit.disabled = true;
        submit.textContent = 'Updating…';
        msg.textContent = '';

        try {
            await api('/api/profile/password', {
                method: 'POST',
                body: JSON.stringify({ current, password }),
            });
            document.getElementById('passCurrent').value = '';
            document.getElementById('passNew').value = '';
            document.getElementById('passConfirm').value = '';
            msg.textContent = 'Password updated.';
            msg.className = 'profile-msg success';
        } catch (err) {
            msg.textContent = err.message || 'Could not update password.';
            msg.className = 'profile-msg error';
        } finally {
            submit.disabled = false;
            submit.textContent = 'Update password';
        }
    });
}

// ============================================
// INIT
// ============================================
function initProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    const close = document.getElementById('profileClose');
    if (close) close.addEventListener('click', closeProfile);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProfile();
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('profileModal');
        if (modal && modal.classList.contains('show')) closeProfile();
    }
});

window.addEventListener('load', () => {
    initProfile();
});