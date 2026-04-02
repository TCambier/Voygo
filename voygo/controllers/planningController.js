/**
 * @voygo-doc
 * Module: planningController
 * Fichier: voygo\controllers\planningController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';
import { initCountryAutocomplete } from './countryController.js';
import {
  listAccommodationsByTrip,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation
} from './accommodationController.js';
import { deleteBudget } from './budgetController.js';

// Formate la valeur traitee par 'formatDate'.
function formatDate(dateValue) {
  if (!dateValue) return '';
  const dateKeyMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateKeyMatch) {
    const year = Number(dateKeyMatch[1]);
    const month = Number(dateKeyMatch[2]) - 1;
    const day = Number(dateKeyMatch[3]);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('fr-FR');
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

// Gere la logique principale de 'toTimeInputValue'.
function toTimeInputValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : '';
}

// Gere la logique principale de 'toDateInputValue'.
function toDateInputValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Retourne l'information calculee par 'getTodayInputValue'.
function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

// Gere la logique principale de 'addDaysToInput'.
function addDaysToInput(value, days) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// Retourne la cle locale des budgets pour un utilisateur donne.
function getBudgetLocalStorageKey(userId) {
  return `voygo_budget_local:${userId || 'anon'}`;
}

// Detecte les budgets lies a un voyage qui sont hors de la nouvelle periode.
function getBudgetsOutsideTripDates(budgets, tripId, nextStartDate, nextEndDate) {
  const normalizedTripId = String(tripId || '').trim();
  const minDate = toDateInputValue(nextStartDate || '');
  const maxDate = toDateInputValue(nextEndDate || '');

  if (!normalizedTripId) return [];

  return (Array.isArray(budgets) ? budgets : []).filter((item) => {
    if (String(item?.trip_id || item?.tripId || '').trim() !== normalizedTripId) return false;
    const itemDate = toDateInputValue(item?.spend_date || item?.date || '');
    if (!itemDate) return true;
    if (minDate && itemDate < minDate) return true;
    if (maxDate && itemDate > maxDate) return true;
    return false;
  });
}

// Supprime les budgets associes a un voyage donne.
async function deleteBudgetsOutsideTripDates({ tripId, nextStartDate, nextEndDate, deleteAllForTrip = false }) {
  if (!tripId) return;

  let budgets = [];
  try {
    const result = await api.get('/api/budgets');
    budgets = Array.isArray(result?.data) ? result.data : [];
  } catch (error) {
    console.warn('Impossible de charger les budgets avant nettoyage.', error);
  }

  const budgetsToDelete = deleteAllForTrip
    ? budgets.filter((item) => String(item?.trip_id || item?.tripId || '').trim() === String(tripId).trim())
    : getBudgetsOutsideTripDates(budgets, tripId, nextStartDate, nextEndDate);

  if (budgetsToDelete.length > 0) {
    await Promise.all(
      budgetsToDelete
        .filter((budget) => budget?.id)
        .map((budget) => deleteBudget(budget.id))
    );
  }

  const localStorageKey = getBudgetLocalStorageKey(currentUserId);
  const saved = localStorage.getItem(localStorageKey);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return;

    const nextBudgets = deleteAllForTrip
      ? parsed.filter((item) => String(item?.tripId || item?.trip_id || '').trim() !== String(tripId).trim())
      : parsed.filter((item) => {
          if (String(item?.tripId || item?.trip_id || '').trim() !== String(tripId).trim()) return true;
          const itemDate = toDateInputValue(item?.date || item?.spend_date || '');
          if (!itemDate) return true;
          if (nextStartDate && itemDate < toDateInputValue(nextStartDate)) return false;
          if (nextEndDate && itemDate > toDateInputValue(nextEndDate)) return false;
          return true;
        });

    localStorage.setItem(localStorageKey, JSON.stringify(nextBudgets));
  } catch {
    // Ignore local cache cleanup errors.
  }
}

// Gere la logique principale de 'readFallbackTrip'.
function readFallbackTrip() {
  const stored = localStorage.getItem('voygo_current_trip');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  accessMode: 'owner',
  canEdit: true
};

let currentUserId = '';

let transports = [];
let accommodations = [];
let activitySuggestions = [];
let tripActivities = [];
let suggestionsVisibleCount = 5;
let lastAddedActivityId = null;

const SCHEDULE_META_OPEN = '[VOYGO_SCHEDULE]';
const SCHEDULE_META_CLOSE = '[/VOYGO_SCHEDULE]';

// Gere la logique principale de 'escapeHtml'.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Formate la valeur traitee par 'formatDuration'.
function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}min`;
  if (hours) return `${hours}h`;
  return `${mins}min`;
}

// Formate la valeur traitee par 'formatPrice'.
function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

// Formate la valeur traitee par 'formatActivityRating'.
function formatActivityRating(rating, reviewsCount) {
  const safeRating = Number(rating);
  const safeReviews = Number(reviewsCount);
  if (!Number.isFinite(safeRating)) return 'Note indisponible';
  const note = safeRating.toFixed(1).replace('.', ',');
  if (!Number.isFinite(safeReviews) || safeReviews <= 0) {
    return `${note} / 5`;
  }
  return `${note} / 5 (${safeReviews} avis)`;
}

// Gere la logique principale de 'toMinuteOfDay'.
function toMinuteOfDay(timeValue) {
  const match = String(timeValue || '').trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

// Normalise les donnees pour 'normalizeActivityDate'.
function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

// Gere la logique principale de 'readScheduleMetadata'.
function readScheduleMetadata(description) {
  const text = String(description || '');
  const match = text.match(/\[VOYGO_SCHEDULE\]([\s\S]*?)\[\/VOYGO_SCHEDULE\]/);
  if (!match || !match[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Gere la logique principale de 'stripScheduleMetadata'.
function stripScheduleMetadata(description) {
  const text = String(description || '');
  return text.replace(/\s*\[VOYGO_SCHEDULE\][\s\S]*?\[\/VOYGO_SCHEDULE\]\s*/g, '').trim();
}

// Gere la logique principale de 'attachScheduleMetadata'.
function attachScheduleMetadata(description, schedule) {
  const clean = stripScheduleMetadata(description);
  const metadata = JSON.stringify({
    date: schedule.date,
    time: schedule.startTime,
    duration_minutes: schedule.durationMinutes
  });
  return [clean, `${SCHEDULE_META_OPEN}${metadata}${SCHEDULE_META_CLOSE}`].filter(Boolean).join('\n\n');
}

