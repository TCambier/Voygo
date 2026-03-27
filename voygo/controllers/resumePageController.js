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

function formatPercent(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '0%';
  return `${Math.round(amount)}%`;
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

function buildBudgetBreakdown() {
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

  return {
    total,
    transportTotal,
    accommodationTotal,
    activitiesTotal,
    topBreakdown
  };
}

function renderOverview() {
  const kpiNode = document.getElementById('resume-overview-kpis');
  const highlightsNode = document.getElementById('resume-highlights');
  const insightsNode = document.getElementById('resume-insights');
  const budgetListNode = document.getElementById('resume-budget-list');
  const planningListNode = document.getElementById('resume-planning-list');
  if (!kpiNode || !highlightsNode || !insightsNode || !budgetListNode || !planningListNode) return;

  const {
    total,
    transportTotal,
    accommodationTotal,
    activitiesTotal,
    topBreakdown
  } = buildBudgetBreakdown();

  const entries = collectTimelineEntries();
  const nights = computeNights(tripState.startDate, tripState.endDate);
  const nextEntry = entries.find((entry) => Boolean(entry.date));
  const dayCount = Math.max(createDateRange(tripState.startDate, tripState.endDate).length, nights > 0 ? nights + 1 : 0, 1);
  const budgetPerDay = total > 0 ? total / dayCount : 0;
  const scheduledDays = new Set(entries.map((entry) => entry.date).filter(Boolean));
  const eventsPerScheduledDay = scheduledDays.size > 0 ? (entries.length / scheduledDays.size) : 0;
  const uniqueTransportModes = new Set((tripState.transports || []).map((item) => String(item?.mode || '').trim()).filter(Boolean));

  const transportRatio = total > 0 ? (transportTotal / total) * 100 : 0;
  const accommodationRatio = total > 0 ? (accommodationTotal / total) * 100 : 0;
  const activitiesRatio = total > 0 ? (activitiesTotal / total) * 100 : 0;

  kpiNode.innerHTML = [
    makeKpiCard('Total estime', formatPrice(total), 'bx-wallet'),
    makeKpiCard('Activites', String(tripState.activities.length), 'bx-map-pin'),
    makeKpiCard('Transports', String(tripState.transports.length), 'bx-car'),
    makeKpiCard('Logements', String(tripState.accommodations.length), 'bx-building-house'),
    makeKpiCard('Nuits', String(nights || 0), 'bx-moon'),
    makeKpiCard('Activites payantes', formatPrice(activitiesTotal), 'bx-map')
  ].join('');

  highlightsNode.innerHTML = [
    `
      <article class="resume-highlight-card">
        <span class="resume-highlight-icon"><i class='bx bx-calendar-event'></i></span>
        <div>
          <p class="resume-highlight-title">Jours planifies</p>
          <strong class="resume-highlight-value">${escapeHtml(String(scheduledDays.size || 0))}</strong>
          <p class="resume-highlight-note">sur ${escapeHtml(String(dayCount))} jour(s) de voyage</p>
        </div>
      </article>
    `,
    `
      <article class="resume-highlight-card">
        <span class="resume-highlight-icon"><i class='bx bx-trending-up'></i></span>
        <div>
          <p class="resume-highlight-title">Rythme moyen</p>
          <strong class="resume-highlight-value">${escapeHtml((eventsPerScheduledDay > 0 ? eventsPerScheduledDay.toFixed(1) : '0.0'))}</strong>
          <p class="resume-highlight-note">etape(s) par jour actif</p>
        </div>
      </article>
    `,
    `
      <article class="resume-highlight-card">
        <span class="resume-highlight-icon"><i class='bx bx-euro'></i></span>
        <div>
          <p class="resume-highlight-title">Cout moyen</p>
          <strong class="resume-highlight-value">${escapeHtml(formatPrice(budgetPerDay))}</strong>
          <p class="resume-highlight-note">par jour de voyage</p>
        </div>
      </article>
    `
  ].join('');

  insightsNode.innerHTML = `
    <article class="resume-insight-card">
      <h3>Repartition budget</h3>
      <div class="resume-budget-split">
        <div class="split-row">
          <span>Transports</span>
          <strong>${escapeHtml(formatPercent(transportRatio))}</strong>
        </div>
        <div class="split-bar"><span style="width:${Math.max(0, Math.min(100, transportRatio))}%;"></span></div>

        <div class="split-row">
          <span>Logements</span>
          <strong>${escapeHtml(formatPercent(accommodationRatio))}</strong>
        </div>
        <div class="split-bar split-accommodation"><span style="width:${Math.max(0, Math.min(100, accommodationRatio))}%;"></span></div>

        <div class="split-row">
          <span>Activites</span>
          <strong>${escapeHtml(formatPercent(activitiesRatio))}</strong>
        </div>
        <div class="split-bar split-activities"><span style="width:${Math.max(0, Math.min(100, activitiesRatio))}%;"></span></div>
      </div>
    </article>

    <article class="resume-insight-card">
      <h3>Lecture rapide</h3>
      <ul class="resume-fact-list">
        <li><span>Destination</span><strong>${escapeHtml(tripState.destination || '-')}</strong></li>
        <li><span>Duree</span><strong>${escapeHtml(String(dayCount))} jour(s)</strong></li>
        <li><span>Modes de transport</span><strong>${escapeHtml(String(uniqueTransportModes.size || 0))}</strong></li>
        <li><span>Activites localisees</span><strong>${escapeHtml(String((tripState.localizedActivities || []).length))}</strong></li>
      </ul>
    </article>
  `;

  if (!topBreakdown.length) {
    budgetListNode.innerHTML = '<p class="muted">Aucune depense enregistree pour le moment.</p>';
  } else {
    budgetListNode.innerHTML = `
      <ul class="resume-simple-list">
        <li>
          <span>Total estime</span>
          <strong>${escapeHtml(formatPrice(total))}</strong>
        </li>
        <li>
          <span>Transports</span>
          <strong>${escapeHtml(formatPrice(transportTotal))}</strong>
        </li>
        <li>
          <span>Logements</span>
          <strong>${escapeHtml(formatPrice(accommodationTotal))}</strong>
        </li>
        ${topBreakdown.map((item) => `
          <li>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(formatPrice(item.value))}</strong>
          </li>
        `).join('')}
      </ul>
    `;
  }

  const planningItems = [
    ['Destination', tripState.destination || '-'],
    ['Depart', formatDate(tripState.startDate) || '-'],
    ['Retour', formatDate(tripState.endDate) || '-'],
    ['Prochaine etape', nextEntry ? `${nextEntry.date ? formatDate(nextEntry.date) : '-'} a ${nextEntry.time || '--:--'} - ${nextEntry.title}` : 'Aucune etape planifiee']
  ];

  planningListNode.innerHTML = `
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

function safePdfFilePart(value) {
  return String(value || 'voyage')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'voyage';
}

function loadImageAsDataUrl(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }
        context.drawImage(image, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: image.naturalWidth || image.width || 0,
          height: image.naturalHeight || image.height || 0
        });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function createPdfReportWriter(doc, options = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const headerBottom = 42;
  const topY = 50;
  const bottomY = pageHeight - 18;
  const lineHeight = 5.5;
  const textWidth = pageWidth - (marginX * 2);
  const logoInfo = options.logoInfo || null;
  let y = topY;

  function drawHeader() {
    doc.setFillColor(255, 107, 107);
    doc.rect(0, 0, pageWidth, headerBottom, 'F');

    const logoSlotW = 68;
    const logoSlotH = 26;
    const logoSlotX = marginX;
    const logoSlotY = 5;
    const headerTextX = marginX + (logoInfo?.dataUrl ? logoSlotW + 6 : 0);

    if (logoInfo?.dataUrl) {
      try {
        const logoWidth = Number(logoInfo.width);
        const logoHeight = Number(logoInfo.height);
        const ratio = (logoWidth > 0 && logoHeight > 0) ? (logoWidth / logoHeight) : (logoSlotW / logoSlotH);

        let drawW = logoSlotW;
        let drawH = drawW / ratio;
        if (drawH > logoSlotH) {
          drawH = logoSlotH;
          drawW = drawH * ratio;
        }

        const drawX = logoSlotX + ((logoSlotW - drawW) / 2);
        const drawY = logoSlotY + ((logoSlotH - drawH) / 2);
        doc.addImage(logoInfo.dataUrl, 'PNG', drawX, drawY, drawW, drawH);
      } catch {
        // ignore logo draw issues and continue with text header
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text('Rapport de voyage', headerTextX, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(options.reportSubtitle || 'Synthese complete', headerTextX, 26);

    doc.setTextColor(31, 41, 55);
  }

  function drawFooter(pageNumber, totalPages) {
    doc.setDrawColor(231, 216, 201);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 13, pageWidth - marginX, pageHeight - 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(95, 107, 122);
    doc.text('Voygo', marginX, pageHeight - 8);
    doc.text(`Page ${pageNumber}/${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    doc.setTextColor(31, 41, 55);
  }

  function ensureSpace(height = lineHeight) {
    if (y + height <= bottomY) return;
    doc.addPage();
    y = topY;
    drawHeader();
  }

  function addGap(height = 2) {
    ensureSpace(height);
    y += height;
  }

  function writeText(text, optionsText = {}) {
    const size = optionsText.size || 10.5;
    const spacingAfter = optionsText.spacingAfter ?? 1.5;
    const style = optionsText.bold ? 'bold' : 'normal';

    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || ''), textWidth);
    ensureSpace(lines.length * lineHeight);
    doc.text(lines, marginX, y);
    y += (lines.length * lineHeight) + spacingAfter;
  }

  function writeSectionTitle(title) {
    ensureSpace(10);
    doc.setFillColor(255, 243, 232);
    doc.roundedRect(marginX, y - 1, textWidth, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(190, 24, 93);
    doc.text(String(title || ''), marginX + 3, y + 4.2);
    doc.setTextColor(31, 41, 55);
    y += 10;
  }

  function writeBudgetTable(rows) {
    const leftX = marginX;
    const width = textWidth;
    const headerH = 7;
    const rowH = 7;
    const col1W = width * 0.7;
    const col2W = width - col1W;
    const safeRows = Array.isArray(rows) ? rows : [];

    ensureSpace(headerH + (rowH * Math.max(1, safeRows.length)) + 2);

    doc.setFillColor(255, 107, 107);
    doc.rect(leftX, y, width, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('Poste budget', leftX + 3, y + 4.7);
    doc.text('Montant', leftX + width - 3, y + 4.7, { align: 'right' });

    y += headerH;
    doc.setTextColor(31, 41, 55);
    doc.setDrawColor(231, 216, 201);
    doc.setLineWidth(0.2);

    if (!safeRows.length) {
      doc.rect(leftX, y, width, rowH, 'S');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Aucune donnee budget disponible', leftX + 3, y + 4.7);
      y += rowH + 2;
      return;
    }

    safeRows.forEach((row, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(255, 251, 246);
        doc.rect(leftX, y, width, rowH, 'F');
      }
      doc.rect(leftX, y, width, rowH, 'S');
      doc.line(leftX + col1W, y, leftX + col1W, y + rowH);

      doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      doc.setFontSize(9.8);
      doc.text(String(row?.label || '-'), leftX + 3, y + 4.7);
      doc.text(String(row?.value || '-'), leftX + col1W + col2W - 3, y + 4.7, { align: 'right' });
      y += rowH;
    });

    y += 2;
  }

  function finalize() {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      drawFooter(page, totalPages);
    }
  }

  drawHeader();
  y = topY;

  return {
    addGap,
    writeText,
    writeSectionTitle,
    writeBudgetTable,
    finalize
  };
}

