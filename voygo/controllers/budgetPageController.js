import { api } from '../assets/js/api.js';
import { listBudgets, createBudget, updateBudget, deleteBudget } from './budgetController.js';
import { listTransports, createTransport } from './transportController.js';
import { listAccommodations, createAccommodation } from './accommodationController.js';

const CATEGORY_LABELS = {
  transport: 'Transport',
  logement: 'Logement',
  activites: 'Activites',
  repas: 'Repas',
  shopping: 'Shopping',
  autre: 'Autre'
};

const SOURCE_LABELS = {
  budget: 'Budget',
  transport: 'Transport',
  accommodation: 'Logement'
};

const PIE_COLORS = {
  transport: '#ff6b6b',
  logement: '#f4a261',
  activites: '#2ec4b6',
  repas: '#2a9d8f',
  shopping: '#457b9d',
  autre: '#8d99ae'
};

const state = {
  budgetRows: [],
  entries: [],
  trips: [],
  transports: [],
  accommodations: [],
  editingId: null,
  isLocalMode: false,
  userId: null,
  initialTripId: ''
};

const LOCAL_STORAGE_PREFIX = 'voygo_budget_local';

const refs = {
  mode: document.getElementById('budget-mode'),
  addButton: document.getElementById('budget-add'),
  inputLabel: document.getElementById('budget-label'),
  inputCategory: document.getElementById('budget-category'),
  inputPlanned: document.getElementById('budget-planned'),
  inputActual: document.getElementById('budget-actual'),
  inputDate: document.getElementById('budget-date'),
  inputTrip: document.getElementById('budget-trip'),
  filterTrip: document.getElementById('budget-filter-trip'),
  filterCategory: document.getElementById('budget-filter-category'),
  tableBody: document.getElementById('budget-table-body'),
  rowCount: document.getElementById('budget-count'),
  sumPlanned: document.getElementById('summary-planned'),
  sumActual: document.getElementById('summary-actual'),
  sumRemaining: document.getElementById('summary-remaining'),
  sumRate: document.getElementById('summary-rate'),
  canvas: document.getElementById('budget-pie-chart'),
  legend: document.getElementById('budget-chart-legend'),
  tripName: document.getElementById('budget-trip-name'),
  tripDates: document.getElementById('budget-dates'),
  addTransportButton: document.getElementById('budget-add-transport'),
  addAccommodationButton: document.getElementById('budget-add-accommodation'),
  transportModal: document.getElementById('transport-modal'),
  transportForm: document.getElementById('transport-form'),
  transportSaveNote: document.getElementById('transport-save-note'),
  accommodationModal: document.getElementById('accommodation-modal'),
  accommodationForm: document.getElementById('accommodation-form'),
  accommodationSaveNote: document.getElementById('accommodation-save-note'),
  accommodationNights: document.getElementById('accommodation-nights')
};

function getLocalStorageKey() {
  return `${LOCAL_STORAGE_PREFIX}:${state.userId || 'anon'}`;
}

function toSafeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2
  }).format(toSafeNumber(value));
}

function formatDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('fr-FR');
}

function formatTripDateRange(startDate, endDate) {
  if (!startDate && !endDate) return '-';
  const start = startDate ? formatDate(startDate) : '-';
  const end = endDate ? formatDate(endDate) : '-';
  return `${start} -> ${end}`;
}

function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || CATEGORY_LABELS.autre;
}

function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, key)) {
    return key;
  }
  return 'autre';
}

function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;
  return Math.round(diff / 86400000);
}

function getTripById(tripId) {
  return state.trips.find((trip) => String(trip.id) === String(tripId));
}

function getActiveTripId() {
  const selectedFilterTrip = refs.filterTrip?.value;
  if (selectedFilterTrip && selectedFilterTrip !== 'all') return selectedFilterTrip;

  const selectedInputTrip = refs.inputTrip?.value;
  if (selectedInputTrip) return selectedInputTrip;

  if (state.initialTripId) return state.initialTripId;

  return '';
}

function requireActiveTripId() {
  const tripId = getActiveTripId();
  if (tripId) return tripId;
  window.alert('Selectionnez un voyage avant d\'ajouter un transport ou un logement.');
  return null;
}

