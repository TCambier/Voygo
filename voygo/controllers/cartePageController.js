/**
 * @voygo-doc
 * Module: cartePageController
 * Fichier: voygo\controllers\cartePageController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: '',
  activities: [],
  localizedActivities: [],
  filters: {
    day: 'all',
    type: 'all'
  }
};

const DAY_COLORS = ['#ff6b6b', '#ff3d71', '#2ec4b6', '#ffd166', '#6c63ff', '#ff8fab'];

const PLACE_CATEGORY_DEFINITIONS = [
  { key: 'culture', label: 'Culture', keywords: /(museum|musee|gallery|art|theatre|theater|monument|historic|heritage|castle|palace|church|cathedral|temple|mosque|synagogue|memorial|archaeolog|cultural)/i },
  { key: 'nature', label: 'Nature', keywords: /(park|garden|forest|beach|waterfall|trail|viewpoint|view point|lookout|scenic|nature|hill|peak|mountain)/i },
  { key: 'food', label: 'Restauration', keywords: /(restaurant|cafe|coffee|bar|pub|bakery|bistro|brasserie|fast food|food court|ice cream|pizzeria|trattoria)/i },
  { key: 'lodging', label: 'Logement', keywords: /(hotel|hostel|guest house|guesthouse|motel|accommodation|lodging|airbnb|apartment)/i },
  { key: 'transport', label: 'Transport', keywords: /(station|airport|bus station|bus stop|tram|metro|subway|train|ferry|parking|transport)/i },
  { key: 'shopping', label: 'Shopping', keywords: /(shop|market|mall|supermarket|retail|boutique|store)/i },
  { key: 'viewpoint', label: 'Point de vue', keywords: /(viewpoint|view point|panorama|lookout|scenic|observatory)/i }
];

const PROXIMITY_CLUSTER_KM = 0.35;
const WALKING_SPEED_KMH = 4.5;

let map = null;
let markerLayer = null;
let traceLayer = null;
let renderSequence = 0;

// Gere la logique principale de 'escapeHtml'.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Met a jour l'etat pilote par 'setNote'.
function setNote(message, kind = 'info') {
  const note = document.getElementById('carte-note');
  if (!note) return;
  note.classList.remove('is-success', 'is-error');
  if (kind === 'success') note.classList.add('is-success');
  if (kind === 'error') note.classList.add('is-error');
  note.textContent = message || '';
}

// Formate la valeur traitee par 'formatDate'.
function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

// Formate une duree en minutes pour l'affichage.
function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}min`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}min`;
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

// Analyse l'entree geree par 'parseDateKey'.
function parseDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

// Formate la valeur traitee par 'formatDateKeyFromUtc'.
function formatDateKeyFromUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Cree les donnees gerees par 'createDateRange'.
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

// Normalise les donnees pour 'normalizeActivityDate'.
function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

// Gere la logique principale de 'toTimeDisplayValue'.
function toTimeDisplayValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return match ? match[1] : '';
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

// Normalise un texte pour la recherche de mots-clés.
function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Retourne la categorie de lieu la plus probable.
function inferPlaceCategory(activity, geocodeData) {
  const text = normalizeForMatch([
    activity?.name,
    activity?.address,
    activity?.description,
    geocodeData?.className,
    geocodeData?.typeName,
    geocodeData?.displayName
  ].filter(Boolean).join(' '));

  const match = PLACE_CATEGORY_DEFINITIONS.find((definition) => definition.keywords.test(text));
  return match?.key || 'other';
}

// Retourne l'etiquette conviviale d'une categorie de lieu.
function getPlaceCategoryLabel(key) {
  return PLACE_CATEGORY_DEFINITIONS.find((definition) => definition.key === key)?.label || 'Autre';
}

// Calcule la distance entre deux points geographiques.
function haversineKm(left, right) {
  if (!left || !right) return 0;
  const lat1 = Number(left.lat);
  const lon1 = Number(left.lon);
  const lat2 = Number(right.lat);
  const lon2 = Number(right.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const a = (sinLat * sinLat) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * (sinLon * sinLon);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Estime un temps de trajet en minutes a partir de la distance.
function estimateTravelMinutes(distanceKm) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.max(1, Math.round((distance / WALKING_SPEED_KMH) * 60));
}

// Formate une distance pour l'affichage.
function formatDistanceKm(distanceKm) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance <= 0) return '0 km';
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1).replace('.', ',')} km`;
}

// Cree un segment estime en ligne droite si le calcul d'itineraire echoue.
function buildEstimatedRouteLeg(fromCoords, toCoords) {
  const distanceKm = haversineKm(fromCoords, toCoords);
  const minutes = estimateTravelMinutes(distanceKm);
  const path = [
    [Number(fromCoords?.lat), Number(fromCoords?.lon)],
    [Number(toCoords?.lat), Number(toCoords?.lon)]
  ];

  return {
    distanceKm,
    minutes,
    path,
    source: 'estimate'
  };
}

// Calcule un segment simple A -> B sans suivi de route externe.
async function fetchRouteLeg(fromCoords, toCoords) {
  return buildEstimatedRouteLeg(fromCoords, toCoords);
}

// Retourne une valeur de filtre normalisee.
function getSelectValue(node, fallback = 'all') {
  if (!(node instanceof HTMLSelectElement)) return fallback;
  return node.value || fallback;
}

// Filtre les activites selon le jour, le type et le temps de trajet.
async function applySelectedFilters(items) {
  const dayFilter = tripState.filters.day || 'all';
  const typeFilter = tripState.filters.type || 'all';

  const grouped = groupActivitiesByDay(items);
  const filtered = [];

  const dayEntries = Array.from(grouped.entries());
  for (const [dayKey, dayItems] of dayEntries) {
    if (dayFilter !== 'all' && dayKey !== dayFilter) continue;

    let previousKeptItem = null;
    for (const item of dayItems) {
      if (typeFilter !== 'all' && item.placeCategory !== typeFilter) {
        continue;
      }

      const routeLeg = previousKeptItem
        ? await fetchRouteLeg(previousKeptItem.coords, item.coords)
        : null;

      filtered.push({
        ...item,
        routeLeg
      });
      previousKeptItem = item;
    }
  }

  return filtered;
}

// Regroupe les activites proches les unes des autres.
function clusterNearbyActivities(items) {
  const grouped = groupActivitiesByDay(items);
  const clusters = [];

  grouped.forEach((dayItems, dayKey) => {
    let previousCluster = null;

    dayItems.forEach((item) => {
      const current = {
        dayKey,
        items: [item],
        coords: { lat: item.coords.lat, lon: item.coords.lon },
        schedule: { ...item.schedule },
        routeLeg: item.routeLeg || null
      };

      if (
        previousCluster &&
        haversineKm(previousCluster.coords, current.coords) <= PROXIMITY_CLUSTER_KM
      ) {
        previousCluster.items.push(item);
        const count = previousCluster.items.length;
        previousCluster.coords = {
          lat: ((previousCluster.coords.lat * (count - 1)) + item.coords.lat) / count,
          lon: ((previousCluster.coords.lon * (count - 1)) + item.coords.lon) / count
        };
        previousCluster.routeLeg = previousCluster.routeLeg || current.routeLeg;
        previousCluster.items.sort((left, right) => {
          const leftTime = toMinuteOfDay(left.schedule.startTime);
          const rightTime = toMinuteOfDay(right.schedule.startTime);
          if (leftTime === null && rightTime === null) return 0;
          if (leftTime === null) return 1;
          if (rightTime === null) return -1;
          return leftTime - rightTime;
        });
        return;
      }

      clusters.push(current);
      previousCluster = current;
    });
  });

  const groupedClusters = new Map();
  clusters.forEach((cluster) => {
    const bucket = groupedClusters.get(cluster.dayKey) || [];
    bucket.push(cluster);
    groupedClusters.set(cluster.dayKey, bucket);
  });

  groupedClusters.forEach((dayClusters) => {
    dayClusters.forEach((cluster, index) => {
      if (index === 0) {
        cluster.routeLeg = null;
        return;
      }

      if (!cluster.routeLeg) {
        const previous = dayClusters[index - 1];
        cluster.routeLeg = buildEstimatedRouteLeg(previous.coords, cluster.coords);
      }
    });
  });

  return Array.from(groupedClusters.values()).flat();
}

// Retourne l'information calculee par 'getActivitySchedule'.
function getActivitySchedule(item) {
  const metadata = readScheduleMetadata(item?.description);
  const date = normalizeActivityDate(metadata?.date || item?.activity_date || '');
  const startTime = toTimeDisplayValue(metadata?.time || '');
  return { date, startTime };
}

// Analyse l'entree geree par 'parseCoordsFromMapUrl'.
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

// Gere la logique principale de 'makeAddressCacheKey'.
function makeAddressCacheKey(address) {
  return String(address || '').trim().toLowerCase();
}

// Charge les donnees necessaires pour 'loadGeocodeCache'.
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

// Gere la logique principale de 'saveGeocodeCache'.
function saveGeocodeCache(cache) {
  try {
    localStorage.setItem('voygo_geocode_cache', JSON.stringify(cache));
  } catch {
    // no-op
  }
}

// Gere la logique principale de 'geocodeAddress'.
async function geocodeAddress(address, destination, cache) {
  const key = makeAddressCacheKey(address);
  if (!key) return null;

  const cached = cache[key];
  if (cached && Number.isFinite(Number(cached.lat)) && Number.isFinite(Number(cached.lon))) {
    return { lat: Number(cached.lat), lon: Number(cached.lon), className: cached.className || '', typeName: cached.typeName || '', displayName: cached.displayName || '' };
  }

  const queryParts = [String(address || '').trim(), String(destination || '').trim()].filter(Boolean);
  if (!queryParts.length) return null;

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    `q=${encodeURIComponent(queryParts.join(', '))}` +
    '&format=jsonv2&addressdetails=1&namedetails=1&extratags=1&limit=1';

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

    const result = {
      lat,
      lon,
      className: String(top?.class || '').trim(),
      typeName: String(top?.type || '').trim(),
      displayName: String(top?.display_name || '').trim()
    };

    cache[key] = result;
    return result;
  } catch {
    return null;
  }
}

// Applique les mises a jour de 'updateMeta'.
function updateMeta() {
  const nameNode = document.getElementById('carte-trip-name');
  const datesNode = document.getElementById('carte-dates');

  if (nameNode) {
    nameNode.textContent = tripState.destination || '-';
  }

  if (datesNode) {
    const from = formatDate(tripState.startDate);
    const to = formatDate(tripState.endDate);
    datesNode.textContent = from && to ? `${from} - ${to}` : '-';
  }
}

// Applique les mises a jour de 'updateNavigationLinks'.
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

// Gere la logique principale de 'buildDayOptionLabel'.
function buildDayOptionLabel(day, index) {
  const dateLabel = formatDate(day);
  return `Jour ${index + 1}${dateLabel ? ` - ${dateLabel}` : ''}`;
}

// Gere la logique principale de 'populateDayFilter'.
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

// Gere la logique principale de 'populateTypeFilter'.
function populateTypeFilter() {
  const filter = document.getElementById('carte-type-filter');
  if (!(filter instanceof HTMLSelectElement)) return;

  const availableTypes = new Set(
    (tripState.localizedActivities || [])
      .map((item) => item.placeCategory)
      .filter(Boolean)
  );

  filter.innerHTML = '<option value="all">Tous les types</option>';
  PLACE_CATEGORY_DEFINITIONS.forEach((definition) => {
    if (!availableTypes.has(definition.key)) return;
    const option = document.createElement('option');
    option.value = definition.key;
    option.textContent = definition.label;
    filter.appendChild(option);
  });

  if (availableTypes.has('other')) {
    const option = document.createElement('option');
    option.value = 'other';
    option.textContent = getPlaceCategoryLabel('other');
    filter.appendChild(option);
  }
}

// Gere la logique principale de 'ensureMap'.
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

// Gere la logique principale de 'groupActivitiesByDay'.
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

// Construit les informations textuelles d'un cluster.
function buildClusterPopup(cluster, dayKey, color, index) {
  const items = cluster.items || [];
  const title = items.length > 1
    ? `${items.length} lieux regroupes`
    : (items[0]?.name || 'Activite');
  const routeLabel = cluster.routeLeg
    ? `Trajet estime: ${formatDuration(cluster.routeLeg.minutes)} (${formatDistanceKm(cluster.routeLeg.distanceKm)})`
    : 'Premier point de la journee';

  const listHtml = items.map((item) => {
    const scheduleLabel = item.schedule.startTime ? item.schedule.startTime : 'Heure non precisee';
    const typeLabel = getPlaceCategoryLabel(item.placeCategory);
    return `
      <li>
        <strong>${escapeHtml(item.name || 'Activite')}</strong><br>
        ${escapeHtml(item.address || 'Adresse non renseignee')}<br>
        ${escapeHtml(typeLabel)} · ${escapeHtml(scheduleLabel)}
      </li>
    `;
  }).join('');

  return `
    <strong>${escapeHtml(title)}</strong><br>
    ${escapeHtml(dayKey === 'no-date' ? 'Date non renseignee' : formatDate(dayKey))}<br>
    ${items.length > 1 ? `<span class="carte-cluster-count">${items.length} points regroupes</span>` : ''}
    <ol class="carte-cluster-list">${listHtml}</ol>
    <div class="carte-route-summary"><strong>Etape ${index + 1}</strong><br>${escapeHtml(routeLabel)}</div>
  `;
}

// Construit un marqueur adapte selon le nombre d'activites regroupees.
function createClusterMarker(cluster, color, dayKey, index) {
  if (cluster.items.length > 1) {
    return window.L.marker([cluster.coords.lat, cluster.coords.lon], {
      icon: window.L.divIcon({
        className: 'carte-cluster-wrapper',
        html: `<span class="carte-cluster-icon carte-cluster-icon--wide">${cluster.items.length}</span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      })
    }).bindPopup(buildClusterPopup(cluster, dayKey, color, index));
  }

  const marker = window.L.circleMarker([cluster.coords.lat, cluster.coords.lon], {
    radius: 7,
    color,
    weight: 2,
    fillColor: color,
    fillOpacity: 0.85
  });

  marker.bindPopup(buildClusterPopup(cluster, dayKey, color, index));
  return marker;
}

// Applique les mises a jour de 'updateStats'.
function updateStats(entries) {
  const statsNode = document.getElementById('carte-stats');
  if (!statsNode) return;

  if (entries.length === 0) {
    statsNode.innerHTML = '';
    return;
  }

  const tracedDays = new Set(entries.map((item) => item.schedule?.date).filter((dayKey) => dayKey && dayKey !== 'no-date')).size;
  const totalDistanceKm = entries.reduce((sum, item) => sum + Number(item.routeLeg?.distanceKm || 0), 0);
  const totalTravelMinutes = entries.reduce((sum, item) => sum + Number(item.routeLeg?.minutes || 0), 0);

  statsNode.innerHTML = `
    <span class="carte-chip"><i class='bx bx-map-pin'></i> ${entries.length} activite(s)</span>
    <span class="carte-chip"><i class='bx bx-route'></i> ${tracedDays} jour(s) traces</span>
    <span class="carte-chip"><i class='bx bx-time-five'></i> ${formatDuration(totalTravelMinutes)} de trajet estime</span>
    <span class="carte-chip"><i class='bx bx-street-view'></i> ${formatDistanceKm(totalDistanceKm)} d'itineraire</span>
  `;
}

// Construit le rendu pour 'renderMap'.
async function renderMap() {
  const currentRenderSequence = ++renderSequence;
  ensureMap();
  if (!map || !markerLayer || !traceLayer) return;

  markerLayer.clearLayers();
  traceLayer.clearLayers();

  const emptyNode = document.getElementById('carte-empty');
  const allItems = tripState.localizedActivities || [];
  const withCoords = allItems.filter((item) => Number.isFinite(item.coords?.lat) && Number.isFinite(item.coords?.lon));
  const filteredItems = await applySelectedFilters(withCoords);
  if (currentRenderSequence !== renderSequence) return;

  if (emptyNode) {
    emptyNode.hidden = filteredItems.length > 0;
    emptyNode.textContent = filteredItems.length > 0
      ? 'Aucun point ne correspond aux filtres selectionnes.'
      : 'Aucune activite localisable pour ce voyage.';
  }

  updateStats(filteredItems);

  if (!filteredItems.length) return;

  const grouped = groupActivitiesByDay(filteredItems);
  const bounds = [];
  const dayKeys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  dayKeys.forEach((dayKey, dayIndex) => {
    const dayItems = grouped.get(dayKey) || [];
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length];

    dayItems.forEach((item, index) => {
      const marker = window.L.circleMarker([item.coords.lat, item.coords.lon], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.85
      });

      const timeLabel = item.schedule?.startTime ? item.schedule.startTime : 'Heure non precisee';
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

    for (let index = 1; index < dayItems.length; index += 1) {
      const segment = dayItems[index]?.routeLeg || null;
      const previous = dayItems[index - 1];
      const current = dayItems[index];
      const path = Array.isArray(segment?.path) && segment.path.length >= 2
        ? segment.path
        : [
            [previous.coords.lat, previous.coords.lon],
            [current.coords.lat, current.coords.lon]
          ];

      const polyline = window.L.polyline(path, {
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
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// Charge les donnees necessaires pour 'loadTrip'.
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

// Charge les donnees necessaires pour 'loadActivities'.
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
    const geocodeData = coordsFromUrl || await geocodeAddress(activity?.address, tripState.destination, geocodeCache);
    const coords = geocodeData;
    if (!coords) continue;

    localized.push({
      ...activity,
      schedule,
      coords,
      placeCategory: inferPlaceCategory(activity, coordsFromUrl ? null : geocodeData)
    });
  }

  saveGeocodeCache(geocodeCache);
  tripState.localizedActivities = localized;
}

// Synchronise les filtres de la carte avec l'etat courant.
function bindFilters() {
  const dayFilter = document.getElementById('carte-day-filter');
  const typeFilter = document.getElementById('carte-type-filter');

  if (dayFilter instanceof HTMLSelectElement) {
    dayFilter.addEventListener('change', () => {
      tripState.filters.day = getSelectValue(dayFilter, 'all');
      void renderMap();
    });
  }

  if (typeFilter instanceof HTMLSelectElement) {
    typeFilter.addEventListener('change', () => {
      tripState.filters.type = getSelectValue(typeFilter, 'all');
      void renderMap();
    });
  }

  tripState.filters.day = getSelectValue(dayFilter, 'all');
  tripState.filters.type = getSelectValue(typeFilter, 'all');
}

// Initialise le bloc fonctionnel 'initCartePage'.
export async function initCartePage() {
  try {
    await loadTrip();
    updateMeta();
    updateNavigationLinks();

    await loadActivities();
    populateDayFilter();
    populateTypeFilter();
    bindFilters();

    await renderMap();

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
