/**
 * nav.js — Site-wide navigation initialisation
 * Bikers Portal shared module
 *
 * Automatically handles:
 *   - Active link/tab highlighting
 *   - Hamburger → slide-in drawer (tablet)
 *   - Avatar dropdown menu (desktop)
 *   - Scroll-aware top nav border
 *   - Logout button wiring
 *   - Auth-dependent show/hide via data-auth="required|guest"
 *   - Avatar initials from user display_name
 *   - Notification bell dot from unread count
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
  document.querySelectorAll('.tab-bar .tab-bar__item').forEach((el) => {
    const href = el.getAttribute('href') || el.querySelector('a')?.getAttribute('href');
    if (href && isCurrentPage(href)) {
      el.classList.add('active');
      el.setAttribute('aria-current', 'page');
    }
  });
}

/** Hamburger → nav drawer + overlay. */
function initDrawer() {
  const hamburger = document.getElementById('nav-hamburger') ||
                    document.querySelector('.nav-hamburger, [data-nav-toggle]');
  const drawer    = document.getElementById('nav-drawer') ||
                    document.querySelector('.nav-drawer');
  const overlay   = document.getElementById('nav-drawer-overlay') ||
                    document.querySelector('.nav-drawer__overlay');
  const closeBtn  = document.getElementById('nav-drawer-close');

  if (!hamburger || !drawer) return;

  function openDrawer() {
    drawer.classList.add('open');
    overlay?.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay?.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    const isOpen = drawer.classList.contains('open');
    isOpen ? closeDrawer() : openDrawer();
  });

  closeBtn?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);

  // Close drawer when any link inside it is clicked
  drawer.querySelectorAll('a[href]').forEach((a) => {
    a.addEventListener('click', closeDrawer);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });
}

/** Avatar dropdown toggle. */
function initDropdown() {
  // Support both: button#nav-avatar-btn and .nav-avatar / [data-dropdown-toggle]
  const trigger  = document.getElementById('nav-avatar-btn') ||
                   document.querySelector('.nav-avatar, [data-dropdown-toggle]');
  const dropdown = document.getElementById('nav-dropdown-menu') ||
                   document.querySelector('.nav-dropdown__menu');

  if (!trigger || !dropdown) return;

  // Initial hidden state — set via attribute (CSS .open shows it)
  if (!dropdown.classList.contains('open')) {
    dropdown.style.display = 'none';
  }

  function openDropdown() {
    dropdown.style.display = '';
    dropdown.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.style.display = 'none';
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    isOpen ? closeDropdown() : openDropdown();
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (dropdown.classList.contains('open') &&
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
  const nav = document.getElementById('site-nav') ||
              document.querySelector('.site-nav');
  if (!nav) return;

  function update() {
    nav.classList.toggle('scrolled', window.scrollY > 0);
  }

  update(); // run once on load in case page is already scrolled
  window.addEventListener('scroll', update, { passive: true });
}

/** Wire up logout button(s). */
function initLogout() {
  // Support id="nav-logout-btn", data-logout attribute, or .nav-logout class
  const selectors = '#nav-logout-btn, [data-logout], .nav-logout';
  document.querySelectorAll(selectors).forEach((btn) => {
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
      // Also clear inline display:none that may have been set for initial render
      if (user && el.style.display === 'none') el.style.display = '';
    } else if (rule === 'guest') {
      el.hidden = !!user;
      if (!user && el.style.display === 'none') el.style.display = '';
    }
  });

  // Populate avatar initials
  if (user) {
    // Try id-based selector first (matches the HTML), then class-based fallback
    const initialsEl = document.getElementById('nav-avatar-initials') ||
                       document.querySelector('.nav-avatar__initials');

    if (initialsEl && user.display_name) {
      const parts = user.display_name.trim().split(/\s+/);
      initialsEl.textContent = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
    }

    // Set any user name text nodes (optional elements)
    document.querySelectorAll('.nav-user-name').forEach((el) => {
      el.textContent = user.display_name || '';
    });
  }
}

/** Fetch unread notification count and show bell dot if > 0. */
async function initNotificationBell(user) {
  if (!user) return;

  const dot = document.getElementById('nav-bell-dot') ||
              document.querySelector('.nav-bell__dot');
  if (!dot) return;

  // Show the bell button itself
  const bellBtn = document.getElementById('nav-bell-btn') ||
                  document.querySelector('.nav-bell');
  if (bellBtn && bellBtn.style.display === 'none') {
    bellBtn.style.display = '';
  }

  try {
    const data = await api.get('/notifications/unread-count');
    const count = data?.count ?? data?.unread_count ?? 0;
    if (count > 0) {
      dot.classList.add('show');
      dot.textContent = count > 9 ? '9+' : String(count);
    } else {
      dot.classList.remove('show');
      dot.textContent = '';
    }
  } catch {
    // Non-critical — silently ignore
    dot.classList.remove('show');
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Initialise all navigation behaviour.
 * Automatically called on DOMContentLoaded from each page via:
 *   <script type="module" src="/js/nav.js"></script>
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

// Auto-initialise when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNav);
} else {
  initNav();
}