// Retourne l'information calculee par 'getActivitySchedule'.
function getActivitySchedule(item) {
  const metadata = readScheduleMetadata(item?.description);
  const date = normalizeActivityDate(metadata?.date || item?.activity_date || '');
  const startTime = String(metadata?.time || '').trim();
  const durationRaw = Number(metadata?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 60;

  if (!date || !startTime || toMinuteOfDay(startTime) === null) return null;

  return {
    date,
    startTime,
    durationMinutes
  };
}

// Retourne l'information calculee par 'getActivityDateKey'.
function getActivityDateKey(item) {
  const metadata = readScheduleMetadata(item?.description);
  return normalizeActivityDate(metadata?.date || item?.activity_date || '');
}

// Retourne l'information calculee par 'getActivitiesOutsideTripDates'.
function getActivitiesOutsideTripDates(nextStartDate, nextEndDate) {
  if (!nextStartDate || !nextEndDate) return [];

  return (tripActivities || []).filter((activity) => {
    const dateKey = getActivityDateKey(activity);
    if (!dateKey) return false;
    return dateKey < nextStartDate || dateKey > nextEndDate;
  });
}

// Retourne l'information calculee par 'getAccommodationDateKey'.
function getAccommodationDateKey(value) {
  return normalizeActivityDate(value || '');
}

// Retourne l'information calculee par 'getAccommodationsOutsideTripDates'.
function getAccommodationsOutsideTripDates(nextStartDate, nextEndDate) {
  if (!nextStartDate || !nextEndDate) return [];

  return (accommodations || []).filter((accommodation) => {
    const startDate = getAccommodationDateKey(accommodation?.start_date);
    const endDate = getAccommodationDateKey(accommodation?.end_date);
    if (!startDate || !endDate) return false;
    return startDate < nextStartDate || endDate > nextEndDate;
  });
}

// Retourne l'information calculee par 'getTransportDateKey'.
function getTransportDateKey(item) {
  return normalizeActivityDate(item?.travel_date || '');
}

// Retourne l'information calculee par 'getTransportsOutsideTripDates'.
function getTransportsOutsideTripDates(nextStartDate, nextEndDate) {
  if (!nextStartDate || !nextEndDate) return [];

  return (transports || []).filter((transport) => {
    const dateKey = getTransportDateKey(transport);
    if (!dateKey) return false;
    return dateKey < nextStartDate || dateKey > nextEndDate;
  });
}

// Formate la valeur traitee par 'formatActivitySchedule'.
function formatActivitySchedule(schedule) {
  if (!schedule) return '';
  const dateLabel = formatDate(schedule.date);
  const durationLabel = formatDuration(schedule.durationMinutes);
  return `${dateLabel} a ${schedule.startTime} (${durationLabel})`;
}

// Retourne l'information calculee par 'getTransportSchedule'.
function getTransportSchedule(item) {
  const date = normalizeActivityDate(item?.travel_date || '');
  const startTime = toTimeInputValue(item?.travel_time || '');
  const durationRaw = Number(item?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 0;

  if (!date || !startTime || toMinuteOfDay(startTime) === null || durationMinutes <= 0) return null;

  return {
    date,
    startTime,
    durationMinutes
  };
}

// Gere la logique principale de 'findTransportConflict'.
function findTransportConflict(schedule, excludedTransportId = null) {
  const start = toMinuteOfDay(schedule.startTime);
  if (start === null) return null;
  const end = start + schedule.durationMinutes;

  for (const existing of transports) {
    if (excludedTransportId && String(existing.id) === String(excludedTransportId)) continue;

    const existingSchedule = getTransportSchedule(existing);
    if (!existingSchedule || existingSchedule.date !== schedule.date) continue;

    const existingStart = toMinuteOfDay(existingSchedule.startTime);
    if (existingStart === null) continue;
    const existingEnd = existingStart + existingSchedule.durationMinutes;
    const overlap = start < existingEnd && existingStart < end;

    if (overlap) {
      return existing;
    }
  }

  return null;
}

// Formate la valeur traitee par 'formatTransportLabel'.
function formatTransportLabel(item) {
  return [item?.origin || '-', item?.destination || '-'].join(' -> ');
}

// Normalise les donnees pour 'normalizeActivityIdentityPart'.
function normalizeActivityIdentityPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Retourne l'information calculee par 'getActivityIdentity'.
function getActivityIdentity(item) {
  const sourcePlaceId = String(item?.source_place_id || '').trim();
  if (sourcePlaceId) {
    return `source:${sourcePlaceId}`;
  }

  const name = normalizeActivityIdentityPart(item?.name);
  const address = normalizeActivityIdentityPart(item?.address);
  if (!name) return '';
  return `text:${name}::${address}`;
}

// Normalise les donnees pour 'normalizeDestination'.
function normalizeDestination(value) {
  return String(value || '').trim().toLowerCase();
}

// Verifie la condition exposee par 'isReadOnlyTrip'.
function isReadOnlyTrip() {
  return !tripState.canEdit;
}

// Gere la logique principale de 'applyReadOnlyUiState'.
function applyReadOnlyUiState() {
  document.body.classList.toggle('is-read-only-trip', isReadOnlyTrip());
}

// Gere la logique principale de 'syncPlanningUrl'.
function syncPlanningUrl() {
  const params = new URLSearchParams(window.location.search);
  if (tripState.id) {
    params.set('tripId', String(tripState.id));
  } else {
    params.delete('tripId');
  }

  if (tripState.destination) {
    params.set('destination', tripState.destination);
  } else {
    params.delete('destination');
  }

  if (tripState.startDate) {
    params.set('startDate', toDateInputValue(tripState.startDate));
  } else {
    params.delete('startDate');
  }

  if (tripState.endDate) {
    params.set('endDate', toDateInputValue(tripState.endDate));
  } else {
    params.delete('endDate');
  }

  if (tripState.accessMode) {
    params.set('tripAccess', tripState.accessMode);
  } else {
    params.delete('tripAccess');
  }

  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `planning.html?${nextQuery}` : 'planning.html';
  window.history.replaceState({}, '', nextUrl);
  updatePlanningNavigationLinks();
}

// Applique les mises a jour de 'updatePlanningNavigationLinks'.
function updatePlanningNavigationLinks() {
  const nav = document.querySelector('.planning-nav');
  if (!nav) return;

  const params = new URLSearchParams();
  if (tripState.id) params.set('tripId', String(tripState.id));
  if (tripState.destination) params.set('destination', tripState.destination);
  if (tripState.startDate) params.set('startDate', toDateInputValue(tripState.startDate));
  if (tripState.endDate) params.set('endDate', toDateInputValue(tripState.endDate));
  if (tripState.accessMode) params.set('tripAccess', tripState.accessMode);

  const query = params.toString();
  nav.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const basePath = href.split('?')[0];
    if (!/\.html$/i.test(basePath)) return;
    link.setAttribute('href', query ? `${basePath}?${query}` : basePath);
  });
}

// Gere la logique principale de 'filterOutAddedSuggestions'.
function filterOutAddedSuggestions(items) {
  const existingIdentities = new Set(
    tripActivities
      .map((activity) => getActivityIdentity(activity))
      .filter(Boolean)
  );

  return (items || []).filter((item) => {
    const identity = getActivityIdentity(item);
    return !identity || !existingIdentities.has(identity);
  });
}

// Retourne l'information calculee par 'getVisibleActivitySuggestions'.
function getVisibleActivitySuggestions() {
  return filterOutAddedSuggestions(activitySuggestions);
}

