/**
 * find-riders.js — Solo Trip Partner Discovery & Match Engine
 */

import { api } from '../api-client.js';
import { auth } from '../auth.js';
import { toast } from '../toast.js';
import { modal } from '../modal.js';
import { initLocationPicker } from '../location-picker.js';

let trips = [];
let activeTripId = null;

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

async function loadTrips() {
  const sidebar = document.getElementById('trips-list');
  if (!sidebar) return;

  try {
    const data = await api.get('/trips/mine');
    trips = data?.trips || [];

    if (!trips.length) {
      sidebar.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6);">
          <div class="empty-state__icon">🗺️</div>
          <p class="empty-state__text" style="font-size:var(--text-meta);">No trips planned yet.</p>
        </div>
      `;
      document.getElementById('matches-view').innerHTML = `
        <div class="empty-state" style="background:var(--color-surface);border-radius:var(--radius-md);padding:var(--space-16);">
          <div class="empty-state__icon">🏍️</div>
          <div class="empty-state__title">Find Riding Companions</div>
          <p class="empty-state__text">Post your upcoming solo itinerary. Our matching engine will pair you with riders within 100 km whose routes and dates overlap.</p>
          <button class="btn btn-primary" id="btn-empty-create-trip" style="margin-top:var(--space-4);">Plan a Solo Trip</button>
        </div>
      `;
      document.getElementById('btn-empty-create-trip')?.addEventListener('click', openCreateTripModal);
      return;
    }

    renderTripSidebar();

    // Select the first trip or keep previous selection
    const defaultTrip = trips.find((t) => t.id === activeTripId) || trips[0];
    selectTrip(defaultTrip.id);
  } catch (err) {
    console.error('Failed to load trips:', err);
    toast.error('Unable to load your trips.');
  }
}

function renderTripSidebar() {
  const sidebar = document.getElementById('trips-list');
  if (!sidebar) return;

  sidebar.innerHTML = trips.map((t) => `
    <div class="trip-item-card ${t.id === activeTripId ? 'active' : ''}" data-id="${t.id}" role="button" tabindex="0">
      <div style="font-weight:var(--fw-semi);font-size:var(--text-body);">${escapeHtml(t.origin_name)} → ${escapeHtml(t.destination_name)}</div>
      <div class="text-caption" style="margin-top:var(--space-1);">${formatDate(t.start_date)} - ${formatDate(t.end_date)}</div>
      <div style="margin-top:var(--space-2);">
        <span class="badge ${t.status === 'active' ? 'badge-open' : 'badge-draft'}">${escapeHtml(t.status)}</span>
      </div>
    </div>
  `).join('');

  sidebar.querySelectorAll('.trip-item-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectTrip(Number(card.dataset.id));
    });
  });
}

async function selectTrip(tripId) {
  activeTripId = tripId;
  renderTripSidebar();

  const container = document.getElementById('matches-view');
  if (!container) return;

  container.innerHTML = `
    <div class="flex-center" style="padding:var(--space-16);">
      <div class="spinner" role="status" aria-label="Finding matched riders"></div>
    </div>
  `;

  try {
    const data = await api.get(`/trips/${tripId}/matches`);
    const { trip, matches } = data;
    renderMatchesView(trip, matches || []);
  } catch (err) {
    console.error('Failed to load matches:', err);
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__text">Could not retrieve rider matches for this trip.</p>
      </div>
    `;
  }
}

