/**
 * auth.js — Session state management and page guards
 * Bikers Portal shared client module
 */

import { api } from './api-client.js';

let _user = undefined;
let _fetchPromise = null;

export const auth = {
  /**
   * Retrieves the current user profile from `/api/auth/me` or returns cached profile.
   * Resolves to user object or `null` if not logged in.
   */
  async getUser() {
    if (_user !== undefined) return _user;
    if (_fetchPromise) return _fetchPromise;

    _fetchPromise = api.get('/auth/me')
      .then((data) => {
        _user = data && data.user ? data.user : null;
        return _user;
      })
      .catch(() => {
        _user = null;
        return null;
      })
      .finally(() => {
        _fetchPromise = null;
      });

    return _fetchPromise;
  },

  /**
   * Clears cached session state so next getUser() triggers a network check.
   */
  invalidate() {
    _user = undefined;
    _fetchPromise = null;
  },

  /**
   * Authenticates user with email and password.
   */
  async login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    _user = data?.user || null;
    return _user;
  },

  /**
   * Registers a new rider account.
   */
  async register(details) {
    const data = await api.post('/auth/register', details);
    _user = data?.user || null;
    return _user;
  },

  /**
   * Logs out the current user and clears session state.
   */
  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors during logout
    }
    this.invalidate();
    window.location.href = '/';
  },

  /**
   * Page guard: requires a logged-in user.
   * If not logged in, redirects to /login?redirect=<target>.
   *
   * @param {string} [redirectUrl] - Target URL to return to after login.
   * @returns {Promise<object|null>}
   */
  async requireAuth(redirectUrl) {
    const user = await this.getUser();
    if (!user) {
      const target = redirectUrl || (window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
      return null;
    }
    return user;
  },

  /**
   * Page guard: requires an admin user.
   * If not an admin, redirects to / or login.
   */
  async requireAdmin(redirectUrl = '/') {
    const user = await this.requireAuth();
    if (!user) return null;
    if (user.role !== 'admin') {
      window.location.href = redirectUrl;
      return null;
    }
    return user;
  },

  /**
   * Page guard: for guest-only pages like /login and /register.
   * If already logged in, redirects to the provided destination (default '/').
   */
  async requireGuest(destination = '/') {
    const user = await this.getUser();
    if (user) {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect') || destination;
      window.location.href = redirect;
      return null;
    }
    return true;
  },
};

export default auth;
