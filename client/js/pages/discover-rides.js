/**
 * discover-rides.js — Discover & Filter Group Rides
 */

import { api } from '../api-client.js';
import { initLocationPicker } from '../location-picker.js';

let state = {
  q: '',
  fromId: '',
  toId: '',
  dateFrom: '',
  dateTo: '',
  expense: '',
  seats: '',
  sort: 'date',
  page: 1,
  limit: 12,
  total: 0,
};

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderRideCard(ride) {
  const seatsText = ride.seats_left > 0 ? `${ride.seats_left} seats left` : 'Fully booked';
  const seatsBadgeClass = ride.seats_left > 0 ? 'badge-open' : 'badge-full';
  const expenseText = ride.expense_type === 'shared' ? 'Shared Cost' : 'Host Sponsored';

  return `
    <a href="/ride-detail?id=${ride.id}" class="ride-card" aria-label="${escapeHtml(ride.title)}">
      <div class="ride-card__cover" style="display:flex;align-items:center;justify-content:center;background:#1e1e1e;color:#fff;font-size:2.5rem;">
        🏍️
      </div>
      <div class="ride-card__body">
        <div class="ride-card__route">
          <span>${escapeHtml(ride.start_name)}</span>
          <span>→</span>
          <span>${escapeHtml(ride.end_name)}</span>
        </div>
        <h3 style="font-size:var(--text-card);line-height:1.3;margin-block:var(--space-1);">${escapeHtml(ride.title)}</h3>
        <div class="ride-card__meta">
          <span>📅 ${formatDate(ride.start_date)}</span>
          ${ride.stop_count ? `<span>📍 ${ride.stop_count} stops</span>` : ''}
          <span>👤 ${escapeHtml(ride.host_name)}</span>
        </div>
        <div class="ride-card__badges">
          <span class="badge ${seatsBadgeClass}">${seatsText}</span>
          <span class="badge badge-shared">${expenseText}</span>
          ${ride.is_tentative ? '<span class="badge badge-tentative">Tentative</span>' : ''}
        </div>
      </div>
    </a>
  `;
}

async function fetchRides() {
  const grid = document.getElementById('rides-grid');
  const countEl = document.getElementById('results-count');
  const pagination = document.getElementById('pagination-bar');
  if (!grid) return;

  grid.innerHTML = `
    <div class="flex-center" style="grid-column:1/-1;padding:var(--space-16);">
      <div class="spinner" role="status" aria-label="Loading rides"></div>
    </div>
  `;

  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.fromId) params.set('from', state.fromId);
  if (state.toId) params.set('to', state.toId);
  if (state.dateFrom) params.set('dateFrom', state.dateFrom);
  if (state.dateTo) params.set('dateTo', state.dateTo);
  if (state.expense) params.set('expense', state.expense);
  if (state.seats) params.set('seats', state.seats);
  if (state.sort) params.set('sort', state.sort);
  params.set('page', state.page);
  params.set('limit', state.limit);

  try {
    const data = await api.get(`/rides?${params.toString()}`);
    const rides = data?.rides || [];
    state.total = data?.total || 0;

    if (countEl) {
      countEl.textContent = `${state.total} ride${state.total === 1 ? '' : 's'} found`;
    }

    if (!rides.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state__icon">🔍</div>
          <div class="empty-state__title">No rides match your search</div>
          <p class="empty-state__text">Try adjusting your filters, searching for a different city, or host your own group ride.</p>
          <button class="btn btn-secondary" id="reset-filters-btn" style="margin-top:var(--space-4);">Clear All Filters</button>
        </div>
      `;
      document.getElementById('reset-filters-btn')?.addEventListener('click', resetFilters);
      if (pagination) pagination.style.display = 'none';
      return;
    }

    grid.innerHTML = rides.map(renderRideCard).join('');
    renderPagination();
  } catch (err) {
    console.error('Error fetching rides:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <p class="empty-state__text">Failed to load rides. Please try again.</p>
      </div>
    `;
  }
}