function normalizeBudgetItem(raw, index = 0) {
  const plannedCandidates = [
    raw?.planned_amount,
    raw?.planned,
    raw?.estimated_amount,
    raw?.budget_amount,
    raw?.amount
  ];

  const actualCandidates = [
    raw?.actual_amount,
    raw?.actual,
    raw?.spent_amount,
    raw?.amount_spent,
    raw?.paid_amount
  ];

  const planned = plannedCandidates.map(toSafeNumber).find((v) => v > 0) || 0;
  const actual = actualCandidates.map(toSafeNumber).find((v) => v > 0) || 0;
  const id = raw?.id || `local-${Date.now()}-${index}`;

  return {
    id,
    source: 'budget',
    sourceId: String(id),
    label: String(raw?.label || raw?.name || raw?.title || 'Depense').trim(),
    category: normalizeCategory(raw?.category),
    planned,
    actual,
    date: String(raw?.spend_date || raw?.date || '').trim(),
    tripId: raw?.trip_id ? String(raw.trip_id) : '',
    raw: raw || {}
  };
}

function normalizeTransportAsBudget(raw) {
  const price = toSafeNumber(raw?.price);
  const origin = String(raw?.origin || '').trim();
  const destination = String(raw?.destination || '').trim();
  const label = origin || destination
    ? `${origin || 'Depart'} -> ${destination || 'Arrivee'}`
    : 'Transport';

  return {
    id: `transport-${raw?.id}`,
    source: 'transport',
    sourceId: String(raw?.id || ''),
    label,
    category: 'transport',
    planned: price,
    actual: price,
    date: String(raw?.travel_date || '').trim(),
    tripId: raw?.trip_id ? String(raw.trip_id) : '',
    raw: raw || {}
  };
}

function normalizeAccommodationAsBudget(raw) {
  const nights = toSafeNumber(raw?.nights || computeNights(raw?.start_date, raw?.end_date));
  const nightlyPrice = toSafeNumber(raw?.price_per_night ?? raw?.price ?? 0);
  const total = Math.round((nights * nightlyPrice) * 100) / 100;
  const name = String(raw?.name || '').trim();
  const address = String(raw?.address || '').trim();

  return {
    id: `accommodation-${raw?.id}`,
    source: 'accommodation',
    sourceId: String(raw?.id || ''),
    label: name || address || 'Logement',
    category: 'logement',
    planned: total,
    actual: total,
    date: String(raw?.start_date || '').trim(),
    tripId: raw?.trip_id ? String(raw.trip_id) : '',
    raw: raw || {}
  };
}

function rebuildEntries() {
  const manualEntries = state.budgetRows;
  const transportEntries = state.transports.map(normalizeTransportAsBudget);
  const accommodationEntries = state.accommodations.map(normalizeAccommodationAsBudget);

  state.entries = [...manualEntries, ...transportEntries, ...accommodationEntries]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

function mapToPayload(item) {
  return {
    label: item.label,
    category: item.category,
    planned_amount: item.planned,
    actual_amount: item.actual,
    spend_date: item.date || null,
    trip_id: item.tripId || null
  };
}

function readLocalBudgets() {
  try {
    const saved = localStorage.getItem(getLocalStorageKey());
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => normalizeBudgetItem(item, index));
  } catch {
    return [];
  }
}

function saveLocalBudgets() {
  const payload = state.budgetRows.map((item) => ({
    id: item.id,
    label: item.label,
    category: item.category,
    planned: item.planned,
    actual: item.actual,
    date: item.date,
    tripId: item.tripId
  }));

  localStorage.setItem(getLocalStorageKey(), JSON.stringify(payload));
}

function setLocalMode(message) {
  if (state.isLocalMode) return;
  state.isLocalMode = true;
  if (refs.mode) {
    refs.mode.hidden = false;
    refs.mode.textContent = message || 'Mode local active';
  }
  saveLocalBudgets();
}

function resolveTripLabel(tripId) {
  if (!tripId) return 'General';
  const trip = state.trips.find((item) => String(item.id) === String(tripId));
  return trip?.name || trip?.destination || 'Voyage';
}

