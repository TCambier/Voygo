import { api } from '../assets/js/api.js';
import { initCountryAutocomplete } from './countryController.js';
import {
  listAccommodations,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation
} from './accommodationController.js';

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

function toDateInputValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToInput(value, days) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

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
  endDate: ''
};

let transports = [];
let accommodations = [];
let activitySuggestions = [];
let tripActivities = [];
let suggestionsVisibleCount = 5;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}min`;
  if (hours) return `${hours}h`;
  return `${mins}min`;
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

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

function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

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

function updateTripMeta({ destination, startDate, endDate }) {
  const destinationNode = document.querySelector('#planning-destination');
  const datesNode = document.querySelector('#planning-dates');
  if (!destinationNode || !datesNode) return;

  destinationNode.textContent = destination || '-';

  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  datesNode.textContent = formattedStart && formattedEnd ? `${formattedStart} - ${formattedEnd}` : '-';
}

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

    row.innerHTML = `
      <div class="transport-title">
        <span>${item.origin || '-'} -> ${item.destination || '-'} · ${item.mode || 'Transport'}</span>
        <span class="transport-sub">${dateLabel}</span>
      </div>
      <span>${formatDuration(item.duration_minutes)}</span>
      <span>${formatPrice(item.price)}</span>
      <div class="transport-actions">
        <button type="button" class="btn-icon" data-edit title="Modifier"><i class='bx bx-edit'></i></button>
        <button type="button" class="btn-icon danger" data-delete title="Supprimer"><i class='bx bx-trash'></i></button>
      </div>
    `;

    list.appendChild(row);
  });
}

async function loadAccommodations() {
  if (!tripState.id) {
    accommodations = [];
    renderAccommodations();
    return;
  }
  try {
    const all = await listAccommodations();
    accommodations = (all || []).filter((item) => String(item.trip_id) === String(tripState.id));
  } catch (error) {
    console.warn('Impossible de charger les logements.', error);
    accommodations = [];
  }
  renderAccommodations();
}

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

function renderActivitySuggestions() {
  const list = document.getElementById('activity-suggestions');
  const empty = document.getElementById('activity-suggestions-empty');
  const loadMoreButton = document.getElementById('activity-load-more');
  if (!list || !empty || !loadMoreButton) return;

  list.innerHTML = '';

  const displayed = activitySuggestions.slice(0, suggestionsVisibleCount);
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
        <button type="button" class="btn-secondary" data-add-suggestion="${index}">
          <i class='bx bx-plus'></i>
          Ajouter au voyage
        </button>
        ${mapLink}
      </div>
    `;

    list.appendChild(row);
  });

  loadMoreButton.hidden = false;
}

async function loadTripActivities() {
  const list = document.getElementById('trip-activities-list');
  const empty = document.getElementById('trip-activities-empty');
  if (!list || !empty) return;

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
}

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

  tripActivities.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'trip-activity-item';
    row.dataset.activityId = String(item.id);

    const safeName = escapeHtml(item.name || 'Activite');
    const safeAddress = escapeHtml(item.address || 'Adresse indisponible');
    const safeDescription = escapeHtml(item.description || '');
    const safeRating = escapeHtml(formatActivityRating(item.rating, item.reviews_count));

    row.innerHTML = `
      <div class="trip-activity-head">
        <div>
          <div class="activity-title">${safeName}</div>
          <div class="activity-meta">${safeAddress}</div>
          ${safeDescription ? `<div class="activity-description">${safeDescription}</div>` : ''}
        </div>
        <span class="activity-rating">${safeRating}</span>
      </div>
      <div class="activity-item-actions">
        <button type="button" class="btn-icon danger" data-delete-activity title="Supprimer"><i class='bx bx-trash'></i></button>
      </div>
    `;

    list.appendChild(row);
  });
}