async function exportResumeToPdf() {
  if (!tripState.id) {
    setNote('Selectionnez un voyage avant export PDF.', 'error');
    return;
  }

  const jsPdfLib = window.jspdf?.jsPDF;
  if (!jsPdfLib) {
    setNote('Export PDF indisponible: bibliotheque non chargee.', 'error');
    return;
  }

  try {
    const doc = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const logoInfo = await loadImageAsDataUrl('../assets/images/banner.png');
    const writer = createPdfReportWriter(doc, {
      logoInfo,
      reportSubtitle: `${tripState.name || tripState.destination || 'Voyage'} - ${new Date().toLocaleDateString('fr-FR')}`
    });

    const dateRange = [formatDate(tripState.startDate), formatDate(tripState.endDate)].filter(Boolean).join(' - ') || '-';
    const budgetData = buildBudgetBreakdown();
    const timelineEntries = collectTimelineEntries();
    const localized = [...(tripState.localizedActivities || [])].sort((left, right) => {
      const leftDate = String(left?.schedule?.date || '9999-12-31');
      const rightDate = String(right?.schedule?.date || '9999-12-31');
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

      const leftTime = toMinuteOfDay(left?.schedule?.startTime || '');
      const rightTime = toMinuteOfDay(right?.schedule?.startTime || '');
      if (leftTime === null && rightTime === null) return 0;
      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime;
    });

    writer.writeSectionTitle('Fiche voyage');
    writer.writeText(`Voyage: ${tripState.name || tripState.destination || '-'}`, { bold: true, size: 12, spacingAfter: 1.2 });
    writer.writeText(`Destination: ${tripState.destination || '-'}`);
    writer.writeText(`Dates: ${dateRange}`);
    writer.writeText(`Genere le: ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}`);
    writer.addGap(1);

    writer.writeSectionTitle('Budget (tableau)');
    writer.writeBudgetTable([
      { label: 'Total estime', value: formatPrice(budgetData.total) },
      { label: 'Transports', value: formatPrice(budgetData.transportTotal) },
      { label: 'Logements', value: formatPrice(budgetData.accommodationTotal) },
      { label: 'Activites payantes', value: formatPrice(budgetData.activitiesTotal) }
    ]);

    writer.writeSectionTitle('Chiffres cles');
    writer.writeText(`- Activites: ${tripState.activities.length}`);
    writer.writeText(`- Transports: ${tripState.transports.length}`);
    writer.writeText(`- Logements: ${tripState.accommodations.length}`);
    writer.writeText(`- Activites localisees: ${localized.length}`);
    writer.addGap(1);

    writer.writeSectionTitle('Top depenses');
    if (!budgetData.topBreakdown.length) {
      writer.writeText('- Aucune depense detaillee disponible.');
    } else {
      budgetData.topBreakdown.slice(0, 10).forEach((item, index) => {
        writer.writeText(`${index + 1}. ${item.label}: ${formatPrice(item.value)}`);
      });
    }
    writer.addGap(1);

    writer.writeSectionTitle('Etapes du planning');
    if (!timelineEntries.length) {
      writer.writeText('- Aucune etape planifiee.');
    } else {
      timelineEntries.slice(0, 30).forEach((entry, index) => {
        const when = `${entry.date ? formatDate(entry.date) : 'Date non renseignee'} ${entry.time || '--:--'}`;
        const where = entry.subtitle || '-';
        writer.writeText(`${index + 1}. ${entry.title} (${when}) - ${where}`);
      });
      if (timelineEntries.length > 30) {
        writer.writeText(`... ${timelineEntries.length - 30} autre(s) etape(s) non affichee(s).`);
      }
    }
    writer.addGap(1);

    writer.writeSectionTitle('Activites localisees (carte)');
    if (!localized.length) {
      writer.writeText('- Aucune activite localisee.');
    } else {
      localized.slice(0, 40).forEach((item, index) => {
        const day = item?.schedule?.date ? formatDate(item.schedule.date) : 'Date non renseignee';
        const time = item?.schedule?.startTime || '--:--';
        const lat = Number(item?.coords?.lat);
        const lon = Number(item?.coords?.lon);
        const geo = Number.isFinite(lat) && Number.isFinite(lon)
          ? ` [${lat.toFixed(4)}, ${lon.toFixed(4)}]`
          : '';
        writer.writeText(`${index + 1}. ${item?.name || 'Activite'} - ${day} ${time} - ${item?.address || 'Adresse non renseignee'}${geo}`);
      });
      if (localized.length > 40) {
        writer.writeText(`... ${localized.length - 40} autre(s) activite(s) non affichee(s).`);
      }
    }

    writer.finalize();

    const fileName = `voygo-resume-${safePdfFilePart(tripState.name || tripState.destination || tripState.id)}.pdf`;
    doc.save(fileName);
    setNote('Resume exporte en PDF avec succes.', 'success');
  } catch (error) {
    console.error('PDF export failed:', error);
    setNote('Impossible de generer le PDF.', 'error');
  }
}

