// app.js - main entry point for the application
// This file can import controllers and initialize the UI. It is loaded
// from your HTML with `type="module"`.

import { supabase } from '../assets/js/supabase.js';
import { initCountryAutocomplete } from './countryController.js';
import { initTravelerStepper } from './tripFormController.js';
import { initLandingTripCreation } from './landingTripController.js';
// import * as tripCtrl from '../controllers/tripController.js';
// ... import other controllers as needed

// simple smoke test to ensure the client works
async function testConnection() {
  try {
    const { data, error } = await supabase.from('trips').select('id').limit(1);
    if (error) throw error;
    console.log('Supabase connection OK, sample data:', data);
  } catch (err) {
    console.warn('Supabase test query failed (is the URL/key set?)', err);
  }
}

testConnection();
initCountryAutocomplete();
initTravelerStepper();
initLandingTripCreation();
