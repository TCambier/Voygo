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
    } catch (err) {
        console.error('Failed to load header:', err);
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

// restore theme preference and load header on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
    }
    loadHeader();
});