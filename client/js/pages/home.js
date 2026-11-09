/**
 * home.js — Landing page logic for Bikers Portal
 * Fetches upcoming rides and community highlights.
 */

import { api } from '../api-client.js';

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderRideCard(ride) {
  const seatsText = ride.seats_left > 0 ? `${ride.seats_left} seats left` : 'Fully booked';
  const seatsBadgeClass = ride.seats_left > 0 ? 'badge-open' : 'badge-full';
  const expenseText = ride.expense_type === 'shared' ? 'Shared Cost' : 'Host Sponsored';

  return `
    <a href="/ride-detail?id=${ride.id}" class="ride-card" aria-label="${ride.title}">
      <div class="ride-card__cover" style="display:flex;align-items:center;justify-content:center;background:#202020;color:#ffffff;font-size:2.5rem;">
        🏍️
      </div>
      <div class="ride-card__body">
        <div class="ride-card__route">
          <span>${ride.start_name || 'Start'}</span>
          <span>→</span>
          <span>${ride.end_name || 'Destination'}</span>
        </div>
        <h3 style="font-size:var(--text-card);line-height:1.3;margin-block:var(--space-1);">${escapeHtml(ride.title)}</h3>
        <div class="ride-card__meta">
          <span>📅 ${formatDate(ride.start_date)}</span>
          ${ride.stop_count ? `<span>📍 ${ride.stop_count} stops</span>` : ''}
        </div>
        <div class="ride-card__badges">
          <span class="badge ${seatsBadgeClass}">${seatsText}</span>
          <span class="badge badge-shared">${expenseText}</span>
        </div>
      </div>
    </a>
  `;
}

function renderPostCard(post) {
  const authorInit = (post.display_name || '?').charAt(0).toUpperCase();
  return `
    <div class="community-post-preview">
      <div class="community-post-preview__author">
        <div class="avatar avatar-sm"><span>${escapeHtml(authorInit)}</span></div>
        <div>
          <div style="font-weight:var(--fw-semi);font-size:var(--text-meta);">${escapeHtml(post.display_name)}</div>
          <div class="text-caption">${escapeHtml(post.bike_model || 'Rider')}</div>
        </div>
      </div>
      <p class="community-post-preview__text">${escapeHtml(post.body)}</p>
      ${post.ride_title ? `<div class="text-caption" style="margin-top:var(--space-2);">🏍️ ${escapeHtml(post.ride_title)}</div>` : ''}
    </div>
  `;
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

async function loadHomeRides() {
  const container = document.getElementById('home-rides-grid');
  const seeAllBtn = document.getElementById('see-all-rides-btn');
  if (!container) return;

  try {
    const data = await api.get('/rides?limit=4');
    const rides = data?.rides || [];

    if (!rides.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state__icon">🏍️</div>
          <div class="empty-state__title">No upcoming rides right now</div>
          <p class="empty-state__text">Be the first to host an epic journey across India!</p>
          <a href="/host-ride" class="btn btn-primary" style="margin-top:var(--space-4);">Host a Ride</a>
        </div>
      `;
      return;
    }

    container.innerHTML = rides.map(renderRideCard).join('');
    if (seeAllBtn) seeAllBtn.style.display = 'inline-flex';
  } catch (err) {
    console.error('Failed to load rides:', err);
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <p class="empty-state__text">Unable to load rides. Please check your connection.</p>
      </div>
    `;
  }
}

async function loadHomePosts() {
  const container = document.getElementById('home-posts-grid');
  if (!container) return;

  try {
    const data = await api.get('/posts?limit=3');
    const posts = data?.posts || [];

    if (!posts.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <p class="empty-state__text">No community stories yet. Head over to the community feed to share yours!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = posts.map(renderPostCard).join('');
  } catch (err) {
    console.error('Failed to load community highlights:', err);
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <p class="empty-state__text">Unable to load posts at this moment.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadHomeRides();
  loadHomePosts();
});
