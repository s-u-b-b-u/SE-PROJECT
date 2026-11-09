/**
 * host-ride.js — Interactive Stop Builder & Ride Creation
 */

import { api } from '../api-client.js';
import { auth } from '../auth.js';
import { toast } from '../toast.js';
import { initLocationPicker } from '../location-picker.js';

let stops = [
  { tempId: 1, locationId: '', locationName: '', plannedDate: '' },
  { tempId: 2, locationId: '', locationName: '', plannedDate: '' },
];
let nextTempId = 3;

function renderStops() {
  const container = document.getElementById('stops-list');
  if (!container) return;

  container.innerHTML = '';

  stops.forEach((stop, index) => {
    const isStart = index === 0;
    const isEnd = index === stops.length - 1;
    const label = isStart ? '1. Starting Point' : isEnd ? `${stops.length}. Final Destination` : `${index + 1}. Intermediate Stop`;

    const stopCard = document.createElement('div');
    stopCard.className = 'stop-card';
    stopCard.innerHTML = `
      <div class="stop-card__header">
        <span class="stop-card__badge">${label}</span>
        ${!isStart && !isEnd ? `
          <button type="button" class="btn btn-ghost" data-action="remove" data-index="${index}" style="height:32px;padding:0 var(--space-3);font-size:var(--text-meta);">Remove</button>
        ` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:var(--space-3);" class="stop-inputs-grid">
        <div class="form-field">
          <label class="form-label">City / Destination</label>
          <div class="autocomplete-wrapper">
            <input type="text" class="form-input stop-loc-input" placeholder="Search Indian city, pass, lake..." value="${escapeHtml(stop.locationName)}" required>
            <input type="hidden" class="stop-loc-id" value="${stop.locationId}">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Planned Date (optional)</label>
          <input type="date" class="form-input stop-date-input" value="${stop.plannedDate || ''}">
        </div>
      </div>
    `;

    container.appendChild(stopCard);

    // Initialise location picker
    const inputEl = stopCard.querySelector('.stop-loc-input');
    const hiddenEl = stopCard.querySelector('.stop-loc-id');
    const dateEl = stopCard.querySelector('.stop-date-input');

    initLocationPicker(inputEl, hiddenEl, {
      placeholder: 'Search Indian city, pass, lake...',
      onSelect: (loc) => {
        stop.locationId = loc.id;
        stop.locationName = loc.name + (loc.state ? `, ${loc.state}` : '');
      },
    });

    dateEl.addEventListener('change', (e) => {
      stop.plannedDate = e.target.value;
    });

    stopCard.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
      stops.splice(index, 1);
      renderStops();
    });
  });
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

document.addEventListener('DOMContentLoaded', async () => {
  const user = await auth.requireAuth();
  if (!user) return;

  renderStops();

  // Add intermediate stop
  document.getElementById('btn-add-stop')?.addEventListener('click', () => {
    if (stops.length >= 30) {
      toast.error('A ride can have at most 30 stops.');
      return;
    }
    // Insert before the last stop (destination)
    stops.splice(stops.length - 1, 0, {
      tempId: nextTempId++,
      locationId: '',
      locationName: '',
      plannedDate: '',
    });
    renderStops();
  });

  // Handle Form Submission
  document.getElementById('host-ride-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.submitter || document.querySelector('#host-ride-form button[type="submit"]');
    const isDraft = submitBtn?.dataset?.status === 'draft';

    const title = document.getElementById('ride-title').value.trim();
    const description = document.getElementById('ride-desc').value.trim();
    const startDate = document.getElementById('ride-start-date').value;
    const endDate = document.getElementById('ride-end-date').value;
    const capacity = Number(document.getElementById('ride-capacity').value);
    const expenseType = document.getElementById('ride-expense').value;
    const expenseNote = document.getElementById('ride-expense-note').value.trim();
    const isTentative = document.getElementById('ride-tentative').checked;

    // Validate stops
    for (let i = 0; i < stops.length; i++) {
      if (!stops[i].locationId) {
        toast.error(`Please select a valid location for stop #${i + 1} from the list.`);
        return;
      }
    }

    // Set planned dates for first and last stops if unset
    if (!stops[0].plannedDate) stops[0].plannedDate = startDate;
    if (!stops.at(-1).plannedDate) stops.at(-1).plannedDate = endDate;

    const payload = {
      title,
      description,
      startDate,
      endDate,
      capacity,
      expenseType,
      expenseNote,
      isTentative,
      status: isDraft ? 'draft' : 'published',
      stops: stops.map((s) => ({
        locationId: Number(s.locationId),
        plannedDate: s.plannedDate || null,
      })),
    };

    try {
      const res = await api.post('/rides', payload);
      toast.success(isDraft ? 'Ride saved as draft.' : 'Your ride is live and open for joining!');
      setTimeout(() => {
        window.location.href = `/ride-detail?id=${res.id}`;
      }, 1000);
    } catch (err) {
      toast.error(err.message || 'Failed to create ride. Please check inputs.');
    }
  });
});