// Gere la logique principale de 'findActivityConflict'.
function findActivityConflict(schedule) {
  const start = toMinuteOfDay(schedule.startTime);
  if (start === null) return null;
  const end = start + schedule.durationMinutes;

  for (const existing of tripActivities) {
    const existingSchedule = getActivitySchedule(existing);
    if (!existingSchedule || existingSchedule.date !== schedule.date) continue;

    const existingStart = toMinuteOfDay(existingSchedule.startTime);
    if (existingStart === null) continue;
    const existingEnd = existingStart + existingSchedule.durationMinutes;
    const overlap = start < existingEnd && existingStart < end;

    if (overlap) {
      return existing;
    }
  }

  return null;
}

// Initialise le bloc fonctionnel 'initActivityScheduleModal'.
function initActivityScheduleModal() {
  const modal = document.getElementById('activity-schedule-modal');
  const form = document.getElementById('activity-schedule-form');
  const note = document.getElementById('activity-schedule-note');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];
  const dateInput = form?.elements?.namedItem('date');
  const timeInput = form?.elements?.namedItem('time');
  const durationInput = form?.elements?.namedItem('duration');

  if (
    !modal ||
    !form ||
    !(dateInput instanceof HTMLInputElement) ||
    !(timeInput instanceof HTMLInputElement) ||
    !(durationInput instanceof HTMLInputElement) ||
    !note
  ) {
    return async () => null;
  }

  let resolver = null;
  let validateSchedule = null;

  const closeModal = (value) => {
    if (!resolver) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    const resolve = resolver;
    resolver = null;
    validateSchedule = null;
    resolve(value);
  };

  const openModal = (options = {}) => new Promise((resolve) => {
    resolver = resolve;
    validateSchedule = typeof options.validate === 'function' ? options.validate : null;
    note.classList.remove('is-success', 'is-error');
    note.textContent = '';
    form.reset();

    const currentStart = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const currentEnd = document.getElementById('trip-end-date')?.value || tripState.endDate;
    dateInput.min = currentStart || '';
    dateInput.max = currentEnd || '';
    dateInput.value = currentStart || getTodayInputValue();
    timeInput.value = '09:00';
    durationInput.value = '60';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    dateInput.focus();
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', () => closeModal(null));
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal(null);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal(null);
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    note.classList.remove('is-success', 'is-error');

    const date = dateInput.value;
    const startTime = timeInput.value;
    const durationMinutes = Number(durationInput.value);

    const currentStart = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const currentEnd = document.getElementById('trip-end-date')?.value || tripState.endDate;

    if (!date || !startTime || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      note.classList.add('is-error');
      note.textContent = 'Merci de renseigner jour, heure et duree.';
      return;
    }

    if (currentStart && date < currentStart) {
      note.classList.add('is-error');
      note.textContent = 'Le jour doit etre dans les dates du voyage.';
      return;
    }

    if (currentEnd && date > currentEnd) {
      note.classList.add('is-error');
      note.textContent = 'Le jour doit etre dans les dates du voyage.';
      return;
    }

    const schedule = {
      date,
      startTime,
      durationMinutes: Math.round(durationMinutes)
    };

    if (validateSchedule) {
      const validationMessage = validateSchedule(schedule);
      if (validationMessage) {
        note.classList.add('is-error');
        note.textContent = validationMessage;
        return;
      }
    }

    closeModal(schedule);
  });

  return openModal;
}

// Gere la logique principale de 'computeNights'.
function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

// Met a jour l'etat pilote par 'setAccommodationDateBounds'.
function setAccommodationDateBounds(startDate, endDate) {
  const startInput = document.getElementById('accommodation-start');
  const endInput = document.getElementById('accommodation-end');
  if (!startInput || !endInput) return;

  startInput.min = startDate || '';
  startInput.max = endDate || '';
  endInput.min = startDate ? addDaysToInput(startDate, 1) : '';
  endInput.max = endDate || '';

  if (startInput.value && startDate && startInput.value < startDate) {
    startInput.value = startDate;
  }
  if (endInput.value && endDate && endInput.value > endDate) {
    endInput.value = endDate;
  }
}

// Met a jour l'etat pilote par 'setTransportDateBounds'.
function setTransportDateBounds(startDate, endDate) {
  const dateInput = document.getElementById('transport-date');
  if (!dateInput) return;
  dateInput.min = startDate || '';
  dateInput.max = endDate || '';

  if (dateInput.value) {
    if (startDate && dateInput.value < startDate) {
      dateInput.value = startDate;
    }
    if (endDate && dateInput.value > endDate) {
      dateInput.value = endDate;
    }
  }
}

// Applique les mises a jour de 'updateTripMeta'.
function updateTripMeta({ destination, startDate, endDate }) {
  const destinationNode = document.querySelector('#planning-destination');
  const datesNode = document.querySelector('#planning-dates');
  if (!destinationNode || !datesNode) return;

  destinationNode.textContent = destination || '-';

  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  datesNode.textContent = formattedStart && formattedEnd ? `${formattedStart} - ${formattedEnd}` : '-';
}

// Gere la logique principale de 'syncTripInputs'.
function syncTripInputs() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('pays');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');

  if (nameInput) nameInput.value = tripState.name || '';
  if (destinationInput) {
    destinationInput.value = tripState.destination || '';
    destinationInput.dataset.selectedValue = tripState.destination || '';
  }
  if (startInput) startInput.value = toDateInputValue(tripState.startDate);
  if (endInput) endInput.value = toDateInputValue(tripState.endDate);

  const today = getTodayInputValue();
  if (startInput) startInput.min = today;
  if (endInput) endInput.min = tripState.startDate
    ? addDaysToInput(tripState.startDate, 1)
    : today;

  updateTripMeta(tripState);
  setTransportDateBounds(toDateInputValue(tripState.startDate), toDateInputValue(tripState.endDate));
}

