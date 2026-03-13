const GEODB_BASE_URL = 'https://geodb-free-service.wirefreethought.com/v1/geo';
const CITY_LIMIT = 5;
const COUNTRY_LIMIT = 5;
const TOTAL_LIMIT = 8;
const LANGUAGE_CODE = 'fr';

function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatCity(city) {
  const parts = [city?.name, city?.region, city?.country].filter(Boolean);
  return parts.join(', ');
}

function formatCountry(country) {
  return country?.name || '';
}

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

export async function searchCountries(query, signal) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  const queryParam = encodeURIComponent(trimmedQuery);
  const [citiesResponse, countriesResponse] = await Promise.all([
    fetchGeoDb(
      `/cities?namePrefix=${queryParam}&limit=${CITY_LIMIT}&languageCode=${LANGUAGE_CODE}`,
      signal
    ),
    fetchGeoDb(
      `/countries?namePrefix=${queryParam}&limit=${COUNTRY_LIMIT}&languageCode=${LANGUAGE_CODE}`,
      signal
    )
  ]);

  const cities = citiesResponse?.data || [];
  const countries = countriesResponse?.data || [];

  const suggestions = [
    ...cities
      .map((city) => {
        const label = formatCity(city);
        return label ? { label, value: label, kind: 'city' } : null;
      })
      .filter(Boolean),
    ...countries
      .map((country) => {
        const label = formatCountry(country);
        return label ? { label, value: label, kind: 'country' } : null;
      })
      .filter(Boolean)
  ];

  if (!suggestions.length) return [];

  const queryNorm = normalizeText(trimmedQuery);
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
      const aKind = a.kind === 'city' ? 0 : 1;
      const bKind = b.kind === 'city' ? 0 : 1;
      return (
        aStarts - bStarts ||
        aKind - bKind ||
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
      );
    })
    .slice(0, TOTAL_LIMIT);
}