function renderMatchesView(trip, matches) {
  const container = document.getElementById('matches-view');
  if (!container) return;

  container.innerHTML = `
    <div class="stack gap-6">
      <!-- Active Trip Overview Card -->
      <div style="background:var(--color-surface);border-radius:var(--radius-md);padding:var(--space-6);" class="flex-between">
        <div>
          <div class="text-caption" style="margin-bottom:var(--space-1);">SELECTED ITINERARY</div>
          <h2 style="font-size:var(--text-card);">${escapeHtml(trip.origin_name)} to ${escapeHtml(trip.destination_name)}</h2>
          <div class="text-muted">📅 ${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}</div>
          ${trip.notes ? `<p class="text-muted" style="margin-top:var(--space-2);font-size:var(--text-meta);">"${escapeHtml(trip.notes)}"</p>` : ''}
        </div>
        ${trip.status === 'active' ? `
          <button class="btn btn-ghost" id="btn-close-trip" style="flex-shrink:0;">Close Trip</button>
        ` : ''}
      </div>

      <!-- Matches Section -->
      <div>
        <div class="flex-between" style="margin-bottom:var(--space-4);">
          <h3 style="font-size:var(--text-card);">Matched Riders (${matches.length})</h3>
          <span class="text-muted" style="font-size:var(--text-meta);">Within 100km origin · 50km destination</span>
        </div>

        ${!matches.length ? `
          <div class="empty-state" style="background:var(--color-surface);border-radius:var(--radius-md);">
            <div class="empty-state__icon">🔍</div>
            <div class="empty-state__title">No matching riders found yet</div>
            <p class="empty-state__text">We keep looking! As soon as another rider plans a trip with overlapping dates and nearby routes, they will appear here.</p>
          </div>
        ` : `
          <div class="matches-container">
            ${matches.map((m) => renderMatchCard(m, trip.id)).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  document.getElementById('btn-close-trip')?.addEventListener('click', async () => {
    if (!confirm('Close this trip? You will stop receiving match notifications for it.')) return;
    try {
      await api.post(`/trips/${trip.id}/close`);
      toast.info('Trip closed.');
      loadTrips();
    } catch (err) {
      toast.error(err.message || 'Could not close trip.');
    }
  });

  attachMatchActions(trip.id);
}

function renderMatchCard(m, tripId) {
  let actionButton = '';
  if (!m.connection) {
    actionButton = `<button class="btn btn-primary btn-connect" data-user-id="${m.user_id}" data-user-name="${escapeHtml(m.display_name)}" style="height:38px;">Send Connection Request</button>`;
  } else if (m.connection.status === 'pending' && m.connection.direction === 'sent') {
    actionButton = `<span class="badge badge-draft">Request Sent</span>`;
  } else if (m.connection.status === 'pending' && m.connection.direction === 'received') {
    actionButton = `<a href="/connections" class="btn btn-secondary" style="height:38px;">Respond to Request</a>`;
  } else if (m.connection.status === 'accepted') {
    actionButton = `<span class="badge badge-open">✓ Connected Buddy</span>`;
  }

  return `
    <div class="match-card">
      <div class="flex-between" style="flex-wrap:wrap;gap:var(--space-3);">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div class="avatar avatar-md"><span>${escapeHtml(m.display_name.charAt(0).toUpperCase())}</span></div>
          <div>
            <div style="font-weight:var(--fw-semi);font-size:var(--text-body);">${escapeHtml(m.display_name)}</div>
            <div class="text-caption">${escapeHtml(m.bike_model || 'Motorcycle Rider')}</div>
          </div>
        </div>
        <div>${actionButton}</div>
      </div>

      <div class="match-card__meta">
        <div class="match-card__meta-item">
          📅 Overlap: <strong>${m.overlap_days} day${m.overlap_days === 1 ? '' : 's'}</strong>
        </div>
        <div class="match-card__meta-item">
          📍 Origin: <strong>${m.origin_name}</strong> (${m.origin_km} km away)
        </div>
        <div class="match-card__meta-item">
          🏁 Destination: <strong>${m.destination_name}</strong> (${m.destination_km} km away)
        </div>
      </div>

      ${m.notes ? `<p class="text-muted" style="margin:0;font-size:var(--text-meta);background:var(--color-bg);padding:var(--space-3);border-radius:var(--radius-sm);">"${escapeHtml(m.notes)}"</p>` : ''}
    </div>
  `;
}

function attachMatchActions(tripId) {
  document.querySelectorAll('.btn-connect').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetUserId = Number(btn.dataset.userId);
      const name = btn.dataset.userName;
      const message = prompt(`Send a connection message to ${name}:`, 'Hey! I saw our riding routes overlap. Up for riding together?');
      if (message === null) return;

      try {
        await api.post('/connections', {
          userId: targetUserId,
          tripId,
          message: message.trim(),
        });
        toast.success(`Connection request sent to ${name}!`);
        selectTrip(tripId);
      } catch (err) {
        toast.error(err.message || 'Failed to send request.');
      }
    });
  });
}

function openCreateTripModal() {
  modal.open({
    title: 'Plan a Solo Itinerary',
    content: `
      <form id="new-trip-form" class="stack gap-4">
        <div class="form-field">
          <label class="form-label" for="trip-origin">Starting City</label>
          <div class="autocomplete-wrapper">
            <input type="text" id="trip-origin" class="form-input" placeholder="Search city..." required>
            <input type="hidden" id="trip-origin-id">
          </div>
        </div>

        <div class="form-field">
          <label class="form-label" for="trip-dest">Destination City</label>
          <div class="autocomplete-wrapper">
            <input type="text" id="trip-dest" class="form-input" placeholder="Search destination..." required>
            <input type="hidden" id="trip-dest-id">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
          <div class="form-field">
            <label class="form-label" for="trip-start">Start Date</label>
            <input type="date" id="trip-start" class="form-input" required>
          </div>
          <div class="form-field">
            <label class="form-label" for="trip-end">End Date</label>
            <input type="date" id="trip-end" class="form-input" required>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label" for="trip-notes">Trip Notes (optional)</label>
          <textarea id="trip-notes" class="form-textarea" placeholder="Riding style, preferred pace, halts..." rows="3"></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:var(--space-3);margin-top:var(--space-2);">
          <button type="button" class="btn btn-ghost" id="btn-cancel-trip">Cancel</button>
          <button type="submit" class="btn btn-primary">Find Matches</button>
        </div>
      </form>
    `,
    onOpen: (modalEl) => {
      const origInput = modalEl.querySelector('#trip-origin');
      const origHidden = modalEl.querySelector('#trip-origin-id');
      const destInput = modalEl.querySelector('#trip-dest');
      const destHidden = modalEl.querySelector('#trip-dest-id');

      initLocationPicker(origInput, origHidden);
      initLocationPicker(destInput, destHidden);

      modalEl.querySelector('#btn-cancel-trip')?.addEventListener('click', () => modal.close());

      modalEl.querySelector('#new-trip-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originLocationId = Number(origHidden.value);
        const destinationLocationId = Number(destHidden.value);
        const startDate = modalEl.querySelector('#trip-start').value;
        const endDate = modalEl.querySelector('#trip-end').value;
        const notes = modalEl.querySelector('#trip-notes').value.trim();

        if (!originLocationId || !destinationLocationId) {
          toast.error('Please pick valid starting and destination locations from the suggestions.');
          return;
        }

        try {
          const res = await api.post('/trips', {
            originLocationId,
            destinationLocationId,
            startDate,
            endDate,
            notes,
          });
          toast.success('Trip planned! Checking matches...');
          modal.close();
          activeTripId = res.id;
          loadTrips();
        } catch (err) {
          toast.error(err.message || 'Could not save trip.');
        }
      });
    },
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await auth.requireAuth();
  if (!user) return;

  document.getElementById('btn-new-trip')?.addEventListener('click', openCreateTripModal);
  loadTrips();
});
