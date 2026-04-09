/**
 * @voygo-doc
 * Module: country
 * Fichier: voygo\models\country.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const GEODB_BASE_URL = 'https://geodb-free-service.wirefreethought.com/v1/geo';
const TOTAL_LIMIT = 10;
const GEODB_CITY_LIMIT = 10;
const GEODB_COUNTRY_LIMIT = 6;
const LANGUAGE_CODE = 'fr';

// Normalise les donnees pour 'normalizeText'.
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Recupere les donnees distantes pour 'fetchNominatim'.
async function fetchNominatim(query, signal) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    dedupe: '1',
    limit: String(TOTAL_LIMIT * 2),
    'accept-language': LANGUAGE_CODE
  });

  try {
    const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, { signal });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

// Recupere les donnees distantes pour 'fetchGeoDb'.
async function fetchGeoDb(path, signal) {
  try {
    const response = await fetch(`${GEODB_BASE_URL}${path}`, { signal });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

// Formate une suggestion issue de Nominatim.
function toSuggestion(item) {
  const address = item?.address || {};
  const district = address.city_district || address.borough || address.suburb || address.neighbourhood || address.quarter || '';
  const city = address.city || address.town || address.village || address.municipality || address.county || address.state_district || '';
  const country = address.country || '';
  const baseLabel = String(item?.display_name || '').split(',').map((part) => part.trim()).filter(Boolean);

  // On privilegie une etiquette courte mais descriptive pour les grandes villes et arrondissements.
  const prioritized = [district, city, country].filter(Boolean);
  const fallbackLabel = baseLabel.slice(0, 3).join(', ');
  const label = prioritized.length ? prioritized.join(', ') : fallbackLabel;

  if (!label) return null;

  return {
    label,
    value: label,
    kind: item?.type || item?.addresstype || 'place',
    importance: Number(item?.importance || 0),
    placeRank: Number(item?.place_rank || 99)
  };
}

// Transforme une ville GeoDB en suggestion.
function toGeoDbCitySuggestion(city) {
  const parts = [city?.name, city?.region, city?.country].filter(Boolean);
  const label = parts.join(', ');
  if (!label) return null;
  return {
    label,
    value: label,
    kind: 'city',
    importance: Number(city?.population || 0) / 1000000,
    placeRank: 20
  };
}

// Transforme un pays GeoDB en suggestion.
function toGeoDbCountrySuggestion(country) {
  const label = String(country?.name || '').trim();
  if (!label) return null;
  return {
    label,
    value: label,
    kind: 'country',
    importance: 0,
    placeRank: 30
  };
}

// Retient les resultats pertinents pour la saisie destination.
function isLocationSuggestion(item) {
  const kind = String(item?.kind || '').toLowerCase();
  return [
    'city',
    'town',
    'village',
    'municipality',
    'hamlet',
    'borough',
    'suburb',
    'quarter',
    'neighbourhood',
    'administrative',
    'county',
    'state_district',
    'country',
    'state',
    'province',
    'region'
  ].includes(kind);
}

// Retourne les suggestions Nominatim.
async function searchNominatim(query, signal) {
  const rows = await fetchNominatim(query, signal);
  if (!Array.isArray(rows)) return [];
  return rows.map(toSuggestion).filter(Boolean).filter(isLocationSuggestion);
}

// Retourne les suggestions GeoDB (villes + pays).
async function searchGeoDb(query, signal) {
  const encodedQuery = encodeURIComponent(query);
  const [citiesResponse, countriesResponse] = await Promise.all([
    fetchGeoDb(`/cities?namePrefix=${encodedQuery}&limit=${GEODB_CITY_LIMIT}&languageCode=${LANGUAGE_CODE}`, signal),
    fetchGeoDb(`/countries?namePrefix=${encodedQuery}&limit=${GEODB_COUNTRY_LIMIT}&languageCode=${LANGUAGE_CODE}`, signal)
  ]);

  const cities = Array.isArray(citiesResponse?.data) ? citiesResponse.data : [];
  const countries = Array.isArray(countriesResponse?.data) ? countriesResponse.data : [];

  return [
    ...cities.map(toGeoDbCitySuggestion).filter(Boolean),
    ...countries.map(toGeoDbCountrySuggestion).filter(Boolean)
  ];
}

// Fusionne les suggestions et supprime les doublons forts.
function mergeSuggestions(query, suggestions) {
  const queryNorm = normalizeText(query);
  const seen = new Set();

  return suggestions
    .filter((item) => {
      const normalized = normalizeText(item.label);
      if (!normalized.includes(queryNorm)) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .sort((a, b) => {
      const aNorm = normalizeText(a.label);
      const bNorm = normalizeText(b.label);
      const aStarts = aNorm.startsWith(queryNorm) ? 0 : 1;
      const bStarts = bNorm.startsWith(queryNorm) ? 0 : 1;
      const aHasDistrict = /arrondissement|district|quartier|borough|suburb|neighbourhood/.test(aNorm) ? 0 : 1;
      const bHasDistrict = /arrondissement|district|quartier|borough|suburb|neighbourhood/.test(bNorm) ? 0 : 1;
      const aImportance = Number.isFinite(a.importance) ? a.importance : 0;
      const bImportance = Number.isFinite(b.importance) ? b.importance : 0;
      const aRank = Number.isFinite(a.placeRank) ? a.placeRank : 99;
      const bRank = Number.isFinite(b.placeRank) ? b.placeRank : 99;
      return (
        aStarts - bStarts ||
        aHasDistrict - bHasDistrict ||
        bImportance - aImportance ||
        aRank - bRank ||
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
      );
    })
    .slice(0, TOTAL_LIMIT)
    .map(({ label, value, kind }) => ({ label, value, kind }));
}

// Gere la logique principale de 'searchCountries'.
export async function searchCountries(query, signal) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  let nominatimSuggestions = [];
  let geoDbSuggestions = [];

  try {
    [nominatimSuggestions, geoDbSuggestions] = await Promise.all([
      searchNominatim(trimmedQuery, signal),
      searchGeoDb(trimmedQuery, signal)
    ]);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
  }

  const suggestions = mergeSuggestions(trimmedQuery, [
    ...nominatimSuggestions,
    ...geoDbSuggestions
  ]);

  if (!suggestions.length) return [];

  return suggestions;
}