function buildTripOptions(select) {
  if (!select) return;

  const existingValue = select.value;
  const isFilter = select === refs.filterTrip;

  select.innerHTML = '';
  if (isFilter) {
    const option = document.createElement('option');
    option.value = 'all';
    option.textContent = 'Tous les voyages';
    select.appendChild(option);
  } else {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'General';
    select.appendChild(option);
  }

  state.trips.forEach((trip) => {
    const option = document.createElement('option');
    option.value = String(trip.id);
    option.textContent = trip.name || trip.destination || `Voyage ${trip.id}`;
    select.appendChild(option);
  });

  const knownTripIds = new Set(state.trips.map((trip) => String(trip.id)));
  state.entries
    .map((item) => item.tripId)
    .filter((tripId) => tripId && !knownTripIds.has(String(tripId)))
    .forEach((tripId) => {
      const option = document.createElement('option');
      option.value = String(tripId);
      option.textContent = `Voyage ${tripId}`;
      select.appendChild(option);
    });

  const values = Array.from(select.options).map((option) => option.value);
  select.value = values.includes(existingValue) ? existingValue : (isFilter ? 'all' : '');
}

function getFilteredEntries() {
  const selectedTrip = refs.filterTrip?.value || 'all';
  const selectedCategory = refs.filterCategory?.value || 'all';

  return state.entries.filter((item) => {
    const tripOk = selectedTrip === 'all' || String(item.tripId || '') === String(selectedTrip);
    const categoryOk = selectedCategory === 'all' || item.category === selectedCategory;
    return tripOk && categoryOk;
  });
}

function createCell(content) {
  const cell = document.createElement('td');
  cell.textContent = content;
  return cell;
}

function renderTable(items) {
  if (!refs.tableBody) return;

  refs.tableBody.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'budget-empty';
    cell.colSpan = 7;
    cell.textContent = 'Aucune depense pour le filtre selectionne.';
    row.appendChild(cell);
    refs.tableBody.appendChild(row);
  } else {
    items.forEach((item) => {
      const row = document.createElement('tr');

      row.appendChild(createCell(item.label));
      row.appendChild(createCell(getCategoryLabel(item.category)));
      row.appendChild(createCell(formatCurrency(item.planned)));
      row.appendChild(createCell(formatCurrency(item.actual)));
      row.appendChild(createCell(formatDate(item.date)));
      row.appendChild(createCell(resolveTripLabel(item.tripId)));

      const actionCell = document.createElement('td');

      if (item.source === 'budget') {
        const group = document.createElement('div');
        group.className = 'budget-action-group';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-icon';
        editBtn.setAttribute('data-action', 'edit');
        editBtn.setAttribute('data-id', String(item.id));
        editBtn.title = 'Modifier';
        editBtn.innerHTML = "<i class='bx bx-edit'></i>";

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-icon btn-icon-danger';
        deleteBtn.setAttribute('data-action', 'delete');
        deleteBtn.setAttribute('data-id', String(item.id));
        deleteBtn.title = 'Supprimer';
        deleteBtn.innerHTML = "<i class='bx bx-trash'></i>";

        group.appendChild(editBtn);
        group.appendChild(deleteBtn);
        actionCell.appendChild(group);
      } else {
        actionCell.textContent = SOURCE_LABELS[item.source] || 'Auto';
      }

      row.appendChild(actionCell);
      refs.tableBody.appendChild(row);
    });
  }

  if (refs.rowCount) {
    refs.rowCount.textContent = `${items.length} ligne${items.length > 1 ? 's' : ''}`;
  }
}

function renderSummary(items) {
  const planned = items.reduce((sum, item) => sum + toSafeNumber(item.planned), 0);
  const actual = items.reduce((sum, item) => sum + toSafeNumber(item.actual), 0);
  const remaining = planned - actual;
  const rate = planned > 0 ? Math.min(999, (actual / planned) * 100) : 0;

  refs.sumPlanned.textContent = formatCurrency(planned);
  refs.sumActual.textContent = formatCurrency(actual);
  refs.sumRemaining.textContent = formatCurrency(remaining);
  refs.sumRate.textContent = `${rate.toFixed(1).replace('.', ',')}%`;
}

