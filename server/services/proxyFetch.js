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
  process.env.http_proxy ||
  'http://10.1.2.5:8080';

export const proxyAgent = new ProxyAgent(proxyUrl);

export async function proxyFetch(input, init = {}) {
  return undiciFetch(input, {
    ...init,
    dispatcher: proxyAgent
  });
}
