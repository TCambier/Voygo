import { api } from '../assets/js/api.js';

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  activities: [],
  localizedActivities: []
};

const DAY_COLORS = ['#ff6b6b', '#ff3d71', '#2ec4b6', '#ffd166', '#6c63ff', '#ff8fab'];

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
  const note = document.getElementById('carte-note');
  if (!note) return;
  note.classList.remove('is-success', 'is-error');
  if (kind === 'success') note.classList.add('is-success');
  if (kind === 'error') note.classList.add('is-error');
  note.textContent = message || '';
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
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

function normalizeActivityDate(value) {
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

function getActivitySchedule(item) {
  const metadata = readScheduleMetadata(item?.description);
  const date = normalizeActivityDate(metadata?.date || item?.activity_date || '');
  const startTime = toTimeDisplayValue(metadata?.time || '');
  return { date, startTime };
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
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    });

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

function updateMeta() {
  const nameNode = document.getElementById('carte-trip-name');
  const datesNode = document.getElementById('carte-dates');

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

function buildDayOptionLabel(day, index) {
  const dateLabel = formatDate(day);
  return `Jour ${index + 1}${dateLabel ? ` - ${dateLabel}` : ''}`;
}

function populateDayFilter() {
  const filter = document.getElementById('carte-day-filter');
  if (!(filter instanceof HTMLSelectElement)) return;

  const groupedDays = new Set(
    (tripState.localizedActivities || [])
      .map((item) => item.schedule.date)
      .filter(Boolean)
  );

  let dayKeys = createDateRange(tripState.startDate, tripState.endDate);
  if (!dayKeys.length) {
    dayKeys = Array.from(groupedDays).sort((a, b) => a.localeCompare(b));
  }

  filter.innerHTML = '<option value="all">Tous les jours</option>';
  dayKeys.forEach((day, index) => {
    const option = document.createElement('option');
    option.value = day;
    option.textContent = buildDayOptionLabel(day, index);
    filter.appendChild(option);
  });
}

function ensureMap() {
  if (map) return;

  const mapNode = document.getElementById('carte-map');
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
    const day = item.schedule.date || 'no-date';
    const bucket = grouped.get(day) || [];
    bucket.push(item);
    grouped.set(day, bucket);
  });

  grouped.forEach((items, day) => {
    items.sort((left, right) => {
      const leftTime = toMinuteOfDay(left.schedule.startTime);
      const rightTime = toMinuteOfDay(right.schedule.startTime);
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime;
    });
    grouped.set(day, items);
  });

  return grouped;
}

function updateStats(entries) {
  const statsNode = document.getElementById('carte-stats');
  if (!statsNode) return;

  if (entries.length === 0) {
    statsNode.innerHTML = '';
    return;
  }

  const tracedDays = new Set(entries.map((item) => item.schedule.date).filter(Boolean)).size;
  statsNode.innerHTML = `
    <span class="carte-chip"><i class='bx bx-map-pin'></i> ${entries.length} activite(s)</span>
    <span class="carte-chip"><i class='bx bx-route'></i> ${tracedDays} jour(s) traces</span>
  `;
}

function renderMap(filterValue = 'all') {
  ensureMap();
  if (!map || !markerLayer || !traceLayer) return;

  markerLayer.clearLayers();
  traceLayer.clearLayers();

  const emptyNode = document.getElementById('carte-empty');
  const allItems = tripState.localizedActivities || [];
  const selected = filterValue === 'all'
    ? allItems
    : allItems.filter((item) => item.schedule.date === filterValue);

  const withCoords = selected.filter((item) => Number.isFinite(item.coords?.lat) && Number.isFinite(item.coords?.lon));
  if (emptyNode) emptyNode.hidden = withCoords.length > 0;
  updateStats(withCoords);

  if (!withCoords.length) return;

  const grouped = groupActivitiesByDay(withCoords);
  const bounds = [];
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  dayKeys.forEach((dayKey, dayIndex) => {
    const dayItems = grouped.get(dayKey) || [];
    const points = dayItems.map((item) => [item.coords.lat, item.coords.lon]);
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length];

    dayItems.forEach((item, index) => {
      const marker = window.L.circleMarker([item.coords.lat, item.coords.lon], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.8
      });

      const timeLabel = item.schedule.startTime ? `${item.schedule.startTime}` : 'Heure non precisee';
      marker.bindPopup(`
        <strong>${escapeHtml(item.name || 'Activite')}</strong><br>
        ${escapeHtml(item.address || 'Adresse non renseignee')}<br>
        ${escapeHtml(dayKey === 'no-date' ? 'Date non renseignee' : formatDate(dayKey))}<br>
        ${escapeHtml(timeLabel)}<br>
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
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
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

  if (!tripId) {
    setNote('Selectionnez un voyage depuis la page Planning pour afficher la carte.', 'error');
    return;
  }

  try {
    const tripResult = await api.get(`/api/trips/${encodeURIComponent(tripId)}`);
    const trip = tripResult?.data || null;
    if (trip) {
      tripState.name = String(trip.name || '').trim();
      tripState.destination = String(trip.destination || tripState.destination || '').trim();
      tripState.startDate = toDateInputValue(trip.start_date || tripState.startDate);
      tripState.endDate = toDateInputValue(trip.end_date || tripState.endDate);
      localStorage.setItem('voygo_current_trip', JSON.stringify(trip));
    }
  } catch {
    // fallback to query/local storage values
  }
}

async function loadActivities() {
  if (!tripState.id) {
    tripState.activities = [];
    tripState.localizedActivities = [];
    return;
  }

  const result = await api.get(`/api/activities/trip/${encodeURIComponent(tripState.id)}`);
  const activities = Array.isArray(result?.data) ? result.data : [];
  tripState.activities = activities;

  const geocodeCache = loadGeocodeCache();
  const localized = [];

  for (const activity of activities) {
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

function bindFilter() {
  const filter = document.getElementById('carte-day-filter');
  if (!(filter instanceof HTMLSelectElement)) return;

  filter.addEventListener('change', () => {
    renderMap(filter.value || 'all');
  });
}

export async function initCartePage() {
  try {
    await loadTrip();
    updateMeta();
    updateNavigationLinks();

    await loadActivities();
    populateDayFilter();
    bindFilter();

    const filter = document.getElementById('carte-day-filter');
    const currentFilter = filter instanceof HTMLSelectElement ? filter.value : 'all';
    renderMap(currentFilter || 'all');

    const localizedCount = tripState.localizedActivities.length;
    if (!localizedCount) {
      setNote('Aucune activite avec position exploitable n\'a ete trouvee.', 'error');
    }
  } catch (error) {
    console.error('Carte page init failed:', error);
    setNote(error?.message || 'Impossible de charger la carte.', 'error');
  }
}

initCartePage();
