import { config } from '../config.js';
import { getSupabaseForUser } from '../services/supabase.js';

async function ensureTripOwnership(client, tripId, userId) {
  const { data, error } = await client
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;
  return true;
}

function readScheduleMetadataFromDescription(description) {
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

function toMinuteOfDay(timeValue) {
  const raw = String(timeValue || '');
  const match = raw.trim().match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

function extractScheduleFromActivity(activity) {
  const metadata = readScheduleMetadataFromDescription(activity?.description);
  const date = normalizeActivityDate(metadata?.date || activity?.activity_date || '');
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

function extractScheduleFromTransport(transport) {
  const date = normalizeActivityDate(transport?.travel_date || '');
  const startTime = String(transport?.travel_time || '').trim();
  const durationRaw = Number(transport?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 0;

  if (!date || !startTime || toMinuteOfDay(startTime) === null || durationMinutes <= 0) return null;

  return {
    date,
    startTime,
    durationMinutes
  };
}

function hasScheduleConflict(existingActivities, newSchedule) {
  const newStart = toMinuteOfDay(newSchedule.startTime);
  if (newStart === null) return false;
  const newEnd = newStart + newSchedule.durationMinutes;

  return (existingActivities || []).some((item) => {
    const schedule = extractScheduleFromActivity(item);
    if (!schedule || schedule.date !== newSchedule.date) return false;

    const existingStart = toMinuteOfDay(schedule.startTime);
    if (existingStart === null) return false;
    const existingEnd = existingStart + schedule.durationMinutes;
    return newStart < existingEnd && existingStart < newEnd;
  });
}

function hasTransportConflict(existingTransports, newSchedule) {
  const newStart = toMinuteOfDay(newSchedule.startTime);
  if (newStart === null) return false;
  const newEnd = newStart + newSchedule.durationMinutes;

  return (existingTransports || []).some((item) => {
    const schedule = extractScheduleFromTransport(item);
    if (!schedule || schedule.date !== newSchedule.date) return false;

    const existingStart = toMinuteOfDay(schedule.startTime);
    if (existingStart === null) return false;
    const existingEnd = existingStart + schedule.durationMinutes;
    return newStart < existingEnd && existingStart < newEnd;
  });
}

function toTopRatedPlaces(places, limit) {
  return (places || [])
    .map((place) => ({
      name: place?.name || 'Activite',
      address: place?.address || null,
      description: place?.description || null,
      rating: Number.isFinite(Number(place?.rating)) ? Number(place.rating) : null,
      reviews_count: Number.isFinite(Number(place?.reviews_count)) ? Number(place.reviews_count) : 0,
      source: 'opentripmap',
      source_place_id: place?.source_place_id || null,
      map_url: place?.map_url || null
    }))
    .sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.reviews_count || 0) - (a.reviews_count || 0);
    })
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function sanitizeLang(langRaw) {
  const lang = String(langRaw || 'en').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(lang)) return 'en';
  return lang;
}

function getLangCandidates(preferredLang) {
  const preferred = sanitizeLang(preferredLang);
  return Array.from(new Set([preferred, 'en', 'ru']));
}

function sanitizeKinds(kindsRaw) {
  const raw = String(kindsRaw || '').trim().toLowerCase();
  if (!raw) return '';

  const cleaned = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^[a-z_]+$/.test(item));

  if (!cleaned.length) return '';
  return Array.from(new Set(cleaned)).join(',');
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(eme|er|e)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeDestination(value) {
  const stopwords = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'd', 'l', 'arrondissement']);
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token && token.length >= 2 && !stopwords.has(token));
}

function scoreGeocodeCandidate(candidate, tokens) {
  const haystack = normalizeForMatch([
    candidate?.display_name,
    candidate?.name,
    candidate?.address?.city,
    candidate?.address?.town,
    candidate?.address?.state,
    candidate?.address?.country
  ].filter(Boolean).join(' '));

  if (!haystack) return 0;

  let matches = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matches += 1;
  }

  const ratio = tokens.length ? matches / tokens.length : 0;
  const importance = Number.isFinite(Number(candidate?.importance)) ? Number(candidate.importance) : 0;
  return ratio + Math.min(importance, 1) * 0.2;
}

