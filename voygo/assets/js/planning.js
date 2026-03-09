import { supabase } from './supabase.js';

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

function readFallbackTrip() {
  const stored = localStorage.getItem('voygo_current_trip');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function updateTripMeta({ destination, startDate, endDate }) {
  const destinationNode = document.querySelector('#planning-destination');
  const datesNode = document.querySelector('#planning-dates');
  if (!destinationNode || !datesNode) return;

  destinationNode.textContent = destination || '-';

  const formattedStart = formatDate(startDate);
  const formattedEnd = formatDate(endDate);
  datesNode.textContent = formattedStart && formattedEnd ? `${formattedStart} - ${formattedEnd}` : '-';
}

async function initPlanningPage() {
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get('tripId');
  let destination = params.get('destination') || '';
  let startDate = params.get('startDate') || '';
  let endDate = params.get('endDate') || '';

  if (tripId) {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('id,destination,start_date,end_date')
        .eq('id', tripId)
        .single();

      if (!error && data) {
        destination = data.destination || destination;
        startDate = data.start_date || startDate;
        endDate = data.end_date || endDate;
      }
    } catch (err) {
      console.warn('Impossible de charger le voyage depuis Supabase.', err);
    }
  }

  if (!destination || !startDate || !endDate) {
    const fallback = readFallbackTrip();
    if (fallback) {
      destination = destination || fallback.destination || '';
      startDate = startDate || fallback.start_date || '';
      endDate = endDate || fallback.end_date || '';
    }
  }

  updateTripMeta({ destination, startDate, endDate });
}

initPlanningPage();
