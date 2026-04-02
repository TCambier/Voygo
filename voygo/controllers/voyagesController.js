/**
 * @voygo-doc
 * Module: voyagesController
 * Fichier: voygo\controllers\voyagesController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

const grid = document.getElementById('voyages-grid');
const emptyState = document.getElementById('voyages-empty');
const searchInput = document.querySelector('.voyages-search input');
const statusFilter = document.getElementById('status-filter');
const sortFilter = document.getElementById('sort-filter');
const quickFilterTags = Array.from(document.querySelectorAll('.filter-tags .tag'));
const resetFiltersButton = document.getElementById('reset-filters-btn');
const statTotal = document.getElementById('stat-total');
const statUpcoming = document.getElementById('stat-upcoming');
const statUpcomingNotes = document.getElementById('stat-upcoming-notes');
const statBudget = document.getElementById('stat-budget');
const statBudgetNote = document.getElementById('stat-budget-note');
const createTripButton = document.getElementById('create-trip-btn');
const createTripEmptyButton = document.getElementById('create-trip-empty-btn');
const launchPlanningButton = document.getElementById('launch-planning-btn');
const shareModalBackdrop = document.getElementById('share-trip-modal-backdrop');
const shareTripForm = document.getElementById('share-trip-form');
const shareTripTitle = document.getElementById('share-trip-title');
const shareTripEmailInput = document.getElementById('share-trip-email');
const shareTripPermissionSelect = document.getElementById('share-trip-permission');
const shareTripFeedback = document.getElementById('share-trip-feedback');
const shareTripSubmitButton = document.getElementById('share-trip-submit');
const shareTripExistingEmpty = document.getElementById('share-trip-existing-empty');
const shareTripSharesList = document.getElementById('share-trip-shares-list');
const FAVORITES_STORAGE_KEY = 'voygo.favoriteTrips';

let allTrips = [];
let allBudgetRows = [];
let allTransportRows = [];
let allAccommodationRows = [];
let allActivityRows = [];
let selectedTripToShare = null;
let currentTripShares = [];
let activeQuickTag = quickFilterTags.find((tag) => tag.classList.contains('active'))?.textContent?.trim() || '';
const localFavoriteTripIds = new Set(loadLocalFavoriteTripIds());

function isAllTripsQuickTag(label) {
    const normalizedLabel = normalizeText(label).trim();
    return normalizedLabel === 'tous'
        || normalizedLabel === 'tout'
        || normalizedLabel === 'voir tous les voyages'
        || normalizedLabel === 'voir tout les voyages';
}

function activateAllTripsQuickTag() {
    const allTag = quickFilterTags.find((tag) => isAllTripsQuickTag(tag.textContent || ''));

    quickFilterTags.forEach((tag) => tag.classList.remove('active'));

    if (allTag) {
        allTag.classList.add('active');
        activeQuickTag = allTag.textContent?.trim() || '';
        return;
    }

    activeQuickTag = '';
}

// Charge les donnees necessaires pour 'loadLocalFavoriteTripIds'.
function loadLocalFavoriteTripIds() {
    try {
        const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((value) => String(value)).filter(Boolean);
    } catch {
        return [];
    }
}

// Persiste les donnees de 'persistLocalFavoriteTripIds'.
function persistLocalFavoriteTripIds() {
    try {
        window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...localFavoriteTripIds]));
    } catch {
        // Ignore storage quota and private mode errors.
    }
}

// Resout les informations calculees par 'resolveTripId'.
function resolveTripId(trip) {
    if (!trip || trip.id === null || trip.id === undefined) return '';
    return String(trip.id);
}

// Met a jour l'etat pilote par 'setLocalFavorite'.
function setLocalFavorite(tripId, isFavorite) {
    if (!tripId) return;
    if (isFavorite) {
        localFavoriteTripIds.add(tripId);
    } else {
        localFavoriteTripIds.delete(tripId);
    }
    persistLocalFavoriteTripIds();
}

// Normalise les donnees pour 'normalizeText'.
function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// Normalise les donnees pour 'toTagTokens'.
function toTagTokens(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value
            .flatMap((item) => toTagTokens(item))
            .filter(Boolean);
    }

    const normalized = normalizeText(value);
    if (!normalized) return [];

    return normalized
        .split(/[;,|/]+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

// Resout les informations calculees par 'resolveTripTags'.
function resolveTripTags(trip) {
    const rawValues = [
        trip.tags,
        trip.tag,
        trip.trip_tags,
        trip.categories,
        trip.category,
        trip.type,
        trip.trip_type,
        trip.theme,
        trip.labels
    ];

    return rawValues.flatMap((value) => toTagTokens(value));
}

// Determine la valeur booleenne pour 'isTruthyFavorite'.
function isTruthyFavorite(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
        const normalized = normalizeText(value).trim();
        return ['true', '1', 'yes', 'oui', 'favori', 'favorite'].includes(normalized);
    }
    return false;
}

// Resout les informations calculees par 'isFavoriteTrip'.
function isFavoriteTrip(trip) {
    const tripId = resolveTripId(trip);
    if (tripId && localFavoriteTripIds.has(tripId)) {
        return true;
    }

    const favoriteFields = [
        trip.is_favorite,
        trip.favorite,
        trip.favori,
        trip.is_starred,
        trip.starred,
        trip.pinned
    ];

    if (favoriteFields.some((value) => isTruthyFavorite(value))) {
        return true;
    }

    const tags = resolveTripTags(trip);
    return tags.some((token) => token.includes('favori') || token.includes('favorite'));
}

// Met a jour les donnees de 'syncFavoriteToApi'.
async function syncFavoriteToApi(trip, isFavorite) {
    const tripId = resolveTripId(trip);
    if (!tripId) return;

    try {
        await api.patch(`/api/trips/${encodeURIComponent(tripId)}`, { is_favorite: isFavorite });
    } catch {
        // Keep local fallback when backend schema does not expose a favorite field.
    }
}

// Applique les mises a jour de 'toggleTripFavorite'.
async function toggleTripFavorite(tripId) {
    if (!tripId) return;
    const trip = allTrips.find((item) => String(item.id) === String(tripId));
    if (!trip) return;

    const nextValue = !isFavoriteTrip(trip);

    setLocalFavorite(String(tripId), nextValue);
    trip.is_favorite = nextValue;
    applyFilters();

    await syncFavoriteToApi(trip, nextValue);
}

// Calcule les nuits pour 'resolveTripDurationNights'.
function resolveTripDurationNights(trip) {
    const start = normalizeDate(trip.start_date);
    const end = normalizeDate(trip.end_date);
    if (!start || !end) return null;

    const deltaMs = end.getTime() - start.getTime();
    if (deltaMs <= 0) return null;
    return Math.round(deltaMs / 86400000);
}

// Determine le matching principal de 'matchesQuickFilter'.
function matchesQuickFilter(trip, quickTagLabel) {
    const normalizedLabel = normalizeText(quickTagLabel);
    if (!normalizedLabel) return true;
    if (isAllTripsQuickTag(quickTagLabel)) return true;

    const tags = resolveTripTags(trip);
    const searchableText = normalizeText(`${resolveTitle(trip)} ${trip.destination || ''} ${resolveSummary(trip)}`);
    const nights = resolveTripDurationNights(trip);

    if (normalizedLabel === 'favoris') {
        return isFavoriteTrip(trip);
    }

    if (normalizedLabel === 'workation') {
        return tags.some((token) => token.includes('workation')) || searchableText.includes('workation');
    }

    if (normalizedLabel === 'week-end' || normalizedLabel === 'week end') {
        const byTags = tags.some((token) => token.includes('week-end') || token.includes('weekend') || token.includes('week end'));
        const byDuration = Number.isFinite(nights) && nights >= 1 && nights <= 3;
        return byTags || byDuration;
    }

    if (normalizedLabel === 'long sejour') {
        const byTags = tags.some((token) => token.includes('long sejour') || token.includes('long-sejour') || token.includes('longstay'));
        const byDuration = Number.isFinite(nights) && nights >= 7;
        return byTags || byDuration;
    }

    return true;
}

// Formate la valeur traitee par 'formatDate'.
function formatDate(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Formate la valeur traitee par 'formatCurrency'.
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

// Resout les informations calculees par 'resolveTravelers'.
function resolveTravelers(trip) {
    const raw = trip.people ?? trip.travelers ?? trip.nb_people ?? trip.passengers;
    const count = parseInt(raw, 10);
    return Number.isFinite(count) && count > 0 ? count : null;
}

// Resout les informations calculees par 'resolveBudget'.
function resolveBudget(trip) {
    return trip.budget ?? trip.budget_total ?? trip.total_budget ?? trip.estimated_budget ?? null;
}

// Resout les informations calculees par 'resolveBudgetAmountFromRow'.
function resolveBudgetAmountFromRow(row) {
    const candidates = [
        row?.actual_amount,
        row?.actual,
        row?.spent_amount,
        row?.amount_spent,
        row?.paid_amount
    ];

    for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }

    return 0;
}

// Resout les informations calculees par 'resolveTransportAmountFromRow'.
function resolveTransportAmountFromRow(row) {
    const candidates = [row?.actual_amount, row?.actual, row?.spent_amount, row?.price, row?.amount, row?.cost];
    for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}

// Resout les informations calculees par 'resolveActivityAmountFromRow'.
function resolveActivityAmountFromRow(row) {
    const candidates = [
        row?.actual_amount,
        row?.actual,
        row?.spent_amount,
        row?.price,
        row?.amount,
        row?.cost,
        row?.ticket_price,
        row?.entry_price
    ];
    for (const candidate of candidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }
    return 0;
}

// Calcule les nuits pour 'computeAccommodationNights'.
function computeAccommodationNights(row) {
    const explicit = Number(row?.nights);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    const startRaw = String(row?.start_date || '').trim();
    const endRaw = String(row?.end_date || '').trim();
    if (!startRaw || !endRaw) return 1;

    const start = normalizeDate(startRaw);
    const end = normalizeDate(endRaw);
    if (!start || !end) return 1;

    const deltaMs = end.getTime() - start.getTime();
    if (deltaMs <= 0) return 1;
    return Math.round(deltaMs / 86400000);
}

// Resout les informations calculees par 'resolveAccommodationAmountFromRow'.
function resolveAccommodationAmountFromRow(row) {
    const nightlyCandidates = [row?.price_per_night, row?.price, row?.nightly_price, row?.amount_per_night];
    let nightly = 0;
    for (const candidate of nightlyCandidates) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) {
            nightly = value;
            break;
        }
    }
    if (nightly <= 0) return 0;

    const nights = computeAccommodationNights(row);
    return nightly * nights;
}

// Construit le rendu pour 'buildBudgetTotalsByTrip'.
function buildBudgetTotalsByTrip(budgetRows, transportRows, accommodationRows, activityRows) {
    const totalsByTrip = new Map();

    (Array.isArray(budgetRows) ? budgetRows : []).forEach((row) => {
        const tripId = String(row?.trip_id || row?.tripId || '').trim();
        if (!tripId) return;

        const amount = resolveBudgetAmountFromRow(row);
        if (amount <= 0) return;

        totalsByTrip.set(tripId, (totalsByTrip.get(tripId) || 0) + amount);
    });

    (Array.isArray(transportRows) ? transportRows : []).forEach((row) => {
        const tripId = String(row?.trip_id || row?.tripId || '').trim();
        if (!tripId) return;

        const amount = resolveTransportAmountFromRow(row);
        if (amount <= 0) return;

        totalsByTrip.set(tripId, (totalsByTrip.get(tripId) || 0) + amount);
    });

    (Array.isArray(accommodationRows) ? accommodationRows : []).forEach((row) => {
        const tripId = String(row?.trip_id || row?.tripId || '').trim();
        if (!tripId) return;

        const amount = resolveAccommodationAmountFromRow(row);
        if (amount <= 0) return;

        totalsByTrip.set(tripId, (totalsByTrip.get(tripId) || 0) + amount);
    });

    (Array.isArray(activityRows) ? activityRows : []).forEach((row) => {
        const tripId = String(row?.trip_id || row?.tripId || '').trim();
        if (!tripId) return;

        const amount = resolveActivityAmountFromRow(row);
        if (amount <= 0) return;

        totalsByTrip.set(tripId, (totalsByTrip.get(tripId) || 0) + amount);
    });

    return totalsByTrip;
}

// Resout les informations calculees par 'resolveSummary'.
function resolveSummary(trip) {
    return trip.summary || trip.description || trip.notes || 'Aucune note pour ce voyage.';
}

// Resout les informations calculees par 'resolveTitle'.
function resolveTitle(trip) {
    return trip.name || trip.destination || 'Voyage';
}

// Normalise les donnees pour 'normalizeDate'.
function normalizeDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) {
        const normalized = new Date(dateValue);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }

    if (typeof dateValue === 'string') {
        const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const [, year, month, day] = match;
            return new Date(Number(year), Number(month) - 1, Number(day));
        }
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

function normalizeDateTime(dateValue, options = {}) {
    const { endOfDayForDateOnly = false } = options;

    if (!dateValue) return null;

    if (dateValue instanceof Date) {
        const normalized = new Date(dateValue);
        if (Number.isNaN(normalized.getTime())) return null;
        return normalized;
    }

    if (typeof dateValue === 'string') {
        const exactDateOnly = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (exactDateOnly) {
            const [, year, month, day] = exactDateOnly;
            if (endOfDayForDateOnly) {
                return new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
            }
            return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
        }
    }

    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function pluralizeDays(days) {
    return `${days} jour${days > 1 ? 's' : ''}`;
}

function resolveTripCreatedDate(trip) {
    return normalizeDateTime(
        trip.creation_date
        ?? trip.created_at
        ?? trip.createdAt
        ?? trip.created
        ?? trip.updated_at
        ?? trip.updatedAt
        ?? null
    );
}

function resolveTripStartDate(trip) {
    return normalizeDateTime(
        trip.start_date
        ?? trip.startDate
        ?? trip.departure_date
        ?? trip.departureDate
        ?? null
    );
}

function resolveTripEndDate(trip) {
    return normalizeDateTime(
        trip.end_date
        ?? trip.endDate
        ?? trip.return_date
        ?? trip.returnDate
        ?? null,
        { endOfDayForDateOnly: true }
    );
}

function computeTripProgressVisual(trip) {
    const start = resolveTripStartDate(trip);
    const resolvedEnd = resolveTripEndDate(trip);
    const end = resolvedEnd && start && resolvedEnd < start ? start : (resolvedEnd || start);

    if (!start || !end || end < start) {
        const planningProgress = clamp(Number(trip.progress) || 0, 0, 100);
        return {
            preTripWidth: planningProgress,
            inTripWidth: 0,
            barClassName: 'is-planning',
            text: planningProgress ? `Planification à ${planningProgress}%` : 'Planification à démarrer'
        };
    }

    const now = new Date();

    const oneDayAfterEnd = new Date(end);
    oneDayAfterEnd.setDate(oneDayAfterEnd.getDate() + 1);

    if (now >= oneDayAfterEnd) {
        return {
            preTripWidth: 0,
            inTripWidth: 100,
            barClassName: 'is-passed',
            text: 'Voyage déjà passé'
        };
    }

    if (now < start) {
        const createdAt = resolveTripCreatedDate(trip);
        const fallbackTimelineStart = new Date(start.getTime() - 86400000);
        const timelineStart = createdAt && createdAt < start ? createdAt : fallbackTimelineStart;
        const totalPreparationMs = Math.max(1, start.getTime() - timelineStart.getTime());
        const elapsedPreparationMs = clamp(now.getTime() - timelineStart.getTime(), 0, totalPreparationMs);
        const preTripRaw = clamp((elapsedPreparationMs / totalPreparationMs) * 100, 0, 100);
        const preTripWidth = preTripRaw > 0 ? Math.max(preTripRaw, 1) : 0;
        const daysUntilStart = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 86400000));

        return {
            preTripWidth,
            inTripWidth: 0,
            barClassName: 'is-before-trip',
            text: `Préparation : ${Math.round(preTripRaw)}% · Départ dans ${pluralizeDays(daysUntilStart)}`
        };
    }

    const totalTripMs = Math.max(1, end.getTime() - start.getTime());
    const elapsedTripMs = clamp(now.getTime() - start.getTime(), 0, totalTripMs);
    const inTripRaw = clamp((elapsedTripMs / totalTripMs) * 100, 0, 100);
    const inTripCompletion = inTripRaw > 0 ? Math.max(inTripRaw, 1) : 0;

    return {
        preTripWidth: 100,
        inTripWidth: inTripCompletion,
        barClassName: 'is-during-trip',
        text: `Voyage en cours : ${Math.round(inTripRaw)}%`
    };
}

// Gere la logique principale de 'computeStatus'.
function computeStatus(trip) {
    const start = resolveTripStartDate(trip);
    const end = resolveTripEndDate(trip);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start && start > today) return { label: 'À venir', className: 'upcoming' };
    if (end && end < today) return { label: 'Terminé', className: 'done' };
    return { label: 'En cours', className: 'in-progress' };
}

// Gere la logique principale de 'buildTripCard'.
function buildTripCard(trip, index) {
    const card = document.createElement('article');
    card.className = `voyage-card${index === 0 ? ' featured' : ''}`;

    const status = computeStatus(trip);
    const travelers = resolveTravelers(trip);
    const budget = resolveBudget(trip);
    const summary = resolveSummary(trip);
    const title = resolveTitle(trip);
    const startDate = formatDate(resolveTripStartDate(trip));
    const endDate = formatDate(resolveTripEndDate(trip));
    const progressVisual = computeTripProgressVisual(trip);

    const datesLabel = startDate && endDate ? `${startDate} \u2192 ${endDate}` : 'Dates à définir';

    const metaItems = [];
    if (travelers) metaItems.push(`<span><i class='bx bx-user'></i> ${travelers} voyageur${travelers > 1 ? 's' : ''}</span>`);
    if (budget) metaItems.push(`<span><i class='bx bx-wallet'></i> ${formatCurrency(budget)}</span>`);
    metaItems.push(`<span><i class='bx bx-map'></i> ${trip.steps_count ?? trip.steps ?? '0'} étape${(trip.steps_count ?? trip.steps ?? 0) > 1 ? 's' : ''}</span>`);

    const accessMode = trip.access_mode || 'owner';
    const isOwner = accessMode === 'owner';
    const favorite = isFavoriteTrip(trip);
    if (!isOwner) {
        const permissionLabel = trip.can_edit ? 'Partage : lecture + modification' : 'Partage : lecture seule';
        metaItems.push(`<span><i class='bx bx-link-alt'></i> ${permissionLabel}</span>`);
    }

    const query = new URLSearchParams();
    if (trip.id) query.set('tripId', trip.id);
    if (trip.destination) query.set('destination', trip.destination);
    if (trip.start_date) query.set('startDate', trip.start_date);
    if (trip.end_date) query.set('endDate', trip.end_date);
    query.set('tripAccess', accessMode);

    const canDelete = Boolean(trip.id) && isOwner;
    const canShare = Boolean(trip.id) && isOwner;

    card.innerHTML = `
        <div class="voyage-card-header">
            <div>
                <h3>${title}</h3>
                <p class="voyage-dates">${datesLabel}</p>
            </div>
            <div class="voyage-card-header-actions">
                <button
                    type="button"
                    class="favorite-trip-btn${favorite ? ' active' : ''}"
                    data-favorite="${trip.id || ''}"
                    aria-label="${favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}"
                    aria-pressed="${favorite ? 'true' : 'false'}"
                >
                    <i class='bx ${favorite ? 'bxs-heart' : 'bx-heart'}'></i>
                </button>
                <span class="status ${status.className}">${status.label}</span>
            </div>
        </div>
        <p class="voyage-summary">${summary}</p>
        <div class="voyage-meta">
            ${metaItems.join('')}
        </div>
        <div class="voyage-progress">
            <div class="progress-bar ${progressVisual.barClassName}">
                <span class="progress-segment progress-segment-pre" style="width: ${progressVisual.preTripWidth}%;"></span>
                <span class="progress-segment progress-segment-during" style="width: ${progressVisual.inTripWidth}%;"></span>
            </div>
            <span class="progress-text">${progressVisual.text}</span>
        </div>
        <div class="voyage-actions">
            <button class="btn-secondary" data-open="${query.toString()}">Ouvrir</button>
            <button class="btn-ghost" data-share="${trip.id || ''}" ${canShare ? '' : 'disabled'}>Partager</button>
            <button class="btn-danger" data-delete="${trip.id || ''}" ${canDelete ? '' : 'disabled'}>Supprimer</button>
        </div>
    `;

    return card;
}

// Construit le rendu pour 'renderTrips'.
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

// Applique les mises a jour de 'updateStats'.
function updateStats(trips) {
    if (!statTotal || !statUpcoming || !statUpcomingNotes || !statBudget || !statBudgetNote) {
        return;
    }

    statTotal.textContent = String(trips.length);

    const upcomingTrips = trips.filter((trip) => computeStatus(trip).label === 'À venir');
    statUpcoming.textContent = String(upcomingTrips.length);
    const upcomingNames = upcomingTrips.slice(0, 2).map(resolveTitle);
    statUpcomingNotes.textContent = upcomingNames.length ? upcomingNames.join(' et ') : '-';

    const totalsByTrip = buildBudgetTotalsByTrip(
        allBudgetRows,
        allTransportRows,
        allAccommodationRows,
        allActivityRows
    );
    let budgets = trips
        .map((trip) => totalsByTrip.get(String(trip?.id || '').trim()) || 0)
        .filter((value) => Number.isFinite(value) && value > 0);

    // Fallback on trip-level budget fields when no detailed budget rows are available.
    if (!budgets.length) {
        budgets = trips
            .map((trip) => resolveBudget(trip))
            .map((value) => (value === null || value === undefined ? null : Number(value)))
            .filter((value) => Number.isFinite(value) && value > 0);
    }

    if (budgets.length) {
        const avg = budgets.reduce((sum, value) => sum + value, 0) / budgets.length;
        statBudget.textContent = formatCurrency(avg);
        statBudgetNote.textContent = `Basé sur ${budgets.length} voyage${budgets.length > 1 ? 's' : ''} (budgets, transports, logements, activités)`;
    } else {
        statBudget.textContent = '-';
        statBudgetNote.textContent = 'Aucune dépense renseignée';
    }
}

// Gere la logique principale de 'applyFilters'.
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

    if (activeQuickTag) {
        filtered = filtered.filter((trip) => matchesQuickFilter(trip, activeQuickTag));
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

// Reinitialise l'etat gere par 'resetFilters'.
function resetFilters() {
    if (searchInput) {
        searchInput.value = '';
    }

    if (statusFilter) {
        statusFilter.value = 'Tous';
    }

    if (sortFilter) {
        sortFilter.value = 'Dernière mise à jour';
    }

    activateAllTripsQuickTag();

    applyFilters();
}

// Gere la logique principale de 'redirectToIndex'.
function redirectToIndex() {
    window.location.href = '/index.html';
}

// Recupere les donnees distantes pour 'fetchTrips'.
async function fetchTrips() {
    const result = await api.get('/api/trips');
    return result?.data || [];
}

// Recupere les donnees distantes pour 'fetchBudgets'.
async function fetchBudgets() {
    const result = await api.get('/api/budgets');
    return result?.data || [];
}

// Recupere les donnees distantes pour 'fetchActivities'.
async function fetchActivities() {
    const result = await api.get('/api/activities');
    return result?.data || [];
}

// Recupere les donnees distantes pour 'fetchAccommodations'.
async function fetchAccommodations() {
    const result = await api.get('/api/accommodations');
    return result?.data || [];
}

// Recupere les donnees distantes pour 'fetchTransportsByTrips'.
async function fetchTransportsByTrips(trips) {
    const tripIds = (Array.isArray(trips) ? trips : [])
        .map((trip) => String(trip?.id || '').trim())
        .filter(Boolean);

    if (!tripIds.length) return [];

    const results = await Promise.all(
        tripIds.map(async (tripId) => {
            try {
                const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripId)}`);
                return Array.isArray(result?.data) ? result.data : [];
            } catch {
                return [];
            }
        })
    );

    return results.flat();
}

// Supprime les donnees ciblees par 'deleteTrip'.
async function deleteTrip(tripId) {
    await api.delete(`/api/trips/${encodeURIComponent(tripId)}`);
}

// Met a jour l'etat pilote par 'setShareFeedback'.
function setShareFeedback(message, type = 'info') {
    if (!shareTripFeedback) return;
    shareTripFeedback.textContent = message || '';
    shareTripFeedback.dataset.type = type;
    shareTripFeedback.hidden = !message;
}

// Construit le rendu pour 'renderTripShares'.
function renderTripShares() {
    if (!shareTripExistingEmpty || !shareTripSharesList) return;

    if (!currentTripShares.length) {
        shareTripExistingEmpty.hidden = false;
        shareTripSharesList.hidden = true;
        shareTripSharesList.innerHTML = '';
        return;
    }

    shareTripExistingEmpty.hidden = true;
    shareTripSharesList.hidden = false;
    shareTripSharesList.innerHTML = currentTripShares.map((share) => `
        <div class="share-trip-row" data-user-id="${share.shared_with_user_id}">
            <div class="share-trip-row-main">
                <strong>${share.shared_with_email || 'Compte partage'}</strong>
            </div>
            <div class="share-trip-row-actions">
                <select class="form-input share-trip-row-permission" data-share-permission-user="${share.shared_with_user_id}">
                    <option value="read" ${share.permission === 'read' ? 'selected' : ''}>Lecture seule</option>
                    <option value="edit" ${share.permission === 'edit' ? 'selected' : ''}>Lecture + modification</option>
                </select>
                <button type="button" class="btn-danger share-trip-row-remove" data-share-remove-user="${share.shared_with_user_id}">Retirer</button>
            </div>
        </div>
    `).join('');
}

// Charge les donnees necessaires pour 'loadTripShares'.
async function loadTripShares() {
    if (!selectedTripToShare?.id) return;

    try {
        const result = await api.get(`/api/trips/${encodeURIComponent(selectedTripToShare.id)}/share`);
        currentTripShares = Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
        currentTripShares = [];
        setShareFeedback(error?.message || 'Impossible de charger les partages existants.', 'error');
    }

    renderTripShares();
}

// Applique les mises a jour de 'updateSharePermission'.
async function updateSharePermission(sharedWithUserId, permission) {
    if (!selectedTripToShare?.id || !sharedWithUserId) return;
    await api.patch(`/api/trips/${encodeURIComponent(selectedTripToShare.id)}/share/${encodeURIComponent(sharedWithUserId)}`, {
        permission
    });
}

// Gere la logique principale de 'revokeShare'.
async function revokeShare(sharedWithUserId) {
    if (!selectedTripToShare?.id || !sharedWithUserId) return;
    await api.delete(`/api/trips/${encodeURIComponent(selectedTripToShare.id)}/share/${encodeURIComponent(sharedWithUserId)}`);
}

// Gere la logique principale de 'openShareModal'.
function openShareModal(trip) {
    if (!shareModalBackdrop || !shareTripForm || !trip) return;
    selectedTripToShare = trip;
    currentTripShares = [];

    if (shareTripTitle) {
        shareTripTitle.textContent = resolveTitle(trip);
    }
    if (shareTripEmailInput) {
        shareTripEmailInput.value = '';
    }
    if (shareTripPermissionSelect) {
        shareTripPermissionSelect.value = 'read';
    }
    setShareFeedback('', 'info');

    shareModalBackdrop.hidden = false;
    shareModalBackdrop.setAttribute('aria-hidden', 'false');
    shareTripEmailInput?.focus();
    loadTripShares();
}

// Gere la logique principale de 'closeShareModal'.
function closeShareModal() {
    if (!shareModalBackdrop) return;
    shareModalBackdrop.hidden = true;
    shareModalBackdrop.setAttribute('aria-hidden', 'true');
    selectedTripToShare = null;
    currentTripShares = [];
    renderTripShares();
    setShareFeedback('', 'info');
}

// Gere la logique principale de 'verifyEmailExists'.
async function verifyEmailExists(email) {
    const result = await api.get(`/api/auth/email-exists?email=${encodeURIComponent(email)}`);
    return Boolean(result?.exists);
}

// Gere la logique principale de 'submitTripShare'.
async function submitTripShare(event) {
    event.preventDefault();
    if (!selectedTripToShare?.id) return;

    const email = shareTripEmailInput?.value.trim().toLowerCase() || '';
    const permission = shareTripPermissionSelect?.value === 'edit' ? 'edit' : 'read';

    if (!email) {
        setShareFeedback('Veuillez saisir une adresse email.', 'error');
        return;
    }

    if (!email.includes('@')) {
        setShareFeedback('Adresse email invalide.', 'error');
        return;
    }

    if (shareTripSubmitButton) {
        shareTripSubmitButton.disabled = true;
        shareTripSubmitButton.textContent = 'Verification...';
    }

    try {
        const exists = await verifyEmailExists(email);
        if (!exists) {
            setShareFeedback("Ce compte n'existe pas.", 'error');
            return;
        }

        if (shareTripSubmitButton) {
            shareTripSubmitButton.textContent = 'Partage...';
        }

        await api.post(`/api/trips/${encodeURIComponent(selectedTripToShare.id)}/share`, {
            email,
            permission
        });

        setShareFeedback('Voyage partage avec succes.', 'success');
        if (shareTripEmailInput) {
            shareTripEmailInput.value = '';
        }
        await loadTripShares();
    } catch (error) {
        setShareFeedback(error?.message || 'Partage impossible pour le moment.', 'error');
    } finally {
        if (shareTripSubmitButton) {
            shareTripSubmitButton.disabled = false;
            shareTripSubmitButton.textContent = 'Partager';
        }
    }
}

// Initialise le bloc fonctionnel 'initVoyagesPage'.
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

        const trips = await fetchTrips();
        const [budgets, activities, accommodations, transports] = await Promise.all([
            fetchBudgets(),
            fetchActivities(),
            fetchAccommodations(),
            fetchTransportsByTrips(trips)
        ]);
        allTrips = Array.isArray(trips) ? trips : [];
        allBudgetRows = Array.isArray(budgets) ? budgets : [];
        allActivityRows = Array.isArray(activities) ? activities : [];
        allAccommodationRows = Array.isArray(accommodations) ? accommodations : [];
        allTransportRows = Array.isArray(transports) ? transports : [];
        activateAllTripsQuickTag();
        updateStats(allTrips);
        applyFilters();
    } catch (err) {
        console.error('Impossible de charger les voyages:', err);
        grid.innerHTML = '<div class="voyages-loading">Impossible de charger vos voyages.</div>';
    }
}

document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const quickTag = target.closest('.filter-tags .tag');
    if (quickTag) {
        quickFilterTags.forEach((tag) => tag.classList.remove('active'));
        quickTag.classList.add('active');
        activeQuickTag = quickTag.textContent?.trim() || '';
        applyFilters();
        return;
    }

    const favoriteButton = target.closest('button[data-favorite]');
    if (favoriteButton) {
        const tripId = favoriteButton.getAttribute('data-favorite');
        await toggleTripFavorite(tripId);
        return;
    }

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
            allBudgetRows = allBudgetRows.filter((row) => String(row?.trip_id || row?.tripId || '') !== String(tripId));
            allActivityRows = allActivityRows.filter((row) => String(row?.trip_id || row?.tripId || '') !== String(tripId));
            allAccommodationRows = allAccommodationRows.filter((row) => String(row?.trip_id || row?.tripId || '') !== String(tripId));
            allTransportRows = allTransportRows.filter((row) => String(row?.trip_id || row?.tripId || '') !== String(tripId));
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

    const shareButton = target.closest('button[data-share]');
    if (shareButton) {
        const tripId = shareButton.getAttribute('data-share');
        if (!tripId) return;

        const trip = allTrips.find((item) => String(item.id) === String(tripId));
        if (!trip) return;
        openShareModal(trip);
        return;
    }

    if (target.closest('[data-share-close]')) {
        closeShareModal();
    }

    const removeShareButton = target.closest('button[data-share-remove-user]');
    if (removeShareButton) {
        const sharedWithUserId = removeShareButton.getAttribute('data-share-remove-user');
        if (!sharedWithUserId) return;

        const confirmed = window.confirm('Retirer l\'acces de ce compte a ce voyage ?');
        if (!confirmed) return;

        removeShareButton.disabled = true;
        try {
            await revokeShare(sharedWithUserId);
            setShareFeedback('Acces retire avec succes.', 'success');
            await loadTripShares();
        } catch (error) {
            setShareFeedback(error?.message || 'Suppression du partage impossible.', 'error');
            removeShareButton.disabled = false;
        }
        return;
    }
});

shareTripSharesList?.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.matches('[data-share-permission-user]')) return;

    const sharedWithUserId = target.getAttribute('data-share-permission-user');
    if (!sharedWithUserId) return;

    const permission = target.value === 'edit' ? 'edit' : 'read';
    target.disabled = true;
    try {
        await updateSharePermission(sharedWithUserId, permission);
        setShareFeedback('Droit de partage mis a jour.', 'success');
        await loadTripShares();
    } catch (error) {
        setShareFeedback(error?.message || 'Mise a jour du partage impossible.', 'error');
        target.disabled = false;
    }
});

shareModalBackdrop?.addEventListener('click', (event) => {
    if (event.target === shareModalBackdrop) {
        closeShareModal();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shareModalBackdrop?.hidden) {
        closeShareModal();
    }
});

shareTripForm?.addEventListener('submit', submitTripShare);

searchInput?.addEventListener('input', applyFilters);
statusFilter?.addEventListener('change', applyFilters);
sortFilter?.addEventListener('change', applyFilters);
resetFiltersButton?.addEventListener('click', resetFilters);

createTripButton?.addEventListener('click', redirectToIndex);
createTripEmptyButton?.addEventListener('click', redirectToIndex);
launchPlanningButton?.addEventListener('click', redirectToIndex);

initVoyagesPage();




