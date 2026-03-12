import { api } from '../assets/js/api.js';

const grid = document.getElementById('voyages-grid');
const emptyState = document.getElementById('voyages-empty');
const searchInput = document.querySelector('.voyages-search input');
const statusFilter = document.getElementById('status-filter');
const sortFilter = document.getElementById('sort-filter');
const statTotal = document.getElementById('stat-total');
const statLastCreated = document.getElementById('stat-last-created');
const statUpcoming = document.getElementById('stat-upcoming');
const statUpcomingNotes = document.getElementById('stat-upcoming-notes');
const statBudget = document.getElementById('stat-budget');
const statBudgetNote = document.getElementById('stat-budget-note');

let allTrips = [];

function formatDate(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0
    }).format(num);
}

function resolveTravelers(trip) {
    const raw = trip.people ?? trip.travelers ?? trip.nb_people ?? trip.passengers;
    const count = parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : null;
}

function resolveBudget(trip) {
    return trip.budget ?? trip.budget_total ?? trip.total_budget ?? trip.estimated_budget ?? null;
}

function resolveSummary(trip) {
    return trip.summary || trip.description || trip.notes || 'Aucune note pour ce voyage.';
}

function resolveTitle(trip) {
    return trip.name || trip.destination || 'Voyage';
}

function computeStatus(trip) {
    const start = trip.start_date ? new Date(trip.start_date) : null;
    const end = trip.end_date ? new Date(trip.end_date) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start && start > today) return { label: 'À venir', className: 'upcoming' };
    if (end && end < today) return { label: 'Terminé', className: 'done' };
    return { label: 'En cours', className: 'in-progress' };
}

function buildTripCard(trip, index) {
    const card = document.createElement('article');
    card.className = `voyage-card${index === 0 ? ' featured' : ''}`;

    const status = computeStatus(trip);
    const travelers = resolveTravelers(trip);
    const budget = resolveBudget(trip);
    const summary = resolveSummary(trip);
    const title = resolveTitle(trip);
    const startDate = formatDate(trip.start_date);
    const endDate = formatDate(trip.end_date);

    const datesLabel = startDate && endDate ? `${startDate} \u2192 ${endDate}` : 'Dates à définir';

    const metaItems = [];
    if (travelers) metaItems.push(`<span><i class='bx bx-user'></i> ${travelers} voyageur${travelers > 1 ? 's' : ''}</span>`);
    if (budget) metaItems.push(`<span><i class='bx bx-wallet'></i> ${formatCurrency(budget)}</span>`);
    metaItems.push(`<span><i class='bx bx-map'></i> ${trip.steps_count ?? trip.steps ?? '0'} étape${(trip.steps_count ?? trip.steps ?? 0) > 1 ? 's' : ''}</span>`);

    const query = new URLSearchParams();
    if (trip.id) query.set('tripId', trip.id);
    if (trip.destination) query.set('destination', trip.destination);
    if (trip.start_date) query.set('startDate', trip.start_date);
    if (trip.end_date) query.set('endDate', trip.end_date);

    const canDelete = Boolean(trip.id);

    card.innerHTML = `
        <div class="voyage-card-header">
            <div>
                <h3>${title}</h3>
                <p class="voyage-dates">${datesLabel}</p>
            </div>
            <span class="status ${status.className}">${status.label}</span>
        </div>
        <p class="voyage-summary">${summary}</p>
        <div class="voyage-meta">
            ${metaItems.join('')}
        </div>
        <div class="voyage-progress">
            <div class="progress-bar">
                <span style="width: ${trip.progress ?? 0}%;"></span>
            </div>
            <span class="progress-text">${trip.progress ? `Planification à ${trip.progress}%` : 'Planification à démarrer'}</span>
        </div>
        <div class="voyage-actions">
            <button class="btn-secondary" data-open="${query.toString()}">Ouvrir</button>
            <button class="btn-danger" data-delete="${trip.id || ''}" ${canDelete ? '' : 'disabled'}>Supprimer</button>
        </div>
    `;

    return card;
}

function renderTrips(trips) {
    if (!grid || !emptyState) return;
    grid.innerHTML = '';

    if (!allTrips.length) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;
    if (!trips.length) return;
    trips.forEach((trip, index) => {
        grid.appendChild(buildTripCard(trip, index));
    });
}

