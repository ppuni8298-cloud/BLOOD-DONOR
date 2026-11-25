/**
 * BLOODLINK - PYTHON FLASK API CLIENT (api-client.js)
 * Handles authenticated communication with the Flask REST Backend.
 * Automatically injects the Supabase JWT Bearer token into HTTP headers.
 */

(function () {
  'use strict';

  function getBaseUrl() {
    return window.BloodLinkConfig?.flaskApiBaseUrl || 'http://localhost:5000';
  }

  async function request(endpoint, options = {}) {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    };

    // Inject Bearer token if session exists
    const token = window.BloodLinkSession?.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const error = new Error(data.message || data.error || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.warn(`[BloodLink API Client] Request failed for ${endpoint}:`, err.message);
      throw err;
    }
  }

  const ApiClient = {
    get: (endpoint, headers) => request(endpoint, { method: 'GET', headers }),
    post: (endpoint, body, headers) => request(endpoint, { method: 'POST', body, headers }),
    put: (endpoint, body, headers) => request(endpoint, { method: 'PUT', body, headers }),
    delete: (endpoint, headers) => request(endpoint, { method: 'DELETE', headers }),

    /**
     * Check Flask API Health (Public)
     */
    async getHealth() {
      return request('/api/health', { method: 'GET' });
    },

    /**
     * Fetch authenticated user identity via Flask JWT verification middleware
     */
    async getMe() {
      return request('/api/v1/me', { method: 'GET' });
    },

    /**
     * Dispatch emergency blood beacon to Flask matching service
     */
    async dispatchEmergencyBeacon(payload) {
      return request('/api/v1/emergency/dispatch', { method: 'POST', body: payload });
    }
  };

  window.BloodLinkApiClient = ApiClient;
})();