function initActivitiesPanel() {
  const suggestionsList = document.getElementById('activity-suggestions');
  const tripList = document.getElementById('trip-activities-list');
  const refreshButton = document.getElementById('activities-refresh');
  const loadMoreButton = document.getElementById('activity-load-more');
  const suggestionsNote = document.getElementById('activity-suggestions-note');
  const tripNote = document.getElementById('trip-activities-note');

  if (!suggestionsList || !tripList || !refreshButton || !loadMoreButton || !suggestionsNote || !tripNote) {
    return;
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

    const query = params.toString();
    window.location.href = query ? `activity-explorer.html?${query}` : 'activity-explorer.html';
  });

  suggestionsList.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-add-suggestion]') : null;
    if (!target) return;
    const index = Number.parseInt(target.getAttribute('data-add-suggestion') || '', 10);
    if (!Number.isFinite(index) || !activitySuggestions[index]) return;
    if (!tripState.id) return;

    const suggestion = activitySuggestions[index];
    suggestionsNote.classList.remove('is-success', 'is-error');
    suggestionsNote.textContent = 'Ajout en cours...';

    try {
      await api.post(`/api/activities/trip/${encodeURIComponent(tripState.id)}`, {
        name: suggestion.name,
        address: suggestion.address,
        description: suggestion.description,
        rating: suggestion.rating,
        reviews_count: suggestion.reviews_count,
        source: suggestion.source || 'opentripmap',
        source_place_id: suggestion.source_place_id,
        map_url: suggestion.map_url
      });
      suggestionsNote.classList.add('is-success');
      suggestionsNote.textContent = 'Activite ajoutee au voyage.';
      await loadTripActivities();
    } catch (error) {
      suggestionsNote.classList.add('is-error');
      suggestionsNote.textContent = error?.message || "Impossible d'ajouter l'activite.";
    }
  });

  tripList.addEventListener('click', async (event) => {
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
          <button type="button" class="btn-icon" data-edit title="Modifier"><i class='bx bx-edit'></i></button>
          <button type="button" class="btn-icon danger" data-delete title="Supprimer"><i class='bx bx-trash'></i></button>
        </div>
      </div>
    `;

    list.appendChild(card);
  });

  const addCard = document.createElement('button');
  addCard.type = 'button';
  addCard.className = 'accommodation-add-card';
  addCard.setAttribute('data-add-accommodation', '');
  addCard.innerHTML = "<i class='bx bx-plus'></i> Ajouter un logement";
  list.appendChild(addCard);
}

async function initPlanningPage() {
  const returnTo = `planning.html${window.location.search || ''}`;
  try {
    const me = await api.get('/api/auth/me');
    const userId = me?.user?.id;
    if (!userId) {
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }
  } catch (error) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const tripId = params.get('tripId');
  let destination = params.get('destination') || '';
  let startDate = params.get('startDate') || '';
  let endDate = params.get('endDate') || '';

  if (tripId) {
    try {
      const result = await api.get(`/api/trips/${encodeURIComponent(tripId)}`);
      const data = result?.data;
      if (data) {
        tripState.id = data.id;
        tripState.name = data.name || '';
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

  syncTripInputs();
  await loadTransports();
  await loadAccommodations();
  await loadTripActivities();
  await loadActivitySuggestions();
}

function initTripEditor() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('pays');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');
  const saveButton = document.getElementById('trip-save');
  const saveNote = document.getElementById('trip-save-note');

  if (!nameInput || !destinationInput || !startInput || !endInput || !saveButton || !saveNote) return;

  if (!tripState.id) {
    saveButton.disabled = true;
    saveNote.textContent = "Ce voyage n'est pas encore enregistrÃ©.";
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
      saveNote.textContent = 'La date de dÃ©part ne peut pas Ãªtre dans le passÃ©.';
      return;
    }

    if (payload.end_date && payload.end_date < today) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de retour ne peut pas Ãªtre dans le passÃ©.';
      return;
    }

    if (payload.start_date && payload.end_date && payload.end_date <= payload.start_date) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Le voyage doit durer au moins 1 nuit.';
      return;
    }

    try {
      const result = await api.patch(`/api/trips/${encodeURIComponent(tripState.id)}`, payload);
      const data = result?.data;

      tripState.name = data?.name || '';
      tripState.destination = data?.destination || '';
      tripState.startDate = toDateInputValue(data?.start_date || '');
      tripState.endDate = toDateInputValue(data?.end_date || '');

      localStorage.setItem('voygo_current_trip', JSON.stringify(data));
      syncTripInputs();
      await loadActivitySuggestions();

      saveNote.classList.add('is-success');
      saveNote.textContent = 'Voyage mis à jour.';
    } catch (err) {
      console.warn('Impossible de mettre Ã  jour le voyage.', err);
      saveNote.classList.add('is-error');
      saveNote.textContent = "Erreur lors de l'enregistrement.";
    }
  });
}

function initTransportModal() {
  const modal = document.getElementById('transport-modal');
  const openButton = document.querySelector('[data-open-transport]');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];
  const form = document.getElementById('transport-form');
  const saveNote = document.getElementById('transport-save-note');
  const submitButton = document.getElementById('transport-submit');

  if (!modal || !openButton || !form || !saveNote || !submitButton) return;

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
      saveNote.textContent = 'La date doit Ãªtre dans les dates du voyage.';
      return;
    }

    if (currentEnd && travelDate && travelDate > currentEnd) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date doit Ãªtre dans les dates du voyage.';
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

      const payload = {
        origin,
        destination,
        travel_date: travelDate,
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
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const row = target.closest('.transport-row');
      if (!row) return;
      const transportId = row.dataset.transportId;
      const current = transports.find((item) => item.id === transportId);
      if (!current) return;

      if (target.closest('[data-edit]')) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        form.elements.namedItem('transport_id').value = current.id;
        form.elements.namedItem('from').value = current.origin || '';
        form.elements.namedItem('to').value = current.destination || '';
        form.elements.namedItem('date').value = toDateInputValue(current.travel_date || '');
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

initPlanningPage().then(initTripEditor);
initTransportModal();
initAccommodationModal();
initActivitiesPanel();
initCountryAutocomplete();




