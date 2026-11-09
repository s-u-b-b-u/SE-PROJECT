/**
 * nav.js — Site-wide navigation initialisation
 * Bikers Portal shared module
 *
 * Call initNav() on DOMContentLoaded from every page.
 */

import { auth, api } from './api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the given href matches the current page pathname. */
function isCurrentPage(href) {
  if (!href || href === '#') return false;
  try {
    const url = new URL(href, location.origin);
    return url.pathname === location.pathname;
  } catch {
    return href === location.pathname;
  }
}

// ---------------------------------------------------------------------------
// Sub-initialisers
// ---------------------------------------------------------------------------

/** Mark active nav links with aria-current='page'. */
function initActiveLinks() {
  document.querySelectorAll('.site-nav a[href], .nav-drawer a[href]').forEach((a) => {
    if (isCurrentPage(a.getAttribute('href'))) {
      a.setAttribute('aria-current', 'page');
    }
  });
}

/** Mark active tab-bar item. */
function initTabBar() {
  document.querySelectorAll('.tab-bar__item[href], .tab-bar__item a[href]').forEach((el) => {
    const href = el.tagName === 'A' ? el.getAttribute('href') : el.querySelector('a')?.getAttribute('href');
    if (href && isCurrentPage(href)) {
      // Support both <a class="tab-bar__item"> and wrapper <div> patterns
      const item = el.closest('.tab-bar__item') || el;
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    }
  });
}

/** Hamburger → nav drawer + overlay. */
function initDrawer() {
  const hamburger = document.querySelector('.nav-hamburger, [data-nav-toggle]');
  const drawer    = document.querySelector('.nav-drawer');
  const overlay   = document.querySelector('.nav-drawer__overlay');

  if (!hamburger || !drawer) return;

  function openDrawer() {
    drawer.classList.add('is-open');
    overlay?.classList.add('is-visible');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    overlay?.classList.remove('is-visible');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('is-open');
    isOpen ? closeDrawer() : openDrawer();
  });

  overlay?.addEventListener('click', closeDrawer);

  // Close drawer when any link inside it is clicked
  drawer.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener('click', closeDrawer);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });
}

/** Avatar dropdown toggle. */
function initDropdown() {
  const trigger  = document.querySelector('.nav-avatar, [data-dropdown-toggle]');
  const dropdown = document.querySelector('.nav-dropdown__menu');

  if (!trigger || !dropdown) return;

  function openDropdown() {
    dropdown.removeAttribute('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    dropdown.setAttribute('hidden', '');
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hasAttribute('hidden');
    isOpen ? closeDropdown() : openDropdown();
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (!dropdown.hasAttribute('hidden') &&
        !dropdown.contains(e.target) &&
        !trigger.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });
}

/** Scroll-aware top nav (adds .scrolled when page is scrolled). */
function initScrollBehaviour() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  function update() {
    nav.classList.toggle('scrolled', window.scrollY > 0);
  }

  update(); // run once on load in case page is already scrolled
  window.addEventListener('scroll', update, { passive: true });
}

/** Wire up logout button(s). */
function initLogout() {
  document.querySelectorAll('[data-logout], .nav-logout').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await auth.logout();
    });
  });
}

/**
 * Show/hide elements based on auth state.
 *   data-auth="required" → visible only when logged in
 *   data-auth="guest"    → visible only when logged out
 */
async function initAuthVisibility(user) {
  document.querySelectorAll('[data-auth]').forEach((el) => {
    const rule = el.dataset.auth;
    if (rule === 'required') {
      el.hidden = !user;
    } else if (rule === 'guest') {
      el.hidden = !!user;
    }
  });

  // Populate avatar image / initials if the nav has a placeholder
  if (user) {
    const avatarImg = document.querySelector('.nav-avatar__img');
    const avatarInitials = document.querySelector('.nav-avatar__initials');

    if (avatarImg) {
      if (user.avatar_url) {
        avatarImg.src = user.avatar_url;
        avatarImg.alt = user.name || 'Your avatar';
        avatarImg.hidden = false;
        if (avatarInitials) avatarInitials.hidden = true;
      }
    } else if (avatarInitials && user.name) {
      const parts = user.name.trim().split(/\s+/);
      avatarInitials.textContent = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    }

    // Set display name text nodes
    document.querySelectorAll('.nav-user-name').forEach((el) => {
      el.textContent = user.name || user.username || '';
    });
  }
}

/** Fetch unread notification count and show bell dot if > 0. */
async function initNotificationBell(user) {
  if (!user) return;

  const dot = document.querySelector('.nav-bell__dot');
  if (!dot) return;

  try {
    const data = await api.get('/notifications/unread-count');
    const count = data?.count ?? data?.unread_count ?? 0;
    dot.hidden = count === 0;
    dot.textContent = count > 9 ? '9+' : count > 0 ? String(count) : '';
  } catch {
    // Non-critical — silently ignore
    dot.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Initialise all navigation behaviour.
 * Call once per page on DOMContentLoaded.
 *
 * @example
 * import { initNav } from '/js/nav.js';
 * document.addEventListener('DOMContentLoaded', initNav);
 */
export async function initNav() {
  // Run sync initialisers immediately
  initActiveLinks();
  initTabBar();
  initDrawer();
  initDropdown();
  initScrollBehaviour();
  initLogout();

  // Auth-dependent initialisers — resolve in parallel
  const user = await auth.getUser();
  await Promise.all([
    initAuthVisibility(user),
    initNotificationBell(user),
  ]);
}
