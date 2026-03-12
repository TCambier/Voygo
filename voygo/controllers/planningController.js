import { supabase } from '../assets/js/supabase.js';

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('fr-FR');
}

function toDateInputValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
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

const tripState = {
  id: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: ''
};

function setTransportDateBounds(startDate, endDate) {
  const dateInput = document.getElementById('transport-date');
  if (!dateInput) return;
  dateInput.min = startDate || '';
  dateInput.max = endDate || '';

  if (dateInput.value) {
    if (startDate && dateInput.value < startDate) {
      dateInput.value = startDate;
    }
    if (endDate && dateInput.value > endDate) {
      dateInput.value = endDate;
    }
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

function syncTripInputs() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('trip-destination-input');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');

  if (nameInput) nameInput.value = tripState.name || '';
  if (destinationInput) destinationInput.value = tripState.destination || '';
  if (startInput) startInput.value = toDateInputValue(tripState.startDate);
  if (endInput) endInput.value = toDateInputValue(tripState.endDate);

  updateTripMeta(tripState);
  setTransportDateBounds(toDateInputValue(tripState.startDate), toDateInputValue(tripState.endDate));
}

async function initPlanningPage() {
  const returnTo = `planning.html${window.location.search || ''}`;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const tripId = params.get('tripId');
  let destination = params.get('destination') || '';
  let startDate = params.get('startDate') || '';
  let endDate = params.get('endDate') || '';

  if (tripId) {
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('id,name,destination,start_date,end_date')
        .eq('id', tripId)
        .single();

      if (!error && data) {
        tripState.id = data.id;
        tripState.name = data.name || '';
        destination = data.destination || destination;
        startDate = toDateInputValue(data.start_date || startDate);
        endDate = toDateInputValue(data.end_date || endDate);
      }
    } catch (err) {
      console.warn('Impossible de charger le voyage depuis Supabase.', err);
    }
  }

  if (!destination || !startDate || !endDate) {
    const fallback = readFallbackTrip();
    if (fallback) {
      tripState.name = tripState.name || fallback.name || '';
      destination = destination || fallback.destination || '';
      startDate = startDate || toDateInputValue(fallback.start_date || '');
      endDate = endDate || toDateInputValue(fallback.end_date || '');
    }
  }

  tripState.destination = destination;
  tripState.startDate = toDateInputValue(startDate);
  tripState.endDate = toDateInputValue(endDate);

  syncTripInputs();
}

function initTripEditor() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('trip-destination-input');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');
  const saveButton = document.getElementById('trip-save');
  const saveNote = document.getElementById('trip-save-note');

  if (!nameInput || !destinationInput || !startInput || !endInput || !saveButton || !saveNote) return;

  if (!tripState.id) {
    saveButton.disabled = true;
    saveNote.textContent = "Ce voyage n'est pas encore enregistrÃ©.";
    return;
  }

  const handleDateChange = () => {
    if (startInput.value && endInput.value && endInput.value < startInput.value) {
      endInput.value = startInput.value;
    }
    setTransportDateBounds(startInput.value, endInput.value);
  };

  startInput.addEventListener('change', handleDateChange);
  endInput.addEventListener('change', handleDateChange);

  saveButton.addEventListener('click', async () => {
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    const payload = {
      name: nameInput.value.trim() || null,
      destination: destinationInput.value.trim() || null,
      start_date: startInput.value || null,
      end_date: endInput.value || null
    };

    if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de retour doit Ãªtre aprÃ¨s le dÃ©part.';
      return;
    }

    try {
      const { data, error } = await supabase
        .from('trips')
        .update(payload)
        .eq('id', tripState.id)
        .select('id,name,destination,start_date,end_date')
        .single();

      if (error) throw error;

      tripState.name = data?.name || '';
      tripState.destination = data?.destination || '';
      tripState.startDate = toDateInputValue(data?.start_date || '');
      tripState.endDate = toDateInputValue(data?.end_date || '');

      localStorage.setItem('voygo_current_trip', JSON.stringify(data));
      syncTripInputs();

      saveNote.classList.add('is-success');
      saveNote.textContent = 'Voyage mis Ã  jour.';
    } catch (err) {
      console.warn('Impossible de mettre Ã  jour le voyage.', err);
      saveNote.classList.add('is-error');
      saveNote.textContent = "Erreur lors de l'enregistrement.";
    }
  });
}

function initTransportModal() {
  const modal = document.getElementById('transport-modal');
  const openButton = document.querySelector('[data-open-transport]');
  const closeButtons = modal?.querySelectorAll('[data-close]') || [];
  const form = document.getElementById('transport-form');

  if (!modal || !openButton || !form) return;

  const openModal = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTransportDateBounds(tripState.startDate, tripState.endDate);
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
  };

  openButton.addEventListener('click', openModal);
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    form.reset();
    closeModal();
  });
}

initPlanningPage().then(initTripEditor);
initTransportModal();
