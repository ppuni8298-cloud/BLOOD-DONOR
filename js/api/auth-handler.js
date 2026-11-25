/**
 * BLOODLINK - ADVANCED AUTHENTICATION HANDLER (auth-handler.js)
 * Implements real email authentication, password validation, role assignment,
 * Google OAuth integration, password reset, and session callbacks with Supabase Auth.
 */

(function () {
  'use strict';

  function initAuth() {
    const supabase = window.BloodLinkSupabase?.getClient();
    const config = window.BloodLinkConfig;
    const sessionManager = window.BloodLinkSession;

    const authTabs = document.querySelectorAll('.auth-tab-btn');
    const authPanels = document.querySelectorAll('.auth-form-panel');
    const accountTypeOptions = document.querySelectorAll('.role-option-card');
    const roleInput = document.getElementById('signup-account-type');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const googleBtns = document.querySelectorAll('.btn-google-oauth');
    const forgotPwdLinks = document.querySelectorAll('.forgot-pwd-link');

    // 1. Check for OAuth Callback or Password Reset Token in URL
    handleAuthUrlCallbacks();

    // 2. Tab Switching between Sign In & Sign Up
    if (authTabs.length && authPanels.length) {
      authTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const targetTab = tab.getAttribute('data-target-tab');

          authTabs.forEach((t) => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          authPanels.forEach((p) => p.classList.remove('active'));

          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          const activePanel = document.getElementById(targetTab);
          if (activePanel) {
            activePanel.classList.add('active');
          }
        });
      });
    }

    // 3. Account Type Role Selector (Donor, Patient/Guardian, Hospital, Blood Bank)
    if (accountTypeOptions.length) {
      accountTypeOptions.forEach((option) => {
        option.addEventListener('click', () => {
          accountTypeOptions.forEach((opt) => opt.classList.remove('selected'));
          option.classList.add('selected');

          const roleValue = option.getAttribute('data-role');
          if (roleInput) {
            roleInput.value = roleValue;
          }

          // Show specific role guidance
          updateRoleFieldsGuidance(roleValue);
        });
      });
    }

    // 4. Real Email & Password Login
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginForm.querySelector('#login-email')?.value.trim();
        const password = loginForm.querySelector('#login-password')?.value;
        const remember = loginForm.querySelector('#login-remember')?.checked;

        if (!email || !password) {
          showToast('Please enter both email and password.', 'error', 'Validation');
          return;
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true, 'Authenticating...');

        try {
          if (!config.isConfigured()) {
            // Development fallback when credentials are not yet populated in .env
            console.warn('[BloodLink Auth] Running in Development Sandbox. Simulating Supabase sign in.');
            setTimeout(() => {
              setLoadingState(submitBtn, false);
              handleSuccessfulAuth({
                email,
                user_metadata: { full_name: email.split('@')[0], account_type: 'donor' }
              });
            }, 600);
            return;
          }

          // Real Supabase Authentication call
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            throw error;
          }

          showToast('Authentication successful! Loading dashboard...', 'success', 'Welcome');
          setLoadingState(submitBtn, true, 'Redirecting...');

          // Fetch profile and redirect based on role
          setTimeout(async () => {
            await handleSuccessfulAuth(data.user);
          }, 500);

        } catch (err) {
          setLoadingState(submitBtn, false);
          handleAuthError(err, 'Sign In Failed');
        }
      });
    }

    // 5. Real Email & Password Sign Up with Role Assignment
    if (signupForm) {
      // Add real-time password strength indicator
      setupPasswordStrengthIndicator(signupForm);

      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = signupForm.querySelector('#signup-name')?.value.trim();
        const email = signupForm.querySelector('#signup-email')?.value.trim();
        const password = signupForm.querySelector('#signup-password')?.value;
        const confirmPassword = signupForm.querySelector('#signup-confirm-password')?.value;
        const accountType = roleInput ? roleInput.value : 'donor';

        if (!fullName || !email || !password || !confirmPassword) {
          showToast('Please complete all required fields.', 'error', 'Missing Data');
          return;
        }

        if (password.length < 8) {
          showToast('Password must be at least 8 characters long.', 'warning', 'Security');
          return;
        }

        if (password !== confirmPassword) {
          showToast('Passwords do not match. Please re-enter.', 'error', 'Validation');
          return;
        }

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        setLoadingState(submitBtn, true, 'Creating Account...');

        try {
          if (!config.isConfigured()) {
            console.warn('[BloodLink Auth] Running in Development Sandbox. Simulating Supabase registration.');
            setTimeout(() => {
              setLoadingState(submitBtn, false);
              handleSuccessfulAuth({
                email,
                user_metadata: { full_name: fullName, account_type: accountType }
              });
            }, 700);
            return;
          }

          // Real Supabase User Registration with user metadata
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                account_type: accountType
              },
              emailRedirectTo: `${window.location.origin}/auth.html`
            }
          });

          if (error) {
            throw error;
          }

          setLoadingState(submitBtn, false);

          if (data.session) {
            // Email auto-confirm is enabled in Supabase project
            showToast('Account created successfully! Preparing your dashboard...', 'success', 'Welcome to BloodLink');
            setTimeout(async () => {
              await handleSuccessfulAuth(data.user);
            }, 600);
          } else {
            // Email confirmation is required by Supabase
            showToast(
              `Confirmation email sent to ${email}. Please verify your email to activate your account.`,
              'info',
              'Check Your Inbox',
              8000
            );
          }

        } catch (err) {
          setLoadingState(submitBtn, false);
          handleAuthError(err, 'Registration Error');
        }
      });
    }

    // 6. Real Google OAuth Integration
    if (googleBtns.length) {
      googleBtns.forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();

          if (!config.isConfigured()) {
            showToast(
              'Google OAuth requires Supabase credentials. Refer to GOOGLE_OAUTH_SETUP.md to activate.',
              'warning',
              'Setup Required'
            );
            return;
          }

          try {
            const redirectUrl = `${window.location.origin}/auth.html?oauth_callback=true`;
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: redirectUrl,
                queryParams: {
                  access_type: 'offline',
                  prompt: 'consent'
                }
              }
            });

            if (error) throw error;
          } catch (err) {
            handleAuthError(err, 'Google OAuth');
          }
        });
      });
    }

    // 7. Password Reset Request
    forgotPwdLinks.forEach((link) => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();

        const email = prompt('Enter your registered official email address to receive a password reset link:');
        if (!email || !email.includes('@')) return;

        if (!config.isConfigured()) {
          showToast(`Password reset link dispatched to ${email} (Simulation Mode).`, 'info', 'Password Reset');
          return;
        }

        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/reset-password.html`
          });

          if (error) throw error;
          showToast(`Password reset link sent to ${email}. Please check your inbox.`, 'success', 'Email Dispatched');
        } catch (err) {
          handleAuthError(err, 'Password Reset');
        }
      });
    });
  }

  /**
   * Handles OAuth Redirect Callback or Email Confirmation from URL
   */
  async function handleAuthUrlCallbacks() {
    const supabase = window.BloodLinkSupabase?.getClient();
    if (!supabase) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    // Check if OAuth or recovery token arrived
    if (urlParams.get('oauth_callback') === 'true' || hashParams.has('access_token')) {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session && session.user) {
          showToast('Google authentication verified. Loading profile...', 'success', 'OAuth Successful');
          setTimeout(async () => {
            await handleSuccessfulAuth(session.user);
          }, 800);
        }
      } catch (err) {
        showToast('Could not finalize OAuth session: ' + err.message, 'error', 'OAuth Error');
      }
    }
  }

  /**
   * Directs authenticated user to their role dashboard
   */
  async function handleSuccessfulAuth(user) {
    const supabase = window.BloodLinkSupabase?.getClient();
    let accountType = user.user_metadata?.account_type || 'donor';

    // If live Supabase is available, query profiles table for verified role
    if (supabase && window.BloodLinkConfig.isConfigured()) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('account_type, is_verified, account_status')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data && data.account_type) {
          accountType = data.account_type;
        }
      } catch (e) {
        console.warn('Could not query user profile for role, using metadata fallback:', e);
      }
    } else {
      // Store development test user in localStorage
      localStorage.setItem('bloodlink_dev_user', JSON.stringify({
        user,
        profile: {
          id: 'dev-user-uuid',
          full_name: user.user_metadata?.full_name || 'Demo User',
          email: user.email,
          account_type: accountType,
          is_verified: true,
          account_status: 'active'
        }
      }));
    }

    const dashboard = window.BloodLinkSession?.getDashboardForRole(accountType) || 'donor-dashboard.html';
    window.location.href = dashboard;
  }

  /**
   * Form helper: Loading button state
   */
  function setLoadingState(button, isLoading, text = '') {
    if (!button) return;
    if (isLoading) {
      button.dataset.origText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
        <span>${text}</span>
      `;
    } else {
      button.disabled = false;
      if (button.dataset.origText) {
        button.innerHTML = button.dataset.origText;
      }
    }
  }

  /**
   * Helper: Show Toast
   */
  function showToast(message, type = 'info', title = '') {
    if (window.BloodLinkToast) {
      window.BloodLinkToast[type] ? window.BloodLinkToast[type](message, title) : window.BloodLinkToast.info(message, title);
    } else {
      alert(`${title}: ${message}`);
    }
  }

  /**
   * Friendly error translation
   */
  function handleAuthError(err, contextTitle) {
    console.error(`[BloodLink Auth] ${contextTitle}:`, err);
    let message = err.message || 'An error occurred during authentication.';

    if (message.includes('Invalid login credentials')) {
      message = 'Incorrect email or password. Please verify and try again.';
    } else if (message.includes('Email not confirmed')) {
      message = 'Your email address has not been confirmed yet. Please check your inbox for the activation link.';
    } else if (message.includes('User already registered')) {
      message = 'An account with this email address already exists. Please sign in instead.';
    } else if (message.includes('Password should be at least')) {
      message = 'Password is too weak. Please ensure it is at least 8 characters long.';
    }

    showToast(message, 'error', contextTitle);
  }

  /**
   * Role guidance helper
   */
  function updateRoleFieldsGuidance(role) {
    const guidanceBox = document.getElementById('role-guidance-note');
    if (!guidanceBox) return;

    const guidance = {
      donor: 'Donors contribute voluntarily and gain instant access to digital health passes and donation scheduling.',
      patient: 'Patients or legal guardians can request emergency blood units and monitor surgical cross-matches.',
      hospital: 'Hospital accounts require proof of accreditation and enter a pending verification status.',
      blood_bank: 'Blood banks manage cold-chain storage and license validation before receiving full distribution rights.'
    };

    guidanceBox.textContent = guidance[role] || '';
  }

  /**
   * Password strength meter
   */
  function setupPasswordStrengthIndicator(form) {
    const passwordInput = form.querySelector('#signup-password');
    if (!passwordInput) return;

    let meter = form.querySelector('.password-strength-meter');
    if (!meter) {
      meter = document.createElement('div');
      meter.className = 'password-strength-meter';
      meter.innerHTML = `
        <div style="height: 4px; width: 100%; background: var(--color-border); border-radius: 2px; margin-top: 6px; overflow: hidden;">
          <div id="strength-bar" style="height: 100%; width: 0%; background: var(--color-primary); transition: width 0.3s, background-color 0.3s;"></div>
        </div>
        <div id="strength-label" style="font-size: 0.7rem; color: var(--color-text-tertiary); margin-top: 4px;">Password Strength: Weak</div>
      `;
      passwordInput.parentNode.appendChild(meter);
    }

    const bar = meter.querySelector('#strength-bar');
    const label = meter.querySelector('#strength-label');

    passwordInput.addEventListener('input', () => {
      const val = passwordInput.value;
      let score = 0;
      if (val.length >= 8) score += 25;
      if (val.length >= 12) score += 25;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score += 25;
      if (/[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val)) score += 25;

      bar.style.width = score + '%';
      if (score < 50) {
        bar.style.backgroundColor = '#C71932'; // Red
        label.textContent = 'Password Strength: Weak (Must be min 8 chars)';
      } else if (score < 75) {
        bar.style.backgroundColor = '#F59E0B'; // Orange
        label.textContent = 'Password Strength: Moderate';
      } else {
        bar.style.backgroundColor = '#10B981'; // Green
        label.textContent = 'Password Strength: Strong & Secure';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();
