import { supabase } from '../assets/js/supabase.js';
import { initCountryAutocomplete } from './countryController.js';

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

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToInput(value, days) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
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
  userId: null,
  name: '',
  destination: '',
  startDate: '',
  endDate: ''
};

let transports = [];

function formatDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}min`;
  if (hours) return `${hours}h`;
  return `${mins}min`;
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

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
  const destinationInput = document.getElementById('pays');
  const startInput = document.getElementById('trip-start-date');
  const endInput = document.getElementById('trip-end-date');

  if (nameInput) nameInput.value = tripState.name || '';
  if (destinationInput) destinationInput.value = tripState.destination || '';
  if (startInput) startInput.value = toDateInputValue(tripState.startDate);
  if (endInput) endInput.value = toDateInputValue(tripState.endDate);

  const today = getTodayInputValue();
  if (startInput) startInput.min = today;
  if (endInput) endInput.min = tripState.startDate
    ? addDaysToInput(tripState.startDate, 1)
    : today;

  updateTripMeta(tripState);
  setTransportDateBounds(toDateInputValue(tripState.startDate), toDateInputValue(tripState.endDate));
}

async function loadTransports() {
  if (!tripState.id || !tripState.userId) return;
  const { data, error } = await supabase
    .from('transports')
    .select('id,origin,destination,travel_date,mode,price,duration_minutes,created_at')
    .eq('trip_id', tripState.id)
    .eq('user_id', tripState.userId)
    .order('travel_date', { ascending: true });

  if (error) {
    console.warn('Impossible de charger les transports.', error);
    return;
  }

  transports = data || [];
  renderTransports();
}

function renderTransports() {
  const list = document.getElementById('transport-list');
  const empty = document.getElementById('transport-empty');
  if (!list || !empty) return;

  list.innerHTML = '';
  if (!transports.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  transports.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'transport-row';
    row.dataset.transportId = item.id;

    const dateLabel = item.travel_date ? formatDate(item.travel_date) : '-';

    row.innerHTML = `
      <div class="transport-title">
        <span>${item.origin || '-'} -> ${item.destination || '-'} · ${item.mode || 'Transport'}</span>
        <span class="transport-sub">${dateLabel}</span>
      </div>
      <span>${formatDuration(item.duration_minutes)}</span>
      <span>${formatPrice(item.price)}</span>
      <div class="transport-actions">
        <button type="button" class="btn-icon" data-edit title="Modifier"><i class='bx bx-edit'></i></button>
        <button type="button" class="btn-icon danger" data-delete title="Supprimer"><i class='bx bx-trash'></i></button>
      </div>
    `;

    list.appendChild(row);
  });
}

async function initPlanningPage() {
  const returnTo = `planning.html${window.location.search || ''}`;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (authError || !userId) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }
  tripState.userId = userId;

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
      tripState.id = tripState.id || fallback.id || null;
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
  await loadTransports();
}

function initTripEditor() {
  const nameInput = document.getElementById('trip-name');
  const destinationInput = document.getElementById('pays');
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
    const today = getTodayInputValue();
    if (startInput.value && startInput.value < today) {
      startInput.value = today;
    }
    if (endInput.value && endInput.value < today) {
      endInput.value = today;
    }
    if (startInput.value) {
      endInput.min = addDaysToInput(startInput.value, 1);
    }
    if (startInput.value && endInput.value && endInput.value <= startInput.value) {
      endInput.value = addDaysToInput(startInput.value, 1);
    }
    setTransportDateBounds(startInput.value, endInput.value);
  };

  startInput.addEventListener('change', handleDateChange);
  endInput.addEventListener('change', handleDateChange);

  saveButton.addEventListener('click', async () => {
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    const nextName = nameInput.value.trim() || tripState.name || 'Voyage';
    const payload = {
      name: nextName,
      destination: destinationInput.value.trim() || null,
      start_date: startInput.value || null,
      end_date: endInput.value || null
    };

    const today = getTodayInputValue();
    if (payload.start_date && payload.start_date < today) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de dÃ©part ne peut pas Ãªtre dans le passÃ©.';
      return;
    }

    if (payload.end_date && payload.end_date < today) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date de retour ne peut pas Ãªtre dans le passÃ©.';
      return;
    }

    if (payload.start_date && payload.end_date && payload.end_date <= payload.start_date) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'Le voyage doit durer au moins 1 nuit.';
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
  const saveNote = document.getElementById('transport-save-note');
  const submitButton = document.getElementById('transport-submit');

  if (!modal || !openButton || !form || !saveNote || !submitButton) return;

  const openModal = () => {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const startInput = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const endInput = document.getElementById('trip-end-date')?.value || tripState.endDate;
    setTransportDateBounds(startInput, endInput);
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = '';
    submitButton.textContent = 'Ajouter';
    form.reset();
    form.elements.namedItem('transport_id').value = '';
    const firstInput = modal.querySelector('input, select, textarea');
    if (firstInput instanceof HTMLElement) {
      firstInput.focus();
    }
  };

  const priceInput = form.elements.namedItem('price');
  const durationInput = form.elements.namedItem('duration');

  if (priceInput instanceof HTMLInputElement) {
    priceInput.addEventListener('input', () => {
      const normalized = priceInput.value
        .replace(/[^\d.,]/g, '')
        .replace(/,(?=.*[,])/g, '')
        .replace(/\.(?=.*\.)/g, '')
        .replace(',', '.');
      priceInput.value = normalized;
    });
  }

  if (durationInput instanceof HTMLInputElement) {
    durationInput.addEventListener('input', () => {
      durationInput.value = durationInput.value.replace(/[^\d]/g, '');
    });
  }

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveNote.classList.remove('is-success', 'is-error');
    saveNote.textContent = 'Enregistrement...';

    if (!tripState.id || !tripState.userId) {
      saveNote.classList.add('is-error');
      saveNote.textContent = "Impossible d'enregistrer sans voyage.";
      return;
    }

    const origin = form.elements.namedItem('from')?.value?.trim();
    const destination = form.elements.namedItem('to')?.value?.trim();
    const travelDate = form.elements.namedItem('date')?.value;
    const mode = form.elements.namedItem('mode')?.value;
    const priceRaw = form.elements.namedItem('price')?.value;
    const durationRaw = form.elements.namedItem('duration')?.value;
    const priceValue = priceRaw ? Number(String(priceRaw).replace(',', '.')) : null;
    const durationValue = durationRaw ? Number(durationRaw) : null;
    const transportId = form.elements.namedItem('transport_id')?.value;

    const currentStart = document.getElementById('trip-start-date')?.value || tripState.startDate;
    const currentEnd = document.getElementById('trip-end-date')?.value || tripState.endDate;

    if (currentStart && travelDate && travelDate < currentStart) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date doit Ãªtre dans les dates du voyage.';
      return;
    }

    if (currentEnd && travelDate && travelDate > currentEnd) {
      saveNote.classList.add('is-error');
      saveNote.textContent = 'La date doit Ãªtre dans les dates du voyage.';
      return;
    }

    try {
      if (priceValue !== null && !Number.isFinite(priceValue)) {
        saveNote.classList.add('is-error');
        saveNote.textContent = 'Prix invalide.';
        return;
      }

      if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue <= 0)) {
        saveNote.classList.add('is-error');
        saveNote.textContent = 'Temps de trajet invalide.';
        return;
      }

      const payload = {
        trip_id: tripState.id,
        user_id: tripState.userId,
        origin,
        destination,
        travel_date: travelDate,
        mode,
        price: priceValue,
        duration_minutes: durationValue
      };

      const query = supabase.from('transports');
      const { error } = transportId
        ? await query.update(payload).eq('id', transportId)
        : await query.insert(payload);

      if (error) throw error;

      saveNote.classList.add('is-success');
      saveNote.textContent = transportId ? 'Transport mis a jour.' : 'Transport ajoute.';
      await loadTransports();
      closeModal();
    } catch (err) {
      console.warn('Impossible d\'ajouter le transport.', err);
      saveNote.classList.add('is-error');
      saveNote.textContent = "Erreur lors de l'ajout.";
    }
  });

  const list = document.getElementById('transport-list');
  if (list) {
    list.addEventListener('click', async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const row = target.closest('.transport-row');
      if (!row) return;
      const transportId = row.dataset.transportId;
      const current = transports.find((item) => item.id === transportId);
      if (!current) return;

      if (target.closest('[data-edit]')) {
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        form.elements.namedItem('transport_id').value = current.id;
        form.elements.namedItem('from').value = current.origin || '';
        form.elements.namedItem('to').value = current.destination || '';
        form.elements.namedItem('date').value = toDateInputValue(current.travel_date || '');
        form.elements.namedItem('mode').value = current.mode || '';
        form.elements.namedItem('price').value = current.price ?? '';
        form.elements.namedItem('duration').value = current.duration_minutes ?? '';
        submitButton.textContent = 'Modifier';
        saveNote.classList.remove('is-success', 'is-error');
        saveNote.textContent = '';
      }

      if (target.closest('[data-delete]')) {
        const confirmed = window.confirm('Supprimer ce transport ?');
        if (!confirmed) return;
        const { error } = await supabase
          .from('transports')
          .delete()
          .eq('id', current.id);
        if (error) {
          console.warn('Impossible de supprimer le transport.', error);
          return;
        }
        await loadTransports();
      }
    });
  }
}

initPlanningPage().then(initTripEditor);
initTransportModal();
initCountryAutocomplete();
