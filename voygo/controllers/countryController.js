/**
 * @voygo-doc
 * Module: countryController
 * Fichier: voygo\controllers\countryController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { searchCountries } from '../models/country.js';

// Gere la logique principale de 'debounce'.
function debounce(fn, delay = 250) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

// Initialise le bloc fonctionnel 'initCountryAutocomplete'.
export function initCountryAutocomplete(options = {}) {
  const inputSelector = options.inputSelector || '#pays';
  const listSelector = options.listSelector || '#country-suggestions';
  const input = document.querySelector(inputSelector);
  const list = document.querySelector(listSelector);
  if (!input || !list) return;

  let activeIndex = -1;
  let currentItems = [];
  let requestController;

  function getItemLabel(item) {
    return typeof item === 'string' ? item : item?.label || '';
  }

  function getItemValue(item) {
    return typeof item === 'string' ? item : item?.value || '';
  }

  function closeList() {
    currentItems = [];
    activeIndex = -1;
    list.innerHTML = '';
    list.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function pickCountry(item) {
    const value = getItemValue(item);
    input.value = value;
    input.dataset.selectedValue = value;
    closeList();
  }

  function highlightActive() {
    const options = list.querySelectorAll('.country-suggestion-item');
    options.forEach((option, index) => {
      const isActive = index === activeIndex;
      option.classList.toggle('is-active', isActive);
      if (isActive) {
        input.setAttribute('aria-activedescendant', option.id);
      }
    });

    if (activeIndex < 0) {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function renderList(items) {
    list.innerHTML = '';
    currentItems = items;
    activeIndex = -1;

    if (!items.length) {
      closeList();
      return;
    }

    items.forEach((suggestion, index) => {
      const label = getItemLabel(suggestion);
      const option = document.createElement('li');
      option.className = 'country-suggestion-item';
      option.setAttribute('role', 'option');
      option.setAttribute('id', `country-option-${index}`);
      option.textContent = label;
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        pickCountry(suggestion);
      });
      list.appendChild(option);
    });

    list.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
  }

  async function loadSuggestions(query) {
    if (query.length < 2) {
      closeList();
      return;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();

    try {
      const items = await searchCountries(query, requestController.signal);
      renderList(items);
    } catch (error) {
      if (error.name !== 'AbortError') {
        closeList();
      }
    }
  }

  const debouncedSearch = debounce((value) => loadSuggestions(value), 250);

  input.addEventListener('input', () => {
    activeIndex = -1;
    input.dataset.selectedValue = '';
    debouncedSearch(input.value.trim());
  });

  input.addEventListener('keydown', (event) => {
    if (!currentItems.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % currentItems.length;
      highlightActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
      highlightActive();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      pickCountry(currentItems[activeIndex]);
    } else if (event.key === 'Escape') {
      closeList();
    }
  });

  input.addEventListener('blur', () => {
    window.setTimeout(closeList, 120);
  });
}