function drawPieChart(items) {
  if (!refs.canvas || !refs.legend) return;

  const ctx = refs.canvas.getContext('2d');
  if (!ctx) return;

  const totalsByCategory = {};
  items.forEach((item) => {
    const key = normalizeCategory(item.category);
    const value = toSafeNumber(item.actual > 0 ? item.actual : item.planned);
    totalsByCategory[key] = (totalsByCategory[key] || 0) + value;
  });

  const slices = Object.entries(totalsByCategory)
    .map(([category, total]) => ({
      category,
      total,
      color: PIE_COLORS[category] || PIE_COLORS.autre
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  const total = slices.reduce((sum, entry) => sum + entry.total, 0);
  const width = refs.canvas.width;
  const height = refs.canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 12;

  ctx.clearRect(0, 0, width, height);

  if (!slices.length || total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.fill();

    ctx.fillStyle = '#6b7280';
    ctx.font = '600 14px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune depense', cx, cy + 4);
    refs.legend.innerHTML = '';
    return;
  }

  let startAngle = -Math.PI / 2;
  slices.forEach((slice) => {
    const angle = (slice.total / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    startAngle += angle;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.fillStyle = '#1f2937';
  ctx.font = '700 14px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText('Total', cx, cy - 8);
  ctx.font = '700 16px Segoe UI';
  ctx.fillText(formatCurrency(total), cx, cy + 14);

  refs.legend.innerHTML = '';
  slices.forEach((slice) => {
    const item = document.createElement('li');
    item.className = 'chart-legend-item';

    const label = document.createElement('span');
    label.className = 'chart-legend-label';

    const dot = document.createElement('span');
    dot.className = 'chart-dot';
    dot.style.background = slice.color;

    const name = document.createElement('span');
    name.textContent = getCategoryLabel(slice.category);

    label.appendChild(dot);
    label.appendChild(name);

    const stats = document.createElement('span');
    const percent = (slice.total / total) * 100;
    stats.textContent = `${formatCurrency(slice.total)} (${percent.toFixed(1).replace('.', ',')}%)`;

    item.appendChild(label);
    item.appendChild(stats);
    refs.legend.appendChild(item);
  });
}

function updateHeroMeta() {
  if (!refs.tripName || !refs.tripDates) return;

  const selectedTripId = refs.filterTrip?.value || 'all';
  if (selectedTripId === 'all') {
    refs.tripName.textContent = 'Tous les voyages';
    refs.tripDates.textContent = '-';
    return;
  }

  const trip = getTripById(selectedTripId);
  if (!trip) {
    refs.tripName.textContent = `Voyage ${selectedTripId}`;
    refs.tripDates.textContent = '-';
    return;
  }

  refs.tripName.textContent = trip.name || trip.destination || `Voyage ${trip.id}`;
  refs.tripDates.textContent = formatTripDateRange(trip.start_date, trip.end_date);
}

function renderAll() {
  buildTripOptions(refs.inputTrip);
  buildTripOptions(refs.filterTrip);

  if (state.initialTripId && refs.filterTrip && refs.filterTrip.value === 'all') {
    const values = Array.from(refs.filterTrip.options).map((option) => option.value);
    if (values.includes(state.initialTripId)) {
      refs.filterTrip.value = state.initialTripId;
      refs.inputTrip.value = state.initialTripId;
    }
    state.initialTripId = '';
  }

  const filtered = getFilteredEntries();
  renderTable(filtered);
  renderSummary(filtered);
  drawPieChart(filtered);
  updateHeroMeta();
}

function resetForm() {
  state.editingId = null;
  refs.inputLabel.value = '';
  refs.inputCategory.value = 'transport';
  refs.inputPlanned.value = '';
  refs.inputActual.value = '';
  refs.inputDate.value = '';
  refs.inputTrip.value = getActiveTripId() || '';
  refs.addButton.textContent = 'Ajouter';
}

function loadFormForEdit(item) {
  state.editingId = item.id;
  refs.inputLabel.value = item.label;
  refs.inputCategory.value = item.category;
  refs.inputPlanned.value = item.planned > 0 ? String(item.planned) : '';
  refs.inputActual.value = item.actual > 0 ? String(item.actual) : '';
  refs.inputDate.value = item.date || '';
  refs.inputTrip.value = item.tripId || '';
  refs.addButton.textContent = 'Mettre a jour';
}

function validateForm() {
  const label = String(refs.inputLabel.value || '').trim();
  const category = normalizeCategory(refs.inputCategory.value);
  const planned = toSafeNumber(refs.inputPlanned.value);
  const actual = toSafeNumber(refs.inputActual.value);
  const date = String(refs.inputDate.value || '').trim();
  const tripId = String(refs.inputTrip.value || '').trim();

  if (!label) {
    throw new Error('Merci de renseigner un nom de depense.');
  }

  if (planned <= 0 && actual <= 0) {
    throw new Error('Renseignez au moins un montant prevu ou depense superieur a 0.');
  }

  return {
    label,
    category,
    planned,
    actual,
    date,
    tripId
  };
}

function upsertBudgetRow(item) {
  const index = state.budgetRows.findIndex((entry) => String(entry.id) === String(item.id));
  if (index === -1) {
    state.budgetRows.unshift(item);
  } else {
    state.budgetRows[index] = item;
  }
  saveLocalBudgets();
  rebuildEntries();
}

function removeBudgetRow(itemId) {
  state.budgetRows = state.budgetRows.filter((item) => String(item.id) !== String(itemId));
  saveLocalBudgets();
  rebuildEntries();
}

async function handleSave() {
  let formData;
  try {
    formData = validateForm();
  } catch (error) {
    window.alert(error.message || 'Formulaire invalide.');
    return;
  }

  refs.addButton.disabled = true;
  refs.addButton.textContent = state.editingId ? 'Mise a jour...' : 'Ajout...';

  try {
    if (state.isLocalMode) {
      const localItem = {
        id: state.editingId || `local-${Date.now()}`,
        source: 'budget',
        sourceId: state.editingId || `local-${Date.now()}`,
        ...formData,
        raw: {}
      };
      upsertBudgetRow(localItem);
    } else if (state.editingId) {
      const updated = await updateBudget(state.editingId, mapToPayload(formData));
      const normalized = normalizeBudgetItem(updated);
      upsertBudgetRow(normalized);
    } else {
      const created = await createBudget(mapToPayload(formData));
      upsertBudgetRow(normalizeBudgetItem(created));
    }

    resetForm();
    renderAll();
  } catch (error) {
    setLocalMode('Mode local active (API budget indisponible)');
    const id = state.editingId || `local-${Date.now()}`;
    const localItem = {
      id,
      source: 'budget',
      sourceId: id,
      ...formData,
      raw: {}
    };
    upsertBudgetRow(localItem);
    resetForm();
    renderAll();
    console.error('Erreur budget API, fallback local:', error);
  } finally {
    refs.addButton.disabled = false;
    refs.addButton.textContent = state.editingId ? 'Mettre a jour' : 'Ajouter';
  }
}

async function handleDelete(itemId) {
  const confirmed = window.confirm('Supprimer cette depense ?');
  if (!confirmed) return;

  try {
    if (!state.isLocalMode) {
      await deleteBudget(itemId);
    }
    removeBudgetRow(itemId);
    if (String(state.editingId) === String(itemId)) {
      resetForm();
    }
    renderAll();
  } catch (error) {
    setLocalMode('Mode local active (API budget indisponible)');
    removeBudgetRow(itemId);
    renderAll();
    console.error('Suppression budget en local suite a erreur API:', error);
  }
}

async function loadTrips() {
  try {
    const result = await api.get('/api/trips');
    state.trips = Array.isArray(result?.data) ? result.data : [];
  } catch {
    state.trips = [];
  }
}

async function loadBudgets() {
  try {
    const rows = await listBudgets();
    state.budgetRows = Array.isArray(rows) ? rows.map((row, index) => normalizeBudgetItem(row, index)) : [];
  } catch (error) {
    setLocalMode('Mode local active (API budget indisponible)');
    state.budgetRows = readLocalBudgets();
    console.error('Chargement budgets via API impossible:', error);
  }

  if (state.isLocalMode && !state.budgetRows.length) {
    state.budgetRows = readLocalBudgets();
  }
}

async function loadRelatedEntries() {
  try {
    const accommodations = await listAccommodations();
    state.accommodations = Array.isArray(accommodations) ? accommodations : [];
  } catch (error) {
    state.accommodations = [];
    console.warn('Chargement logements impossible:', error);
  }

  const tripIds = state.trips.map((trip) => String(trip.id)).filter(Boolean);
  if (!tripIds.length) {
    state.transports = [];
    rebuildEntries();
    return;
  }

  const transportResults = await Promise.all(
    tripIds.map(async (tripId) => {
      try {
        const items = await listTransports(tripId);
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    })
  );

  state.transports = transportResults.flat();
  rebuildEntries();
}

function setTransportDateBounds(tripId) {
  const dateInput = document.getElementById('transport-date');
  if (!dateInput) return;
  const trip = getTripById(tripId);
  dateInput.min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
  dateInput.max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';
}

function setAccommodationDateBounds(tripId) {
  const startInput = document.getElementById('accommodation-start');
  const endInput = document.getElementById('accommodation-end');
  const trip = getTripById(tripId);

  if (startInput) {
    startInput.min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
    startInput.max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';
  }
  if (endInput) {
    endInput.min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
    endInput.max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';
  }
}

function initTransportModal() {
  if (!refs.transportModal || !refs.transportForm || !refs.addTransportButton || !refs.transportSaveNote) return;

  const closeModal = () => {
    refs.transportModal.hidden = true;
    document.body.style.overflow = '';
  };

  const resetTransportForm = () => {
    refs.transportForm.reset();
    const idInput = refs.transportForm.elements.namedItem('transport_id');
    if (idInput) idInput.value = '';
    refs.transportSaveNote.classList.remove('is-error', 'is-success');
    refs.transportSaveNote.textContent = '';
  };

  refs.addTransportButton.addEventListener('click', () => {
    const tripId = requireActiveTripId();
    if (!tripId) return;
    setTransportDateBounds(tripId);
    resetTransportForm();
    refs.transportModal.hidden = false;
    document.body.style.overflow = 'hidden';
  });

  refs.transportModal.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  refs.transportModal.addEventListener('click', (event) => {
    if (event.target === refs.transportModal) {
      closeModal();
    }
  });

  refs.transportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tripId = requireActiveTripId();
    if (!tripId) return;

    const origin = refs.transportForm.elements.namedItem('from')?.value?.trim();
    const destination = refs.transportForm.elements.namedItem('to')?.value?.trim();
    const travelDate = refs.transportForm.elements.namedItem('date')?.value;
    const travelTime = refs.transportForm.elements.namedItem('time')?.value;
    const mode = refs.transportForm.elements.namedItem('mode')?.value;
    const priceRaw = refs.transportForm.elements.namedItem('price')?.value;
    const durationRaw = refs.transportForm.elements.namedItem('duration')?.value;
    const price = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const durationMinutes = durationRaw ? Number(durationRaw) : null;

    refs.transportSaveNote.classList.remove('is-error', 'is-success');
    refs.transportSaveNote.textContent = 'Enregistrement...';

    if (!origin || !destination || !travelDate || !travelTime || !mode) {
      refs.transportSaveNote.classList.add('is-error');
      refs.transportSaveNote.textContent = 'Merci de remplir les champs obligatoires.';
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      refs.transportSaveNote.classList.add('is-error');
      refs.transportSaveNote.textContent = 'Temps de trajet invalide.';
      return;
    }

    if (price !== null && !Number.isFinite(price)) {
      refs.transportSaveNote.classList.add('is-error');
      refs.transportSaveNote.textContent = 'Prix invalide.';
      return;
    }

    try {
      await createTransport(tripId, {
        origin,
        destination,
        travel_date: travelDate,
        travel_time: travelTime,
        mode,
        price,
        duration_minutes: durationMinutes
      });

      refs.transportSaveNote.classList.add('is-success');
      refs.transportSaveNote.textContent = 'Transport ajoute.';
      await loadRelatedEntries();
      renderAll();
      closeModal();
    } catch (error) {
      refs.transportSaveNote.classList.add('is-error');
      refs.transportSaveNote.textContent = error?.message || 'Erreur lors de l\'ajout du transport.';
    }
  });
}

function initAccommodationModal() {
  if (!refs.accommodationModal || !refs.accommodationForm || !refs.addAccommodationButton || !refs.accommodationSaveNote) return;

  const closeModal = () => {
    refs.accommodationModal.hidden = true;
    document.body.style.overflow = '';
  };

  const updateNights = () => {
    if (!refs.accommodationNights) return;
    const startDate = refs.accommodationForm.elements.namedItem('start')?.value;
    const endDate = refs.accommodationForm.elements.namedItem('end')?.value;
    const nights = computeNights(startDate, endDate);
    refs.accommodationNights.value = nights > 0 ? String(nights) : '';
  };

  const resetAccommodationForm = () => {
    refs.accommodationForm.reset();
    const idInput = refs.accommodationForm.elements.namedItem('accommodation_id');
    if (idInput) idInput.value = '';
    if (refs.accommodationNights) refs.accommodationNights.value = '';
    refs.accommodationSaveNote.classList.remove('is-error', 'is-success');
    refs.accommodationSaveNote.textContent = '';
  };

  refs.accommodationForm.elements.namedItem('start')?.addEventListener('change', updateNights);
  refs.accommodationForm.elements.namedItem('end')?.addEventListener('change', updateNights);

  refs.addAccommodationButton.addEventListener('click', () => {
    const tripId = requireActiveTripId();
    if (!tripId) return;
    setAccommodationDateBounds(tripId);
    resetAccommodationForm();
    refs.accommodationModal.hidden = false;
    document.body.style.overflow = 'hidden';
  });

  refs.accommodationModal.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  refs.accommodationModal.addEventListener('click', (event) => {
    if (event.target === refs.accommodationModal) {
      closeModal();
    }
  });

  refs.accommodationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tripId = requireActiveTripId();
    if (!tripId) return;

    const name = refs.accommodationForm.elements.namedItem('name')?.value?.trim();
    const address = refs.accommodationForm.elements.namedItem('address')?.value?.trim();
    const startDate = refs.accommodationForm.elements.namedItem('start')?.value;
    const endDate = refs.accommodationForm.elements.namedItem('end')?.value;
    const priceRaw = refs.accommodationForm.elements.namedItem('price')?.value;
    const priceValue = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const nights = computeNights(startDate, endDate);

    refs.accommodationSaveNote.classList.remove('is-error', 'is-success');
    refs.accommodationSaveNote.textContent = 'Enregistrement...';

    if (!address || !startDate || !endDate) {
      refs.accommodationSaveNote.classList.add('is-error');
      refs.accommodationSaveNote.textContent = 'Merci de remplir les champs obligatoires.';
      return;
    }

    if (nights <= 0) {
      refs.accommodationSaveNote.classList.add('is-error');
      refs.accommodationSaveNote.textContent = 'Les dates doivent couvrir au moins 1 nuit.';
      return;
    }

    if (priceValue !== null && !Number.isFinite(priceValue)) {
      refs.accommodationSaveNote.classList.add('is-error');
      refs.accommodationSaveNote.textContent = 'Prix invalide.';
      return;
    }

    try {
      await createAccommodation({
        trip_id: tripId,
        name: name || null,
        address,
        price_per_night: priceValue,
        start_date: startDate,
        end_date: endDate,
        nights
      });

      refs.accommodationSaveNote.classList.add('is-success');
      refs.accommodationSaveNote.textContent = 'Logement ajoute.';
      await loadRelatedEntries();
      renderAll();
      closeModal();
    } catch (error) {
      refs.accommodationSaveNote.classList.add('is-error');
      refs.accommodationSaveNote.textContent = error?.message || 'Erreur lors de l\'ajout du logement.';
    }
  });
}

function bindEvents() {
  refs.addButton?.addEventListener('click', handleSave);
  refs.filterTrip?.addEventListener('change', () => {
    if (refs.filterTrip?.value !== 'all') {
      refs.inputTrip.value = refs.filterTrip.value;
    }
    renderAll();
  });
  refs.filterCategory?.addEventListener('change', renderAll);

  refs.tableBody?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('button[data-action][data-id]');
    if (!button) return;

    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');
    const item = state.budgetRows.find((entry) => String(entry.id) === String(id));

    if (!item) return;

    if (action === 'edit') {
      loadFormForEdit(item);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'delete') {
      await handleDelete(item.id);
    }
  });
}

async function initBudgetPage() {
  if (!refs.addButton || !refs.tableBody || !refs.canvas) return;

  try {
    const me = await api.get('/api/auth/me');
    const userId = me?.user?.id;
    if (!userId) {
      window.location.href = `login.html?returnTo=${encodeURIComponent('budget.html')}`;
      return;
    }

    state.userId = String(userId);
  } catch {
    window.location.href = `login.html?returnTo=${encodeURIComponent('budget.html')}`;
    return;
  }

  const params = new URLSearchParams(window.location.search || '');
  state.initialTripId = String(params.get('tripId') || '').trim();

  await loadTrips();
  await loadBudgets();
  await loadRelatedEntries();
  bindEvents();
  initTransportModal();
  initAccommodationModal();
  renderAll();
  resetForm();
}

initBudgetPage();
