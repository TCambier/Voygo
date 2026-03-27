import { api } from '../assets/js/api.js';
import { listAccommodations } from './accommodationController.js';

const DAY_COLORS = ['#ff6b6b', '#ff3d71', '#2ec4b6', '#ffd166', '#6c63ff', '#ff8fab'];

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  activities: [],
  transports: [],
  accommodations: [],
  localizedActivities: []
};

let map = null;
let markerLayer = null;
let traceLayer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setNote(message, kind = 'info') {
  const note = document.getElementById('resume-note');
  if (!note) return;

  note.classList.remove('is-success', 'is-error');
  if (kind === 'success') note.classList.add('is-success');
  if (kind === 'error') note.classList.add('is-error');
  note.textContent = message || '';
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString('fr-FR');
}

function formatDateLong(dateValue) {
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

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
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

function toDateInputValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

function toTimeDisplayValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : '';
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

function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
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

function getActivitySchedule(item) {
  const metadata = readScheduleMetadata(item?.description);
  const date = normalizeDate(metadata?.date || item?.activity_date || '');
  const startTime = toTimeDisplayValue(metadata?.time || '');
  const durationRaw = Number(metadata?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 60;

  return {
    date,
    startTime,
    durationMinutes
  };
}

function getTransportSchedule(item) {
  const date = normalizeDate(item?.travel_date || '');
  const startTime = toTimeDisplayValue(item?.travel_time || '');
  const durationRaw = Number(item?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 0;

  return {
    date,
    startTime,
    durationMinutes
  };
}

function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function formatDateKeyFromUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDateRange(startDate, endDate) {
  const startParts = parseDateKey(startDate);
  const endParts = parseDateKey(endDate);
  if (!startParts || !endParts) return [];

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

function readFallbackTrip() {
  const stored = localStorage.getItem('voygo_current_trip');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

async function loadTrip() {
  const params = new URLSearchParams(window.location.search);
  const fallbackTrip = readFallbackTrip();

  const tripId = params.get('tripId') || fallbackTrip?.id || null;
  tripState.id = tripId;
  tripState.destination = params.get('destination') || fallbackTrip?.destination || '';
  tripState.startDate = toDateInputValue(params.get('startDate') || fallbackTrip?.start_date || fallbackTrip?.startDate || '');
  tripState.endDate = toDateInputValue(params.get('endDate') || fallbackTrip?.end_date || fallbackTrip?.endDate || '');
  tripState.name = fallbackTrip?.name || fallbackTrip?.title || '';

  if (!tripId) return;

  try {
    const tripResult = await api.get(`/api/trips/${encodeURIComponent(tripId)}`);
    const trip = tripResult?.data || null;
    if (!trip) return;

    tripState.name = String(trip.name || '').trim();
    tripState.destination = String(trip.destination || tripState.destination || '').trim();
    tripState.startDate = toDateInputValue(trip.start_date || tripState.startDate);
    tripState.endDate = toDateInputValue(trip.end_date || tripState.endDate);
    localStorage.setItem('voygo_current_trip', JSON.stringify(trip));
  } catch {
    // fallback on query/local storage
  }
}

function updateMeta() {
  const nameNode = document.getElementById('resume-trip-name');
  const datesNode = document.getElementById('resume-dates');

  if (nameNode) {
    nameNode.textContent = tripState.name || tripState.destination || '-';
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

  const query = params.toString();
  nav.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const basePath = href.split('?')[0];
    if (!/\.html$/i.test(basePath)) return;
    link.setAttribute('href', query ? `${basePath}?${query}` : basePath);
  });
}

async function loadActivities() {
  if (!tripState.id) {
    tripState.activities = [];
    return;
  }

  try {
    const result = await api.get(`/api/activities/trip/${encodeURIComponent(tripState.id)}`);
    tripState.activities = Array.isArray(result?.data) ? result.data : [];
  } catch {
    tripState.activities = [];
  }
}

async function loadTransports() {
  if (!tripState.id) {
    tripState.transports = [];
    return;
  }

  try {
    const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripState.id)}`);
    tripState.transports = Array.isArray(result?.data) ? result.data : [];
  } catch {
    tripState.transports = [];
  }
}

async function loadAccommodations() {
  if (!tripState.id) {
    tripState.accommodations = [];
    return;
  }

  try {
    const all = await listAccommodations();
    tripState.accommodations = (all || []).filter((item) => String(item.trip_id) === String(tripState.id));
  } catch {
    tripState.accommodations = [];
  }
}

function makeKpiCard(label, value, icon) {
  return `
    <div class="resume-kpi-card">
      <span class="resume-kpi-icon"><i class='bx ${icon}'></i></span>
      <div>
        <span class="resume-kpi-label">${escapeHtml(label)}</span>
        <strong class="resume-kpi-value">${escapeHtml(value)}</strong>
      </div>
    </div>
  `;
}

function collectTimelineEntries() {
  const entries = [];

  (tripState.activities || []).forEach((activity) => {
    const schedule = getActivitySchedule(activity);
    if (!schedule.date) return;
    entries.push({
      type: 'activity',
      date: schedule.date,
      time: schedule.startTime || '09:00',
      duration: schedule.durationMinutes,
      title: activity?.name || 'Activite',
      subtitle: activity?.address || 'Adresse indisponible',
      description: stripScheduleMetadata(activity?.description || ''),
      icon: 'bx-map-pin'
    });
  });

  (tripState.transports || []).forEach((transport) => {
    const schedule = getTransportSchedule(transport);
    if (!schedule.date) return;
    entries.push({
      type: 'transport',
      date: schedule.date,
      time: schedule.startTime || '09:00',
      duration: schedule.durationMinutes,
      title: transport?.mode || 'Transport',
      subtitle: `${transport?.origin || '-'} -> ${transport?.destination || '-'}`,
      description: schedule.durationMinutes > 0 ? `Temps de trajet: ${formatDuration(schedule.durationMinutes)}` : '',
      icon: 'bx-car'
    });
  });

  (tripState.accommodations || []).forEach((accommodation) => {
    const startDate = normalizeDate(accommodation?.start_date || '');
    const endDate = normalizeDate(accommodation?.end_date || '');
    if (!startDate) return;

    entries.push({
      type: 'accommodation',
      date: startDate,
      time: '14:00',
      duration: 0,
      title: `Arrivee - ${accommodation?.name || 'Logement'}`,
      subtitle: accommodation?.address || 'Adresse indisponible',
      description: '',
      icon: 'bx-building-house'
    });

    if (endDate) {
      entries.push({
        type: 'accommodation',
        date: endDate,
        time: '11:00',
        duration: 0,
        title: `Depart - ${accommodation?.name || 'Logement'}`,
        subtitle: accommodation?.address || 'Adresse indisponible',
        description: '',
        icon: 'bx-building-house'
      });
    }
  });

  entries.sort((left, right) => {
    if (left.date !== right.date) return left.date.localeCompare(right.date);
    const leftMinute = toMinuteOfDay(left.time);
    const rightMinute = toMinuteOfDay(right.time);
    if (leftMinute === null && rightMinute === null) return 0;
    if (leftMinute === null) return 1;
    if (rightMinute === null) return -1;
    return leftMinute - rightMinute;
  });

  return entries;
}

function renderBudget() {
  const kpiNode = document.getElementById('resume-budget-kpis');
  const listNode = document.getElementById('resume-budget-list');
  if (!kpiNode || !listNode) return;

  const transportTotal = (tripState.transports || []).reduce((sum, item) => {
    const price = Number(item?.price);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);

  const accommodationTotal = (tripState.accommodations || []).reduce((sum, item) => {
    const nightlyPriceRaw = Number(item?.price_per_night ?? item?.price);
    if (!Number.isFinite(nightlyPriceRaw)) return sum;
    const nights = Number(item?.nights) || computeNights(normalizeDate(item?.start_date || ''), normalizeDate(item?.end_date || ''));
    const safeNights = Number.isFinite(Number(nights)) && Number(nights) > 0 ? Number(nights) : 1;
    return sum + (nightlyPriceRaw * safeNights);
  }, 0);

  const activitiesWithPrice = (tripState.activities || [])
    .map((item) => Number(item?.price))
    .filter((value) => Number.isFinite(value) && value > 0);
  const activitiesTotal = activitiesWithPrice.reduce((sum, value) => sum + value, 0);

  const total = transportTotal + accommodationTotal + activitiesTotal;

  kpiNode.innerHTML = [
    makeKpiCard('Total estime', formatPrice(total), 'bx-wallet'),
    makeKpiCard('Transports', formatPrice(transportTotal), 'bx-car'),
    makeKpiCard('Logements', formatPrice(accommodationTotal), 'bx-building-house'),
    makeKpiCard('Activites payantes', formatPrice(activitiesTotal), 'bx-map')
  ].join('');

  const breakdown = [];
  (tripState.transports || []).forEach((item) => {
    const price = Number(item?.price);
    if (!Number.isFinite(price) || price <= 0) return;
    breakdown.push({
      label: `${item?.mode || 'Transport'} - ${item?.origin || '-'} -> ${item?.destination || '-'}`,
      value: price
    });
  });

  (tripState.accommodations || []).forEach((item) => {
    const nightlyPriceRaw = Number(item?.price_per_night ?? item?.price);
    if (!Number.isFinite(nightlyPriceRaw) || nightlyPriceRaw <= 0) return;
    const nights = Number(item?.nights) || computeNights(normalizeDate(item?.start_date || ''), normalizeDate(item?.end_date || ''));
    const safeNights = Number.isFinite(Number(nights)) && Number(nights) > 0 ? Number(nights) : 1;
    breakdown.push({
      label: `Logement - ${item?.name || item?.address || 'Sans nom'} (${safeNights} nuit(s))`,
      value: nightlyPriceRaw * safeNights
    });
  });

  const topBreakdown = breakdown
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  if (!topBreakdown.length) {
    listNode.innerHTML = '<p class="muted">Aucune depense enregistree pour le moment.</p>';
    return;
  }

  listNode.innerHTML = `
    <ul class="resume-simple-list">
      ${topBreakdown.map((item) => `
        <li>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(formatPrice(item.value))}</strong>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderPlanning() {
  const kpiNode = document.getElementById('resume-planning-kpis');
  const listNode = document.getElementById('resume-planning-list');
  if (!kpiNode || !listNode) return;

  const entries = collectTimelineEntries();
  const nights = computeNights(tripState.startDate, tripState.endDate);
  const nextEntry = entries.find((entry) => Boolean(entry.date));

  kpiNode.innerHTML = [
    makeKpiCard('Activites', String(tripState.activities.length), 'bx-map-pin'),
    makeKpiCard('Transports', String(tripState.transports.length), 'bx-car'),
    makeKpiCard('Logements', String(tripState.accommodations.length), 'bx-building-house'),
    makeKpiCard('Nuits', String(nights || 0), 'bx-moon')
  ].join('');

  const planningItems = [
    ['Destination', tripState.destination || '-'],
    ['Depart', formatDate(tripState.startDate) || '-'],
    ['Retour', formatDate(tripState.endDate) || '-'],
    ['Prochaine etape', nextEntry ? `${nextEntry.date ? formatDate(nextEntry.date) : '-'} a ${nextEntry.time || '--:--'} - ${nextEntry.title}` : 'Aucune etape planifiee']
  ];

  listNode.innerHTML = `
    <ul class="resume-simple-list">
      ${planningItems.map(([label, value]) => `
        <li>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderAgenda() {
  const daysNode = document.getElementById('resume-agenda-days');
  const emptyNode = document.getElementById('resume-agenda-empty');
  if (!daysNode || !emptyNode) return;

  const entries = collectTimelineEntries();
  if (!entries.length) {
    daysNode.innerHTML = '';
    emptyNode.hidden = false;
    return;
  }

  const grouped = new Map();
  entries.forEach((entry) => {
    const key = entry.date || 'no-date';
    const bucket = grouped.get(key) || [];
    bucket.push(entry);
    grouped.set(key, bucket);
  });

  let dayKeys = createDateRange(tripState.startDate, tripState.endDate);
  if (!dayKeys.length) {
    dayKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  }

  const visibleKeys = dayKeys.filter((key) => (grouped.get(key) || []).length > 0).slice(0, 8);
  if (!visibleKeys.length && grouped.has('no-date')) {
    visibleKeys.push('no-date');
  }

  daysNode.innerHTML = visibleKeys.map((key) => {
    const items = grouped.get(key) || [];
    const dayLabel = key === 'no-date' ? 'Sans date precise' : formatDateLong(key);
    return `
      <article class="agenda-day-card">
        <div class="agenda-day-head">
          <h3>${escapeHtml(dayLabel)}</h3>
        </div>
        <div class="agenda-day-list">
          ${items.map((item) => `
            <article class="agenda-item ${item.type === 'transport' ? 'is-transport' : ''}">
              <div class="agenda-time">${escapeHtml(item.time || '--:--')}</div>
              <div class="agenda-item-content">
                <span class="agenda-badge"><i class='bx ${item.icon}'></i>${escapeHtml(item.type)}</span>
                <h3>${escapeHtml(item.title || '-')}</h3>
                <p class="agenda-item-meta">${escapeHtml(item.subtitle || '-')}</p>
                ${item.duration > 0 ? `<p class="agenda-item-meta">Duree: ${escapeHtml(formatDuration(item.duration))}</p>` : ''}
                ${item.description ? `<p class="agenda-item-desc">${escapeHtml(item.description)}</p>` : ''}
              </div>
            </article>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');

  emptyNode.hidden = visibleKeys.length > 0;
}

function parseCoordsFromMapUrl(mapUrl) {
  const text = String(mapUrl || '').trim();
  if (!text) return null;

  const mlat = text.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
  const mlon = text.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (mlat && mlon) {
    const lat = Number(mlat[1]);
    const lon = Number(mlon[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }

  const hash = text.match(/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i);
  if (hash) {
    const lat = Number(hash[1]);
    const lon = Number(hash[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }

  return null;
}

function makeAddressCacheKey(address) {
  return String(address || '').trim().toLowerCase();
}

function loadGeocodeCache() {
  const raw = localStorage.getItem('voygo_geocode_cache');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveGeocodeCache(cache) {
  try {
    localStorage.setItem('voygo_geocode_cache', JSON.stringify(cache));
  } catch {
    // no-op
  }
}

async function geocodeAddress(address, destination, cache) {
  const key = makeAddressCacheKey(address);
  if (!key) return null;

  const cached = cache[key];
  if (cached && Number.isFinite(Number(cached.lat)) && Number.isFinite(Number(cached.lon))) {
    return { lat: Number(cached.lat), lon: Number(cached.lon) };
  }

  const queryParts = [String(address || '').trim(), String(destination || '').trim()].filter(Boolean);
  if (!queryParts.length) return null;

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    `q=${encodeURIComponent(queryParts.join(', '))}` +
    '&format=jsonv2&limit=1';

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;

    const payload = await response.json();
    if (!Array.isArray(payload) || !payload.length) return null;

    const top = payload[0];
    const lat = Number(top?.lat);
    const lon = Number(top?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    cache[key] = { lat, lon };
    return { lat, lon };
  } catch {
    return null;
  }
}

async function localizeActivities() {
  const geocodeCache = loadGeocodeCache();
  const localized = [];

  for (const activity of tripState.activities || []) {
    const schedule = getActivitySchedule(activity);
    const coordsFromUrl = parseCoordsFromMapUrl(activity?.map_url);
    const coords = coordsFromUrl || await geocodeAddress(activity?.address, tripState.destination, geocodeCache);
    if (!coords) continue;

    localized.push({
      ...activity,
      schedule,
      coords
    });
  }

  saveGeocodeCache(geocodeCache);
  tripState.localizedActivities = localized;
}

function ensureMap() {
  if (map) return;
  const mapNode = document.getElementById('resume-map');
  if (!mapNode || typeof window.L === 'undefined') return;

  map = window.L.map(mapNode).setView([48.8566, 2.3522], 5);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markerLayer = window.L.layerGroup().addTo(map);
  traceLayer = window.L.layerGroup().addTo(map);
}

function groupActivitiesByDay(list) {
  const grouped = new Map();

  list.forEach((item) => {
    const day = item.schedule?.date || 'no-date';
    const bucket = grouped.get(day) || [];
    bucket.push(item);
    grouped.set(day, bucket);
  });

  grouped.forEach((items, day) => {
    items.sort((left, right) => {
      const leftTime = toMinuteOfDay(left.schedule?.startTime || '');
      const rightTime = toMinuteOfDay(right.schedule?.startTime || '');
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime;
    });
    grouped.set(day, items);
  });

  return grouped;
}

function renderMapSection() {
  const emptyNode = document.getElementById('resume-map-empty');
  const statsNode = document.getElementById('resume-carte-stats');

  ensureMap();
  if (!map || !markerLayer || !traceLayer) {
    if (emptyNode) emptyNode.hidden = false;
    if (statsNode) statsNode.innerHTML = '';
    return;
  }

  markerLayer.clearLayers();
  traceLayer.clearLayers();

  const entries = tripState.localizedActivities || [];
  const hasEntries = entries.length > 0;
  if (emptyNode) emptyNode.hidden = hasEntries;

  if (!hasEntries) {
    if (statsNode) statsNode.innerHTML = '';
    return;
  }

  const grouped = groupActivitiesByDay(entries);
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  const bounds = [];

  if (statsNode) {
    statsNode.innerHTML = `
      <span class="carte-chip"><i class='bx bx-map-pin'></i> ${entries.length} activite(s)</span>
      <span class="carte-chip"><i class='bx bx-route'></i> ${dayKeys.length} jour(s) traces</span>
    `;
  }

  dayKeys.forEach((dayKey, dayIndex) => {
    const dayItems = grouped.get(dayKey) || [];
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length];
    const points = dayItems.map((item) => [item.coords.lat, item.coords.lon]);

    dayItems.forEach((item, index) => {
      const marker = window.L.circleMarker([item.coords.lat, item.coords.lon], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.8
      });

      marker.bindPopup(`
        <strong>${escapeHtml(item.name || 'Activite')}</strong><br>
        ${escapeHtml(item.address || 'Adresse non renseignee')}<br>
        ${escapeHtml(dayKey === 'no-date' ? 'Date non renseignee' : formatDate(dayKey))}<br>
        ${escapeHtml(item.schedule?.startTime || 'Heure non precisee')}<br>
        Etape ${index + 1}
      `);

      markerLayer.addLayer(marker);
      bounds.push([item.coords.lat, item.coords.lon]);
    });

    if (points.length >= 2) {
      const polyline = window.L.polyline(points, {
        color,
        weight: 4,
        opacity: 0.85
      });
      traceLayer.addLayer(polyline);
    }
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 13);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [36, 36] });
  }
}

export async function initResumePage() {
  try {
    await loadTrip();
    updateMeta();
    updateNavigationLinks();

    if (!tripState.id) {
      renderBudget();
      renderPlanning();
      renderAgenda();
      renderMapSection();
      setNote('Selectionnez un voyage depuis Planning pour afficher le resume.', 'error');
      return;
    }

    await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
    await localizeActivities();

    renderBudget();
    renderPlanning();
    renderAgenda();
    renderMapSection();
  } catch (error) {
    console.error('Resume page init failed:', error);
    setNote(error?.message || 'Impossible de charger le resume.', 'error');
  }
}

initResumePage();