function bindExportButton() {
  const button = document.getElementById('resume-export-pdf-btn');
  if (!button) return;

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const previousLabel = button.innerHTML;
    button.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Generation PDF...";

    try {
      await exportResumeToPdf();
    } finally {
      button.disabled = false;
      button.innerHTML = previousLabel;
    }
  });
}

function renderMapSection() {
  const emptyNode = document.getElementById('resume-map-empty');
  const statsNode = document.getElementById('resume-carte-stats');
  const activitiesNode = document.getElementById('resume-map-activities');

  const entries = tripState.localizedActivities || [];
  const hasEntries = entries.length > 0;

  if (activitiesNode) {
    if (!hasEntries) {
      activitiesNode.innerHTML = '';
    } else {
      const sortedEntries = [...entries].sort((left, right) => {
        const leftDate = String(left?.schedule?.date || '9999-12-31');
        const rightDate = String(right?.schedule?.date || '9999-12-31');
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

        const leftTime = toMinuteOfDay(left?.schedule?.startTime || '');
        const rightTime = toMinuteOfDay(right?.schedule?.startTime || '');
        if (leftTime === null && rightTime === null) return 0;
        if (leftTime === null) return 1;
        if (rightTime === null) return -1;
        return leftTime - rightTime;
      });

      const previewEntries = sortedEntries.slice(0, 8);
      activitiesNode.innerHTML = `
        <h3>Activites localisees</h3>
        <ul class="resume-map-activity-list">
          ${previewEntries.map((item) => {
            const day = item?.schedule?.date ? formatDate(item.schedule.date) : 'Date non renseignee';
            const time = item?.schedule?.startTime || '--:--';
            return `
              <li class="resume-map-activity-item">
                <span class="resume-map-activity-dot"></span>
                <div class="resume-map-activity-content">
                  <p class="resume-map-activity-title">${escapeHtml(item?.name || 'Activite')}</p>
                  <p class="resume-map-activity-meta">${escapeHtml(day)} - ${escapeHtml(time)}</p>
                  <p class="resume-map-activity-address">${escapeHtml(item?.address || 'Adresse non renseignee')}</p>
                </div>
              </li>
            `;
          }).join('')}
        </ul>
        ${sortedEntries.length > previewEntries.length ? `<p class="resume-map-more">${escapeHtml(String(sortedEntries.length - previewEntries.length))} activite(s) supplementaire(s) sur la carte.</p>` : ''}
      `;
    }
  }

  ensureMap();
  if (!map || !markerLayer || !traceLayer) {
    if (emptyNode) emptyNode.hidden = false;
    if (statsNode) statsNode.innerHTML = '';
    return;
  }

  markerLayer.clearLayers();
  traceLayer.clearLayers();

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
    bindExportButton();
    await loadTrip();
    updateMeta();
    updateNavigationLinks();

    if (!tripState.id) {
      renderOverview();
      renderMapSection();
      setNote('Selectionnez un voyage depuis Planning pour afficher le resume.', 'error');
      return;
    }

    await Promise.all([loadActivities(), loadTransports(), loadAccommodations()]);
    await localizeActivities();

    renderOverview();
    renderMapSection();
  } catch (error) {
    console.error('Resume page init failed:', error);
    setNote(error?.message || 'Impossible de charger le resume.', 'error');
  }
}

initResumePage();
