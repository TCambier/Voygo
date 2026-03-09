import { searchCountries } from '../models/country.js';

function debounce(fn, delay = 250) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

export function initCountryAutocomplete() {
  const input = document.querySelector('#pays');
  const list = document.querySelector('#country-suggestions');
  if (!input || !list) return;

  let activeIndex = -1;
  let currentItems = [];
  let requestController;

  function closeList() {
    currentItems = [];
    activeIndex = -1;
    list.innerHTML = '';
    list.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function pickCountry(countryName) {
    input.value = countryName;
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

    items.forEach((countryName, index) => {
      const item = document.createElement('li');
      item.className = 'country-suggestion-item';
      item.setAttribute('role', 'option');
      item.setAttribute('id', `country-option-${index}`);
      item.textContent = countryName;
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        pickCountry(countryName);
      });
      list.appendChild(item);
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
