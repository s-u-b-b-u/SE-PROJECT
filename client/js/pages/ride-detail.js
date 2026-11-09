/**
 * ride-detail.js — Group Ride Details & Partial Segment Participation
 */

import { api } from '../api-client.js';
import { auth } from '../auth.js';
import { toast } from '../toast.js';

let rideData = null;

function getRideId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
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

async function loadRideDetail() {
  const rideId = getRideId();
  const root = document.getElementById('ride-content');
  if (!rideId || !root) return;

  try {
    rideData = await api.get(`/rides/${rideId}`);
    renderRide(rideData);
  } catch (err) {
    console.error('Failed to load ride:', err);
    root.innerHTML = `
      <div class="empty-state" style="padding:var(--space-16);">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__title">Ride not found</div>
        <p class="empty-state__text">${escapeHtml(err.message || 'This ride does not exist or may have been removed.')}</p>
        <a href="/discover-rides" class="btn btn-primary" style="margin-top:var(--space-4);">Explore other rides</a>
      </div>
    `;
  }
}

function renderRide({ ride, stops, participants, reviews, viewer }) {
  const root = document.getElementById('ride-content');
  if (!root) return;

  const isHost = viewer.isHost;
  const isJoined = Boolean(viewer.participation);
  const seatsBadge = ride.seats_left > 0 ? `<span class="badge badge-open">${ride.seats_left} seats free</span>` : `<span class="badge badge-full">Full</span>`;
  const expenseLabel = ride.expense_type === 'shared' ? 'Shared Expenses' : 'Host Sponsored';

  let hostControls = '';
  if (isHost) {
    hostControls = `
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap;">
        ${ride.status === 'published' ? `
          <button class="btn btn-secondary" id="btn-complete-ride">Mark Completed</button>
          <button class="btn btn-ghost" id="btn-cancel-ride" style="color:#dc2626;border-color:#dc2626;">Cancel Ride</button>
        ` : ''}
      </div>
    `;
  }

  root.innerHTML = `
    <div class="ride-detail-layout">
      <!-- Main Content -->
      <div class="stack gap-6">
        <!-- Header Card -->
        <article class="ride-header-card">
          <div class="flex-between" style="flex-wrap:wrap;gap:var(--space-2);">
            <div class="text-caption">${escapeHtml(ride.status.toUpperCase())} ${ride.is_tentative ? '· TENTATIVE DATES' : ''}</div>
            <div style="display:flex;gap:var(--space-2);">${seatsBadge} <span class="badge badge-shared">${expenseLabel}</span></div>
          </div>
          <h1>${escapeHtml(ride.title)}</h1>
          <div class="text-muted" style="display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;">
            <span>📅 ${formatDate(ride.start_date)} — ${formatDate(ride.end_date)}</span>
            <span>👥 Capacity: ${ride.capacity} riders</span>
          </div>

          <div class="divider"></div>

          <div>
            <h2 style="font-size:var(--text-card);margin-bottom:var(--space-2);">About this ride</h2>
            <p style="white-space:pre-line;line-height:var(--lh-body);">${escapeHtml(ride.description)}</p>
            ${ride.expense_note ? `<p class="text-muted" style="margin-top:var(--space-3);"><strong>Expense note:</strong> ${escapeHtml(ride.expense_note)}</p>` : ''}
          </div>

          ${hostControls}
        </article>

        <!-- Route & Stops Timeline -->
        <section class="ride-header-card" aria-labelledby="stops-heading">
          <h2 id="stops-heading" style="font-size:var(--text-card);">Itinerary & Stops (${stops.length})</h2>
          <p class="text-muted">You can join for the entire route or any partial segment between these stops.</p>

          <div class="timeline" role="list">
            ${stops.map((stop, index) => {
              const isStart = index === 0;
              const isEnd = index === stops.length - 1;
              const nodeClass = isStart ? 'start' : isEnd ? 'end' : '';
              return `
                <div class="timeline-item ${nodeClass}" role="listitem">
                  <div class="timeline-node"></div>
                  <div class="timeline-content">
                    <div class="timeline-title">${escapeHtml(stop.name)}, <span class="text-muted">${escapeHtml(stop.state)}</span></div>
                    <div class="timeline-date">${stop.planned_date ? formatDate(stop.planned_date) : 'Date as planned'} ${isStart ? '· (Starting Point)' : isEnd ? '· (Final Destination)' : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>

        <!-- Participants List -->
        <section class="ride-header-card" aria-labelledby="riders-heading">
          <h2 id="riders-heading" style="font-size:var(--text-card);">Riders Joined (${participants.length})</h2>
          ${!participants.length ? `<p class="text-muted">No other riders have joined yet. Be the first!</p>` : `
            <div>
              ${participants.map((p) => {
                const joinStop = stops.find((s) => s.id === p.join_stop_id)?.name || 'Start';
                const leaveStop = stops.find((s) => s.id === p.leave_stop_id)?.name || 'End';
                return `
                  <div class="participant-row">
                    <div>
                      <div style="font-weight:var(--fw-semi);">${escapeHtml(p.display_name)}</div>
                      <div class="text-caption">${escapeHtml(p.bike_model || 'Motorcycle enthusiast')}</div>
                    </div>
                    <div class="text-muted" style="text-align:right;font-size:var(--text-meta);">
                      <div>${escapeHtml(joinStop)} → ${escapeHtml(leaveStop)}</div>
                      <div class="text-caption">${formatShortDate(p.join_date)} - ${formatShortDate(p.leave_date)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>

        <!-- Reviews Section -->
        <section class="ride-header-card" aria-labelledby="reviews-heading">
          <div class="flex-between">
            <h2 id="reviews-heading" style="font-size:var(--text-card);">Ride Reviews (${reviews.length})</h2>
          </div>
          ${!reviews.length ? `<p class="text-muted">No reviews yet for this ride.</p>` : `
            <div class="stack gap-4">
              ${reviews.map((r) => `
                <div style="padding-block:var(--space-3);border-bottom:1px solid var(--color-divider);">
                  <div class="flex-between" style="margin-bottom:var(--space-1);">
                    <span style="font-weight:var(--fw-semi);">${escapeHtml(r.reviewer_name)}</span>
                    <span class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                  </div>
                  <p style="margin:0;font-size:var(--text-body);">${escapeHtml(r.comment)}</p>
                </div>
              `).join('')}
            </div>
          `}

          ${viewer.canReview ? `
            <div style="margin-top:var(--space-6);padding-top:var(--space-4);border-top:1px solid var(--color-divider);">
              <h3 style="font-size:var(--text-card);margin-bottom:var(--space-3);">Leave a Review</h3>
              <form id="review-form" class="stack gap-4">
                <div class="form-field">
                  <label class="form-label" for="review-rating">Rating (1 to 5 stars)</label>
                  <select id="review-rating" class="form-select" required>
                    <option value="5">★★★★★ 5 - Outstanding</option>
                    <option value="4">★★★★☆ 4 - Great ride</option>
                    <option value="3">★★★☆☆ 3 - Good</option>
                    <option value="2">★★☆☆☆ 2 - Fair</option>
                    <option value="1">★☆☆☆☆ 1 - Poor</option>
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label" for="review-comment">Your Feedback</label>
                  <textarea id="review-comment" class="form-textarea" placeholder="How was the pace, communication, and route?" rows="3"></textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="align-self:flex-start;">Submit Review</button>
              </form>
            </div>
          ` : ''}
        </section>
      </div>

      <!-- Sticky Action Sidebar -->
      <aside class="ride-action-box">
        <!-- Host Profile Card -->
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div class="avatar avatar-md">
            <span>${escapeHtml((ride.host_name || '?').charAt(0).toUpperCase())}</span>
          </div>
          <div>
            <div style="font-weight:var(--fw-semi);">${escapeHtml(ride.host_name)}</div>
            <div class="text-caption">${escapeHtml(ride.host_bike || 'Touring Rider')}</div>
            ${ride.host_rating ? `<div class="rating-stars" style="font-size:0.875rem;">★ ${ride.host_rating} Host Rating</div>` : ''}
          </div>
        </div>

        <div class="divider"></div>

        <!-- Participation Actions -->
        ${isHost ? `
          <div class="text-muted" style="font-size:var(--text-meta);">
            You are hosting this journey. Manage stops and participants from this dashboard.
          </div>
        ` : isJoined ? `
          <div class="stack gap-3">
            <div style="background:var(--color-input);padding:var(--space-4);border-radius:var(--radius-sm);">
              <div style="font-weight:var(--fw-semi);margin-bottom:var(--space-1);">✓ You are joined!</div>
              <p class="text-muted" style="font-size:var(--text-meta);margin:0;">
                Segment: ${formatShortDate(viewer.participation.join_date)} to ${formatShortDate(viewer.participation.leave_date)}
              </p>
            </div>
            <button class="btn btn-ghost" id="btn-leave-ride" style="width:100%;">Leave This Ride</button>
          </div>
        ` : ride.status !== 'published' ? `
          <p class="text-muted">This ride is ${escapeHtml(ride.status)} and is no longer accepting new riders.</p>
        ` : `
          <div class="stack gap-4">
            <div>
              <div style="font-size:var(--text-card);font-weight:var(--fw-semi);margin-bottom:var(--space-1);">Join this Ride</div>
              <p class="text-muted" style="font-size:var(--text-meta);">Choose which segment of the journey you want to ride.</p>
            </div>

            <form id="join-segment-form" class="stack gap-3">
              <div class="form-field">
                <label class="form-label" for="join-stop">Joining Stop</label>
                <select id="join-stop" class="form-select" required>
                  ${stops.slice(0, -1).map((s) => `
                    <option value="${s.id}" data-date="${s.planned_date || ride.start_date}">${escapeHtml(s.name)}</option>
                  `).join('')}
                </select>
              </div>

              <div class="form-field">
                <label class="form-label" for="leave-stop">Leaving Stop</label>
                <select id="leave-stop" class="form-select" required>
                  ${stops.slice(1).map((s) => `
                    <option value="${s.id}" data-date="${s.planned_date || ride.end_date}">${escapeHtml(s.name)}</option>
                  `).join('')}
                </select>
              </div>

              <div class="form-field">
                <label class="form-label" for="join-date">Joining Date</label>
                <input type="date" id="join-date" class="form-input" min="${ride.start_date}" max="${ride.end_date}" value="${ride.start_date}" required>
              </div>

              <div class="form-field">
                <label class="form-label" for="leave-date">Leaving Date</label>
                <input type="date" id="leave-date" class="form-input" min="${ride.start_date}" max="${ride.end_date}" value="${ride.end_date}" required>
              </div>

              <button type="submit" class="btn btn-primary" style="width:100%;margin-top:var(--space-2);">Confirm & Join Ride</button>
            </form>
          </div>
        `}
      </aside>
    </div>
  `;

  attachEventHandlers(ride, stops);
}

function attachEventHandlers(ride, stops) {
  // Join form segment date synchronisation
  const joinStopSelect = document.getElementById('join-stop');
  const leaveStopSelect = document.getElementById('leave-stop');
  const joinDateInput = document.getElementById('join-date');
  const leaveDateInput = document.getElementById('leave-date');

  if (joinStopSelect && leaveStopSelect) {
    function updateLeaveStops() {
      const selectedJoinId = Number(joinStopSelect.value);
      const joinStop = stops.find((s) => s.id === selectedJoinId);
      if (!joinStop) return;

      if (joinStop.planned_date && joinDateInput) {
        joinDateInput.value = joinStop.planned_date;
      }

      // Filter leave stops to only those after the chosen join stop
      const validLeaveStops = stops.filter((s) => s.stop_order > joinStop.stop_order);
      const currentLeaveVal = Number(leaveStopSelect.value);

      leaveStopSelect.innerHTML = validLeaveStops.map((s) => `
        <option value="${s.id}" data-date="${s.planned_date || ride.end_date}">${escapeHtml(s.name)}</option>
      `).join('');

      if (validLeaveStops.some((s) => s.id === currentLeaveVal)) {
        leaveStopSelect.value = String(currentLeaveVal);
      } else if (validLeaveStops.length) {
        leaveStopSelect.value = String(validLeaveStops.at(-1).id);
      }
      updateLeaveDate();
    }

    function updateLeaveDate() {
      const selectedLeaveId = Number(leaveStopSelect.value);
      const leaveStop = stops.find((s) => s.id === selectedLeaveId);
      if (leaveStop?.planned_date && leaveDateInput) {
        leaveDateInput.value = leaveStop.planned_date;
      }
    }

    joinStopSelect.addEventListener('change', updateLeaveStops);
    leaveStopSelect.addEventListener('change', updateLeaveDate);
    updateLeaveStops();
  }

  // Handle Join Submission
  document.getElementById('join-segment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = await auth.getUser();
    if (!user) {
      auth.requireAuth();
      return;
    }

    const joinStopId = Number(joinStopSelect.value);
    const leaveStopId = Number(leaveStopSelect.value);
    const joinDate = joinDateInput.value;
    const leaveDate = leaveDateInput.value;

    try {
      await api.post(`/rides/${ride.id}/participants`, {
        joinStopId,
        leaveStopId,
        joinDate,
        leaveDate,
      });
      toast.success('You have successfully joined this ride!');
      loadRideDetail();
    } catch (err) {
      toast.error(err.message || 'Failed to join ride.');
    }
  });

  // Handle Leave Ride
  document.getElementById('btn-leave-ride')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to leave this ride?')) return;
    try {
      await api.del(`/rides/${ride.id}/participants/me`);
      toast.info('You have left the ride.');
      loadRideDetail();
    } catch (err) {
      toast.error(err.message || 'Failed to leave ride.');
    }
  });

  // Host Complete Ride
  document.getElementById('btn-complete-ride')?.addEventListener('click', async () => {
    if (!confirm('Mark this ride as completed? This opens the review period for participants.')) return;
    try {
      await api.post(`/rides/${ride.id}/complete`);
      toast.success('Ride marked as completed!');
      loadRideDetail();
    } catch (err) {
      toast.error(err.message || 'Could not complete ride.');
    }
  });

  // Host Cancel Ride
  document.getElementById('btn-cancel-ride')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to cancel this ride? All participants will be notified.')) return;
    try {
      await api.post(`/rides/${ride.id}/cancel`);
      toast.info('Ride has been cancelled.');
      loadRideDetail();
    } catch (err) {
      toast.error(err.message || 'Could not cancel ride.');
    }
  });

  // Review Form Submit
  document.getElementById('review-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = Number(document.getElementById('review-rating').value);
    const comment = document.getElementById('review-comment').value.trim();

    try {
      await api.post(`/rides/${ride.id}/reviews`, { rating, comment });
      toast.success('Thank you! Your review has been posted.');
      loadRideDetail();
    } catch (err) {
      toast.error(err.message || 'Failed to post review.');
    }
  });
}

document.addEventListener('DOMContentLoaded', loadRideDetail);