function updateStats(trips) {
    if (!statTotal || !statLastCreated || !statUpcoming || !statUpcomingNotes || !statBudget || !statBudgetNote) {
        return;
    }

    statTotal.textContent = String(trips.length);

    const sortedByCreated = [...trips].sort((a, b) => {
        const aDate = new Date(a.created_at || a.updated_at || a.start_date || 0);
        const bDate = new Date(b.created_at || b.updated_at || b.start_date || 0);
        return bDate - aDate;
    });

    const lastCreated = sortedByCreated[0];
    const lastCreatedDate = lastCreated ? formatDate(lastCreated.created_at || lastCreated.updated_at || lastCreated.start_date) : '-';
    statLastCreated.textContent = `Dernière création : ${lastCreatedDate || '-'}`;

    const upcomingTrips = trips.filter((trip) => computeStatus(trip).label === 'À venir');
    statUpcoming.textContent = String(upcomingTrips.length);
    const upcomingNames = upcomingTrips.slice(0, 2).map(resolveTitle);
    statUpcomingNotes.textContent = upcomingNames.length ? upcomingNames.join(' et ') : '-';

    const budgets = trips
        .map((trip) => resolveBudget(trip))
        .map((value) => (value === null || value === undefined ? null : Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (budgets.length) {
        const avg = budgets.reduce((sum, value) => sum + value, 0) / budgets.length;
        statBudget.textContent = formatCurrency(avg);
        statBudgetNote.textContent = `Basé sur ${budgets.length} voyage${budgets.length > 1 ? 's' : ''}`;
    } else {
        statBudget.textContent = '-';
        statBudgetNote.textContent = 'Aucun budget renseigné';
    }
}

function applyFilters() {
    let filtered = [...allTrips];

    const searchValue = searchInput?.value.trim().toLowerCase() || '';
    if (searchValue) {
        filtered = filtered.filter((trip) => {
            const target = `${trip.name || ''} ${trip.destination || ''}`.toLowerCase();
            return target.includes(searchValue);
        });
    }

    const statusValue = statusFilter?.value || 'Tous';
    if (statusValue !== 'Tous') {
        filtered = filtered.filter((trip) => computeStatus(trip).label === statusValue);
    }

    const sortValue = sortFilter?.value || 'Dernière mise à jour';
    if (sortValue === 'Date de départ') {
        filtered.sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0));
    } else if (sortValue === 'Budget') {
        filtered.sort((a, b) => (resolveBudget(b) || 0) - (resolveBudget(a) || 0));
    } else {
        filtered.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
    }

    renderTrips(filtered);
}

async function fetchTrips() {
    const result = await api.get('/api/trips');
    return result?.data || [];
}

async function deleteTrip(tripId) {
    await api.delete(`/api/trips/${encodeURIComponent(tripId)}`);
}

async function initVoyagesPage() {
    if (!grid || !emptyState) return;
    grid.innerHTML = '<div class="voyages-loading">Chargement des voyages...</div>';
    try {
        const me = await api.get('/api/auth/me');
        const userId = me?.user?.id;
        if (!userId) {
            window.location.href = `login.html?returnTo=${encodeURIComponent('voyages.html')}`;
            return;
        }

        allTrips = await fetchTrips();
        updateStats(allTrips);
        applyFilters();
    } catch (err) {
        console.error('Impossible de charger les voyages:', err);
        grid.innerHTML = '<div class="voyages-loading">Impossible de charger vos voyages.</div>';
    }
}

document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const openButton = target.closest('button[data-open]');
    if (openButton) {
        const query = openButton.getAttribute('data-open');
        window.location.href = query ? `planning.html?${query}` : 'planning.html';
        return;
    }

    const deleteButton = target.closest('button[data-delete]');
    if (deleteButton) {
        const tripId = deleteButton.getAttribute('data-delete');
        if (!tripId) return;

        const trip = allTrips.find((item) => String(item.id) === String(tripId));
        const tripName = trip ? resolveTitle(trip) : 'ce voyage';
        const confirmed = window.confirm(`Supprimer ${tripName} et toutes les données liées ?`);
        if (!confirmed) return;

        deleteButton.disabled = true;
        deleteButton.textContent = 'Suppression...';

        try {
            await deleteTrip(tripId);
            allTrips = allTrips.filter((item) => String(item.id) !== String(tripId));
            updateStats(allTrips);
            applyFilters();
        } catch (err) {
            console.error('Suppression du voyage impossible.', err);
            window.alert("Impossible de supprimer ce voyage pour le moment.");
            deleteButton.disabled = false;
            deleteButton.textContent = 'Supprimer';
        }
        return;
    }
});

searchInput?.addEventListener('input', applyFilters);
statusFilter?.addEventListener('change', applyFilters);
sortFilter?.addEventListener('change', applyFilters);

initVoyagesPage();




