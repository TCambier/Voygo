/**
 * @voygo-doc
 * Module: index
 * Fichier: server\index.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import app from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Voygo server running on http://localhost:${config.port}`);
});
