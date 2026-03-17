import { api } from '../assets/js/api.js';
import { initCountryAutocomplete } from './countryController.js';

const FILTERS = [
  { key: 'all', label: 'Tous', kinds: 'interesting_places' },
  { key: 'monuments', label: 'Monuments', kinds: 'historic,architecture' },
  { key: 'viewpoints', label: 'Points de vue', kinds: 'view_points' },
  { key: 'nature', label: 'Nature', kinds: 'natural' },
  { key: 'culture', label: 'Culture', kinds: 'museums,cultural' }
];

const SCHEDULE_META_OPEN = '[VOYGO_SCHEDULE]';
const SCHEDULE_META_CLOSE = '[/VOYGO_SCHEDULE]';

const state = {
  tripId: null,
  destination: '',
  startDate: '',
  endDate: '',
  filter: 'all',
  suggestions: [],
  tripActivities: []
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
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

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function toMinuteOfDay(timeValue) {
  if (!/^\d{2}:\d{2}$/.test(String(timeValue || ''))) return null;
  const [hours, minutes] = String(timeValue).split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

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

function stripScheduleMetadata(description) {
  const text = String(description || '');
  return text.replace(/\s*\[VOYGO_SCHEDULE\][\s\S]*?\[\/VOYGO_SCHEDULE\]\s*/g, '').trim();
}

function attachScheduleMetadata(description, schedule) {
  const clean = String(description || '').replace(/\s*\[VOYGO_SCHEDULE\][\s\S]*?\[\/VOYGO_SCHEDULE\]\s*/g, '').trim();
  const metadata = JSON.stringify({
    date: schedule.date,
    time: schedule.startTime,
    duration_minutes: schedule.durationMinutes
  });
  return [clean, `${SCHEDULE_META_OPEN}${metadata}${SCHEDULE_META_CLOSE}`].filter(Boolean).join('\n\n');
}

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

function formatActivitySchedule(schedule) {
  if (!schedule) return '';
  const dateLabel = formatDate(schedule.date);
  const durationLabel = formatDuration(schedule.durationMinutes);
  return `${dateLabel} a ${schedule.startTime} (${durationLabel})`;
}

function findActivityConflict(schedule) {
  const start = toMinuteOfDay(schedule.startTime);
  if (start === null) return null;
  const end = start + schedule.durationMinutes;

  for (const existing of state.tripActivities) {
    const existingSchedule = getActivitySchedule(existing);
    if (!existingSchedule || existingSchedule.date !== schedule.date) continue;

    const existingStart = toMinuteOfDay(existingSchedule.startTime);
    if (existingStart === null) continue;
    const existingEnd = existingStart + existingSchedule.durationMinutes;
    if (start < existingEnd && existingStart < end) {
      return existing;
    }
  }

  return null;
}

function initActivityEditorModal() {
  const modal = document.getElementById('explorer-activity-modal');
  const form = document.getElementById('explorer-activity-form');
  const note = document.getElementById('explorer-activity-note');
  const title = document.getElementById('explorer-activity-modal-title');
  const submit = document.getElementById('explorer-activity-submit');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];

  const nameInput = document.getElementById('explorer-activity-name');
  const addressInput = document.getElementById('explorer-activity-address');
  const dateInput = document.getElementById('explorer-activity-date');
  const timeInput = document.getElementById('explorer-activity-time');
  const durationInput = document.getElementById('explorer-activity-duration');
  const descriptionInput = document.getElementById('explorer-activity-desc');

  if (
    !modal ||
    !form ||
    !note ||
    !title ||
    !submit ||
    !(nameInput instanceof HTMLInputElement) ||
    !(addressInput instanceof HTMLInputElement) ||
    !(dateInput instanceof HTMLInputElement) ||
    !(timeInput instanceof HTMLInputElement) ||
    !(durationInput instanceof HTMLInputElement) ||
    !(descriptionInput instanceof HTMLTextAreaElement)
  ) {
    return async () => null;
  }

  let resolver = null;
  let validateSchedule = null;

  const closeModal = (value = null) => {
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

    title.textContent = options.title || 'Ajouter une activite';
    submit.textContent = options.submitLabel || 'Ajouter';
    note.classList.remove('is-success', 'is-error');
    note.textContent = '';

    const preset = options.preset || {};
    form.reset();
    nameInput.value = String(preset.name || '');
    addressInput.value = String(preset.address || '');
    descriptionInput.value = String(preset.description || '');

    dateInput.min = state.startDate || '';
    dateInput.max = state.endDate || '';
    dateInput.value = String(preset.date || state.startDate || getTodayInputValue());
    timeInput.value = String(preset.startTime || '09:00');
    durationInput.value = String(preset.durationMinutes || 60);

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    nameInput.focus();
  });

  closeButtons.forEach((button) => button.addEventListener('click', () => closeModal()));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    note.classList.remove('is-success', 'is-error');

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();
    const description = descriptionInput.value.trim();
    const date = dateInput.value;
    const startTime = timeInput.value;
    const durationMinutes = Number(durationInput.value);

    if (!name || !startTime || !date || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      note.classList.add('is-error');
      note.textContent = 'Merci de renseigner nom, jour, heure et duree.';
      return;
    }

    if (state.startDate && date < state.startDate) {
      note.classList.add('is-error');
      note.textContent = 'Le jour doit etre dans les dates du voyage.';
      return;
    }

    if (state.endDate && date > state.endDate) {
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

    closeModal({
      name,
      address,
      description,
      schedule
    });
  });

  return openModal;
}

function normalizeActivityIdentityPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function filterOutAddedSuggestions(items) {
  const existingIdentities = new Set(
    state.tripActivities
      .map((activity) => getActivityIdentity(activity))
      .filter(Boolean)
  );

  return (items || []).filter((item) => {
    const identity = getActivityIdentity(item);
    return !identity || !existingIdentities.has(identity);
  });
}

function getVisibleSuggestions() {
  return filterOutAddedSuggestions(state.suggestions);
}

function getCurrentFilter() {
  return FILTERS.find((item) => item.key === state.filter) || FILTERS[0];
}

function renderFilters() {
  const container = document.getElementById('activity-filter-bar');
  if (!container) return;

  container.innerHTML = FILTERS.map((filter) => {
    const selected = filter.key === state.filter;
    return `
      <button
        type="button"
        class="activity-filter-chip${selected ? ' is-active' : ''}"
        data-filter="${filter.key}"
        aria-pressed="${selected ? 'true' : 'false'}"
      >
        ${escapeHtml(filter.label)}
      </button>
    `;
  }).join('');
}

function renderSuggestions() {
  const list = document.getElementById('explorer-results');
  const empty = document.getElementById('explorer-empty');
  if (!list || !empty) return;

  list.innerHTML = '';

  const visibleSuggestions = getVisibleSuggestions();

  if (!visibleSuggestions.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  visibleSuggestions.forEach((item, index) => {
    const safeName = escapeHtml(item.name || 'Activite');
    const safeAddress = escapeHtml(item.address || 'Adresse indisponible');
    const safeDescription = escapeHtml(item.description || '');
    const safeRating = escapeHtml(formatActivityRating(item.rating, item.reviews_count));
    const mapLink = item.map_url
      ? `<a class="btn-ghost" target="_blank" rel="noopener" href="${escapeHtml(item.map_url)}">Voir la fiche</a>`
      : '';

    const addButton = state.tripId
      ? `
        <button type="button" class="btn-secondary" data-add-suggestion="${index}">
          <i class='bx bx-plus'></i>
          Ajouter au voyage
        </button>
      `
      : '';

    const row = document.createElement('article');
    row.className = 'activity-suggestion-item';
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
}

function setNote(message, type = '') {
  const note = document.getElementById('explorer-note');
  if (!note) return;
  note.classList.remove('is-success', 'is-error');
  if (type) note.classList.add(type);
  note.textContent = message || '';
}

function updateBackLink() {
  const back = document.getElementById('explorer-back');
  if (!back) return;

  const params = new URLSearchParams();
  if (state.tripId) params.set('tripId', state.tripId);
  if (state.destination) params.set('destination', state.destination);
  if (state.startDate) params.set('startDate', state.startDate);
  if (state.endDate) params.set('endDate', state.endDate);

  const query = params.toString();
  back.href = query ? `planning.html?${query}` : 'planning.html';
}

async function loadTripActivities() {
  if (!state.tripId) {
    state.tripActivities = [];
    renderSuggestions();
    return;
  }

  try {
    const result = await api.get(`/api/activities/trip/${encodeURIComponent(state.tripId)}`);
    state.tripActivities = result?.data || [];
  } catch {
    state.tripActivities = [];
  }

  renderSuggestions();
}

async function fetchSuggestions() {
  if (!state.destination) {
    state.suggestions = [];
    renderSuggestions();
    setNote('Renseignez une destination pour charger des activites.');
    return;
  }

  const filter = getCurrentFilter();
  const params = new URLSearchParams({
    destination: state.destination,
    limit: '24',
    kinds: filter.kinds
  });

  setNote('Chargement des suggestions...');

  try {
    const result = await api.get(`/api/activities/suggestions?${params.toString()}`);
    state.suggestions = result?.data || [];
    renderSuggestions();
    setNote(`Categorie active: ${filter.label}`, 'is-success');
  } catch (error) {
    state.suggestions = [];
    renderSuggestions();
    setNote(error?.message || 'Impossible de charger les suggestions.', 'is-error');
  }
}

async function addSuggestion(index) {
  const visibleSuggestions = getVisibleSuggestions();
  if (!state.tripId || !visibleSuggestions[index]) return;

  const item = visibleSuggestions[index];
  const itemIdentity = getActivityIdentity(item);
  const requestActivity = initActivityEditorModal.instance;
  const formData = await requestActivity({
    title: 'Ajouter une activite au voyage',
    submitLabel: 'Ajouter',
    preset: {
      name: item.name || '',
      address: item.address || '',
      description: stripScheduleMetadata(item.description || ''),
      date: state.startDate || getTodayInputValue(),
      startTime: '09:00',
      durationMinutes: 60
    },
    validate: (nextSchedule) => {
      const conflictingActivity = findActivityConflict(nextSchedule);
      if (!conflictingActivity) return '';
      return `Conflit detecte: ${conflictingActivity.name || 'une activite'} est deja prevue a ${formatActivitySchedule(getActivitySchedule(conflictingActivity))}.`;
    }
  });
  if (!formData) return;

  setNote('Ajout en cours...');

  try {
    await api.post(`/api/activities/trip/${encodeURIComponent(state.tripId)}`, {
      name: formData.name,
      address: formData.address,
      description: attachScheduleMetadata(formData.description, formData.schedule),
      activity_date: formData.schedule.date,
      rating: item.rating,
      reviews_count: item.reviews_count,
      source: item.source || 'opentripmap',
      source_place_id: item.source_place_id,
      map_url: item.map_url
    });

    state.suggestions = state.suggestions.filter((suggestion) => getActivityIdentity(suggestion) !== itemIdentity);
    await loadTripActivities();
    setNote('Activite ajoutee au voyage.', 'is-success');
  } catch (error) {
    setNote(error?.message || "Impossible d'ajouter l'activite.", 'is-error');
  }
}

function bindEvents() {
  const destinationInput = document.getElementById('explorer-destination');
  const searchButton = document.getElementById('explorer-search');
  const filterBar = document.getElementById('activity-filter-bar');
  const results = document.getElementById('explorer-results');
  const customButton = document.getElementById('explorer-add-custom');

  if (destinationInput) {
    destinationInput.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.destination = destinationInput.value.trim();
        updateBackLink();
        await fetchSuggestions();
      }
    });
  }

  if (searchButton) {
    searchButton.addEventListener('click', async () => {
      state.destination = destinationInput?.value.trim() || '';
      updateBackLink();
      await fetchSuggestions();
    });
  }

  if (filterBar) {
    filterBar.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-filter]') : null;
      if (!target) return;
      const nextFilter = target.getAttribute('data-filter');
      if (!nextFilter || nextFilter === state.filter) return;

      state.filter = nextFilter;
      renderFilters();
      await fetchSuggestions();
    });
  }

  if (results) {
    results.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-add-suggestion]') : null;
      if (!target) return;
      const index = Number.parseInt(target.getAttribute('data-add-suggestion') || '', 10);
      if (!Number.isFinite(index)) return;
      await addSuggestion(index);
    });
  }

  if (customButton) {
    customButton.addEventListener('click', async () => {
      if (!state.tripId) {
        setNote('Selectionnez un voyage depuis le planning pour ajouter une activite personnalisee.', 'is-error');
        return;
      }

      const requestActivity = initActivityEditorModal.instance;
      const formData = await requestActivity({
        title: 'Ajouter une activite personnalisee',
        submitLabel: 'Ajouter',
        preset: {
          date: state.startDate || getTodayInputValue(),
          startTime: '09:00',
          durationMinutes: 60
        },
        validate: (nextSchedule) => {
          const conflictingActivity = findActivityConflict(nextSchedule);
          if (!conflictingActivity) return '';
          return `Conflit detecte: ${conflictingActivity.name || 'une activite'} est deja prevue a ${formatActivitySchedule(getActivitySchedule(conflictingActivity))}.`;
        }
      });

      if (!formData) return;
      setNote('Ajout en cours...');

      try {
        await api.post(`/api/activities/trip/${encodeURIComponent(state.tripId)}`, {
          name: formData.name,
          address: formData.address,
          description: attachScheduleMetadata(formData.description, formData.schedule),
          activity_date: formData.schedule.date,
          source: 'manual'
        });
        await loadTripActivities();
        setNote('Activite personnalisee ajoutee au voyage.', 'is-success');
      } catch (error) {
        setNote(error?.message || "Impossible d'ajouter l'activite.", 'is-error');
      }
    });
  }
}

function initStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const destination = String(params.get('destination') || '').trim();

  state.tripId = params.get('tripId');
  state.destination = destination;
  state.startDate = params.get('startDate') || '';
  state.endDate = params.get('endDate') || '';

  const destinationInput = document.getElementById('explorer-destination');
  if (destinationInput) destinationInput.value = destination;
}

async function initPage() {
  initStateFromQuery();
  initCountryAutocomplete({
    inputSelector: '#explorer-destination',
    listSelector: '#explorer-destination-suggestions'
  });
  renderFilters();
  updateBackLink();
  initActivityEditorModal.instance = initActivityEditorModal();
  bindEvents();
  await loadTripActivities();
  await fetchSuggestions();
}

initPage();
