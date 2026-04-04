/**
 * @voygo-doc
 * Module: accessibilityController
 * Fichier: voygo\controllers\accessibilityController.js
 * Role: Renforce l'accessibilite et l'UX mobile globale.
 */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

function ensureMainLandmark() {
    const main = document.querySelector('main');
    if (!main) return;
    if (!main.id) {
        main.id = 'main-content';
    }
    main.setAttribute('tabindex', '-1');
}

function injectSkipLink() {
    if (document.querySelector('.skip-to-content')) return;
    const main = document.querySelector('main');
    if (!main) return;

    if (!main.id) {
        main.id = 'main-content';
    }

    const link = document.createElement('a');
    link.className = 'skip-to-content';
    link.href = `#${main.id}`;
    link.textContent = 'Aller au contenu principal';
    document.body.insertAdjacentElement('afterbegin', link);
}

function enhanceIconButtonsLabels() {
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach((button) => {
        if (button.getAttribute('aria-label')) return;
        const text = String(button.textContent || '').trim();
        if (text) return;

        const title = String(button.getAttribute('title') || '').trim();
        if (title) {
            button.setAttribute('aria-label', title);
            return;
        }

        const icon = button.querySelector('i');
        if (icon) {
            const iconClass = icon.className;
            if (iconClass.includes('bx-x')) {
                button.setAttribute('aria-label', 'Fermer');
                return;
            }
            if (iconClass.includes('bx-search')) {
                button.setAttribute('aria-label', 'Rechercher');
                return;
            }
        }

        button.setAttribute('aria-label', 'Action');
    });
}

function enhanceFormLabels() {
    const fields = Array.from(document.querySelectorAll('input, select, textarea'));

    fields.forEach((field) => {
        if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return;
        const id = field.id;
        if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) return;
        }

        const placeholder = String(field.getAttribute('placeholder') || '').trim();
        if (placeholder) {
            field.setAttribute('aria-label', placeholder);
            return;
        }

        const fallback = String(field.getAttribute('name') || id || 'Champ de formulaire').trim();
        field.setAttribute('aria-label', fallback);
    });
}

function makeClickablesKeyboardFriendly() {
    const selectors = ['.tag', '.activity-filter-chip'];
    const elements = Array.from(document.querySelectorAll(selectors.join(',')));

    elements.forEach((element) => {
        if (element.matches('button, a, input, select, textarea')) return;
        if (!element.hasAttribute('tabindex')) {
            element.setAttribute('tabindex', '0');
        }
        if (!element.hasAttribute('role')) {
            element.setAttribute('role', 'button');
        }
        if (element.classList.contains('active') || element.classList.contains('is-active')) {
            element.setAttribute('aria-pressed', 'true');
        }

        if (element.dataset.a11yKeybound === 'true') return;
        element.dataset.a11yKeybound = 'true';
        element.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            element.click();
        });
    });
}

function cleanupInjectedDrawers() {
    document.querySelectorAll('.mobile-filter-backdrop, .mobile-filter-trigger').forEach((node) => {
        node.remove();
    });
    document.body.classList.remove('drawer-open');
}

export function initAccessibilityEnhancements() {
    if (!isBrowser) return;
    if (document.body.dataset.a11yEnhanced === 'true') {
        makeClickablesKeyboardFriendly();
        return;
    }

    document.body.dataset.a11yEnhanced = 'true';
    ensureMainLandmark();
    injectSkipLink();
    enhanceIconButtonsLabels();
    enhanceFormLabels();
    makeClickablesKeyboardFriendly();
    cleanupInjectedDrawers();
}
