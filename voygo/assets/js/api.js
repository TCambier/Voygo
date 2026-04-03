/**
 * @voygo-doc
 * Module: api
 * Fichier: voygo\assets\js\api.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
const defaultHeaders = {
  'Content-Type': 'application/json'
};

// Extrait un cookie simple depuis document.cookie.
function getCookie(name) {
  const cookieSource = String(document.cookie || '');
  const pairs = cookieSource.split(';');

  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.trim().split('=');
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }

  return null;
}

function isUnsafeMethod(method = 'GET') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  return normalizedMethod === 'POST' || normalizedMethod === 'PUT' || normalizedMethod === 'PATCH' || normalizedMethod === 'DELETE';
}

// Gere la logique principale de 'apiFetch'.
async function apiFetch(path, options = {}) {
  const { method = 'GET', body, headers } = options;
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const nextHeaders = { ...defaultHeaders, ...(headers || {}) };

  if (isUnsafeMethod(normalizedMethod)) {
    const csrfToken = getCookie('voygo_csrf_token');
    if (csrfToken) {
      nextHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(path, {
    method: normalizedMethod,
    headers: nextHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const message = data?.error || response.statusText || 'Erreur API';
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  delete: (path) => apiFetch(path, { method: 'DELETE' })
};

// Recupere les donnees distantes pour 'fetchCurrentUser'.
export async function fetchCurrentUser() {
  try {
    const result = await api.get('/api/auth/me');
    return result?.user || null;
  } catch (error) {
    return null;
  }
}
