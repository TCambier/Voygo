/**
 * @voygo-doc
 * Module: cookies
 * Fichier: server\utils\cookies.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { config } from '../config.js';

const serverSessionId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

const baseOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  path: '/'
};

// Met a jour l'etat pilote par 'setAuthCookies'.
export function setAuthCookies(res, session) {
  if (!session) return;
  const maxAge = session.expires_in ? session.expires_in * 1000 : undefined;
  res.cookie('voygo_access_token', session.access_token, { ...baseOptions, maxAge });
  if (session.refresh_token) {
    res.cookie('voygo_refresh_token', session.refresh_token, { ...baseOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  res.cookie('voygo_server_session', serverSessionId, { ...baseOptions, maxAge });
}

export function isServerSessionValid(req) {
  return req.cookies?.voygo_server_session === serverSessionId;
}

// Gere la logique principale de 'clearAuthCookies'.
export function clearAuthCookies(res) {
  res.clearCookie('voygo_access_token', { path: '/' });
  res.clearCookie('voygo_refresh_token', { path: '/' });
  res.clearCookie('voygo_server_session', { path: '/' });
}
