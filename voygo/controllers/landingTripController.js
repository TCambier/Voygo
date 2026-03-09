import { supabase } from '../assets/js/supabase.js';
import { createTrip } from './tripController.js';

export function initLandingTripCreation() {
  const countryInput = document.querySelector('#pays');
  const startDateInput = document.querySelector('#start-date');
  const endDateInput = document.querySelector('#end-date');
  const travelersInput = document.querySelector('#voyageurs');
  const createButton = document.querySelector('.btn-creer');

  if (!countryInput || !startDateInput || !endDateInput || !travelersInput || !createButton) {
    return;
  }

  createButton.addEventListener('click', async () => {
    const destination = countryInput.value.trim();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const travelers = parseInt(travelersInput.value, 10) || 1;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    if (authError || !userId) {
      localStorage.setItem(
        'voygo_trip_draft',
        JSON.stringify({
          destination,
          start_date: startDate,
          end_date: endDate,
          travelers
        })
      );
      window.location.href = `login.html?returnTo=${encodeURIComponent('index.html')}`;
      return;
    }

    if (!destination || !startDate || !endDate) {
      alert('Merci de renseigner le pays et les dates du voyage.');
      return;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      alert('La date de debut ne peut pas etre dans le passe.');
      return;
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    const tripDurationMs = end.getTime() - start.getTime();
    if (tripDurationMs < oneDayMs) {
      alert('Un voyage doit durer au minimum 2 jours.');
      return;
    }

    createButton.disabled = true;
    const initialLabel = createButton.textContent;
    createButton.textContent = 'Creation...';

    try {
      const basePayload = {
        destination,
        start_date: startDate,
        end_date: endDate,
        people: travelers
      };

      const payloadVariants = [
        { ...basePayload, user_id: userId, name: '' },
        { ...basePayload, user_id: userId, name: null },
        { ...basePayload, user_id: userId },
        { ...basePayload, uid: userId, name: '' },
        { ...basePayload, uid: userId, name: null },
        { ...basePayload, uid: userId },
        { ...basePayload, travelers, people: undefined, user_id: userId },
        { ...basePayload, travelers, people: undefined, uid: userId }
      ];

      let trip = null;
      let lastError = null;

      for (const payload of payloadVariants) {
        const cleanPayload = Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== undefined)
        );
        try {
          trip = await createTrip(cleanPayload);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!trip && lastError) {
        throw lastError;
      }

      const tripId = Array.isArray(trip) ? trip[0]?.id : trip?.id;

      localStorage.setItem(
        'voygo_current_trip',
        JSON.stringify({
          id: tripId || null,
          destination,
          start_date: startDate,
          end_date: endDate,
          travelers
        })
      );

      const query = new URLSearchParams();
      if (tripId) query.set('tripId', tripId);
      query.set('destination', destination);
      query.set('startDate', startDate);
      query.set('endDate', endDate);

      window.location.href = `planning.html?${query.toString()}`;
    } catch (error) {
      console.error('Erreur lors de la creation du voyage:', error);
      alert(`Impossible de creer le voyage: ${error?.message || 'verifie la structure/policies de trips'}.`);
      createButton.disabled = false;
      createButton.textContent = initialLabel;
    }
  });
}
