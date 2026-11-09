/**
 * api.js — Fetch wrapper + auth state management
 * Bikers Portal shared module
 */

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch('/api' + path, opts);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw { status: res.status, message: data.error || res.statusText };
  }

  // 204 No Content — return null instead of trying to parse empty body
  if (res.status === 204) return null;

  return res.json();
}

// ---------------------------------------------------------------------------
// API object
// ---------------------------------------------------------------------------

export const api = {
  /** GET /api{path} */
  async get(path) {
    return request('GET', path);
  },

  /** POST /api{path} with JSON body */
  async post(path, body) {
    return request('POST', path, body);
  },

  /** PUT /api{path} with JSON body */
  async put(path, body) {
    return request('PUT', path, body);
  },

  /** DELETE /api{path} */
  async del(path) {
    return request('DELETE', path);
  },
};

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

/** In-memory cache: undefined = not yet fetched, null = not logged in, object = user */
let _user = undefined;

export const auth = {
  /**
   * Returns the cached authenticated user, or null if not logged in.
   * Fetches /api/auth/me on first call, then caches indefinitely until
   * invalidate() is called.
   */
  async getUser() {
    if (_user !== undefined) return _user;
    _user = await api.get('/auth/me').then((d) => d.user ?? d).catch(() => null);
    return _user;
  },

  /**
   * Clears the in-memory user cache, forcing a fresh fetch on next getUser().
   */
  invalidate() {
    _user = undefined;
  },

  /**
   * Logs the user out, clears the cache, and redirects to home.
   */
  async logout() {
    await api.post('/auth/logout').catch(() => {});
    auth.invalidate();
    location.href = '/';
  },

  /**
   * Ensures the user is logged in. If not, redirects to /login with a
   * ?redirect= param pointing back to the current page (or the given path).
   * Returns the user object if logged in, null otherwise (after redirect).
   *
   * @param {string} [redirect] — override redirect path (defaults to location.pathname + search)
   */
  async requireAuth(redirect) {
    const user = await auth.getUser();
    if (!user) {
      const target = redirect || location.pathname + location.search;
      location.href = '/login?redirect=' + encodeURIComponent(target);
      return null;
    }
    return user;
  },
};
