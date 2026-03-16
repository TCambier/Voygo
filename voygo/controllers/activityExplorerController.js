import { api } from '../assets/js/api.js';
import { initCountryAutocomplete } from './countryController.js';

const FILTERS = [
  { key: 'all', label: 'Tous', kinds: 'interesting_places' },
  { key: 'monuments', label: 'Monuments', kinds: 'historic,architecture' },
  { key: 'viewpoints', label: 'Points de vue', kinds: 'view_points' },
  { key: 'nature', label: 'Nature', kinds: 'natural' },
  { key: 'culture', label: 'Culture', kinds: 'museums,cultural' }
];

const state = {
  tripId: null,
  destination: '',
  startDate: '',
  endDate: '',
  filter: 'all',
  suggestions: []
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

  if (!state.suggestions.length) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  state.suggestions.forEach((item, index) => {
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

function parseOptionalCost(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return parsed;
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
  if (!state.tripId || !state.suggestions[index]) return;

  const item = state.suggestions[index];
  setNote('Ajout en cours...');

  try {
    await api.post(`/api/activities/trip/${encodeURIComponent(state.tripId)}`, {
      name: item.name,
      address: item.address,
      description: item.description,
      rating: item.rating,
      reviews_count: item.reviews_count,
      source: item.source || 'opentripmap',
      source_place_id: item.source_place_id,
      map_url: item.map_url
    });

    setNote('Activite ajoutee au voyage.', 'is-success');
  } catch (error) {
    setNote(error?.message || "Impossible d'ajouter l'activite.", 'is-error');
  }
}

function initCustomActivityModal() {
  const openButton = document.getElementById('explorer-add-custom');
  const modal = document.getElementById('custom-activity-modal');
  const form = document.getElementById('custom-activity-form');
  const modalNote = document.getElementById('custom-activity-note');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];

  if (!openButton || !modal || !form || !modalNote) return;

  const openModal = () => {
    if (!state.tripId) {
      setNote('Selectionnez un voyage depuis le planning pour ajouter une activite personnalisee.', 'is-error');
      return;
    }

    form.reset();
    modalNote.classList.remove('is-success', 'is-error');
    modalNote.textContent = '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const nameInput = document.getElementById('custom-activity-name');
    if (nameInput instanceof HTMLElement) nameInput.focus();
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  openButton.addEventListener('click', openModal);
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.tripId) {
      modalNote.classList.remove('is-success');
      modalNote.classList.add('is-error');
      modalNote.textContent = 'Aucun voyage associe.';
      return;
    }

    const name = form.elements.namedItem('name')?.value?.trim();
    const address = form.elements.namedItem('address')?.value?.trim();
    const estimatedCost = parseOptionalCost(form.elements.namedItem('estimated_cost')?.value);

    if (!name || !address) {
      modalNote.classList.remove('is-success');
      modalNote.classList.add('is-error');
      modalNote.textContent = 'Nom et adresse sont requis.';
      return;
    }

    if (Number.isNaN(estimatedCost)) {
      modalNote.classList.remove('is-success');
      modalNote.classList.add('is-error');
      modalNote.textContent = 'Cout invalide.';
      return;
    }

    modalNote.classList.remove('is-success', 'is-error');
    modalNote.textContent = 'Ajout en cours...';

    try {
      await api.post(`/api/activities/trip/${encodeURIComponent(state.tripId)}`, {
        name,
        address,
        estimated_cost: estimatedCost,
        source: 'manual'
      });

      modalNote.classList.add('is-success');
      modalNote.textContent = 'Activite personnalisee ajoutee.';
      setNote('Activite personnalisee ajoutee au voyage.', 'is-success');
      closeModal();
    } catch (error) {
      modalNote.classList.remove('is-success');
      modalNote.classList.add('is-error');
      modalNote.textContent = error?.message || "Impossible d'ajouter l'activite.";
    }
  });
}

function bindEvents() {
  const destinationInput = document.getElementById('explorer-destination');
  const searchButton = document.getElementById('explorer-search');
  const filterBar = document.getElementById('activity-filter-bar');
  const results = document.getElementById('explorer-results');

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
  bindEvents();
  initCustomActivityModal();
  await fetchSuggestions();
}

initPage();
