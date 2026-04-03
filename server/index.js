/**
 * @voygo-doc
 * Module: index
 * Fichier: server\index.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { config } from './config.js';
import { proxyFetch, proxyAgent } from './services/proxyFetch.js';
import { setGlobalDispatcher } from 'undici';

if (proxyAgent) {
  setGlobalDispatcher(proxyAgent);
  console.log('Global fetch proxy enabled');
} else {
  console.log('No proxy configured - using direct internet access');
}
globalThis.fetch = proxyFetch;

const { default: app } = await import('./app.js');

app.listen(config.port, () => {
  console.log(`Voygo server running on http://localhost:${config.port}`);
});
