/**
 * Fetch wrappers for every API call the app makes.
 *
 * All of them reject with an {@link ApiError}, which keeps the HTTP status and
 * the server's `reauthRequired` flag alongside the message. The account page
 * uses that flag to open the reauthentication prompt instead of showing the
 * user a bare "Forbidden".
 */

/** An error raised by the API, carrying the status and server-supplied flags. */
export class ApiError extends Error {
  constructor(message, { status = 0, reauthRequired = false, operation = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reauthRequired = reauthRequired;
    this.operation = operation;
  }
}

/**
 * Reads a response body as JSON, tolerating empty and non-JSON bodies so that
 * a 204 or an HTML error page does not turn into a confusing parse error.
 */
async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Throws an ApiError when the response failed. Prefers the server's `error`
 * message and falls back to something that names the status, rather than the
 * generic messages that used to hide the real cause.
 */
async function throwIfNotOk(response, fallbackMessage) {
  if (response.ok) return null;
  const body = await readBody(response);
  throw new ApiError(
    (body && body.error) || `${fallbackMessage} (${response.status} ${response.statusText})`,
    {
      status: response.status,
      reauthRequired: Boolean(body && body.reauthRequired),
      operation: (body && body.operation) || null,
    }
  );
}

async function request(endpoint, { method = 'GET', body, fallback } = {}) {
  const response = await fetch(endpoint, {
    method,
    headers: body === undefined ? undefined : { 'Content-type': 'application/json; charset=UTF-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await throwIfNotOk(response, fallback || `Request to ${endpoint} failed`);
  return readBody(response);
}

/**
 * Sends a POST request to an authentication endpoint.
 * @param {string} endpoint - The API endpoint to hit (e.g., '/api/auth/login').
 * @param {object} data - The JSON data to send in the request body.
 * @returns {Promise<object>} - The JSON response body from the server.
 * @throws {ApiError} - If the network response is not OK.
 */
export async function postAuthRequest(endpoint, data) {
  console.log(`[API] POST ${endpoint}`, data);
  const body = await request(endpoint, { method: 'POST', body: data, fallback: 'Request failed' });
  if (body === null) {
    throw new ApiError('Server returned an empty response.', { status: 0 });
  }
  return body;
}

export async function logout() {
  await fetch(`/api/auth/logout`, { method: 'DELETE' });
}

export async function getUser() {
  const response = await fetch('/api/auth/me');
  if (response.ok) {
    return response.json();
  }
  // If 401/403, the user is simply not logged in.
  if (response.status === 401 || response.status === 403) {
    return null;
  }
  // If 500 or other error, throw so the app knows there is a problem
  throw new ApiError(`Failed to fetch user: ${response.status} ${response.statusText}`, {
    status: response.status,
  });
}

export async function updatePassword(password) {
  await request('/api/auth/password', {
    method: 'PUT',
    body: { password },
    fallback: 'Failed to update password',
  });
}

export async function deleteAccount() {
  await request('/api/auth/account', { method: 'DELETE', fallback: 'Failed to delete account' });
}

export async function getPasskeys() {
  const response = await fetch('/api/auth/passkeys');
  if (response.ok) {
    return response.json();
  }
  if (response.status === 401 || response.status === 403) {
    return [];
  }
  throw new ApiError(`Failed to fetch passkeys: ${response.status} ${response.statusText}`, {
    status: response.status,
  });
}

export async function renamePasskey(id, name) {
  return request(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { name },
    fallback: 'Failed to rename passkey',
  });
}

export async function deletePasskey(id) {
  await request(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    fallback: 'Failed to delete passkey',
  });
}

// --- Reauthentication ------------------------------------------------------

/** Which reauthentication methods are available and whether one is still valid. */
export async function getReauthStatus() {
  return request('/api/auth/reauth-status', { fallback: 'Failed to check reauthentication status' });
}

export async function getReauthOptions() {
  return request('/api/auth/reauth-options', {
    method: 'POST',
    body: {},
    fallback: 'Failed to start reauthentication',
  });
}

export async function verifyReauth(assertion) {
  return request('/api/auth/reauth-verify', {
    method: 'POST',
    body: assertion,
    fallback: 'Reauthentication failed',
  });
}

export async function reauthWithPassword(password) {
  return request('/api/auth/reauth-password', {
    method: 'POST',
    body: { password },
    fallback: 'Reauthentication failed',
  });
}
