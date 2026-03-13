import { createTrip } from './tripController.js';
import { api } from '../assets/js/api.js';

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
    const selectedValue = countryInput.dataset.selectedValue || '';
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const travelers = parseInt(travelersInput.value, 10) || 1;

    let userId = null;
    try {
      const me = await api.get('/api/auth/me');
      userId = me?.user?.id || null;
    } catch (error) {
      userId = null;
    }
    if (!userId) {
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
      alert('Merci de renseigner la destination et les dates du voyage.');
      return;
    }

    if (destination !== selectedValue) {
      alert('Merci de choisir une destination dans la liste de suggestions.');
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
      const trip = await createTrip(basePayload);
      const tripId = trip?.id || null;

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