async function resolveDestinationCoordsWithNominatim(destination) {
  const query = String(destination || '').trim();
  const tokens = tokenizeDestination(query);
  if (!query || !tokens.length) {
    return null;
  }

  const url =
    'https://nominatim.openstreetmap.org/search?' +
    `q=${encodeURIComponent(query)}` +
    '&format=jsonv2&addressdetails=1&limit=8';

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Voygo/1.0'
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !payload.length) {
    return null;
  }

  const ranked = payload
    .map((candidate) => ({
      candidate,
      score: scoreGeocodeCandidate(candidate, tokens)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.45) {
    return null;
  }

  const lat = Number(best.candidate?.lat);
  const lon = Number(best.candidate?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

async function resolveDestinationCoords(destination, apiKey, preferredLang) {
  let lastMessage = 'Destination introuvable pour OpenTripMap.';

  for (const lang of getLangCandidates(preferredLang)) {
    const url = `https://api.opentripmap.com/0.1/${lang}/places/geoname?name=${encodeURIComponent(destination)}&apikey=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url);
    const payload = await response.json();
    if (response.ok && Number.isFinite(Number(payload?.lat)) && Number.isFinite(Number(payload?.lon))) {
      return { lat: Number(payload.lat), lon: Number(payload.lon), lang };
    }
    lastMessage = payload?.error || payload?.message || lastMessage;
  }

  throw new Error(lastMessage);
}

function toAddressLabel(details, fallback) {
  const address = details?.address;
  if (!address || typeof address !== 'object') return fallback || null;
  const parts = [address.road, address.house_number, address.city, address.county, address.state, address.country]
    .filter((part) => typeof part === 'string' && part.trim());
  return parts.length ? parts.join(', ') : (fallback || null);
}

function toFrenchDescription(details) {
  const wiki = details?.wikipedia_extracts?.text;
  if (typeof wiki === 'string' && wiki.trim()) {
    return wiki.trim();
  }
  const descr = details?.info?.descr;
  if (typeof descr === 'string' && descr.trim()) {
    return descr.trim();
  }
  return null;
}

async function enrichPlacesWithDetails(places, apiKey, preferredLang) {
  const langs = getLangCandidates(preferredLang);
  const tasks = places.map(async (place) => {
    if (!place?.source_place_id) return place;

    for (const lang of langs) {
      try {
        const url = `https://api.opentripmap.com/0.1/${lang}/places/xid/${encodeURIComponent(place.source_place_id)}?apikey=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url);
        const payload = await response.json();
        if (!response.ok) continue;
        return {
          ...place,
          lang,
          address: toAddressLabel(payload, place.address),
          description: toFrenchDescription(payload) || place.description || null
        };
      } catch {
        continue;
      }
    }

    return place;
  });

  return Promise.all(tasks);
}

async function fetchOpenTripMapPlaces(lat, lon, apiKey, limit, options = {}) {
  const lang = sanitizeLang(options.lang);
  const kinds = sanitizeKinds(options.kinds);
  const radius = 25000;
  const rawLimit = Math.max(limit * 3, 30);
  let payload = null;
  let usedLang = lang;
  let lastMessage = 'Impossible de charger les recommandations OpenTripMap.';

  for (const candidateLang of getLangCandidates(lang)) {
    const url =
      `https://api.opentripmap.com/0.1/${candidateLang}/places/radius?radius=${radius}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&lat=${encodeURIComponent(lat)}` +
      '&rate=2&format=json' +
      `&limit=${encodeURIComponent(rawLimit)}` +
      (kinds ? `&kinds=${encodeURIComponent(kinds)}` : '') +
      `&apikey=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = await response.json();
    if (response.ok && Array.isArray(data)) {
      payload = data;
      usedLang = candidateLang;
      break;
    }

    lastMessage = data?.error || data?.message || lastMessage;
  }

  if (!Array.isArray(payload)) {
    throw new Error(lastMessage);
  }

  const ranked = payload
    .filter((item) => item && typeof item.name === 'string' && item.name.trim())
    .map((item) => {
      const rate = Number(item.rate);
      const normalizedRating = Number.isFinite(rate) ? Math.min(5, Math.max(1, rate + 2)) : null;
      return {
        name: item.name,
        address: item.kinds ? item.kinds.replace(/_/g, ' ') : null,
        rating: normalizedRating,
        reviews_count: null,
        source_place_id: item.xid || null,
        lang: usedLang,
        map_url: `https://www.openstreetmap.org/?mlat=${item.point?.lat || lat}&mlon=${item.point?.lon || lon}#map=14/${item.point?.lat || lat}/${item.point?.lon || lon}`,
        raw_rate: Number.isFinite(rate) ? rate : 0,
        dist: Number.isFinite(Number(item.dist)) ? Number(item.dist) : Number.MAX_SAFE_INTEGER
      };
    })
    .sort((a, b) => {
      const ratingDiff = (b.raw_rate || 0) - (a.raw_rate || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (a.dist || 0) - (b.dist || 0);
    })
    .slice(0, limit);

  return enrichPlacesWithDetails(ranked, apiKey, usedLang);
}

