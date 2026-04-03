/**
 * @voygo-doc
 * Module: index
 * Fichier: server\index.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { config } from './config.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';

if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`Global fetch proxy enabled: ${proxyUrl}`);
}

const { default: app } = await import('./app.js');

app.listen(config.port, () => {
  console.log(`Voygo server running on http://localhost:${config.port}`);
});