// Charge les donnees necessaires pour 'loadTransports'.
async function loadTransports() {
  if (!tripState.id) return;
  try {
    const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripState.id)}`);
    transports = result?.data || [];
  } catch (error) {
    console.warn('Impossible de charger les transports.', error);
    return;
  }
  renderTransports();
}

// Construit le rendu pour 'renderTransports'.
function renderTransports() {
  const list = document.getElementById('transport-list');
  const empty = document.getElementById('transport-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!transports.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  transports.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'transport-row';
    row.dataset.transportId = item.id;

    const dateLabel = item.travel_date ? formatDate(item.travel_date) : '-';
    const timeValue = toTimeInputValue(item.travel_time);
    const timeLabel = timeValue ? ` a ${timeValue}` : '';

    const actionsMarkup = isReadOnlyTrip()
      ? ''
      : `
      <div class="transport-title">
        <span>${item.origin || '-'} -> ${item.destination || '-'} · ${item.mode || 'Transport'}</span>
        <span class="transport-sub">${dateLabel}${timeLabel}</span>
      </div>
      <span>${formatDuration(item.duration_minutes)}</span>
      <span>${formatPrice(item.price)}</span>
      <div class="transport-actions">
        <button type="button" class="btn-icon" data-edit title="Modifier"><i class='bx bx-edit'></i></button>
        <button type="button" class="btn-icon danger" data-delete title="Supprimer"><i class='bx bx-trash'></i></button>
      </div>
    `;

    row.innerHTML = isReadOnlyTrip()
      ? `
      <div class="transport-title">
        <span>${item.origin || '-'} -> ${item.destination || '-'} · ${item.mode || 'Transport'}</span>
        <span class="transport-sub">${dateLabel}${timeLabel}</span>
      </div>
      <span>${formatDuration(item.duration_minutes)}</span>
      <span>${formatPrice(item.price)}</span>
      <div class="transport-actions"></div>
    `
      : actionsMarkup;

    list.appendChild(row);
  });
}

// Charge les donnees necessaires pour 'loadAccommodations'.
async function loadAccommodations() {
  if (!tripState.id) {
    accommodations = [];
    renderAccommodations();
    return;
  }
  try {
    accommodations = await listAccommodationsByTrip(tripState.id);
  } catch (error) {
    console.warn('Impossible de charger les logements.', error);
    accommodations = [];
  }
  renderAccommodations();
}

// Charge les donnees necessaires pour 'loadActivitySuggestions'.
async function loadActivitySuggestions() {
  const destinationInput = document.getElementById('pays');
  const destination = (destinationInput?.value || tripState.destination || '').trim();
  const note = document.getElementById('activity-suggestions-note');

  if (note) {
    note.classList.remove('is-success', 'is-error');
    note.textContent = '';
  }

  if (!destination) {
    activitySuggestions = [];
    suggestionsVisibleCount = 5;
    renderActivitySuggestions();
    return;
  }

  try {
    const result = await api.get(`/api/activities/suggestions?destination=${encodeURIComponent(destination)}&limit=10`);
    activitySuggestions = result?.data || [];
    suggestionsVisibleCount = 5;
  } catch (error) {
    activitySuggestions = [];
    if (note) {
      note.classList.add('is-error');
      note.textContent = error?.message || 'Impossible de charger les suggestions d\'activites.';
    }
  }

  renderActivitySuggestions();
}

// Construit le rendu pour 'renderActivitySuggestions'.
function renderActivitySuggestions() {
  const list = document.getElementById('activity-suggestions');
  const empty = document.getElementById('activity-suggestions-empty');
  const loadMoreButton = document.getElementById('activity-load-more');
  if (!list || !empty || !loadMoreButton) return;

  list.innerHTML = '';

  const displayed = getVisibleActivitySuggestions().slice(0, suggestionsVisibleCount);
  if (!displayed.length) {
    empty.hidden = false;
    loadMoreButton.hidden = true;
    return;
  }

  empty.hidden = true;
  displayed.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'activity-suggestion-item';
    row.dataset.suggestionIndex = String(index);

    const safeName = escapeHtml(item.name || 'Activite');
    const safeAddress = escapeHtml(item.address || 'Adresse indisponible');
    const safeDescription = escapeHtml(item.description || '');
    const safeRating = escapeHtml(formatActivityRating(item.rating, item.reviews_count));
    const mapLink = item.map_url
      ? `<a class="btn-ghost" target="_blank" rel="noopener" href="${escapeHtml(item.map_url)}">Voir la fiche</a>`
      : '';

    const addButton = isReadOnlyTrip()
      ? ''
      : `
        <button type="button" class="btn-secondary" data-add-suggestion="${index}">
          <i class='bx bx-plus'></i>
          Ajouter au voyage
        </button>
      `;

    row.innerHTML = `
      <div class="activity-suggestion-head">
        <div>
          <div class="activity-title">${safeName}</div>
          <div class="activity-meta">${safeAddress}</div>
          ${safeDescription ? `<div class="activity-description">${safeDescription}</div>` : ''}
        </div>
        <span class="activity-rating">${safeRating}</span>
      </div>
      <div class="activity-item-actions">
        ${addButton}
        ${mapLink}
      </div>
    `;

    list.appendChild(row);
  });

  loadMoreButton.hidden = false;
}

// Charge les donnees necessaires pour 'loadTripActivities'.
async function loadTripActivities() {
  if (!tripState.id) {
    tripActivities = [];
    renderTripActivities();
    return;
  }

  try {
    const result = await api.get(`/api/activities/trip/${encodeURIComponent(tripState.id)}`);
    tripActivities = result?.data || [];
  } catch (error) {
    tripActivities = [];
  }

  renderTripActivities();
  renderActivitySuggestions();
}

// Construit le rendu pour 'renderTripActivities'.
function renderTripActivities() {
  const list = document.getElementById('trip-activities-list');
  const empty = document.getElementById('trip-activities-empty');
  if (!list || !empty) return;

  list.innerHTML = '';

  if (!tripActivities.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  let didAnimateNewItem = false;

  tripActivities.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'trip-activity-item';
    row.dataset.activityId = String(item.id);

    if (lastAddedActivityId && String(item.id) === String(lastAddedActivityId)) {
      row.classList.add('is-newly-added');
      didAnimateNewItem = true;
      window.setTimeout(() => row.classList.remove('is-newly-added'), 1400);
    }

    const safeName = escapeHtml(item.name || 'Activite');
    const safeAddress = escapeHtml(item.address || 'Adresse indisponible');
    const safeDescription = escapeHtml(stripScheduleMetadata(item.description || ''));
    const safeRating = escapeHtml(formatActivityRating(item.rating, item.reviews_count));
    const schedule = getActivitySchedule(item);
    const scheduleMarkup = schedule
      ? `<div class="activity-schedule"><i class='bx bx-time-five'></i>${escapeHtml(formatActivitySchedule(schedule))}</div>`
      : '';

    const deleteButton = isReadOnlyTrip()
      ? ''
      : `<button type="button" class="btn-icon danger" data-delete-activity title="Supprimer"><i class='bx bx-trash'></i></button>`;

    row.innerHTML = `
      <div class="trip-activity-head">
        <div>
          <div class="activity-title">${safeName}</div>
          <div class="activity-meta">${safeAddress}</div>
          ${scheduleMarkup}
          ${safeDescription ? `<div class="activity-description">${safeDescription}</div>` : ''}
        </div>
        <span class="activity-rating">${safeRating}</span>
      </div>
      <div class="activity-item-actions">
        ${deleteButton}
      </div>
    `;

    list.appendChild(row);
  });

  if (didAnimateNewItem) {
    lastAddedActivityId = null;
  }
}

// Initialise le bloc fonctionnel 'initActivitiesPanel'.
function initActivitiesPanel() {
  const suggestionsList = document.getElementById('activity-suggestions');
  const tripList = document.getElementById('trip-activities-list');
  const refreshButton = document.getElementById('activities-refresh');
  const loadMoreButton = document.getElementById('activity-load-more');
  const suggestionsNote = document.getElementById('activity-suggestions-note');
  const tripNote = document.getElementById('trip-activities-note');
  const requestSchedule = initActivityScheduleModal();

  if (!suggestionsList || !refreshButton || !loadMoreButton || !suggestionsNote) {
    return;
  }

  if (isReadOnlyTrip()) {
    loadMoreButton.hidden = true;
  }

  refreshButton.addEventListener('click', async () => {
    suggestionsNote.classList.remove('is-success', 'is-error');
    suggestionsNote.textContent = 'Chargement des suggestions...';
    await loadActivitySuggestions();
    if (!suggestionsNote.classList.contains('is-error')) {
      suggestionsNote.classList.add('is-success');
      suggestionsNote.textContent = 'Suggestions mises a jour.';
    }
  });

  loadMoreButton.addEventListener('click', () => {
    const destinationInput = document.getElementById('pays');
    const destination = (destinationInput?.value || tripState.destination || '').trim();
    const params = new URLSearchParams();

    if (tripState.id) params.set('tripId', String(tripState.id));
    if (destination) params.set('destination', destination);
    if (tripState.startDate) params.set('startDate', toDateInputValue(tripState.startDate));
    if (tripState.endDate) params.set('endDate', toDateInputValue(tripState.endDate));
    if (tripState.accessMode) params.set('tripAccess', tripState.accessMode);

    const query = params.toString();
    window.location.href = query ? `activity-explorer.html?${query}` : 'activity-explorer.html';
  });

  suggestionsList.addEventListener('click', async (event) => {
    if (isReadOnlyTrip()) return;
    const target = event.target instanceof Element ? event.target.closest('[data-add-suggestion]') : null;
    if (!target) return;
    const index = Number.parseInt(target.getAttribute('data-add-suggestion') || '', 10);
    const visibleSuggestions = getVisibleActivitySuggestions();
    if (!Number.isFinite(index) || !visibleSuggestions[index]) return;
    if (!tripState.id) return;

    const suggestion = visibleSuggestions[index];
    const schedule = await requestSchedule({
      validate: (nextSchedule) => {
        const conflictingTransport = findTransportConflict(nextSchedule);
        if (conflictingTransport) {
          return `Conflit detecte: le transport ${formatTransportLabel(conflictingTransport)} est deja prevu a ce moment.`;
        }
        const conflictingActivity = findActivityConflict(nextSchedule);
        if (!conflictingActivity) return '';
        return `Conflit detecte: ${conflictingActivity.name || 'une activite'} est deja prevue a ce moment.`;
      }
    });
    if (!schedule) return;

    const descriptionWithSchedule = attachScheduleMetadata(suggestion.description || '', schedule);

    suggestionsNote.classList.remove('is-success', 'is-error');
    suggestionsNote.textContent = 'Ajout en cours...';

    try {
      const result = await api.post(`/api/activities/trip/${encodeURIComponent(tripState.id)}`, {
        name: suggestion.name,
        address: suggestion.address,
        description: descriptionWithSchedule,
        activity_date: schedule.date,
        rating: suggestion.rating,
        reviews_count: suggestion.reviews_count,
        source: suggestion.source || 'opentripmap',
        source_place_id: suggestion.source_place_id,
        map_url: suggestion.map_url
      });
      lastAddedActivityId = result?.data?.id || null;
      suggestionsNote.classList.add('is-success');
      suggestionsNote.textContent = 'Activite ajoutee au voyage.';
      await loadTripActivities();
    } catch (error) {
      suggestionsNote.classList.add('is-error');
      suggestionsNote.textContent = error?.message || "Impossible d'ajouter l'activite.";
    }
  });

  if (tripList && tripNote) {
    tripList.addEventListener('click', async (event) => {
    if (isReadOnlyTrip()) return;
    const target = event.target instanceof Element ? event.target.closest('[data-delete-activity]') : null;
    if (!target) return;
    const row = target.closest('.trip-activity-item');
    if (!row) return;
    const activityId = row.getAttribute('data-activity-id');
    if (!activityId) return;

    const confirmed = window.confirm('Supprimer cette activite du voyage ?');
    if (!confirmed) return;

    tripNote.classList.remove('is-success', 'is-error');
    tripNote.textContent = 'Suppression en cours...';

    try {
      await api.delete(`/api/activities/${encodeURIComponent(activityId)}`);
      tripNote.classList.add('is-success');
      tripNote.textContent = 'Activite supprimee.';
      await loadTripActivities();
    } catch (error) {
      tripNote.classList.add('is-error');
      tripNote.textContent = error?.message || 'Suppression impossible.';
    }
    });
  }
}

// Construit le rendu pour 'renderAccommodations'.
function renderAccommodations() {
  const list = document.getElementById('accommodation-list');
  const empty = document.getElementById('accommodation-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!accommodations.length) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }

  accommodations.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'accommodation-card';
    card.dataset.accommodationId = item.id;

    const startDate = toDateInputValue(item.start_date || '');
    const endDate = toDateInputValue(item.end_date || '');
    const nights = item.nights ?? computeNights(startDate, endDate);
    const price = item.price_per_night ?? item.price ?? null;
    const total = Number.isFinite(Number(price)) && nights ? Number(price) * nights : null;
    const title = item.name || item.address || 'Logement';

    const actionButtons = isReadOnlyTrip()
      ? ''
      : `
          <button type="button" class="btn-icon" data-edit title="Modifier"><i class='bx bx-edit'></i></button>
          <button type="button" class="btn-icon danger" data-delete title="Supprimer"><i class='bx bx-trash'></i></button>
      `;

    card.innerHTML = `
      <div class="accommodation-content">
        <div class="accommodation-title">${title}</div>
        <div class="accommodation-meta">
          <span>${startDate ? formatDate(startDate) : '-'} -> ${endDate ? formatDate(endDate) : '-'}</span>
          <span>${nights ? `${nights} nuit${nights > 1 ? 's' : ''}` : '-'}</span>
          <span>${price ? `${formatPrice(price)} / nuit` : '-'}</span>
          <span>${total ? `${formatPrice(total)} total` : '-'}</span>
        </div>
        <div class="accommodation-actions">
          ${actionButtons}
        </div>
      </div>
    `;

    list.appendChild(card);
  });

  if (!isReadOnlyTrip()) {
    const addCard = document.createElement('button');
    addCard.type = 'button';
    addCard.className = 'accommodation-add-card';
    addCard.setAttribute('data-add-accommodation', '');
    addCard.innerHTML = "<i class='bx bx-plus'></i> Ajouter un logement";
    list.appendChild(addCard);
  }
}

// Initialise le bloc fonctionnel 'initPlanningPage'.
async function initPlanningPage() {
  const returnTo = `planning.html${window.location.search || ''}`;
  try {
    const me = await api.get('/api/auth/me');
    const userId = me?.user?.id;
    if (!userId) {
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }
    currentUserId = String(userId);
  } catch (error) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const tripId = params.get('tripId');
  const requestedAccessMode = params.get('tripAccess') || '';
  let destination = params.get('destination') || '';
  let startDate = params.get('startDate') || '';
  let endDate = params.get('endDate') || '';

  tripState.accessMode = requestedAccessMode || 'owner';
  tripState.canEdit = requestedAccessMode !== 'read';

  if (tripId) {
    try {
      const result = await api.get(`/api/trips/${encodeURIComponent(tripId)}`);
      const data = result?.data;
      if (data) {
        tripState.id = data.id;
        tripState.name = data.name || '';
        tripState.accessMode = data.access_mode || tripState.accessMode || 'owner';
        tripState.canEdit = data.can_edit !== false;
        destination = data.destination || destination;
        startDate = toDateInputValue(data.start_date || startDate);
        endDate = toDateInputValue(data.end_date || endDate);
      }
    } catch (err) {
      console.warn('Impossible de charger le voyage depuis le serveur.', err);
    }
  }

  if (!destination || !startDate || !endDate) {
    const fallback = readFallbackTrip();
    if (fallback) {
      tripState.id = tripState.id || fallback.id || null;
      tripState.name = tripState.name || fallback.name || '';
      destination = destination || fallback.destination || '';
      startDate = startDate || toDateInputValue(fallback.start_date || '');
      endDate = endDate || toDateInputValue(fallback.end_date || '');
    }
  }

  tripState.destination = destination;
  tripState.startDate = toDateInputValue(startDate);
  tripState.endDate = toDateInputValue(endDate);
  applyReadOnlyUiState();

  syncTripInputs();
  syncPlanningUrl();
  await loadTransports();
  await loadAccommodations();
  await loadTripActivities();
  await loadActivitySuggestions();
}

// Initialise le bloc fonctionnel 'initTripEditor'.
function initTripEditor() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('pays');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');
  const saveButton = document.getElementById('trip-save');
  const saveNote = document.getElementById('trip-save-note');

  if (!nameInput || !destinationInput || !startInput || !endInput || !saveButton || !saveNote) return;

  if (isReadOnlyTrip()) {
    saveButton.hidden = true;
    [nameInput, destinationInput, startInput, endInput].forEach((input) => {
      input.setAttribute('disabled', 'disabled');
    });
    saveNote.classList.add('is-success');
    saveNote.textContent = 'Mode lecture seule: vous pouvez consulter ce voyage sans le modifier.';
    return;
  }

  if (!tripState.id) {
    saveButton.disabled = true;
    saveNote.textContent = "Ce voyage n'est pas encore enregistre.";
    return;
  }

  const handleDateChange = () => {
    const today = getTodayInputValue();
    if (startInput.value && startInput.value < today) {
      startInput.value = today;
    }
    if (endInput.value && endInput.value < today) {
      endInput.value = today;
    }
    if (startInput.value) {
      endInput.min = addDaysToInput(startInput.value, 1);
    }
    if (startInput.value && endInput.value && endInput.value <= startInput.value) {
      endInput.value = addDaysToInput(startInput.value, 1);
    }
    setTransportDateBounds(startInput.value, endInput.value);
  };

  startInput.addEventListener('change', handleDateChange);
  endInput.addEventListener('change', handleDateChange);

  saveButton.addEventListener('click', async () => {
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    const nextName = nameInput.value.trim() || tripState.name || 'Voyage';
    const selectedValue = destinationInput.dataset.selectedValue || '';
    const payload = {
      name: nextName,
      destination: destinationInput.value.trim() || null,
      start_date: startInput.value || null,
      end_date: endInput.value || null
    };

    if (payload.destination && payload.destination !== selectedValue) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Merci de choisir une destination dans la liste de suggestions.';
      return;
    }

    const today = getTodayInputValue();
    if (payload.start_date && payload.start_date < today) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de depart ne peut pas etre dans le passe.';
      return;
    }

    if (payload.end_date && payload.end_date < today) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de retour ne peut pas etre dans le passe.';
      return;
    }

    if (payload.start_date && payload.end_date && payload.end_date <= payload.start_date) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Le voyage doit durer au moins 1 nuit.';
      return;
    }

    const destinationChanged = normalizeDestination(payload.destination) !== normalizeDestination(tripState.destination);
    const dateRangeChanged =
      toDateInputValue(payload.start_date || '') !== toDateInputValue(tripState.startDate || '')
      || toDateInputValue(payload.end_date || '') !== toDateInputValue(tripState.endDate || '');

    if (!destinationChanged && dateRangeChanged) {
      const activitiesOutsideDates = getActivitiesOutsideTripDates(payload.start_date, payload.end_date);
      const accommodationsOutsideDates = getAccommodationsOutsideTripDates(payload.start_date, payload.end_date);
      const transportsOutsideDates = getTransportsOutsideTripDates(payload.start_date, payload.end_date);
      let budgetsOutsideDates = [];
      try {
        const budgetResult = await api.get('/api/budgets');
        budgetsOutsideDates = getBudgetsOutsideTripDates(budgetResult?.data || [], tripState.id, payload.start_date, payload.end_date);
      } catch (error) {
        console.warn('Impossible de verifier les budgets avant changement de dates.', error);
      }

      const impactedCount = activitiesOutsideDates.length + accommodationsOutsideDates.length + transportsOutsideDates.length + budgetsOutsideDates.length;
      if (impactedCount > 0) {
        const impactedParts = [];
        if (activitiesOutsideDates.length > 0) {
          impactedParts.push(`${activitiesOutsideDates.length} activite(s)`);
        }
        if (accommodationsOutsideDates.length > 0) {
          impactedParts.push(`${accommodationsOutsideDates.length} logement(s)`);
        }
        if (transportsOutsideDates.length > 0) {
          impactedParts.push(`${transportsOutsideDates.length} transport(s)`);
        }
        if (budgetsOutsideDates.length > 0) {
          impactedParts.push(`${budgetsOutsideDates.length} budget(s)`);
        }

        const confirmed = window.confirm(
          `${impactedParts.join(' et ')} sont en dehors des nouvelles dates du voyage. `
          + 'Ils seront supprimes avant lenregistrement. Voulez-vous continuer ?'
        );

        if (!confirmed) {
          saveNote.textContent = '';
          return;
        }
      }
    }

    if (destinationChanged) {
      const confirmed = window.confirm(
        'Changer la destination va remplacer ce voyage par un nouveau voyage avec la nouvelle destination. Toutes les activites, tous les logements et tous les transports lies au voyage actuel seront supprimes. Voulez-vous continuer ?'
      );

      if (!confirmed) {
        saveNote.textContent = '';
        return;
      }
    }

    try {
      let data = null;
      let replacedTrip = false;

      if (!destinationChanged && dateRangeChanged) {
        const activitiesOutsideDates = getActivitiesOutsideTripDates(payload.start_date, payload.end_date);
        const accommodationsOutsideDates = getAccommodationsOutsideTripDates(payload.start_date, payload.end_date);
        const transportsOutsideDates = getTransportsOutsideTripDates(payload.start_date, payload.end_date);

        if (activitiesOutsideDates.length > 0) {
          await Promise.all(
            activitiesOutsideDates
              .filter((activity) => activity?.id)
              .map((activity) => api.delete(`/api/activities/${encodeURIComponent(activity.id)}`))
          );

          const deletedIds = new Set(activitiesOutsideDates.map((activity) => String(activity.id)));
          tripActivities = tripActivities.filter((activity) => !deletedIds.has(String(activity.id)));
        }

        if (accommodationsOutsideDates.length > 0) {
          await Promise.all(
            accommodationsOutsideDates
              .filter((accommodation) => accommodation?.id)
              .map((accommodation) => api.delete(`/api/accommodations/${encodeURIComponent(accommodation.id)}`))
          );

          const deletedAccommodationIds = new Set(accommodationsOutsideDates.map((accommodation) => String(accommodation.id)));
          accommodations = accommodations.filter((accommodation) => !deletedAccommodationIds.has(String(accommodation.id)));
        }

        if (transportsOutsideDates.length > 0) {
          await Promise.all(
            transportsOutsideDates
              .filter((transport) => transport?.id)
              .map((transport) => api.delete(`/api/transports/${encodeURIComponent(transport.id)}`))
          );

          const deletedTransportIds = new Set(transportsOutsideDates.map((transport) => String(transport.id)));
          transports = transports.filter((transport) => !deletedTransportIds.has(String(transport.id)));
        }

        await deleteBudgetsOutsideTripDates({
          tripId: tripState.id,
          nextStartDate: payload.start_date,
          nextEndDate: payload.end_date,
          deleteAllForTrip: false
        });
      }

      if (destinationChanged) {
        const previousTripId = tripState.id;
        const createResult = await api.post('/api/trips', payload);
        data = createResult?.data;

        if (!data?.id) {
          throw new Error('Creation du nouveau voyage impossible.');
        }

        try {
          await api.delete(`/api/trips/${encodeURIComponent(previousTripId)}`);
        } catch (deleteError) {
          try {
            await api.delete(`/api/trips/${encodeURIComponent(data.id)}`);
          } catch {
            // Best effort rollback only.
          }
          throw deleteError;
        }

        replacedTrip = true;
      } else {
        const result = await api.patch(`/api/trips/${encodeURIComponent(tripState.id)}`, payload);
        data = result?.data;
      }

      tripState.id = data?.id || tripState.id;
      tripState.name = data?.name || '';
      tripState.destination = data?.destination || '';
      tripState.startDate = toDateInputValue(data?.start_date || '');
      tripState.endDate = toDateInputValue(data?.end_date || '');

      localStorage.setItem('voygo_current_trip', JSON.stringify(data));
      syncTripInputs();
      syncPlanningUrl();
      await loadTransports();
      await loadAccommodations();
      await loadTripActivities();
      await loadActivitySuggestions();

      saveNote.classList.add('is-success');
      saveNote.textContent = replacedTrip
        ? 'Destination modifiee. Un nouveau voyage a ete cree et toutes les donnees liees a l ancien voyage ont ete supprimees.'
        : 'Voyage mis a jour.';
    } catch (err) {
      console.warn('Impossible de mettre a jour le voyage.', err);
      saveNote.classList.add('is-error');
      saveNote.textContent = err?.message || "Erreur lors de l'enregistrement.";
    }
  });
}

// Initialise le bloc fonctionnel 'initTransportModal'.
function initTransportModal() {
  const modal = document.getElementById('transport-modal');
  const openButton = document.querySelector('[data-open-transport]');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];
  const form = document.getElementById('transport-form');
  const saveNote = document.getElementById('transport-save-note');
  const submitButton = document.getElementById('transport-submit');

  if (!modal || !openButton || !form || !saveNote || !submitButton) return;

  if (isReadOnlyTrip()) {
    openButton.hidden = true;
    return;
  }
  openButton.hidden = false;

  const openModal = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const startInput = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const endInput = document.getElementById('trip-end-date')?.value || tripState.endDate;
    setTransportDateBounds(startInput, endInput);
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = '';
    submitButton.textContent = 'Ajouter';
    form.reset();
    form.elements.namedItem('transport_id').value = '';
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  };

  const priceInput = form.elements.namedItem('price');
  const durationInput = form.elements.namedItem('duration');
  const timeInput = form.elements.namedItem('time');

  if (priceInput instanceof HTMLInputElement) {
    priceInput.addEventListener('input', () => {
      const normalized = priceInput.value
        .replace(/[^\d.,]/g, '')
        .replace(/,(?=.*[,])/g, '')
        .replace(/\.(?=.*\.)/g, '')
        .replace(',', '.');
      priceInput.value = normalized;
    });
  }

  if (durationInput instanceof HTMLInputElement) {
    durationInput.addEventListener('input', () => {
      durationInput.value = durationInput.value.replace(/[^\d]/g, '');
    });
  }

  if (timeInput instanceof HTMLInputElement) {
    timeInput.addEventListener('input', () => {
      timeInput.value = timeInput.value.trim();
    });
  }

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  openButton.addEventListener('click', openModal);
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isReadOnlyTrip()) {
      saveNote.classList.remove('is-success');
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Mode lecture seule: modification indisponible.';
      return;
    }
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    if (!tripState.id) {
      saveNote.classList.add('is-error');
      saveNote.textContent = "Impossible d'enregistrer sans voyage.";
      return;
    }

    const origin = form.elements.namedItem('from')?.value?.trim();
    const destination = form.elements.namedItem('to')?.value?.trim();
    const travelDate = form.elements.namedItem('date')?.value;
    const travelTime = form.elements.namedItem('time')?.value;
    const mode = form.elements.namedItem('mode')?.value;
    const priceRaw = form.elements.namedItem('price')?.value;
    const durationRaw = form.elements.namedItem('duration')?.value;
    const priceValue = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const durationValue = durationRaw ? Number(durationRaw) : null;
    const transportId = form.elements.namedItem('transport_id')?.value;

    const currentStart = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const currentEnd = document.getElementById('trip-end-date')?.value || tripState.endDate;

    if (currentStart && travelDate && travelDate < currentStart) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date doit etre dans les dates du voyage.';
      return;
    }

    if (currentEnd && travelDate && travelDate > currentEnd) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date doit etre dans les dates du voyage.';
      return;
    }

    if (toMinuteOfDay(travelTime) === null) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Merci de renseigner une heure valide.';
      return;
    }

    try {
      if (priceValue !== null && !Number.isFinite(priceValue)) {
        saveNote.classList.add('is-error');
        saveNote.textContent = 'Prix invalide.';
        return;
      }

      if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue <= 0)) {
        saveNote.classList.add('is-error');
        saveNote.textContent = 'Temps de trajet invalide.';
        return;
      }

      const schedule = {
        date: travelDate,
        startTime: travelTime,
        durationMinutes: Math.round(durationValue || 0)
      };

      if (!schedule.date || schedule.durationMinutes <= 0) {
        saveNote.classList.add('is-error');
        saveNote.textContent = 'Merci de renseigner jour, heure et duree du transport.';
        return;
      }

      const conflictingTransport = findTransportConflict(schedule, transportId || null);
      if (conflictingTransport) {
        saveNote.classList.add('is-error');
        saveNote.textContent = `Conflit detecte avec le transport ${formatTransportLabel(conflictingTransport)}.`;
        return;
      }

      const conflictingActivity = findActivityConflict(schedule);
      if (conflictingActivity) {
        saveNote.classList.add('is-error');
        saveNote.textContent = `Conflit detecte avec ${conflictingActivity.name || 'une activite'} deja prevue.`;
        return;
      }

      const payload = {
        origin,
        destination,
        travel_date: travelDate,
        travel_time: travelTime,
        mode,
        price: priceValue,
        duration_minutes: durationValue
      };

      if (transportId) {
        await api.patch(`/api/transports/${encodeURIComponent(transportId)}`, payload);
      } else {
        await api.post(`/api/transports/trip/${encodeURIComponent(tripState.id)}`, payload);
      }

      saveNote.classList.add('is-success');
      saveNote.textContent = transportId ? 'Transport mis a jour.' : 'Transport ajoute.';
      await loadTransports();
      closeModal();
    } catch (err) {
      console.warn('Impossible d\'ajouter le transport.', err);
      saveNote.classList.add('is-error');
      saveNote.textContent = "Erreur lors de l'ajout.";
    }
  });

  const list = document.getElementById('transport-list');
  if (list) {
    list.addEventListener('click', async (event) => {
      if (isReadOnlyTrip()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const row = target.closest('.transport-row');
      if (!row) return;
      const transportId = row.dataset.transportId;
      const current = transports.find((item) => String(item.id) === String(transportId));
      if (!current) return;

      if (target.closest('[data-edit]')) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        form.elements.namedItem('transport_id').value = current.id;
        form.elements.namedItem('from').value = current.origin || '';
        form.elements.namedItem('to').value = current.destination || '';
        form.elements.namedItem('date').value = toDateInputValue(current.travel_date || '');
        form.elements.namedItem('time').value = toTimeInputValue(current.travel_time || '');
        form.elements.namedItem('mode').value = current.mode || '';
        form.elements.namedItem('price').value = current.price ?? '';
        form.elements.namedItem('duration').value = current.duration_minutes ?? '';
        submitButton.textContent = 'Modifier';
        saveNote.classList.remove('is-success', 'is-error');
        saveNote.textContent = '';
      }

      if (target.closest('[data-delete]')) {
        const confirmed = window.confirm('Supprimer ce transport ?');
        if (!confirmed) return;
        try {
          await api.delete(`/api/transports/${encodeURIComponent(current.id)}`);
        } catch (error) {
          console.warn('Impossible de supprimer le transport.', error);
          return;
        }
        await loadTransports();
      }
    });
  }
}

// Initialise le bloc fonctionnel 'initAccommodationModal'.
function initAccommodationModal() {
  const modal = document.getElementById('accommodation-modal');
  const openButton = document.querySelector('[data-open-accommodation]');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];
  const form = document.getElementById('accommodation-form');
  const saveNote = document.getElementById('accommodation-save-note');
  const submitButton = document.getElementById('accommodation-submit');
  const nightsInput = document.getElementById('accommodation-nights');

  if (!modal || !openButton || !form || !saveNote || !submitButton || !nightsInput) {
    return;
  }

  if (isReadOnlyTrip()) {
    openButton.hidden = true;
    return;
  }
  openButton.hidden = false;

  const resetForm = () => {
    form.reset();
    submitButton.textContent = 'Ajouter';
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = '';
    form.elements.namedItem('accommodation_id').value = '';
    nightsInput.value = '';
  };

  const openModal = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const startInput = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const endInput = document.getElementById('trip-end-date')?.value || tripState.endDate;
    setAccommodationDateBounds(startInput, endInput);
    resetForm();
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  openButton.addEventListener('click', openModal);
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });

  const updateNights = () => {
    const startValue = form.elements.namedItem('start')?.value;
    const endValue = form.elements.namedItem('end')?.value;
    const nights = computeNights(startValue, endValue);
    nightsInput.value = nights ? String(nights) : '';
  };

  form.elements.namedItem('start')?.addEventListener('change', updateNights);
  form.elements.namedItem('end')?.addEventListener('change', updateNights);

  const list = document.getElementById('accommodation-list');
  if (list) {
    list.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest('[data-add-accommodation]')) {
        openModal();
        return;
      }

      const card = target.closest('.accommodation-card');
      if (!card) return;
      const accommodationId = card.dataset.accommodationId;
      const current = accommodations.find((item) => String(item.id) === String(accommodationId));
      if (!current) return;

      if (target.closest('[data-edit]')) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        form.elements.namedItem('accommodation_id').value = current.id;
        form.elements.namedItem('name').value = current.name || '';
        form.elements.namedItem('address').value = current.address || '';
        form.elements.namedItem('price').value = current.price_per_night ?? current.price ?? '';
        form.elements.namedItem('start').value = toDateInputValue(current.start_date || '');
        form.elements.namedItem('end').value = toDateInputValue(current.end_date || '');
        updateNights();
        submitButton.textContent = 'Modifier';
        saveNote.classList.remove('is-success', 'is-error');
        saveNote.textContent = '';
        return;
      }

      if (target.closest('[data-delete]')) {
        const confirmed = window.confirm('Supprimer ce logement ?');
        if (!confirmed) return;
        try {
          await deleteAccommodation(current.id);
        } catch (error) {
          console.warn('Impossible de supprimer le logement.', error);
          return;
        }
        await loadAccommodations();
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isReadOnlyTrip()) {
      saveNote.classList.remove('is-success');
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Mode lecture seule: modification indisponible.';
      return;
    }
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    if (!tripState.id) {
      saveNote.classList.add('is-error');
      saveNote.textContent = "Impossible d'enregistrer sans voyage.";
      return;
    }

    const name = form.elements.namedItem('name')?.value?.trim();
    const address = form.elements.namedItem('address')?.value?.trim();
    const startDate = form.elements.namedItem('start')?.value;
    const endDate = form.elements.namedItem('end')?.value;
    const priceRaw = form.elements.namedItem('price')?.value;
    const priceValue = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const nights = computeNights(startDate, endDate);
    const accommodationId = form.elements.namedItem('accommodation_id')?.value;

    if (!address) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Adresse requise.';
      return;
    }

    if (!startDate || !endDate || nights <= 0) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Les dates doivent couvrir au moins 1 nuit.';
      return;
    }

    const currentStart = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const currentEnd = document.getElementById('trip-end-date')?.value || tripState.endDate;
    if (currentStart && startDate < currentStart) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Les dates doivent etre dans le voyage.';
      return;
    }
    if (currentEnd && endDate > currentEnd) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Les dates doivent etre dans le voyage.';
      return;
    }

    if (priceValue !== null && !Number.isFinite(priceValue)) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Prix invalide.';
      return;
    }

    const payload = {
      trip_id: tripState.id,
      name: name || null,
      address,
      price_per_night: priceValue,
      start_date: startDate,
      end_date: endDate,
      nights
    };

    try {
      if (accommodationId) {
        await updateAccommodation(accommodationId, payload);
      } else {
        await createAccommodation(payload);
      }
      saveNote.classList.add('is-success');
      saveNote.textContent = accommodationId ? 'Logement mis a jour.' : 'Logement ajoute.';
      await loadAccommodations();
      closeModal();
    } catch (error) {
      console.warn('Impossible de sauvegarder le logement.', error);
      saveNote.classList.add('is-error');
      saveNote.textContent = "Erreur lors de l'enregistrement.";
    }
  });
}

// Gere la logique principale de 'bootstrapPlanningPage'.
async function bootstrapPlanningPage() {
  await initPlanningPage();
  initTripEditor();
  initTransportModal();
  initAccommodationModal();
  initActivitiesPanel();
  initCountryAutocomplete();
}

bootstrapPlanningPage();