export async function suggestActivities(req, res) {
  const destination = String(req.query.destination || '').trim();
  const lang = sanitizeLang(req.query.lang);
  const kinds = sanitizeKinds(req.query.kinds);
  const limitRaw = Number.parseInt(String(req.query.limit || '10'), 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 40)) : 10;

  if (!destination) {
    return res.status(400).json({ error: 'La destination est requise.' });
  }

  if (!config.openTripMapApiKey) {
    return res.status(503).json({ error: 'OPENTRIPMAP_API_KEY manquant sur le serveur.' });
  }

  try {
    const nominatimCoords = await resolveDestinationCoordsWithNominatim(destination);
    const fallbackCoords = nominatimCoords
      ? null
      : await resolveDestinationCoords(destination, config.openTripMapApiKey, lang);

    const lat = nominatimCoords?.lat ?? fallbackCoords?.lat;
    const lon = nominatimCoords?.lon ?? fallbackCoords?.lon;
    const resolvedLang = fallbackCoords?.lang || lang;

    const places = await fetchOpenTripMapPlaces(lat, lon, config.openTripMapApiKey, limit, { lang: resolvedLang, kinds });
    const data = toTopRatedPlaces(places, limit);
    return res.json({ data });
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Erreur serveur pendant la recherche de lieux.' });
  }
}

export async function listActivitiesByTrip(req, res) {
  const { tripId } = req.params;
  const client = getSupabaseForUser(req.accessToken);

  const ownsTrip = await ensureTripOwnership(client, tripId, req.user.id);
  if (!ownsTrip) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  const { data, error } = await client
    .from('activities')
    .select('id,trip_id,name,address,description,activity_date,rating,reviews_count,estimated_cost,source,source_place_id,map_url,created_at')
    .eq('trip_id', tripId)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message || 'Chargement impossible.' });
  }

  return res.json({ data: data || [] });
}

export async function createActivity(req, res) {
  const { tripId } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const ownsTrip = await ensureTripOwnership(client, tripId, req.user.id);
  if (!ownsTrip) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  const insertPayload = {
    trip_id: tripId,
    user_id: req.user.id,
    name: String(payload.name || '').trim() || 'Activite',
    address: payload.address || null,
    description: payload.description || null,
    activity_date: payload.activity_date || null,
    rating: payload.rating ?? null,
    reviews_count: payload.reviews_count ?? null,
    estimated_cost: payload.estimated_cost ?? null,
    source: payload.source || 'manual',
    source_place_id: payload.source_place_id || null,
    map_url: payload.map_url || null
  };

  const newSchedule = extractScheduleFromActivity(insertPayload);
  if (newSchedule) {
    const [activitiesResult, transportsResult] = await Promise.all([
      client
        .from('activities')
        .select('id,activity_date,description')
        .eq('trip_id', tripId)
        .eq('user_id', req.user.id),
      client
        .from('transports')
        .select('id,travel_date,travel_time,duration_minutes')
        .eq('trip_id', tripId)
        .eq('user_id', req.user.id)
    ]);

    if (activitiesResult.error || transportsResult.error) {
      return res.status(400).json({ error: activitiesResult.error?.message || transportsResult.error?.message || 'Verification de conflit impossible.' });
    }

    if (hasScheduleConflict(activitiesResult.data, newSchedule)) {
      return res.status(409).json({ error: 'Un autre activite est deja planifiee sur ce creneau.' });
    }

    if (hasTransportConflict(transportsResult.data, newSchedule)) {
      return res.status(409).json({ error: 'Un transport est deja planifie sur ce creneau.' });
    }
  }

  const { data, error } = await client
    .from('activities')
    .insert(insertPayload)
    .select('id,trip_id,name,address,description,activity_date,rating,reviews_count,estimated_cost,source,source_place_id,map_url,created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

export async function updateActivity(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const { data, error } = await client
    .from('activities')
    .update(payload)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('id,trip_id,name,address,description,activity_date,rating,reviews_count,estimated_cost,source,source_place_id,map_url,created_at')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ data });
}

export async function deleteActivity(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);

  const { error } = await client
    .from('activities')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression impossible.' });
  }

  return res.json({ success: true });
}
