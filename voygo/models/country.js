function normalizeText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export async function searchCountries(query, signal) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return [];

  const response = await fetch(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(trimmedQuery)}?fields=name,translations`,
    { signal }
  );

  if (!response.ok) return [];

  const countries = await response.json();
  const queryNorm = normalizeText(trimmedQuery);

  const names = countries
    .map((country) => {
      const french = country?.translations?.fra?.common;
      return french || country?.name?.common || '';
    })
    .filter(Boolean);

  const unique = [...new Set(names)];
  return unique
    .filter((name) => normalizeText(name).includes(queryNorm))
    .sort((a, b) => {
      const aStarts = normalizeText(a).startsWith(queryNorm) ? 0 : 1;
      const bStarts = normalizeText(b).startsWith(queryNorm) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b, 'fr', { sensitivity: 'base' });
    })
    .slice(0, 8);
}
