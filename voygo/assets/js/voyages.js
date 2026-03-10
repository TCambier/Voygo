import { supabase } from './supabase.js';

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
            <button class="btn-ghost" data-duplicate="${trip.id || ''}">Dupliquer</button>
        </div>
    `;

    return card;
}

function renderTrips(trips) {
    if (!grid || !emptyState) return;
    grid.innerHTML = '';

    if (!trips.length) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;
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

async function fetchTripsForUser(userId) {
    const columns = 'id,name,destination,start_date,end_date,people,travelers,steps,steps_count,budget,budget_total,total_budget,estimated_budget,progress,summary,description,notes,created_at,updated_at,user_id,uid';

    try {
        const { data, error } = await supabase
            .from('trips')
            .select(columns)
            .eq('user_id', userId);

        if (!error && data?.length) return data;
        if (!error && data?.length === 0) return data;
        if (error) {
            console.warn('Query trips by user_id failed:', error.message);
        }
    } catch (err) {
        console.warn('Query trips by user_id failed:', err);
    }

    const { data: altData, error: altError } = await supabase
        .from('trips')
        .select(columns)
        .eq('uid', userId);

    if (altError) throw altError;
    return altData || [];
}

async function initVoyagesPage() {
    if (!grid || !emptyState) return;
    grid.innerHTML = '<div class="voyages-loading">Chargement des voyages...</div>';

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (authError || !userId) {
        window.location.href = `login.html?returnTo=${encodeURIComponent('voyages.html')}`;
        return;
    }

    try {
        allTrips = await fetchTripsForUser(userId);
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
});

searchInput?.addEventListener('input', applyFilters);
statusFilter?.addEventListener('change', applyFilters);
sortFilter?.addEventListener('change', applyFilters);

initVoyagesPage();
