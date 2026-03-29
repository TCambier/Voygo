/**
 * @voygo-doc
 * Module: indexController
 * Fichier: voygo\controllers\indexController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
// app.js - main entry point for the application
// This file can import controllers and initialize the UI. It is loaded
// from your HTML with `type="module"`.

import { initCountryAutocomplete } from './countryController.js';
import { initTravelerStepper } from './tripFormController.js';
import { initLandingTripCreation } from './landingTripController.js';
// import * as tripCtrl from '../controllers/tripController.js';
// ... import other controllers as needed

// simple smoke test to ensure the backend responds
async function testConnection() {
  try {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('Health check failed');
    console.log('Backend OK');
  } catch (err) {
    console.warn('Backend health check failed', err);
  }
}

testConnection();
initCountryAutocomplete();
initTravelerStepper();
initLandingTripCreation();
