import { api, fetchCurrentUser } from '../assets/js/api.js';

// Loads header.html into #header-container and manages theme toggle
async function loadHeader() {
    try {
        // determine base path of current document and append header.html
        let base = window.location.pathname;
        // remove filename if present
        if (base.endsWith('/')) {
            // directory path
        } else {
            base = base.substring(0, base.lastIndexOf('/') + 1);
        }
        const headerPath = base + 'header.html';
        const res = await fetch(headerPath);
        if (!res.ok) {
            console.error(`Header fetch failed (${res.status}): ${headerPath}`);
            return;
        }
        const html = await res.text();
        const container = document.getElementById('header-container');
        if (container) container.innerHTML = html;
        updateThemeIcon();
        renderAccountSlot();
    } catch (err) {
        console.error('Failed to load header:', err);
    }
}

async function renderAccountSlot() {
    const slot = document.getElementById('header-account-slot');
    if (!slot) return;

    const user = await fetchCurrentUser();
    if (!user) {
        slot.innerHTML = '<a href="login.html" class="btn-connexion" id="header-login-link">Connexion</a>';
        return;
    }

    const firstName = (user.first_name || '').trim();
    const displayName = firstName || (user.email || 'Mon compte');

    slot.innerHTML = `
        <div class="account-menu" id="header-account-menu">
            <button class="btn-connexion account-toggle" id="account-toggle" aria-haspopup="true" aria-expanded="false">
                <span class="account-label" id="account-label"></span>
                <i class='bx bx-chevron-down' aria-hidden="true"></i>
            </button>
            <div class="account-dropdown" id="account-dropdown" role="menu">
                <a href="settings.html" role="menuitem">Parametres du compte</a>
                <button type="button" class="account-logout" id="account-logout" role="menuitem">Deconnexion</button>
            </div>
        </div>
    `;

    const accountLabel = document.getElementById('account-label');
    if (accountLabel) accountLabel.textContent = displayName;

    setupAccountMenu();
}

function setupAccountMenu() {
    const toggle = document.getElementById('account-toggle');
    const dropdown = document.getElementById('account-dropdown');
    const logoutBtn = document.getElementById('account-logout');

    if (!toggle || !dropdown) return;

    const closeMenu = () => {
        dropdown.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        dropdown.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
    };

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (dropdown.classList.contains('is-open')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    document.addEventListener('click', (event) => {
        if (!dropdown.contains(event.target) && !toggle.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await api.post('/api/auth/logout');
            } catch (error) {
                console.warn('Logout failed:', error);
            }
            window.location.href = 'login.html';
        });
    }
}

function updateThemeIcon() {
    const icon = document.querySelector('.theme-icon');
    if (!icon) return;
    const isDark = document.body.classList.contains('dark-theme');
    icon.classList.toggle('bx-sun', isDark);
    icon.classList.toggle('bx-moon', !isDark);
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    updateThemeIcon();
}

window.toggleTheme = toggleTheme;

// restore theme preference and load header on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }
    loadHeader();
});
