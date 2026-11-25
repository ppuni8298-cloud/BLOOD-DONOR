/**
 * BLOODLINK - RUNTIME CLIENT CONFIGURATION (config.js)
 * Manages runtime environment variables for the frontend.
 * Allows configuration via window.__ENV__, localStorage, or development defaults.
 * NEVER store the Supabase service-role key here.
 */

(function () {
  'use strict';

  // Read from window.__ENV__ if injected by backend/hosting, or localStorage for developer convenience
  const localEnv = (() => {
    try {
      const stored = localStorage.getItem('bloodlink_dev_env');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  })();

  const windowEnv = window.__BLOODLINK_ENV__ || {};

  const config = {
    // Supabase Public API URL & Anon Key (Safe for browser with Row Level Security enabled)
    supabaseUrl: windowEnv.SUPABASE_URL || localEnv.SUPABASE_URL || 'https://bjsvcijupiojifrgrgle.supabase.co',
    supabaseAnonKey: windowEnv.SUPABASE_ANON_KEY || localEnv.SUPABASE_ANON_KEY || 'sb_publishable_KuOjjBY2jKHYAWTYV5ovJg_YcvQ6rfO',

    // Python Flask REST API Base URL
    flaskApiBaseUrl: windowEnv.FLASK_API_URL || localEnv.FLASK_API_URL || 'http://localhost:5000',

    // Site URLs for OAuth & Password Reset Redirects
    siteUrl: window.location.origin,

    // Development Mode Flag
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  };

  /**
   * Helper to set custom dev credentials in localStorage for local testing
   */
  config.setDevCredentials = function (url, anonKey, flaskUrl) {
    const data = {
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: anonKey,
      FLASK_API_URL: flaskUrl || config.flaskApiBaseUrl
    };
    localStorage.setItem('bloodlink_dev_env', JSON.stringify(data));
    console.log('BloodLink Dev Credentials updated in localStorage. Reloading...');
    window.location.reload();
  };

  /**
   * Helper to clear custom dev credentials
   */
  config.clearDevCredentials = function () {
    localStorage.removeItem('bloodlink_dev_env');
    window.location.reload();
  };

  /**
   * Check if real valid credentials have been set
   */
  config.isConfigured = function () {
    return (
      Boolean(config.supabaseUrl) &&
      !config.supabaseUrl.includes('your-project-ref') &&
      Boolean(config.supabaseAnonKey) &&
      !config.supabaseAnonKey.includes('dummy_anon_key')
    );
  };

  window.BloodLinkConfig = config;
})();
