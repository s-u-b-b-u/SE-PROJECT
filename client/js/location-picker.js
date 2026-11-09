/**
 * location-picker.js — Autocomplete location input backed by /api/locations
 * Bikers Portal shared module
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const LIST_CLASS = 'autocomplete-list';
const ITEM_CLASS = 'autocomplete-item';
const ACTIVE_CLASS = 'is-active';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a debounced version of `fn` that waits `delay` ms after the last call.
 */
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Positions the dropdown list immediately below the input element.
 * We use inline styles so this works regardless of CSS layout context.
 */
function positionList(inputEl, listEl) {
  const rect = inputEl.getBoundingClientRect();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
  listEl.style.top = `${rect.bottom + scrollTop}px`;
  listEl.style.left = `${rect.left + scrollLeft}px`;
  listEl.style.width = `${rect.width}px`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attaches location autocomplete behaviour to a text input.
 *
 * @param {HTMLInputElement} inputEl  — The visible text input.
 * @param {HTMLInputElement} hiddenEl — A hidden input that receives the numeric location id.
 * @param {object}           [options={}]
 * @param {string}           [options.placeholder]  — Placeholder text for the input.
 * @param {function}         [options.onSelect]     — Called with the selected location object.
 */
export function initLocationPicker(inputEl, hiddenEl, options = {}) {
  if (!inputEl || !hiddenEl) {
    console.warn('initLocationPicker: inputEl or hiddenEl is null');
    return;
  }

  // Apply optional placeholder
  if (options.placeholder) {
    inputEl.setAttribute('placeholder', options.placeholder);
  }

  // Attributes for accessibility
  inputEl.setAttribute('autocomplete', 'off');
  inputEl.setAttribute('role', 'combobox');
  inputEl.setAttribute('aria-autocomplete', 'list');
  inputEl.setAttribute('aria-expanded', 'false');

  // ---------------------------------------------------------------------------
  // Build the dropdown list (appended to <body> so z-index works freely)
  // ---------------------------------------------------------------------------
  const listEl = document.createElement('ul');
  listEl.className = LIST_CLASS;
  listEl.setAttribute('role', 'listbox');
  listEl.style.position = 'absolute';
  listEl.style.zIndex = '9999';
  listEl.setAttribute('hidden', '');
  document.body.appendChild(listEl);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let results = [];      // current fetched items
  let activeIdx = -1;   // keyboard-highlighted index (-1 = none)
  let abortCtrl = null; // AbortController for in-flight fetch

  // ---------------------------------------------------------------------------
  // Helpers: open / close / render
  // ---------------------------------------------------------------------------

  function openList() {
    listEl.removeAttribute('hidden');
    positionList(inputEl, listEl);
    inputEl.setAttribute('aria-expanded', 'true');
  }

  function closeList() {
    listEl.setAttribute('hidden', '');
    listEl.innerHTML = '';
    results = [];
    activeIdx = -1;
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.removeAttribute('aria-activedescendant');
  }

  function setActive(idx) {
    const items = listEl.querySelectorAll(`.${ITEM_CLASS}`);
    items.forEach((el, i) => {
      el.classList.toggle(ACTIVE_CLASS, i === idx);
      el.setAttribute('aria-selected', String(i === idx));
    });
    activeIdx = idx;
    if (idx >= 0 && items[idx]) {
      inputEl.setAttribute('aria-activedescendant', items[idx].id);
      // Scroll item into view within the list
      items[idx].scrollIntoView({ block: 'nearest' });
    } else {
      inputEl.removeAttribute('aria-activedescendant');
    }
  }

  function renderResults(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      closeList();
      return;
    }

    items.forEach((loc, i) => {
      const li = document.createElement('li');
      li.id = `loc-item-${i}-${Date.now()}`;
      li.className = ITEM_CLASS;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');

      // Primary label + optional secondary (state/region)
      const name = document.createElement('span');
      name.className = 'autocomplete-item__name';
      name.textContent = loc.name;
      li.appendChild(name);

      if (loc.state || loc.region) {
        const sub = document.createElement('span');
        sub.className = 'autocomplete-item__sub';
        sub.textContent = loc.state || loc.region;
        li.appendChild(sub);
      }

      li.addEventListener('mousedown', (e) => {
        // mousedown fires before blur — prevent input from losing focus first
        e.preventDefault();
        selectItem(loc);
      });

      listEl.appendChild(li);
    });

    openList();
    activeIdx = -1;
  }

  // ---------------------------------------------------------------------------
  // Select a result
  // ---------------------------------------------------------------------------

  function selectItem(loc) {
    inputEl.value = loc.name;
    hiddenEl.value = String(loc.id);
    closeList();
    if (typeof options.onSelect === 'function') {
      options.onSelect(loc);
    }
    // Dispatch a native change event so form listeners work
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    hiddenEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------------------------------------------------------------------------
  // Fetch suggestions
  // ---------------------------------------------------------------------------

  async function fetchSuggestions(q) {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    try {
      const res = await fetch(
        `/api/locations?q=${encodeURIComponent(q)}`,
        { credentials: 'include', signal: abortCtrl.signal }
      );
      if (!res.ok) return;
      const data = await res.json();
      // Normalise: accept { locations: [] } or plain []
      results = Array.isArray(data) ? data : (data.locations ?? []);
      renderResults(results);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('location-picker fetch error', err);
      }
    }
  }

  const debouncedFetch = debounce(fetchSuggestions, DEBOUNCE_MS);

  // ---------------------------------------------------------------------------
  // Event listeners on the input
  // ---------------------------------------------------------------------------

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    // Clear hidden id whenever the user edits manually
    hiddenEl.value = '';
    if (q.length < 1) {
      closeList();
      return;
    }
    debouncedFetch(q);
  });

  inputEl.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll(`.${ITEM_CLASS}`);
    const count = items.length;
    const isOpen = !listEl.hasAttribute('hidden');

    switch (e.key) {
      case 'ArrowDown':
        if (!isOpen) return;
        e.preventDefault();
        setActive(activeIdx < count - 1 ? activeIdx + 1 : 0);
        break;

      case 'ArrowUp':
        if (!isOpen) return;
        e.preventDefault();
        setActive(activeIdx > 0 ? activeIdx - 1 : count - 1);
        break;

      case 'Enter':
        if (isOpen && activeIdx >= 0 && results[activeIdx]) {
          e.preventDefault();
          selectItem(results[activeIdx]);
        }
        break;

      case 'Escape':
        closeList();
        break;

      case 'Tab':
        // Auto-select the highlighted item on Tab for convenience
        if (isOpen && activeIdx >= 0 && results[activeIdx]) {
          selectItem(results[activeIdx]);
        } else {
          closeList();
        }
        break;
    }
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
      closeList();
    }
  });

  // Reposition on scroll / resize so the list doesn't drift
  const reposition = () => {
    if (!listEl.hasAttribute('hidden')) positionList(inputEl, listEl);
  };
  window.addEventListener('scroll', reposition, { passive: true });
  window.addEventListener('resize', reposition, { passive: true });
}
