/**
 * BLOODLINK - SESSION MANAGER (session-manager.js)
 * Manages Supabase Auth session persistence, token refreshes,
 * and role-based route protection for dashboards and protected pages.
 */

(function () {
  'use strict';

  let currentSession = null;
  let currentUser = null;
  let currentProfile = null;
  let isInitialized = false;

  const ROLE_DASHBOARDS = {
    donor: 'donor-dashboard.html',
    patient: 'patient-dashboard.html',
    hospital: 'hospital-dashboard.html',
    blood_bank: 'bloodbank-dashboard.html',
    admin: 'admin-dashboard.html',
    super_admin: 'admin-dashboard.html',
    operations_admin: 'admin-dashboard.html',
    verification_admin: 'admin-dashboard.html',
    security_auditor: 'admin-dashboard.html',
    analytics_viewer: 'admin-dashboard.html'
  };

  /**
   * Initialize Auth State listener
   */
  async function initSession() {
    const supabase = window.BloodLinkSupabase?.getClient();
    if (!supabase) return null;

    try {
      // 1. Get initial session
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;

      currentSession = session;
      currentUser = session?.user || null;

      // 2. Fetch profile if logged in
      if (currentUser) {
        await refreshProfile();
      }

      // 3. Subscribe to auth changes (sign in, sign out, token refreshed)
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`[BloodLink Auth Event] ${event}`);
        currentSession = session;
        currentUser = session?.user || null;

        if (event === 'SIGNED_IN' && currentUser) {
          await refreshProfile();
          window.dispatchEvent(new CustomEvent('bloodlink:auth:signin', { detail: { user: currentUser, profile: currentProfile } }));
        } else if (event === 'SIGNED_OUT') {
          currentProfile = null;
          window.dispatchEvent(new CustomEvent('bloodlink:auth:signout'));
        } else if (event === 'TOKEN_REFRESHED') {
          window.dispatchEvent(new CustomEvent('bloodlink:auth:refreshed', { detail: { session } }));
        }
      });

      isInitialized = true;
      return currentSession;
    } catch (err) {
      console.warn('[BloodLink SessionManager] Could not retrieve session:', err.message);
      return null;
    }
  }

  /**
   * Refreshes the cached user profile from public.profiles
   */
  async function refreshProfile() {
    if (!currentUser) return null;
    const supabase = window.BloodLinkSupabase?.getClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!error && data) {
        currentProfile = data;
      }
      return currentProfile;
    } catch (err) {
      console.warn('[BloodLink SessionManager] Error fetching profile:', err.message);
      return null;
    }
  }

  /**
   * Get JWT Access Token for Flask backend authorization
   */
  function getAccessToken() {
    return currentSession?.access_token || null;
  }

  /**
   * Get target dashboard URL for a given role/account_type
   */
  function getDashboardForRole(role) {
    return ROLE_DASHBOARDS[role] || 'donor-dashboard.html';
  }

  /**
   * Redirect user to appropriate dashboard based on their role
   */
  function redirectToRoleDashboard(role) {
    const target = getDashboardForRole(role);
    window.location.href = target;
  }

  /**
   * Protected Route Guard: Enforces authentication and specific role authorization.
   * If not logged in -> redirects to auth.html.
   * If role mismatch -> shows message and redirects to their valid dashboard.
   */
  async function requireAuth(options = {}) {
    const allowedRoles = options.allowedRoles || [];
    const redirectToLogin = options.redirectToLogin !== false;

    // Ensure session is initialized
    if (!isInitialized) {
      await initSession();
    }

    const supabase = window.BloodLinkSupabase?.getClient();
    if (!supabase || !window.BloodLinkConfig.isConfigured()) {
      // In unconfigured development mode, check if there's a simulated dev user in localStorage
      const devUser = localStorage.getItem('bloodlink_dev_user');
      if (devUser) {
        try {
          const parsed = JSON.parse(devUser);
          currentUser = parsed.user;
          currentProfile = parsed.profile;
          // Check role
          if (allowedRoles.length > 0 && currentProfile?.account_type && !allowedRoles.includes(currentProfile.account_type)) {
            alert(`Access Denied: Your account type (${currentProfile.account_type}) is not authorized for this dashboard.`);
            redirectToRoleDashboard(currentProfile.account_type);
            return false;
          }
          return true;
        } catch(e) {}
      }
      
      // If unauthenticated in unconfigured mode
      if (redirectToLogin) {
        console.warn('[SessionManager] Unauthenticated user on protected route. Redirecting to auth.html');
        window.location.href = 'auth.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
      }
      return false;
    }

    if (!currentUser) {
      if (redirectToLogin) {
        window.location.href = 'auth.html?redirect=' + encodeURIComponent(window.location.pathname);
      }
      return false;
    }

    // Role check
    if (allowedRoles.length > 0) {
      if (!currentProfile) {
        await refreshProfile();
      }

      const userRole = currentProfile?.account_type || currentUser.user_metadata?.account_type || 'donor';

      if (!allowedRoles.includes(userRole)) {
        if (window.BloodLinkToast) {
          window.BloodLinkToast.error(
            `Access Denied: Your account role (${userRole}) cannot access this section. Redirecting to your dashboard...`,
            'Unauthorized'
          );
        } else {
          alert(`Access Denied: Your role (${userRole}) is not permitted on this dashboard.`);
        }

        setTimeout(() => {
          redirectToRoleDashboard(userRole);
        }, 1500);

        return false;
      }
    }

    return true;
  }

  /**
   * Log out of the current Supabase session
   */
  async function signOut() {
    const supabase = window.BloodLinkSupabase?.getClient();
    localStorage.removeItem('bloodlink_dev_user');

    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }

    currentSession = null;
    currentUser = null;
    currentProfile = null;

    if (window.BloodLinkToast) {
      window.BloodLinkToast.info('You have been signed out successfully.', 'Session Closed');
    }

    setTimeout(() => {
      window.location.href = 'auth.html';
    }, 600);
  }

  // Self-initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSession);
  } else {
    initSession();
  }

  window.BloodLinkSession = {
    init: initSession,
    getSession: () => currentSession,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    getAccessToken,
    getDashboardForRole,
    redirectToRoleDashboard,
    requireAuth,
    refreshProfile,
    signOut
  };
})();
