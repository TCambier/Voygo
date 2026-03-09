// app.js - main entry point for the application
// This file can import controllers and initialize the UI. It is loaded
// from your HTML with `type="module"`.

import { supabase } from './supabase.js';
import { initCountryAutocomplete } from '../../controllers/countryController.js';
import { initTravelerStepper } from '../../controllers/tripFormController.js';
import { initLandingTripCreation } from '../../controllers/landingTripController.js';
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

async function initHeaderAccount() {
  const accountLink = document.querySelector('#header-account-link');
  if (!accountLink) return;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return;

    const displayName =
      data.user.user_metadata?.first_name ||
      data.user.email ||
      'Mon compte';

    accountLink.textContent = displayName;
    accountLink.href = 'settings.html';
  } catch (err) {
    console.warn('Unable to resolve auth user for header:', err);
  }
}

testConnection();
initHeaderAccount();
initCountryAutocomplete();
initTravelerStepper();
initLandingTripCreation();
