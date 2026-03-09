/**
 * Sends a POST request to a specified authentication endpoint.
 * @param {string} endpoint - The API endpoint to hit (e.g., '/api/auth/login').
 * @param {object} data - The JSON data to send in the request body.
 * @returns {Promise<object>} - The JSON response body from the server.
 * @throws {Error} - Throws an error if the network response is not OK.
 */
export async function postAuthRequest(endpoint, data) {
  console.log(`[API] POST ${endpoint}`, data);
  const response = await fetch(endpoint, {
    method: 'post',
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

  if (response.status !== 200) {
    throw new Error(body.msg || 'An unknown error occurred');
  }

  return body;
}

export async function logout() {
  await fetch(`/api/auth/logout`, {
    method: 'delete',
  });
}
