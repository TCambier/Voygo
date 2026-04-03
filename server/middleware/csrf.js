/**
 * @voygo-doc
 * Module: csrf
 * Fichier: server\middleware\csrf.js
 * Role: Protection CSRF (double submit cookie) pour les routes API mutatives.
 */
import crypto from 'crypto';
import { config } from '../config.js';

const CSRF_COOKIE_NAME = 'voygo_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

const csrfCookieOptions = {
  httpOnly: false,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/'
};

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isUnsafeMethod(method = '') {
  const normalizedMethod = String(method || '').toUpperCase();
  return (
    normalizedMethod === 'POST' ||
    normalizedMethod === 'PUT' ||
    normalizedMethod === 'PATCH' ||
    normalizedMethod === 'DELETE'
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');

  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

// Ajoute un cookie CSRF et valide les requetes API mutatives.
export function csrfProtection(req, res, next) {
  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];

  if (!csrfToken) {
    csrfToken = createToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions);
  }

  if (!req.path.startsWith('/api') || !isUnsafeMethod(req.method)) {
    return next();
  }

  const headerToken = req.get(CSRF_HEADER_NAME) || req.get(CSRF_HEADER_NAME.toUpperCase());
  if (!safeEqual(headerToken, csrfToken)) {
    return res.status(403).json({ error: 'CSRF token invalide ou manquant.' });
  }

  return next();
}
