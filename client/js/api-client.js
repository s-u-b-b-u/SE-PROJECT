/**
 * api-client.js — Fetch wrapper that sends cookies and handles errors.
 * Bikers Portal shared client module.
 */

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Core HTTP request helper.
 * Automatically adds credentials: 'include' for cookie authentication,
 * sets Content-Type to application/json for payloads, and unwraps errors.
 *
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path - URL path relative to /api (e.g. '/rides')
 * @param {object} [body] - JSON serializable payload
 * @returns {Promise<any>}
 */
async function request(method, path, body) {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;
  const options = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    throw new ApiError(0, 'Network error. Please check your connection.', netErr);
  }

  // 204 No Content
  if (res.status === 204) {
    return null;
  }

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = {};
    }
  } else {
    data = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const errorMsg = (data && typeof data === 'object' && data.error) || res.statusText || 'An error occurred';
    const details = (data && typeof data === 'object' && data.details) || null;
    throw new ApiError(res.status, errorMsg, details);
  }

  return data;
}

export const api = {
  get(path) {
    return request('GET', path);
  },
  post(path, body) {
    return request('POST', path, body);
  },
  put(path, body) {
    return request('PUT', path, body);
  },
  del(path) {
    return request('DELETE', path);
  },
  request,
  ApiError,
};

export { ApiError };
export default api;
