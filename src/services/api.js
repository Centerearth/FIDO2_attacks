/**
 * Sends a POST request to a specified authentication endpoint.
 * @param {string} endpoint - The API endpoint to hit (e.g., '/api/auth/login').
 * @param {object} data - The JSON data to send in the request body.
 * @returns {Promise<object>} - The JSON response body from the server.
 * @throws {Error} - Throws an error if the network response is not OK.
 */

//the middleman

async function throwIfNotOk(response, fallbackMessage) {
  if (response.ok) return;
  let message = fallbackMessage;
  try {
    const body = await response.json();
    message = body.error || fallbackMessage;
  } catch (e) { /* ignore non-JSON error responses */ }
  throw new Error(message);
}

export async function postAuthRequest(endpoint, data) {
  console.log(`[API] POST ${endpoint}`, data);
  const response = await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
    },
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`Server returned non-JSON response: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'An unknown error occurred');
  }

  return body;
}

export async function logout() {
  await fetch(`/api/auth/logout`, {
    method: 'DELETE',
  });
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
  throw new Error(`Failed to fetch user: ${response.status} ${response.statusText}`);
}

export async function updatePassword(newPassword) {
  const response = await fetch('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ password: newPassword }),
    headers: { 'Content-type': 'application/json; charset=UTF-8' },
  });
  await throwIfNotOk(response, 'Failed to update password');
}

export async function deleteAccount() {
  const response = await fetch('/api/auth/account', { method: 'DELETE' });
  await throwIfNotOk(response, 'Failed to delete account');
}

export async function getPasskeys() {
  const response = await fetch('/api/auth/passkeys');
  if (response.ok) {
    return response.json();
  }
  if (response.status === 401 || response.status === 403) {
    return [];
  }
  throw new Error(`Failed to fetch passkeys: ${response.status} ${response.statusText}`);
}

export async function deletePasskey(id) {
  const response = await fetch(`/api/auth/passkeys/${id}`, { method: 'DELETE' });
  await throwIfNotOk(response, 'Failed to delete passkey');
}
