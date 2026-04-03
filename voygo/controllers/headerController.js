/**
 * @voygo-doc
 * Module: headerController
 * Fichier: voygo\controllers\headerController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
 
// Loads header.html into #header-container and manages theme toggle
async function loadHeader() {
    if (!isBrowser) return;
    try {
        let base = window.location.pathname;
        if (!base.endsWith('/')) {
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
        const user = await resolveAuthUser();
        renderAccountSlot(user);
        updateNavForAuth(user);
        initMobileMenu(); // ✅ appelé ici, après injection du header
    } catch (err) {
        console.error('Failed to load header:', err);
    }
}
 
// Initialise le bloc fonctionnel 'initMobileMenu'.
function initMobileMenu() {
    if (!isBrowser) return;
    const menu = document.querySelector('.navbar-menu');
    const navbarLeft = document.querySelector('.navbar-left');
    if (!menu || !navbarLeft) return;

    const mq = window.matchMedia('(max-width: 480px)');
    const closeMenu = () => {
        menu.classList.remove('is-open');
        const btn = document.querySelector('.btn-hamburger');
        if (btn) {
            btn.setAttribute('aria-expanded', 'false');
            btn.innerHTML = '<i class="bx bx-menu"></i>';
        }
    };

    const ensureButton = () => {
        const existingBtn = document.querySelector('.btn-hamburger');
        if (!mq.matches) {
            if (existingBtn) {
                existingBtn.remove();
            }
            closeMenu();
            return;
        }

        if (existingBtn) return;

        const btn = document.createElement('button');
        btn.className = 'btn-hamburger';
        btn.setAttribute('aria-label', 'Ouvrir le menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<i class="bx bx-menu"></i>';

        navbarLeft.insertAdjacentElement('afterend', btn);

        btn.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', String(isOpen));
            btn.innerHTML = isOpen
                ? '<i class="bx bx-x"></i>'
                : '<i class="bx bx-menu"></i>';
        });
    };

    ensureButton();

    if (!menu.dataset.mobileMenuBound) {
        menu.dataset.mobileMenuBound = 'true';

        mq.addEventListener('change', ensureButton);

        document.addEventListener('click', (e) => {
            const btn = document.querySelector('.btn-hamburger');
            if (!btn) return;
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMenu();
        });

        menu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                closeMenu();
            });
        });
    }
}
 
// Retourne l'information calculee par 'getStoredUser'.
function getStoredUser() {
    if (!isBrowser) return null;
    try {
        const raw = localStorage.getItem('voygo_auth_user');
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (!user || typeof user !== 'object') return null;
        return user;
    } catch (error) {
        return null;
    }
}

// Resout les informations calculees par 'resolveAuthUser'.
async function resolveAuthUser() {
    if (!isBrowser) return null;
    try {
        const data = await api.get('/api/auth/me');
        if (!data?.user) {
            localStorage.removeItem('voygo_auth_user');
            localStorage.removeItem('voygo_jwt');
            return null;
        }
        localStorage.setItem('voygo_auth_user', JSON.stringify(data.user));
        return data.user;
    } catch (error) {
        return null;
    }
    return null;
}

// Construit le rendu pour 'renderAccountSlot'.
function renderAccountSlot(user) {
    if (!isBrowser) return;
    const slot = document.getElementById('header-account-slot');
    if (!slot) return;
 
    if (!user) {
        user = getStoredUser();
    }
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
 
// Applique les mises a jour de 'updateNavForAuth'.
function updateNavForAuth(user) {
    if (!isBrowser) return;
    const link = document.getElementById('nav-my-trips');
    if (!link) return;
    if (!user) {
        user = getStoredUser();
    }
    link.style.display = user ? '' : 'none';
}

// Met a jour l'etat pilote par 'setupAccountMenu'.
function setupAccountMenu() {
    if (!isBrowser) return;
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
        dropdown.classList.contains('is-open') ? closeMenu() : openMenu();
    });
 
    document.addEventListener('click', (event) => {
        if (!dropdown.contains(event.target) && !toggle.contains(event.target)) {
            closeMenu();
        }
    });
 
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });
 
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await api.post('/api/auth/logout');
            } catch (error) {
                console.warn('Logout API call failed:', error);
            }
            localStorage.removeItem('voygo_auth_user');
            localStorage.removeItem('voygo_jwt');
            window.location.href = 'login.html';
        });
    }
}
 
// Applique les mises a jour de 'updateThemeIcon'.
function updateThemeIcon() {
    if (!isBrowser) return;
    const icon = document.querySelector('.theme-icon');
    if (!icon) return;
    const isDark = document.body.classList.contains('dark-theme');
    icon.classList.toggle('bx-sun', isDark);
    icon.classList.toggle('bx-moon', !isDark);
}
 
// Gere la logique principale de 'toggleTheme'.
function toggleTheme() {
    if (!isBrowser) return;
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
    updateThemeIcon();
}

// Initialise le bloc fonctionnel 'initHeader'.
export function initHeader() {
    if (!isBrowser) return;
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }
    loadHeader();
}

export {
    loadHeader,
    initMobileMenu,
    renderAccountSlot,
    setupAccountMenu,
    updateThemeIcon,
    toggleTheme
};

if (isBrowser) {
    window.toggleTheme = toggleTheme;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeader);
    } else {
        initHeader();
    }
}


