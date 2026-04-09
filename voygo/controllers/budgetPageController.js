/**
 * @voygo-doc
 * Module: budgetPageController
 * Fichier: voygo\controllers\budgetPageController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';
import { listBudgets, createBudget, updateBudget, deleteBudget } from './budgetController.js';
import { listTransports, createTransport, updateTransport, deleteTransport } from './transportController.js';
import { listAccommodationsByTrip, createAccommodation, updateAccommodation, deleteAccommodation } from './accommodationController.js';

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
  accessMode: 'owner',
  canEdit: true,
  editingId: null,
  forcedFormMode: null,
  isLocalMode: false,
  userId: null,
  initialTripId: ''
};

const LOCAL_STORAGE_PREFIX = 'voygo_budget_local';

const refs = {
  mode: document.getElementById('budget-mode'),
  addButton: document.getElementById('budget-add'),
  formNote: document.getElementById('budget-form-note'),
  inputLabel: document.getElementById('budget-label'),
  inputCategory: document.getElementById('budget-category'),
  inputPlanned: document.getElementById('budget-planned'),
  inputActual: document.getElementById('budget-actual'),
  inputDate: document.getElementById('budget-date'),
  budgetMode: document.getElementById('budget-form-budget'),
  transportMode: document.getElementById('budget-form-transport'),
  transportFrom: document.getElementById('budget-transport-from'),
  transportTo: document.getElementById('budget-transport-to'),
  transportDate: document.getElementById('budget-transport-date'),
  transportTime: document.getElementById('budget-transport-time'),
  transportDuration: document.getElementById('budget-transport-duration'),
  transportPrice: document.getElementById('budget-transport-price'),
  transportModeSelect: document.getElementById('budget-transport-mode'),
  accommodationMode: document.getElementById('budget-form-accommodation'),
  accommodationName: document.getElementById('budget-accommodation-name'),
  accommodationAddress: document.getElementById('budget-accommodation-address'),
  accommodationPrice: document.getElementById('budget-accommodation-price'),
  accommodationStart: document.getElementById('budget-accommodation-start'),
  accommodationEnd: document.getElementById('budget-accommodation-end'),
  accommodationNights: document.getElementById('budget-accommodation-nights'),
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
  tripDates: document.getElementById('budget-dates')
};

// Indique si le voyage est termine.
function isTripPastEndDate(endDate) {
  const normalizedEndDate = String(endDate || '').trim();
  if (!normalizedEndDate) return false;
  return normalizedEndDate < new Date().toISOString().slice(0, 10);
}

// Retourne l'information calculee par 'getLocalStorageKey'.
function getLocalStorageKey() {
  return `${LOCAL_STORAGE_PREFIX}:${state.userId || 'anon'}`;
}

// Gere la logique principale de 'toSafeNumber'.
function toSafeNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num * 100) / 100);
}

// Formate la valeur traitee par 'formatCurrency'.
function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2
  }).format(toSafeNumber(value));
}

// Formate la valeur traitee par 'formatDate'.
function formatDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('fr-FR');
}

// Formate la valeur traitee par 'formatTripDateRange'.
function formatTripDateRange(startDate, endDate) {
  if (!startDate && !endDate) return '-';
  const start = startDate ? formatDate(startDate) : '-';
  const end = endDate ? formatDate(endDate) : '-';
  return `${start} -> ${end}`;
}

// Retourne l'information calculee par 'getCategoryLabel'.
function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || CATEGORY_LABELS.autre;
}

// Normalise les donnees pour 'normalizeCategory'.
function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, key)) {
    return key;
  }
  return 'autre';
}

// Retourne l'information calculee par 'getBudgetFormMode'.
function getBudgetFormMode() {
  if (state.forcedFormMode) {
    return state.forcedFormMode;
  }

  const category = normalizeCategory(refs.inputCategory?.value);
  if (category === 'transport' || category === 'logement') {
    return category;
  }
  return 'budget';
}

// Retourne l'information calculee par 'getSelectedTripId'.
function getSelectedTripId() {
  return String(state.initialTripId || '').trim();
}

// Gere la logique principale de 'setSectionDisabled'.
function setSectionDisabled(section, disabled) {
  if (!section) return;
  section.hidden = disabled;
  section.querySelectorAll('input, select, textarea').forEach((input) => {
    input.disabled = disabled;
  });
}

// Gere la logique principale de 'setFormNote'.
function setFormNote(message, isError = false) {
  if (!refs.formNote) return;
  refs.formNote.classList.remove('is-error', 'is-success');
  if (message) {
    refs.formNote.classList.add(isError ? 'is-error' : 'is-success');
  }
  refs.formNote.textContent = message || '';
}

// Verifie la condition exposee par 'isReadOnlyTrip'.
function isReadOnlyTrip() {
  return !state.canEdit;
}

// Gere la logique principale de 'applyReadOnlyUiState'.
function applyReadOnlyUiState() {
  document.body.classList.toggle('is-read-only-trip', isReadOnlyTrip());
}

// Gere la logique principale de 'getTripById'.
function getTripById(tripId) {
  return state.trips.find((trip) => String(trip.id) === String(tripId));
}

// Met a jour les bornes de date du formulaire budget.
function updateBudgetDateBounds() {
  if (!refs.inputDate) return;

  const trip = getTripById(getSelectedTripId());
  const min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
  const max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';

  refs.inputDate.min = min;
  refs.inputDate.max = max;

  if (refs.inputDate.value) {
    if (min && refs.inputDate.value < min) {
      refs.inputDate.value = min;
    }
    if (max && refs.inputDate.value > max) {
      refs.inputDate.value = max;
    }
  }
}

// Gere la logique principale de 'updateTransportDateBounds'.
function updateTransportDateBounds() {
  if (!refs.transportDate) return;
  const trip = getTripById(getSelectedTripId());
  refs.transportDate.min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
  refs.transportDate.max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';
}

// Gere la logique principale de 'updateAccommodationDateBounds'.
function updateAccommodationDateBounds() {
  const trip = getTripById(getSelectedTripId());
  const min = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
  const max = trip?.end_date ? String(trip.end_date).split('T')[0] : '';

  if (refs.accommodationStart) {
    refs.accommodationStart.min = min;
    refs.accommodationStart.max = max;
  }

  if (refs.accommodationEnd) {
    refs.accommodationEnd.min = min;
    refs.accommodationEnd.max = max;
  }
}

// Gere la logique principale de 'updateAccommodationNights'.
function updateAccommodationNights() {
  if (!refs.accommodationNights) return;
  const nights = computeNights(refs.accommodationStart?.value, refs.accommodationEnd?.value);
  refs.accommodationNights.value = nights > 0 ? String(nights) : '';
}

// Gere la logique principale de 'clearFormValues'.
function clearFormValues() {
  if (refs.inputLabel) refs.inputLabel.value = '';
  if (refs.inputPlanned) refs.inputPlanned.value = '';
  if (refs.inputActual) refs.inputActual.value = '';
  if (refs.inputDate) refs.inputDate.value = '';

  if (refs.transportFrom) refs.transportFrom.value = '';
  if (refs.transportTo) refs.transportTo.value = '';
  if (refs.transportDate) refs.transportDate.value = '';
  if (refs.transportTime) refs.transportTime.value = '';
  if (refs.transportDuration) refs.transportDuration.value = '';
  if (refs.transportPrice) refs.transportPrice.value = '';
  if (refs.transportModeSelect) refs.transportModeSelect.value = '';

  if (refs.accommodationName) refs.accommodationName.value = '';
  if (refs.accommodationAddress) refs.accommodationAddress.value = '';
  if (refs.accommodationPrice) refs.accommodationPrice.value = '';
  if (refs.accommodationStart) refs.accommodationStart.value = '';
  if (refs.accommodationEnd) refs.accommodationEnd.value = '';
  if (refs.accommodationNights) refs.accommodationNights.value = '';
}

// Gere la logique principale de 'applyBudgetFormMode'.
function applyBudgetFormMode(mode = getBudgetFormMode()) {
  const readOnly = isReadOnlyTrip();

  if (readOnly) {
    setSectionDisabled(refs.budgetMode, true);
    setSectionDisabled(refs.transportMode, true);
    setSectionDisabled(refs.accommodationMode, true);

    if (refs.addButton) refs.addButton.hidden = true;
    if (refs.formNote) refs.formNote.hidden = true;
    return;
  }

  const normalizedMode = mode === 'transport' || mode === 'logement' ? mode : 'budget';
  const isBudget = normalizedMode === 'budget';
  const isTransport = normalizedMode === 'transport';
  const isAccommodation = normalizedMode === 'logement';

  setSectionDisabled(refs.budgetMode, !isBudget);
  setSectionDisabled(refs.transportMode, !isTransport);
  setSectionDisabled(refs.accommodationMode, !isAccommodation);

  if (refs.addButton) {
    refs.addButton.hidden = false;
    refs.addButton.textContent = isTransport
      ? 'Ajouter le transport'
      : isAccommodation
        ? 'Ajouter le logement'
        : state.editingId
          ? 'Mettre a jour'
          : 'Ajouter';
  }

  if (refs.formNote) {
    refs.formNote.hidden = false;
  }



  if (isTransport) {
    updateTransportDateBounds();
  }

  if (isAccommodation) {
    updateAccommodationDateBounds();
    updateAccommodationNights();
  }

  if (isBudget) {
    updateBudgetDateBounds();
  }
}

// Gere la logique principale de 'getActiveTripId'.
function getActiveTripId() {
  if (state.initialTripId) return state.initialTripId;

  return '';
}

// Gere la logique principale de 'requireActiveTripId'.
function requireActiveTripId() {
  const tripId = getActiveTripId();
  if (tripId) return tripId;
  window.alert('Aucun voyage actif. Ouvrez la page budget depuis un voyage pour ajouter un transport ou un logement.');
  return null;
}

// Gere la logique principale de 'computeNights'.
function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;
  return Math.round(diff / 86400000);
}

// Normalise les donnees pour 'normalizeBudgetItem'.
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

// Normalise les donnees pour 'normalizeTransportAsBudget'.
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

// Normalise les donnees pour 'normalizeAccommodationAsBudget'.
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

// Gere la logique principale de 'rebuildEntries'.
function rebuildEntries() {
  const manualEntries = state.budgetRows;
  const transportEntries = state.transports.map(normalizeTransportAsBudget);
  const accommodationEntries = state.accommodations.map(normalizeAccommodationAsBudget);

  state.entries = [...manualEntries, ...transportEntries, ...accommodationEntries]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

// Gere la logique principale de 'mapToPayload'.
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

// Gere la logique principale de 'readLocalBudgets'.
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

// Gere la logique principale de 'saveLocalBudgets'.
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

// Met a jour l'etat pilote par 'setLocalMode'.
function setLocalMode(message) {
  if (state.isLocalMode) return;
  state.isLocalMode = true;
  saveLocalBudgets();
}

// Resout les informations calculees par 'resolveTripLabel'.
function resolveTripLabel(tripId) {
  if (!tripId) return 'General';
  const trip = state.trips.find((item) => String(item.id) === String(tripId));
  return trip?.name || trip?.destination || 'Voyage';
}

// Retourne l'information calculee par 'getFilteredEntries'.
function getFilteredEntries() {
  const selectedTripId = getSelectedTripId();
  const selectedCategory = refs.filterCategory?.value || 'all';

  return state.entries.filter((item) => {
    const sameTrip = !selectedTripId || String(item.tripId || '') === String(selectedTripId);
    const categoryOk = selectedCategory === 'all' || item.category === selectedCategory;
    return sameTrip && categoryOk;
  });
}

// Cree les donnees gerees par 'createCell'.
function createCell(content) {
  const cell = document.createElement('td');
  cell.textContent = content;
  return cell;
}

// Retourne l'information calculee par 'parseActualInlineValue'.
function parseActualInlineValue(value) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Depense invalide.');
  }
  return Math.round(parsed * 100) / 100;
}

// Gere la logique principale de 'updateActualInline'.
async function updateActualInline(itemId, rawValue) {
  if (!state.canEdit) return;

  const current = state.budgetRows.find((entry) => String(entry.id) === String(itemId));
  if (!current) return;

  let nextActual;
  try {
    nextActual = parseActualInlineValue(rawValue);
  } catch (error) {
    window.alert(error.message || 'Depense invalide.');
    renderAll();
    return;
  }

  if (Math.abs(toSafeNumber(current.actual) - nextActual) < 0.0001) return;

  try {
    if (state.isLocalMode) {
      upsertBudgetRow({ ...current, actual: nextActual });
    } else {
      const updated = await updateBudget(itemId, { actual_amount: nextActual });
      upsertBudgetRow(normalizeBudgetItem(updated));
    }
    renderAll();
  } catch (error) {
    setLocalMode('Mode local active (API budget indisponible)');
    upsertBudgetRow({ ...current, actual: nextActual });
    renderAll();
    console.error('Mise a jour depense en local suite a erreur API:', error);
  }
}

// Construit le rendu pour 'renderTable'.
function renderTable(items) {
  if (!refs.tableBody) return;

  refs.tableBody.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'budget-empty';
    cell.colSpan = 6;
    cell.textContent = 'Aucune depense pour le filtre selectionne.';
    row.appendChild(cell);
    refs.tableBody.appendChild(row);
  } else {
    items.forEach((item) => {
      const row = document.createElement('tr');

      row.appendChild(createCell(item.label));
      row.appendChild(createCell(getCategoryLabel(item.category)));
      row.appendChild(createCell(formatCurrency(item.planned)));

      const actualCell = document.createElement('td');
      if (state.canEdit && (item.source === 'budget' || item.source === 'transport')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'budget-actual-wrapper';

        const actualInput = document.createElement('input');
        actualInput.type = 'number';
        actualInput.min = '0';
        actualInput.step = '0.01';
        actualInput.className = 'field-input budget-actual-inline';
        actualInput.placeholder = '0.00';
        actualInput.value = item.actual > 0 ? String(item.actual) : '';
        actualInput.setAttribute('data-action', 'actual-inline');
        actualInput.setAttribute('data-id', String(item.id));
        wrapper.appendChild(actualInput);
        actualCell.appendChild(wrapper);
      } else {
        actualCell.textContent = formatCurrency(item.actual);
      }
      row.appendChild(actualCell);

      row.appendChild(createCell(formatDate(item.date)));

      const actionCell = document.createElement('td');

      if (state.canEdit && (item.source === 'budget' || item.source === 'transport' || item.source === 'accommodation')) {
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
        const deleteAction = item.source === 'budget'
          ? 'delete'
          : item.source === 'transport'
            ? 'delete-transport'
            : 'delete-accommodation';
        deleteBtn.setAttribute('data-action', deleteAction);
        deleteBtn.setAttribute('data-id', String(item.source === 'budget' ? item.id : item.sourceId));
        deleteBtn.title = 'Supprimer';
        deleteBtn.innerHTML = "<i class='bx bx-trash'></i>";

        group.appendChild(editBtn);
        group.appendChild(deleteBtn);
        actionCell.appendChild(group);
      } else {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn-icon btn-icon-danger';
        const actionType = item.source === 'transport' ? 'delete-transport' : 'delete-accommodation';
        deleteBtn.setAttribute('data-action', actionType);
        deleteBtn.setAttribute('data-id', String(item.sourceId));
        deleteBtn.title = 'Supprimer';
        deleteBtn.innerHTML = "<i class='bx bx-trash'></i>";
        actionCell.appendChild(deleteBtn);
      }

      row.appendChild(actionCell);
      refs.tableBody.appendChild(row);
    });
  }

  if (refs.rowCount) {
    refs.rowCount.textContent = `${items.length} ligne${items.length > 1 ? 's' : ''}`;
  }
}

// Construit le rendu pour 'renderSummary'.
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

// Gere la logique principale de 'drawPieChart'.
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

// Applique les mises a jour de 'updateHeroMeta'.
function updateHeroMeta() {
  if (!refs.tripName || !refs.tripDates) return;

  const selectedTripId = getSelectedTripId();
  if (!selectedTripId) {
    refs.tripName.textContent = '-';
    refs.tripDates.textContent = '-';
    return;
  }

  const trip = getTripById(selectedTripId);
  if (!trip) {
    refs.tripName.textContent = '-';
    refs.tripDates.textContent = '-';
    return;
  }

  refs.tripName.textContent = trip.destination || '-';
  refs.tripDates.textContent = formatTripDateRange(trip.start_date, trip.end_date);
}

// Construit le rendu pour 'renderAll'.
function renderAll() {
  const filtered = getFilteredEntries();
  renderTable(filtered);
  renderSummary(filtered);
  drawPieChart(filtered);
  updateHeroMeta();
  updateBudgetDateBounds();
  applyBudgetFormMode(getBudgetFormMode());
}

// Gere la logique principale de 'resetForm'.
function resetForm() {
  state.editingId = null;
  state.forcedFormMode = null;
  if (refs.inputCategory) refs.inputCategory.value = 'activites';
  clearFormValues();
  applyBudgetFormMode('budget');
}

// Charge les donnees necessaires pour 'loadFormForEdit'.
function loadFormForEdit(item) {
  state.editingId = item.source === 'budget' ? item.id : item.sourceId;
  clearFormValues();
  setFormNote('');
  if (item.source === 'transport') {
    state.forcedFormMode = 'transport';
    if (refs.transportFrom) refs.transportFrom.value = item.raw?.origin || '';
    if (refs.transportTo) refs.transportTo.value = item.raw?.destination || '';
    if (refs.transportDate) refs.transportDate.value = item.date || '';
    if (refs.transportTime) refs.transportTime.value = item.raw?.travel_time || '';
    if (refs.transportDuration) refs.transportDuration.value = item.raw?.duration_minutes > 0 ? String(item.raw.duration_minutes) : '';
    if (refs.transportPrice) refs.transportPrice.value = item.planned > 0 ? String(item.planned) : '';
    if (refs.transportModeSelect) refs.transportModeSelect.value = item.raw?.mode || '';
  } else if (item.source === 'accommodation') {
    state.forcedFormMode = 'logement';
    if (refs.accommodationName) refs.accommodationName.value = item.raw?.name || '';
    if (refs.accommodationAddress) refs.accommodationAddress.value = item.raw?.address || '';
    if (refs.accommodationPrice) refs.accommodationPrice.value = item.raw?.price_per_night > 0 ? String(item.raw.price_per_night) : '';
    if (refs.accommodationStart) refs.accommodationStart.value = item.raw?.start_date || item.date || '';
    if (refs.accommodationEnd) refs.accommodationEnd.value = item.raw?.end_date || '';
    updateAccommodationNights();
  } else {
    state.forcedFormMode = 'budget';
    if (refs.inputCategory) refs.inputCategory.value = item.category;
    if (refs.inputLabel) refs.inputLabel.value = item.label;
    if (refs.inputPlanned) refs.inputPlanned.value = item.planned > 0 ? String(item.planned) : '';
    if (refs.inputDate) refs.inputDate.value = item.date || '';
  }
  applyBudgetFormMode(state.forcedFormMode);
}

// Gere la logique principale de 'validateForm'.
function validateForm() {
  const mode = getBudgetFormMode();

  if (mode === 'transport') {
    const tripId = String(getSelectedTripId() || '').trim();
    const origin = String(refs.transportFrom?.value || '').trim();
    const destination = String(refs.transportTo?.value || '').trim();
    const travelDate = String(refs.transportDate?.value || '').trim();
    const travelTime = String(refs.transportTime?.value || '').trim();
    const transportMode = String(refs.transportModeSelect?.value || '').trim();
    const priceRaw = refs.transportPrice?.value;
    const durationRaw = refs.transportDuration?.value;
    const price = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const durationMinutes = durationRaw ? Number(durationRaw) : null;

    if (!tripId) throw new Error('Selectionnez un voyage avant d\'ajouter un transport.');
    if (!origin || !destination || !travelDate || !travelTime || !transportMode) {
      throw new Error('Merci de remplir les champs obligatoires du transport.');
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new Error('Temps de trajet invalide.');
    }
    if (price !== null && !Number.isFinite(price)) {
      throw new Error('Prix invalide.');
    }

    return {
      mode,
      tripId,
      payload: {
        origin,
        destination,
        travel_date: travelDate,
        travel_time: travelTime,
        mode: transportMode,
        price,
        duration_minutes: durationMinutes
      }
    };
  }

  if (mode === 'logement') {
    const tripId = String(getSelectedTripId() || '').trim();
    const name = String(refs.accommodationName?.value || '').trim();
    const address = String(refs.accommodationAddress?.value || '').trim();
    const startDate = String(refs.accommodationStart?.value || '').trim();
    const endDate = String(refs.accommodationEnd?.value || '').trim();
    const priceRaw = refs.accommodationPrice?.value;
    const priceValue = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const nights = computeNights(startDate, endDate);

    if (!tripId) throw new Error('Selectionnez un voyage avant d\'ajouter un logement.');
    if (!name || !address || !startDate || !endDate) {
      throw new Error('Merci de remplir les champs obligatoires du logement.');
    }
    if (nights <= 0) {
      throw new Error('Les dates doivent couvrir au moins 1 nuit.');
    }
    if (priceValue === null || !Number.isFinite(priceValue) || priceValue <= 0) {
      throw new Error('Prix par nuit invalide (superieur a 0).');
    }

    return {
      mode,
      tripId,
      payload: {
        trip_id: tripId,
        name,
        address,
        price_per_night: priceValue,
        start_date: startDate,
        end_date: endDate,
        nights
      }
    };
  }

  const label = String(refs.inputLabel?.value || '').trim();
  const category = normalizeCategory(refs.inputCategory?.value);
  const planned = toSafeNumber(refs.inputPlanned?.value);
  const actual = state.editingId ? toSafeNumber(refs.inputActual?.value) : 0;
  const date = String(refs.inputDate?.value || '').trim();
  const tripId = String(getSelectedTripId() || '').trim();
  const trip = getTripById(tripId);
  const minDate = trip?.start_date ? String(trip.start_date).split('T')[0] : '';
  const maxDate = trip?.end_date ? String(trip.end_date).split('T')[0] : '';

  if (!label) {
    throw new Error('Merci de renseigner un nom de depense.');
  }

  if (planned <= 0) {
    throw new Error('Renseignez un montant prevu superieur a 0.');
  }

  if (trip && (!date || (minDate && date < minDate) || (maxDate && date > maxDate))) {
    throw new Error('La date doit etre comprise dans les dates du voyage.');
  }

  return {
    mode,
    tripId,
    payload: {
      label,
      category,
      planned,
      actual,
      date,
      tripId
    }
  };
}

// Gere la logique principale de 'upsertBudgetRow'.
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

// Gere la logique principale de 'removeBudgetRow'.
function removeBudgetRow(itemId) {
  state.budgetRows = state.budgetRows.filter((item) => String(item.id) !== String(itemId));
  saveLocalBudgets();
  rebuildEntries();
}

// Gere la logique principale de 'handleSave'.
async function handleSave() {
  if (!state.canEdit) return;

  let formData;
  try {
    formData = validateForm();
  } catch (error) {
    setFormNote(error.message || 'Formulaire invalide.', true);
    return;
  }

  refs.addButton.disabled = true;
  refs.addButton.textContent = state.editingId
    ? 'Mise a jour...'
    : formData.mode === 'transport'
      ? 'Ajout du transport...'
      : formData.mode === 'logement'
        ? 'Ajout du logement...'
        : 'Ajout...';
  setFormNote('Enregistrement...');

  try {
    if (formData.mode === 'transport') {
      if (state.editingId) {
        await updateTransport(state.editingId, { ...formData.payload, trip_id: formData.tripId });
        setFormNote('Transport mis a jour.');
      } else {
        await createTransport(formData.tripId, formData.payload);
        setFormNote('Transport ajoute.');
      }
      await loadRelatedEntries();
    } else if (formData.mode === 'logement') {
      if (state.editingId) {
        await updateAccommodation(state.editingId, formData.payload);
        setFormNote('Logement mis a jour.');
      } else {
        await createAccommodation(formData.payload);
        setFormNote('Logement ajoute.');
      }
      await loadRelatedEntries();
    } else if (state.isLocalMode) {
      const localItem = {
        id: state.editingId || `local-${Date.now()}`,
        source: 'budget',
        sourceId: state.editingId || `local-${Date.now()}`,
        ...formData.payload,
        raw: {}
      };
      upsertBudgetRow(localItem);
      setFormNote(state.editingId ? 'Depense mise a jour.' : 'Depense ajoutee.');
    } else if (state.editingId) {
      const updated = await updateBudget(state.editingId, mapToPayload(formData.payload));
      const normalized = normalizeBudgetItem(updated);
      upsertBudgetRow(normalized);
      setFormNote('Depense mise a jour.');
    } else {
      const created = await createBudget(mapToPayload(formData.payload));
      upsertBudgetRow(normalizeBudgetItem(created));
      setFormNote('Depense ajoutee.');
    }

    resetForm();
    renderAll();
  } catch (error) {
    if (formData.mode === 'budget') {
      setLocalMode('Mode local active (API budget indisponible)');
      const id = state.editingId || `local-${Date.now()}`;
      const localItem = {
        id,
        source: 'budget',
        sourceId: id,
        ...formData.payload,
        raw: {}
      };
      upsertBudgetRow(localItem);
      resetForm();
      renderAll();
      console.error('Erreur budget API, fallback local:', error);
    } else {
      setFormNote(error?.message || 'Erreur lors de l\'enregistrement.', true);
      console.error('Erreur enregistrement form budget:', error);
    }
  } finally {
    refs.addButton.disabled = false;
    refs.addButton.textContent = getBudgetFormMode() === 'transport'
      ? 'Ajouter le transport'
      : getBudgetFormMode() === 'logement'
        ? 'Ajouter le logement'
        : state.editingId
          ? 'Mettre a jour'
          : 'Ajouter';
  }
}

// Gere la logique principale de 'handleDelete'.
async function handleDelete(itemId) {
  if (!state.canEdit) return;

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

// Charge les donnees necessaires pour 'loadTrips'.
async function loadTrips() {
  try {
    const result = await api.get('/api/trips');
    state.trips = Array.isArray(result?.data) ? result.data : [];
  } catch {
    state.trips = [];
  }
}

// Charge les donnees necessaires pour 'loadBudgets'.
async function loadBudgets() {
  const selectedTripId = getSelectedTripId();

  try {
    const rows = await listBudgets(selectedTripId);
    state.budgetRows = Array.isArray(rows) ? rows.map((row, index) => normalizeBudgetItem(row, index)) : [];
  } catch (error) {
    setLocalMode('Mode local active (API budget indisponible)');
    state.budgetRows = readLocalBudgets();
    console.error('Chargement budgets via API impossible:', error);
  }

  if (state.isLocalMode && !state.budgetRows.length) {
    state.budgetRows = readLocalBudgets();
  }

  if (selectedTripId) {
    state.budgetRows = state.budgetRows.filter((row) => String(row.tripId || '') === String(selectedTripId));
  }
}

// Charge les donnees necessaires pour 'loadRelatedEntries'.
async function loadRelatedEntries() {
  const tripId = getSelectedTripId();
  if (!tripId) {
    state.accommodations = [];
    state.transports = [];
    rebuildEntries();
    return;
  }

  try {
    const accommodations = await listAccommodationsByTrip(tripId);
    state.accommodations = Array.isArray(accommodations) ? accommodations : [];
  } catch {
    state.accommodations = [];
  }

  try {
    const transports = await listTransports(tripId);
    state.transports = Array.isArray(transports) ? transports : [];
  } catch {
    state.transports = [];
  }

  rebuildEntries();
}

// Met a jour l'etat pilote par 'setTransportDateBounds'.
function setTransportDateBounds(tripId) {
  void tripId;
  updateTransportDateBounds();
}

// Met a jour l'etat pilote par 'setAccommodationDateBounds'.
function setAccommodationDateBounds(tripId) {
  void tripId;
  updateAccommodationDateBounds();
}

// Initialise le bloc fonctionnel 'initTransportModal'.
function initTransportModal() {
  if (!refs.transportPrice || !refs.transportDuration || !refs.transportTime) return;

  refs.transportPrice.addEventListener('input', () => {
    refs.transportPrice.value = refs.transportPrice.value
      .replace(/[^\d.,]/g, '')
      .replace(/,(?=.*[,])/g, '')
      .replace(/\.(?=.*\.)/g, '')
      .replace(',', '.');
  });

  refs.transportDuration.addEventListener('input', () => {
    refs.transportDuration.value = refs.transportDuration.value.replace(/[^\d]/g, '');
  });

  refs.transportTime.addEventListener('input', () => {
    refs.transportTime.value = refs.transportTime.value.trim();
  });
}

// Initialise le bloc fonctionnel 'initAccommodationModal'.
function initAccommodationModal() {
  if (!refs.accommodationName || !refs.accommodationStart || !refs.accommodationEnd || !refs.accommodationPrice || !refs.accommodationNights) return;

  refs.accommodationStart.addEventListener('change', updateAccommodationNights);
  refs.accommodationEnd.addEventListener('change', updateAccommodationNights);

  refs.accommodationPrice.addEventListener('input', () => {
    refs.accommodationPrice.value = refs.accommodationPrice.value
      .replace(/[^\d.,]/g, '')
      .replace(/,(?=.*[,])/g, '')
      .replace(/\.(?=.*\.)/g, '')
      .replace(',', '.');
    updateAccommodationNights();
  });
}

// Gere la logique principale de 'bindEvents'.
function bindEvents() {
  refs.addButton?.addEventListener('click', handleSave);
  refs.inputCategory?.addEventListener('change', () => {
    if (!state.canEdit) return;

    state.editingId = null;
    state.forcedFormMode = null;
    clearFormValues();
    setFormNote('');
    applyBudgetFormMode(getBudgetFormMode());
  });
  refs.filterCategory?.addEventListener('change', renderAll);

  refs.tableBody?.addEventListener('click', async (event) => {
    if (!state.canEdit) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('button[data-action][data-id]');
    if (!button) return;

    const action = button.getAttribute('data-action');
    const id = button.getAttribute('data-id');

    if (action === 'delete-transport') {
      if (window.confirm('Supprimer ce transport ?')) {
        try {
          await deleteTransport(id);
          await loadRelatedEntries();
          renderAll();
        } catch (error) {
          window.alert('Erreur lors de la suppression du transport.');
          console.error('Erreur suppression transport:', error);
        }
      }
      return;
    }

    if (action === 'delete-accommodation') {
      if (window.confirm('Supprimer ce logement ?')) {
        try {
          await deleteAccommodation(id);
          await loadRelatedEntries();
          renderAll();
        } catch (error) {
          window.alert('Erreur lors de la suppression du logement.');
          console.error('Erreur suppression logement:', error);
        }
      }
      return;
    }

    const item = state.entries.find((entry) => String(entry.id) === String(id) || String(entry.sourceId) === String(id));

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

  refs.tableBody?.addEventListener('keydown', async (event) => {
    if (!state.canEdit) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-action') !== 'actual-inline') return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await updateActualInline(target.getAttribute('data-id'), target.value);
  });

  refs.tableBody?.addEventListener('change', async (event) => {
    if (!state.canEdit) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-action') !== 'actual-inline') return;
    await updateActualInline(target.getAttribute('data-id'), target.value);
  });
}

// Initialise le bloc fonctionnel 'initBudgetPage'.
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
  state.accessMode = String(params.get('tripAccess') || '').trim() || 'owner';
  state.canEdit = state.accessMode !== 'read' && !isTripPastEndDate(params.get('endDate') || '');

  if (state.initialTripId) {
    try {
      const result = await api.get(`/api/trips/${encodeURIComponent(state.initialTripId)}`);
      const trip = result?.data;
      if (trip) {
        state.accessMode = trip.access_mode || state.accessMode || 'owner';
        state.canEdit = trip.can_edit !== false && !isTripPastEndDate(trip.end_date);
      }
    } catch (error) {
      console.warn('Impossible de charger les droits du voyage budget.', error);
    }
  }

  applyReadOnlyUiState();

  resetForm();
  await loadTrips();
  await loadBudgets();
  await loadRelatedEntries();
  bindEvents();
  initTransportModal();
  initAccommodationModal();
  renderAll();
}

initBudgetPage();
