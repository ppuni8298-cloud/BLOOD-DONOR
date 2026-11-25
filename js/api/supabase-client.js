/**
 * BLOODLINK - SUPABASE CLIENT SINGLETON (supabase-client.js)
 * Initializes the official Supabase JS Client for browser operations.
 * Operates with the publishable Anon Key and relies on PostgreSQL Row Level Security (RLS).
 * NEVER expose the service-role key in this file or any frontend script.
 */

(function () {
  'use strict';

  let clientInstance = null;
  const config = window.BloodLinkConfig || {
    supabaseUrl: 'https://your-project-ref.supabase.co',
    supabaseAnonKey: 'dummy_key',
    isConfigured: () => false
  };

  function initSupabase() {
    if (clientInstance) return clientInstance;

    // Check if the official @supabase/supabase-js library is loaded
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn(
        '[BloodLink Supabase] Supabase JS library not loaded. Make sure @supabase/supabase-js is included via CDN in the HTML.'
      );
      return null;
    }

    try {
      clientInstance = window.supabase.createClient(
        config.supabaseUrl,
        config.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'bloodlink_auth_token',
            flowType: 'pkce'
          }
        }
      );

      if (!config.isConfigured()) {
        console.info(
          '%c[BloodLink Architecture]%c Supabase client initialized with placeholder credentials. Configure .env or call BloodLinkConfig.setDevCredentials(url, anonKey) to connect live instance.',
          'background: #C71932; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #5F6368;'
        );
      } else {
        console.log(
          '%c[BloodLink Architecture]%c Live Supabase Client connected to: ' + config.supabaseUrl,
          'background: #10B981; color: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
          'color: #202124;'
        );
      }

      return clientInstance;
    } catch (err) {
      console.error('[BloodLink Supabase] Initialization error:', err);
      return null;
    }
  }

  // Self-initialize if library is already present
  if (window.supabase) {
    initSupabase();
  } else {
    window.addEventListener('DOMContentLoaded', initSupabase);
  }

  window.BloodLinkSupabase = {
    getClient: () => clientInstance || initSupabase(),
    isConfigured: () => config.isConfigured && config.isConfigured(),
    auth: () => (clientInstance ? clientInstance.auth : null),
    from: (table) => (clientInstance ? clientInstance.from(table) : null)
  };
})();
