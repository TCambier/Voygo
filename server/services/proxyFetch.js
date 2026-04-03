/**
 * @voygo-doc
 * Module: proxyFetch
 * Fichier: server\services\proxyFetch.js
 * Role: Fournit un fetch Node force via proxy pour tout le serveur.
 */
import { ProxyAgent, fetch as undiciFetch } from 'undici';

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

export const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

export async function proxyFetch(input, init = {}) {
  // Si un proxy est configuré, l'utiliser. Sinon, pas de proxy
  if (proxyAgent) {
    return undiciFetch(input, {
      ...init,
      dispatcher: proxyAgent
    });
  }
  // Pas de proxy configuré, utiliser le fetch standard
  return undiciFetch(input, init);
}