function renderPagination() {
  const container = document.getElementById('pagination-bar');
  if (!container) return;

  const totalPages = Math.ceil(state.total / state.limit);
  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <button class="btn btn-secondary" id="prev-page-btn" ${state.page <= 1 ? 'disabled' : ''}>← Previous</button>
    <span style="font-size:var(--text-meta);color:var(--color-text-muted);">Page ${state.page} of ${totalPages}</span>
    <button class="btn btn-secondary" id="next-page-btn" ${state.page >= totalPages ? 'disabled' : ''}>Next →</button>
  `;

  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      fetchRides();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    if (state.page < totalPages) {
      state.page++;
      fetchRides();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function resetFilters() {
  state.q = '';
  state.fromId = '';
  state.toId = '';
  state.dateFrom = '';
  state.dateTo = '';
  state.expense = '';
  state.seats = '';
  state.sort = 'date';
  state.page = 1;

  const searchInput = document.getElementById('filter-search');
  if (searchInput) searchInput.value = '';
  const fromInput = document.getElementById('filter-from');
  const fromHidden = document.getElementById('filter-from-id');
  if (fromInput) fromInput.value = '';
  if (fromHidden) fromHidden.value = '';
  const toInput = document.getElementById('filter-to');
  const toHidden = document.getElementById('filter-to-id');
  if (toInput) toInput.value = '';
  if (toHidden) toHidden.value = '';
  const dateFrom = document.getElementById('filter-date-from');
  if (dateFrom) dateFrom.value = '';
  const dateTo = document.getElementById('filter-date-to');
  if (dateTo) dateTo.value = '';

  document.querySelectorAll('[data-filter-expense]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filterExpense === '');
  });
  document.querySelectorAll('[data-filter-seats]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.filterSeats === '');
  });

  fetchRides();
}

document.addEventListener('DOMContentLoaded', () => {
  // Setup location pickers
  const fromInput = document.getElementById('filter-from');
  const fromHidden = document.getElementById('filter-from-id');
  if (fromInput && fromHidden) {
    initLocationPicker(fromInput, fromHidden, {
      placeholder: 'Origin city',
      onSelect: (loc) => {
        state.fromId = loc.id;
        state.page = 1;
        fetchRides();
      },
    });
    fromInput.addEventListener('input', () => {
      if (!fromInput.value.trim()) {
        state.fromId = '';
        fromHidden.value = '';
        state.page = 1;
        fetchRides();
      }
    });
  }

  const toInput = document.getElementById('filter-to');
  const toHidden = document.getElementById('filter-to-id');
  if (toInput && toHidden) {
    initLocationPicker(toInput, toHidden, {
      placeholder: 'Destination city',
      onSelect: (loc) => {
        state.toId = loc.id;
        state.page = 1;
        fetchRides();
      },
    });
    toInput.addEventListener('input', () => {
      if (!toInput.value.trim()) {
        state.toId = '';
        toHidden.value = '';
        state.page = 1;
        fetchRides();
      }
    });
  }

  // Keywords search with debounce
  const searchInput = document.getElementById('filter-search');
  let searchTimer;
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      state.page = 1;
      fetchRides();
    }, 350);
  });

  // Date filters
  document.getElementById('filter-date-from')?.addEventListener('change', (e) => {
    state.dateFrom = e.target.value;
    state.page = 1;
    fetchRides();
  });
  document.getElementById('filter-date-to')?.addEventListener('change', (e) => {
    state.dateTo = e.target.value;
    state.page = 1;
    fetchRides();
  });

  // Expense chips
  document.querySelectorAll('[data-filter-expense]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-expense]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.expense = btn.dataset.filterExpense;
      state.page = 1;
      fetchRides();
    });
  });

  // Seats chips
  document.querySelectorAll('[data-filter-seats]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-seats]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.seats = btn.dataset.filterSeats;
      state.page = 1;
      fetchRides();
    });
  });

  // Sort select
  document.getElementById('filter-sort')?.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    fetchRides();
  });

  fetchRides();
});
