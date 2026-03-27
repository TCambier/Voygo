import { api } from '../assets/js/api.js';
import {
  listAccommodationsByTrip
} from './accommodationController.js';

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  accessMode: 'owner',
  canEdit: true,
  activities: [],
  transports: []
};

let editMode = false;
let openActivityModal = null;
let openTransportModal = null;
let openAccommodationModal = null;
let accommodations = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

function formatDayLabel(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDate(dateValue);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
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

function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  return { year, month, day };
}

function formatDateKeyFromUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

function toMinuteOfDay(timeValue) {
  const match = String(timeValue || '').trim().match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function toTimeDisplayValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : '';
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

function stripScheduleMetadata(description) {
  const text = String(description || '');
  return text.replace(/\s*\[VOYGO_SCHEDULE\][\s\S]*?\[\/VOYGO_SCHEDULE\]\s*/g, '').trim();
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

function getActivitySchedule(item) {
  const metadata = readScheduleMetadata(item?.description);
  const date = normalizeActivityDate(metadata?.date || item?.activity_date || '');
  const startTime = String(metadata?.time || '').trim();
  const durationRaw = Number(metadata?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 60;

  if (!date) return null;

  return {
    date,
    startTime: toTimeDisplayValue(startTime),
    durationMinutes
  };
}

function getTransportSchedule(item) {
  const date = normalizeActivityDate(item?.travel_date || '');
  const startTime = String(item?.travel_time || '').trim();
  const durationRaw = Number(item?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 0;

  if (!date) return null;

  return {
    date,
    startTime: toTimeDisplayValue(startTime),
    durationMinutes
  };
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

function createDateRange(startDate, endDate) {
  const startParts = parseDateKey(startDate);
  const endParts = parseDateKey(endDate);
  if (!startParts || !endParts) {
    return [];
  }

  const start = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const end = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));
  if (end < start) return [];

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(formatDateKeyFromUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function updateMeta() {
  const tripNameNode = document.getElementById('agenda-trip-name');
  const datesNode = document.getElementById('agenda-dates');
  if (tripNameNode) {
    const title = tripState.name || tripState.destination || '-';
    tripNameNode.textContent = title;
  }
  if (datesNode) {
    const from = formatDate(tripState.startDate);
    const to = formatDate(tripState.endDate);
    datesNode.textContent = from && to ? `${from} - ${to}` : '-';
  }
}

function updateNavigationLinks() {
  const nav = document.querySelector('.planning-nav');
  if (!nav) return;

  const params = new URLSearchParams();
  if (tripState.id) params.set('tripId', String(tripState.id));
  if (tripState.destination) params.set('destination', tripState.destination);
  if (tripState.startDate) params.set('startDate', tripState.startDate);
  if (tripState.endDate) params.set('endDate', tripState.endDate);
  if (tripState.accessMode) params.set('tripAccess', tripState.accessMode);

  const query = params.toString();
  nav.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const basePath = href.split('?')[0];
    if (!/\.html$/i.test(basePath)) return;
    link.setAttribute('href', query ? `${basePath}?${query}` : basePath);
  });
}

function isReadOnlyTrip() {
  return !tripState.canEdit;
}

function applyReadOnlyUiState() {
  document.body.classList.toggle('is-read-only-trip', isReadOnlyTrip());
}

function computeEndTime(schedule) {
  const startMin = toMinuteOfDay(schedule.startTime);
  if (startMin === null) return '09:00';
  const endMin = startMin + (schedule.durationMinutes || 60);
  const h = Math.floor(endMin / 60) % 24;
  const m = endMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function renderSeparator(day, prefillTime) {
  return `
    <div class="agenda-separator" data-day="${escapeHtml(day)}" data-prefill-time="${escapeHtml(prefillTime || '09:00')}">
      <div class="agenda-separator-shell">
        <button type="button" class="agenda-separator-trigger" aria-label="Ajouter un element">
          <i class='bx bx-plus'></i>
        </button>
        <div class="agenda-separator-picker" hidden>
          <button type="button" class="agenda-pick-btn" data-pick-type="transport">
            <i class='bx bx-car'></i> Transport
          </button>
          <button type="button" class="agenda-pick-btn" data-pick-type="activity">
            <i class='bx bx-map-pin'></i> Activite
          </button>
          <button type="button" class="agenda-pick-btn" data-pick-type="accommodation">
            <i class='bx bx-building-house'></i> Logement
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAgenda() {
  const daysNode = document.getElementById('agenda-days');
  const emptyNode = document.getElementById('agenda-empty');
  const board = document.querySelector('.agenda-board');
  if (!daysNode || !emptyNode) return;

  if (board) board.classList.toggle('is-edit-mode', editMode);

  const grouped = new Map();
  (tripState.activities || []).forEach((activity) => {
    const schedule = getActivitySchedule(activity);
    if (!schedule?.date) return;

    const list = grouped.get(schedule.date) || [];
    list.push({ type: 'activity', item: activity, schedule });
    grouped.set(schedule.date, list);
  });

  (tripState.transports || []).forEach((transport) => {
    const schedule = getTransportSchedule(transport);
    if (!schedule?.date) return;

    const list = grouped.get(schedule.date) || [];
    list.push({ type: 'transport', item: transport, schedule });
    grouped.set(schedule.date, list);
  });

  (accommodations || []).forEach((accommodation) => {
    const startDate = normalizeActivityDate(accommodation?.start_date || '');
    const endDate = normalizeActivityDate(accommodation?.end_date || '');
    if (!startDate || !endDate) return;

    const days = createDateRange(startDate, endDate);
    days.forEach((day, index) => {
      const list = grouped.get(day) || [];
      const isFirstDay = index === 0;
      const isLastDay = index === days.length - 1;
      
      if (isFirstDay) {
        list.push({
          type: 'accommodation',
          item: accommodation,
          accommodationType: 'check-in',
          schedule: { date: day, startTime: '06:00', durationMinutes: 1440 }
        });
      }
      
      if (isLastDay && !isFirstDay) {
        list.push({
          type: 'accommodation',
          item: accommodation,
          accommodationType: 'check-out',
          schedule: { date: day, startTime: '21:00', durationMinutes: 180 }
        });
      } else if (isFirstDay && isLastDay) {
        list.push({
          type: 'accommodation',
          item: accommodation,
          accommodationType: 'check-out',
          schedule: { date: day, startTime: '21:00', durationMinutes: 180 }
        });
      }
      
      grouped.set(day, list);
    });
  });

  grouped.forEach((list, key) => {
    list.sort((a, b) => {
      const left = toMinuteOfDay(a.schedule.startTime);
      const right = toMinuteOfDay(b.schedule.startTime);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
    grouped.set(key, list);
  });

  let dayKeys = createDateRange(tripState.startDate, tripState.endDate);
  if (!dayKeys.length) {
    dayKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  }

  const hasPlannedEntries = Array.from(grouped.values()).some((list) => list.length > 0);
  emptyNode.hidden = hasPlannedEntries || editMode;

  daysNode.innerHTML = dayKeys.map((day) => {
    const entries = grouped.get(day) || [];

    let itemsHtml;
    if (entries.length === 0) {
      itemsHtml = editMode
        ? renderSeparator(day, '09:00')
        : '<p class="muted agenda-day-empty">Aucune activite prevue ce jour.</p>';
    } else {
      const parts = [];
      if (editMode) parts.push(renderSeparator(day, '09:00'));

      entries.forEach((entry) => {
        const { type, item, schedule, accommodationType } = entry;
        const timeLabel = schedule.startTime || '--:--';
        const duration = formatDuration(schedule.durationMinutes);
        const itemId = escapeHtml(String(item?.id || ''));
        const editActions = editMode ? `
          <div class="agenda-edit-actions">
            <button type="button" class="btn-icon" data-agenda-edit title="Modifier"><i class='bx bx-edit'></i></button>
            <button type="button" class="btn-icon danger" data-agenda-delete title="Supprimer"><i class='bx bx-trash'></i></button>
          </div>` : '';

        if (type === 'transport') {
          const safeMode = escapeHtml(item?.mode || 'Transport');
          const safeRoute = escapeHtml(`${item?.origin || '-'} -> ${item?.destination || '-'}`);
          parts.push(`
            <article class="agenda-item is-transport" data-item-type="transport" data-item-id="${itemId}">
              <div class="agenda-time">${escapeHtml(timeLabel)}</div>
              <div class="agenda-item-content">
                <span class="agenda-badge">Transport</span>
                <h3>${safeMode}</h3>
                <p class="agenda-item-meta agenda-route">${safeRoute}</p>
                <p class="agenda-item-meta">Temps de trajet: ${escapeHtml(duration)}</p>
              </div>
              ${editActions}
            </article>
          `);
        } else if (type === 'accommodation') {
          const safeName = escapeHtml(item?.name || item?.address || 'Logement');
          const safeAddress = escapeHtml(item?.address || 'Adresse indisponible');
          const safeLabel = accommodationType === 'check-in' ? 'Arrivée' : 'Départ';
          const badgeClass = accommodationType === 'check-in' ? 'is-checkin' : 'is-checkout';
          const deleteOnly = `
            <div class="agenda-edit-actions">
              <button type="button" class="btn-icon danger" data-agenda-delete title="Supprimer"><i class='bx bx-trash'></i></button>
            </div>`;
          parts.push(`
            <article class="agenda-item is-accommodation ${badgeClass}" data-item-type="accommodation" data-item-id="${itemId}">
              <div class="agenda-time">${escapeHtml(timeLabel)}</div>
              <div class="agenda-item-content">
                <span class="agenda-badge">${safeLabel}</span>
                <h3>${safeName}</h3>
                <p class="agenda-item-meta">${safeAddress}</p>
              </div>
              ${editMode ? deleteOnly : ''}
            </article>
          `);
        } else {
          const safeName = escapeHtml(item?.name || 'Activite');
          const safeAddress = escapeHtml(item?.address || 'Adresse indisponible');
          const safeDescription = escapeHtml(stripScheduleMetadata(item?.description || ''));
          parts.push(`
            <article class="agenda-item" data-item-type="activity" data-item-id="${itemId}">
              <div class="agenda-time">${escapeHtml(timeLabel)}</div>
              <div class="agenda-item-content">
                <span class="agenda-badge">Activite</span>
                <h3>${safeName}</h3>
                <p class="agenda-item-meta">${safeAddress}</p>
                <p class="agenda-item-meta">Duree prevue: ${escapeHtml(duration)}</p>
                ${safeDescription ? `<p class="agenda-item-desc">${safeDescription}</p>` : ''}
              </div>
              ${editActions}
            </article>
          `);
        }

        if (editMode) {
          parts.push(renderSeparator(day, computeEndTime(schedule)));
        }
      });

      itemsHtml = parts.join('');
    }

    return `
      <article class="agenda-day-card">
        <header class="agenda-day-head">
          <h3>${escapeHtml(formatDayLabel(day))}</h3>
        </header>
        <div class="agenda-day-list">
          ${itemsHtml}
        </div>
      </article>
    `;
  }).join('');
}

function initEditMode() {
  const toggleBtn = document.getElementById('agenda-edit-toggle');
  if (!toggleBtn) return;

  if (isReadOnlyTrip()) {
    toggleBtn.hidden = true;
    editMode = false;
    return;
  }

  toggleBtn.hidden = false;

  toggleBtn.addEventListener('click', () => {
    editMode = !editMode;
    toggleBtn.innerHTML = editMode
      ? `<i class='bx bx-x'></i> Quitter la modification`
      : `<i class='bx bx-edit-alt'></i> Modifier`;
    toggleBtn.classList.toggle('is-active', editMode);
    renderAgenda();
  });
}

function initAgendaInteractions() {
  const daysNode = document.getElementById('agenda-days');
  if (!daysNode) return;

  const closeAllSeparators = () => {
    daysNode.querySelectorAll('.agenda-separator').forEach((separator) => {
      separator.classList.remove('is-open');
      const picker = separator.querySelector('.agenda-separator-picker');
      if (picker) picker.hidden = true;
    });
  };

  daysNode.addEventListener('click', (event) => {
    if (isReadOnlyTrip()) return;
    if (!editMode) return;

    const trigger = event.target.closest('.agenda-separator-trigger');
    if (trigger) {
      const sep = trigger.closest('.agenda-separator');
      const picker = sep?.querySelector('.agenda-separator-picker');
      const shouldOpen = !!picker?.hidden;
      closeAllSeparators();
      if (sep && picker && shouldOpen) {
        sep.classList.add('is-open');
        picker.hidden = false;
      }
      return;
    }

    const pickBtn = event.target.closest('.agenda-pick-btn');
    if (pickBtn) {
      const sep = pickBtn.closest('.agenda-separator');
      const day = sep?.dataset.day || '';
      const prefillTime = sep?.dataset.prefillTime || '09:00';
      const type = pickBtn.dataset.pickType || '';
      if (sep) sep.classList.remove('is-open');
      const picker = sep?.querySelector('.agenda-separator-picker');
      if (picker) picker.hidden = true;
      openInsertForm(type, day, prefillTime);
      return;
    }

    if (!event.target.closest('.agenda-separator')) {
      closeAllSeparators();
    }

    const deleteBtn = event.target.closest('[data-agenda-delete]');
    if (deleteBtn) {
      const articleEl = deleteBtn.closest('.agenda-item');
      const type = articleEl?.dataset.itemType;
      const id = articleEl?.dataset.itemId;
      if (type && id) handleDeleteItem(type, id);
      return;
    }

    const editBtn = event.target.closest('[data-agenda-edit]');
    if (editBtn) {
      const articleEl = editBtn.closest('.agenda-item');
      const type = articleEl?.dataset.itemType;
      const id = articleEl?.dataset.itemId;
      if (type && id) openEditForm(type, id);
    }
  });
}

function openInsertForm(type, day, prefillTime) {
  if (type === 'activity' && openActivityModal) {
    openActivityModal({ date: day, time: prefillTime });
  } else if (type === 'transport' && openTransportModal) {
    openTransportModal({ date: day, time: prefillTime });
  } else if (type === 'accommodation' && openAccommodationModal) {
    openAccommodationModal({ date: day });
  }
}

function openEditForm(type, id) {
  if (type === 'activity') {
    const item = (tripState.activities || []).find((a) => String(a.id) === String(id));
    if (!item || !openActivityModal) return;
    const schedule = getActivitySchedule(item);
    openActivityModal({
      id: item.id,
      date: schedule?.date || '',
      time: schedule?.startTime || '',
      duration: schedule?.durationMinutes || 60,
      name: item.name || '',
      address: item.address || '',
      description: stripScheduleMetadata(item.description || '')
    });
  } else if (type === 'transport') {
    const item = (tripState.transports || []).find((t) => String(t.id) === String(id));
    if (!item || !openTransportModal) return;
    openTransportModal({
      id: item.id,
      date: item.travel_date || '',
      time: toTimeDisplayValue(item.travel_time || ''),
      origin: item.origin || '',
      destination: item.destination || '',
      duration: item.duration_minutes || '',
      mode: item.mode || '',
      price: item.price ?? ''
    });
  }
}

async function handleDeleteItem(type, id) {
  const label = type === 'transport' ? 'ce transport' : type === 'accommodation' ? 'ce logement' : 'cette activite';
  if (!window.confirm(`Supprimer ${label} de l'agenda ?`)) return;
  const note = document.getElementById('agenda-note');
  try {
    if (type === 'transport') {
      await api.delete(`/api/transports/${encodeURIComponent(id)}`);
    } else if (type === 'accommodation') {
      await api.delete(`/api/accommodations/${encodeURIComponent(id)}`);
    } else {
      await api.delete(`/api/activities/${encodeURIComponent(id)}`);
    }
    await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
    renderAgenda();
  } catch (error) {
    if (note) {
      note.classList.add('is-error');
      note.textContent = error?.message || 'Suppression impossible.';
    }
  }
}

function findActivityConflict(schedule, excludedActivityId = null) {
  const start = toMinuteOfDay(schedule.startTime);
  if (start === null) return null;
  const end = start + schedule.durationMinutes;

  for (const existing of (tripState.activities || [])) {
    if (excludedActivityId && String(existing.id) === String(excludedActivityId)) continue;

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

function findTransportConflict(schedule, excludedTransportId = null) {
  const start = toMinuteOfDay(schedule.startTime);
  if (start === null) return null;
  const end = start + schedule.durationMinutes;

  for (const existing of (tripState.transports || [])) {
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

function initActivityModal() {
  const modal = document.getElementById('agenda-activity-modal');
  const form = document.getElementById('agenda-activity-form');
  const note = document.getElementById('agenda-activity-note');
  const titleEl = document.getElementById('agenda-activity-modal-title');
  const submitBtn = document.getElementById('agenda-activity-submit');
  if (!modal || !form || !note) return null;

  let currentSubmit = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (currentSubmit) {
      form.removeEventListener('submit', currentSubmit);
      currentSubmit = null;
    }
    form.reset();
  };

  modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  return (prefill = {}) => {
    form.reset();
    note.textContent = '';
    note.className = 'settings-feedback';
    const isEdit = !!prefill.id;
    if (titleEl) titleEl.textContent = isEdit ? "Modifier l'activite" : 'Ajouter une activite';
    if (submitBtn) submitBtn.textContent = isEdit ? 'Enregistrer' : 'Ajouter';

    const g = (id) => document.getElementById(id);
    g('agenda-activity-id').value = prefill.id || '';
    g('agenda-activity-date').value = prefill.date || '';
    g('agenda-activity-name').value = prefill.name || '';
    g('agenda-activity-address').value = prefill.address || '';
    g('agenda-activity-time').value = prefill.time || '09:00';
    g('agenda-activity-duration').value = prefill.duration ?? 60;
    g('agenda-activity-desc').value = prefill.description || '';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    g('agenda-activity-name').focus();

    if (currentSubmit) form.removeEventListener('submit', currentSubmit);
    currentSubmit = async (e) => {
      e.preventDefault();
      note.textContent = '';
      note.className = 'settings-feedback';

      const id = g('agenda-activity-id').value;
      const date = g('agenda-activity-date').value;
      const name = g('agenda-activity-name').value.trim();
      const address = g('agenda-activity-address').value.trim();
      const time = g('agenda-activity-time').value;
      const duration = Math.round(Number(g('agenda-activity-duration').value) || 60);
      const desc = g('agenda-activity-desc').value.trim();

      if (!name || !time) {
        note.classList.add('is-error');
        note.textContent = "Merci de renseigner le nom et l'heure.";
        return;
      }

      if (!date || toMinuteOfDay(time) === null) {
        note.classList.add('is-error');
        note.textContent = "Date ou heure invalide.";
        return;
      }

      const schedule = { date, startTime: time, durationMinutes: duration };
      const conflictingActivity = findActivityConflict(schedule, id || null);
      if (conflictingActivity) {
        note.classList.add('is-error');
        note.textContent = `Conflit detecte: ${conflictingActivity.name || 'une activite'} est deja prevue a ce moment.`;
        return;
      }

      const conflictingTransport = findTransportConflict(schedule);
      if (conflictingTransport) {
        note.classList.add('is-error');
        note.textContent = `Conflit detecte: un transport est deja prevu a ce moment.`;
        return;
      }

      const metadata = JSON.stringify({ date, time, duration_minutes: duration });
      const fullDesc = [desc, `[VOYGO_SCHEDULE]${metadata}[/VOYGO_SCHEDULE]`].filter(Boolean).join('\n\n');
      note.textContent = 'Enregistrement...';

      try {
        if (isEdit) {
          await api.patch(`/api/activities/${encodeURIComponent(id)}`, {
            name, address, description: fullDesc, activity_date: date
          });
        } else {
          if (!tripState.id) return;
          await api.post(`/api/activities/trip/${encodeURIComponent(tripState.id)}`, {
            name, address, description: fullDesc, activity_date: date, is_custom: true
          });
        }
        note.classList.add('is-success');
        note.textContent = isEdit ? 'Activite mise a jour.' : 'Activite ajoutee.';
        await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
        renderAgenda();
        window.setTimeout(close, 800);
      } catch (error) {
        note.classList.add('is-error');
        note.textContent = error?.message || 'Impossible de sauvegarder.';
      }
    };
    form.addEventListener('submit', currentSubmit);
  };
}

function initTransportModal() {
  const modal = document.getElementById('agenda-transport-modal');
  const form = document.getElementById('agenda-transport-form');
  const note = document.getElementById('agenda-transport-note');
  const titleEl = document.getElementById('agenda-transport-modal-title');
  const submitBtn = document.getElementById('agenda-transport-submit');
  if (!modal || !form || !note) return null;

  let currentSubmit = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (currentSubmit) {
      form.removeEventListener('submit', currentSubmit);
      currentSubmit = null;
    }
    form.reset();
  };

  modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  return (prefill = {}) => {
    form.reset();
    note.textContent = '';
    note.className = 'settings-feedback';
    const isEdit = !!prefill.id;
    if (titleEl) titleEl.textContent = isEdit ? 'Modifier le transport' : 'Ajouter un transport';
    if (submitBtn) submitBtn.textContent = isEdit ? 'Enregistrer' : 'Ajouter';

    const g = (id) => document.getElementById(id);
    g('agenda-transport-id').value = prefill.id || '';
    g('agenda-transport-date').value = prefill.date || '';
    g('agenda-transport-time').value = prefill.time || '09:00';
    g('agenda-transport-from').value = prefill.origin || '';
    g('agenda-transport-to').value = prefill.destination || '';
    g('agenda-transport-duration').value = prefill.duration || '';
    g('agenda-transport-mode').value = prefill.mode || '';
    g('agenda-transport-price').value = prefill.price ?? '';

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    g('agenda-transport-from').focus();

    if (currentSubmit) form.removeEventListener('submit', currentSubmit);
    currentSubmit = async (e) => {
      e.preventDefault();
      note.textContent = '';
      note.className = 'settings-feedback';

      const id = g('agenda-transport-id').value;
      const date = g('agenda-transport-date').value;
      const time = g('agenda-transport-time').value;
      const origin = g('agenda-transport-from').value.trim();
      const destination = g('agenda-transport-to').value.trim();
      const duration = Number(g('agenda-transport-duration').value) || 0;
      const mode = g('agenda-transport-mode').value;
      const priceRaw = g('agenda-transport-price').value;
      const price = priceRaw !== '' ? Number(priceRaw) : null;

      if (!origin || !destination || !time || !mode) {
        note.classList.add('is-error');
        note.textContent = "Merci de renseigner l'origine, la destination, l'heure et le mode.";
        return;
      }

      if (!date || toMinuteOfDay(time) === null || duration <= 0) {
        note.classList.add('is-error');
        note.textContent = "Date, heure ou duree invalide.";
        return;
      }

      const schedule = { date, startTime: time, durationMinutes: duration };
      const conflictingTransport = findTransportConflict(schedule, id || null);
      if (conflictingTransport) {
        note.classList.add('is-error');
        note.textContent = `Conflit detecte: le transport ${conflictingTransport.origin || '-'} -> ${conflictingTransport.destination || '-'} est deja prevu a ce moment.`;
        return;
      }

      const conflictingActivity = findActivityConflict(schedule);
      if (conflictingActivity) {
        note.classList.add('is-error');
        note.textContent = `Conflit detecte: ${conflictingActivity.name || 'une activite'} est deja prevue a ce moment.`;
        return;
      }

      note.textContent = 'Enregistrement...';

      try {
        if (isEdit) {
          await api.patch(`/api/transports/${encodeURIComponent(id)}`, {
            origin, destination, travel_date: date, travel_time: time,
            duration_minutes: duration, mode, price
          });
        } else {
          if (!tripState.id) return;
          await api.post(`/api/transports/trip/${encodeURIComponent(tripState.id)}`, {
            origin, destination, travel_date: date, travel_time: time,
            duration_minutes: duration, mode, price
          });
        }
        note.classList.add('is-success');
        note.textContent = isEdit ? 'Transport mis a jour.' : 'Transport ajoute.';
        await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
        renderAgenda();
        window.setTimeout(close, 800);
      } catch (error) {
        note.classList.add('is-error');
        note.textContent = error?.message || 'Impossible de sauvegarder.';
      }
    };
    form.addEventListener('submit', currentSubmit);
  };
}

function initAccommodationModal() {
  const modal = document.getElementById('agenda-accommodation-modal');
  const form = document.getElementById('agenda-accommodation-form');
  const note = document.getElementById('agenda-accommodation-note');
  if (!modal || !form || !note) return null;

  let currentSubmit = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (currentSubmit) {
      form.removeEventListener('submit', currentSubmit);
      currentSubmit = null;
    }
    form.reset();
  };

  modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  return (prefill = {}) => {
    form.reset();
    note.textContent = '';
    note.className = 'settings-feedback';

    const g = (id) => document.getElementById(id);
    g('agenda-accommodation-checkin').value = prefill.date || '';
    if (prefill.date) {
      const d = new Date(`${prefill.date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      g('agenda-accommodation-checkout').value = d.toISOString().slice(0, 10);
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    g('agenda-accommodation-name').focus();

    if (currentSubmit) form.removeEventListener('submit', currentSubmit);
    currentSubmit = async (e) => {
      e.preventDefault();
      note.textContent = '';
      note.className = 'settings-feedback';

      const name = g('agenda-accommodation-name').value.trim();
      const address = g('agenda-accommodation-address').value.trim();
      const checkin = g('agenda-accommodation-checkin').value;
      const checkout = g('agenda-accommodation-checkout').value;
      const priceRaw = g('agenda-accommodation-price').value;
      const price = priceRaw !== '' ? Number(priceRaw) : null;

      if (!address || !checkin || !checkout) {
        note.classList.add('is-error');
        note.textContent = "Merci de renseigner l'adresse et les dates.";
        return;
      }
      if (!tripState.id) {
        note.classList.add('is-error');
        note.textContent = 'Aucun voyage selectionne.';
        return;
      }
      note.textContent = 'Enregistrement...';

      try {
        await api.post('/api/accommodations', {
          name: name || address,
          address,
          start_date: checkin,
          end_date: checkout,
          price_per_night: price,
          trip_id: tripState.id
        });
        note.classList.add('is-success');
        note.textContent = 'Logement ajoute.';
        window.setTimeout(close, 800);
      } catch (error) {
        note.classList.add('is-error');
        note.textContent = error?.message || 'Impossible de sauvegarder.';
      }
    };
    form.addEventListener('submit', currentSubmit);
  };
}

async function loadTrip() {
  const params = new URLSearchParams(window.location.search);
  const tripIdParam = params.get('tripId');
  const requestedAccessMode = params.get('tripAccess') || '';
  let destination = params.get('destination') || '';
  let startDate = toDateInputValue(params.get('startDate') || '');
  let endDate = toDateInputValue(params.get('endDate') || '');

  tripState.accessMode = requestedAccessMode || 'owner';
  tripState.canEdit = requestedAccessMode !== 'read';

  if (tripIdParam) {
    try {
      const result = await api.get(`/api/trips/${encodeURIComponent(tripIdParam)}`);
      const trip = result?.data;
      if (trip) {
        tripState.id = trip.id;
        tripState.name = trip.name || '';
        tripState.accessMode = trip.access_mode || tripState.accessMode || 'owner';
        tripState.canEdit = trip.can_edit !== false;
        destination = trip.destination || destination;
        startDate = toDateInputValue(trip.start_date || startDate);
        endDate = toDateInputValue(trip.end_date || endDate);
      }
    } catch (error) {
      console.warn('Chargement du voyage impossible.', error);
    }
  }

  if (!tripState.id) {
    const fallback = readFallbackTrip();
    if (fallback) {
      tripState.id = fallback.id || null;
      tripState.name = fallback.name || '';
      destination = destination || fallback.destination || '';
      startDate = startDate || toDateInputValue(fallback.start_date || '');
      endDate = endDate || toDateInputValue(fallback.end_date || '');
    }
  }

  tripState.destination = destination;
  tripState.startDate = startDate;
  tripState.endDate = endDate;
}

async function loadActivities() {
  if (!tripState.id) {
    tripState.activities = [];
    return;
  }

  try {
    const result = await api.get(`/api/activities/trip/${encodeURIComponent(tripState.id)}`);
    tripState.activities = result?.data || [];
  } catch (error) {
    tripState.activities = [];
    const note = document.getElementById('agenda-note');
    if (note) {
      note.classList.add('is-error');
      note.textContent = error?.message || 'Impossible de charger les activites.';
    }
  }
}

async function loadTransports() {
  if (!tripState.id) {
    tripState.transports = [];
    return;
  }

  try {
    const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripState.id)}`);
    tripState.transports = result?.data || [];
  } catch (error) {
    tripState.transports = [];
    const note = document.getElementById('agenda-note');
    if (note) {
      note.classList.add('is-error');
      note.textContent = error?.message || 'Impossible de charger les transports.';
    }
  }
}

async function loadAccommodations() {
  if (!tripState.id) {
    accommodations = [];
    return;
  }

  try {
    accommodations = await listAccommodationsByTrip(tripState.id);
  } catch (error) {
    accommodations = [];
    const note = document.getElementById('agenda-note');
    if (note) {
      note.classList.add('is-error');
      note.textContent = error?.message || 'Impossible de charger les logements.';
    }
  }
}

async function initAgendaPage() {
  const returnTo = `agenda.html${window.location.search || ''}`;
  try {
    const me = await api.get('/api/auth/me');
    if (!me?.user?.id) {
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      return;
    }
  } catch (error) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }

  await loadTrip();
  applyReadOnlyUiState();
  updateMeta();
  updateNavigationLinks();

  const note = document.getElementById('agenda-note');
  if (isReadOnlyTrip() && note) {
    note.classList.add('is-success');
    note.textContent = 'Mode lecture seule: vous pouvez consulter l agenda sans le modifier.';
  }

  await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
  renderAgenda();
  initEditMode();
  initAgendaInteractions();
  openActivityModal = initActivityModal();
  openTransportModal = initTransportModal();
  openAccommodationModal = initAccommodationModal();
}

initAgendaPage();
