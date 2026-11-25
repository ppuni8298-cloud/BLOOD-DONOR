/**
 * BLOODLINK - DONOR COMMAND CENTER CONTROLLER (donor-command-center.js)
 * Master controller for the advanced donor dashboard:
 * - Sidebar navigation and deep tab switching
 * - Availability state management with instant Supabase sync
 * - Profile completeness calculation
 * - Donation history timeline, filters, and search
 * - Camps browsing and appointment scheduling
 * - Digital pass rendering & certificate modal
 */

(function () {
  'use strict';

  let currentProfile = null;
  let allDonations = [];
  let allCamps = [];
  let allAppointments = [];

  // ==========================================================================
  // 1. INITIALIZATION & ROUTE GUARD
  // ==========================================================================
  async function initCommandCenter() {
    // 1. Enforce Donor role authorization
    const isAuthorized = await window.BloodLinkSession?.requireAuth({
      allowedRoles: ['donor']
    });
    if (!isAuthorized) return;

    const user = window.BloodLinkSession.getUser();
    const userId = user?.id || 'dev-user-uuid';

    // 2. Bind sidebar navigation tabs
    setupTabNavigation();

    // 3. Load all donor data
    await loadDonorDashboardData(userId);

    // 4. Bind interactive components
    setupAvailabilitySwitcher(userId);
    setupProfileForm(userId);
    setupHistoryFilters();
    setupAppointmentActions(userId);
    setupEmergencyInvitations(userId);
    setupNotificationDropdown(userId);
    setupSignOut();
  }

  // ==========================================================================
  // 2. TAB NAVIGATION
  // ==========================================================================
  function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.sidebar-nav-btn[data-tab]');
    const tabPanels = document.querySelectorAll('.donor-tab-panel');

    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-tab');

        // Update active sidebar button
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active panel
        tabPanels.forEach(panel => {
          if (panel.id === targetId) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });

        // Close mobile sidebar if open
        const sidebar = document.querySelector('.donor-sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          sidebar.classList.remove('mobile-open');
        }

        // Scroll to top of content
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Mobile sidebar toggle button
    const mobileToggle = document.getElementById('btn-mobile-sidebar-toggle');
    const sidebar = document.querySelector('.donor-sidebar');
    if (mobileToggle && sidebar) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }
  }

  // ==========================================================================
  // 3. DATA LOADER & OVERVIEW METRICS
  // ==========================================================================
  async function loadDonorDashboardData(userId) {
    try {
      // Fetch profile
      currentProfile = await window.BloodLinkDonorService.getDonorFullProfile(userId);
      renderProfileUI(currentProfile);

      // Fetch donations
      allDonations = await window.BloodLinkDonorService.getDonations(userId);
      renderDonationsUI(allDonations);

      // Fetch camps & appointments
      allCamps = await window.BloodLinkDonorService.getCamps(currentProfile.city);
      renderCampsUI(allCamps);

      allAppointments = await window.BloodLinkDonorService.getAppointments(userId);
      renderAppointmentsUI(allAppointments);

      // Fetch notifications
      const notifs = await window.BloodLinkDonorService.getNotifications(userId);
      renderNotificationsUI(notifs);

      // Compute statistics
      computeDonorStatistics(currentProfile, allDonations);

    } catch (err) {
      console.error('[Donor Command Center] Data loading error:', err);
      window.BloodLinkToast?.error('Error synchronizing donor telemetry: ' + err.message, 'Data Sync');
    }
  }

  // ==========================================================================
  // 4. AVAILABILITY CONTROL SWITCHER
  // ==========================================================================
  function setupAvailabilitySwitcher(userId) {
    const cards = document.querySelectorAll('.availability-btn-card');
    const consentToggle = document.getElementById('switch-discovery-consent');
    const statusPill = document.getElementById('overview-availability-pill');
    const lastUpdatedEl = document.getElementById('availability-last-updated');

    cards.forEach(card => {
      card.addEventListener('click', async () => {
        const nextState = card.getAttribute('data-state');

        // Optimistic UI update
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        updateAvailabilityBadges(nextState);

        try {
          await window.BloodLinkDonorService.setAvailability(
            userId,
            nextState,
            consentToggle ? consentToggle.checked : true
          );

          if (lastUpdatedEl) {
            lastUpdatedEl.textContent = 'Just now';
          }

          const stateLabels = {
            available: 'Available for Emergency Matching',
            temporarily_unavailable: 'Temporarily Unavailable',
            not_accepting_requests: 'Not Accepting Requests'
          };

          window.BloodLinkToast?.success(
            `Status updated to: ${stateLabels[nextState]}. Database synchronized.`,
            'Availability Updated'
          );
        } catch (err) {
          window.BloodLinkToast?.error('Failed to update availability: ' + err.message, 'Database Error');
        }
      });
    });

    if (consentToggle) {
      consentToggle.addEventListener('change', async () => {
        const consent = consentToggle.checked;
        const currentActiveCard = document.querySelector('.availability-btn-card.active');
        const currentState = currentActiveCard ? currentActiveCard.getAttribute('data-state') : 'available';

        try {
          await window.BloodLinkDonorService.setAvailability(userId, currentState, consent);
          window.BloodLinkToast?.info(
            consent ? 'Emergency discovery consent granted.' : 'Emergency discovery consent withdrawn.',
            'Privacy Consent'
          );
        } catch (err) {
          window.BloodLinkToast?.error('Could not save consent: ' + err.message, 'Error');
        }
      });
    }
  }

  function updateAvailabilityBadges(state) {
    const pill = document.getElementById('overview-availability-pill');
    if (!pill) return;

    if (state === 'available') {
      pill.className = 'badge-pill';
      pill.style.background = 'var(--color-success-bg)';
      pill.style.color = 'var(--color-success)';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      pill.textContent = '● Available for Matching';
    } else if (state === 'temporarily_unavailable') {
      pill.className = 'badge-pill';
      pill.style.background = 'var(--color-warning-bg)';
      pill.style.color = 'var(--color-warning)';
      pill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      pill.textContent = '● Temporarily Unavailable';
    } else {
      pill.className = 'badge-pill';
      pill.style.background = 'var(--color-bg-tertiary)';
      pill.style.color = 'var(--color-text-tertiary)';
      pill.style.borderColor = 'var(--color-border)';
      pill.textContent = '● Offline / Paused';
    }
  }

  // ==========================================================================
  // 5. PROFILE UI & COMPLETION PROGRESS
  // ==========================================================================
  function renderProfileUI(profile) {
    // Header & Sidebar
    const name = profile.full_name || 'Donor Hero';
    const email = profile.email || '';
    const bloodType = profile.blood_group || 'O-';

    const nameElements = document.querySelectorAll('.dynamic-donor-name');
    nameElements.forEach(el => el.textContent = name);

    const emailElements = document.querySelectorAll('.dynamic-donor-email');
    emailElements.forEach(el => el.textContent = email);

    const bloodElements = document.querySelectorAll('.dynamic-blood-type');
    bloodElements.forEach(el => el.textContent = bloodType);

    // Profile Avatars
    if (profile.avatar_url) {
      const avatarContainers = document.querySelectorAll('.user-avatar-circle');
      avatarContainers.forEach(container => {
        container.innerHTML = `<img src="${profile.avatar_url}" alt="${name}">`;
      });
    }

    // Populate Profile Form Fields
    setInputValue('form-full-name', profile.full_name);
    setInputValue('form-email', profile.email);
    setInputValue('form-phone', profile.phone);
    setInputValue('form-blood-group', profile.blood_group);
    setInputValue('form-dob', profile.date_of_birth);
    setInputValue('form-gender', profile.gender || 'prefer_not_to_say');
    setInputValue('form-city', profile.city);
    setInputValue('form-district', profile.district);
    setInputValue('form-postal-code', profile.postal_code);
    setInputValue('form-last-donation', profile.last_donation_date);
    setInputValue('form-preferred-contact', profile.preferred_contact || 'email');
    setInputValue('form-emergency-name', profile.emergency_contact_name);
    setInputValue('form-emergency-phone', profile.emergency_contact_phone);

    // Digital ID Card Fields
    const cardName = document.getElementById('pass-card-name');
    const cardBlood = document.getElementById('pass-card-blood');
    const cardCity = document.getElementById('pass-card-city');
    const cardId = document.getElementById('pass-card-id');

    if (cardName) cardName.textContent = name;
    if (cardBlood) cardBlood.textContent = bloodType;
    if (cardCity) cardCity.textContent = profile.city || 'Metro Central';
    if (cardId) cardId.textContent = `ID: BL-${profile.id?.substring(0, 8).toUpperCase() || 'HERO'}`;

    // Availability state sync
    const stateCard = document.querySelector(`.availability-btn-card[data-state="${profile.availability_status || 'available'}"]`);
    if (stateCard) {
      document.querySelectorAll('.availability-btn-card').forEach(c => c.classList.remove('active'));
      stateCard.classList.add('active');
      updateAvailabilityBadges(profile.availability_status || 'available');
    }

    const consentCheck = document.getElementById('switch-discovery-consent');
    if (consentCheck) {
      consentCheck.checked = profile.consent_to_discovery !== false;
    }
  }

  function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) {
      el.value = val;
    }
  }

  function computeDonorStatistics(profile, donations) {
    // 1. Total verified units (ONLY verified donations count as per spec!)
    const verifiedDonations = donations.filter(d => d.verification_status === 'verified');
    const totalUnits = verifiedDonations.reduce((sum, d) => sum + (d.units_donated || 1), 0);
    const livesSaved = totalUnits * 3;

    const unitsEl = document.getElementById('stat-total-units');
    const livesEl = document.getElementById('stat-lives-saved');
    if (unitsEl) unitsEl.textContent = totalUnits;
    if (livesEl) livesEl.textContent = `${livesSaved}+`;

    // 2. Next eligible donation countdown (56 days for whole blood)
    const nextEligibleEl = document.getElementById('stat-next-eligible');
    const eligibilityBanner = document.getElementById('eligibility-banner-text');

    if (profile.last_donation_date) {
      const lastDate = new Date(profile.last_donation_date);
      const eligibleDate = new Date(lastDate.getTime() + 56 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const diffDays = Math.ceil((eligibleDate - today) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        if (nextEligibleEl) nextEligibleEl.textContent = 'Eligible Now';
        if (eligibilityBanner) eligibilityBanner.textContent = 'You are clinically eligible to donate whole blood today.';
      } else {
        if (nextEligibleEl) nextEligibleEl.textContent = `In ${diffDays} days`;
        if (eligibilityBanner) eligibilityBanner.textContent = `Eligible on ${eligibleDate.toLocaleDateString()} (${diffDays} days remaining for iron replenishment).`;
      }
    } else {
      if (nextEligibleEl) nextEligibleEl.textContent = 'Eligible Now';
      if (eligibilityBanner) eligibilityBanner.textContent = 'You have no recorded recent donations. You are eligible to donate today.';
    }

    // 3. Profile Completion Percentage
    const fields = [
      profile.full_name,
      profile.email,
      profile.phone,
      profile.blood_group,
      profile.date_of_birth,
      profile.city,
      profile.emergency_contact_phone,
      profile.avatar_url
    ];
    const filledCount = fields.filter(Boolean).length;
    const percentage = Math.round((filledCount / fields.length) * 100);

    const compBar = document.getElementById('profile-completion-bar');
    const compLabel = document.getElementById('profile-completion-label');
    if (compBar) compBar.style.width = `${percentage}%`;
    if (compLabel) compLabel.textContent = `${percentage}% Complete`;
  }

  // ==========================================================================
  // 6. PROFILE EDITING & AVATAR UPLOAD
  // ==========================================================================
  function setupProfileForm(userId) {
    const form = document.getElementById('donor-profile-form');
    const avatarInput = document.getElementById('avatar-file-input');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Saving Changes...</span>`;

        const profileData = {
          full_name: document.getElementById('form-full-name')?.value.trim(),
          phone: document.getElementById('form-phone')?.value.trim(),
          gender: document.getElementById('form-gender')?.value,
          city: document.getElementById('form-city')?.value.trim(),
          district: document.getElementById('form-district')?.value.trim(),
          postal_code: document.getElementById('form-postal-code')?.value.trim(),
          preferred_contact: document.getElementById('form-preferred-contact')?.value,
          emergency_contact_name: document.getElementById('form-emergency-name')?.value.trim(),
          emergency_contact_phone: document.getElementById('form-emergency-phone')?.value.trim()
        };

        const donorData = {
          blood_group: document.getElementById('form-blood-group')?.value,
          date_of_birth: document.getElementById('form-dob')?.value || null,
          last_donation_date: document.getElementById('form-last-donation')?.value || null
        };

        try {
          currentProfile = await window.BloodLinkDonorService.updateDonorProfile(userId, profileData, donorData);
          renderProfileUI(currentProfile);
          computeDonorStatistics(currentProfile, allDonations);

          submitBtn.disabled = false;
          submitBtn.innerHTML = origText;
          window.BloodLinkToast?.success('Profile saved successfully with Supabase verification.', 'Profile Updated');
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origText;
          window.BloodLinkToast?.error('Failed to update profile: ' + err.message, 'Update Error');
        }
      });
    }

    if (avatarInput) {
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;

        try {
          window.BloodLinkToast?.info('Uploading avatar to Supabase Storage...', 'Upload');
          const publicUrl = await window.BloodLinkDonorService.uploadAvatar(userId, file);
          currentProfile.avatar_url = publicUrl;
          renderProfileUI(currentProfile);
          window.BloodLinkToast?.success('Avatar updated and synchronized.', 'Success');
        } catch (err) {
          window.BloodLinkToast?.error(err.message, 'Avatar Error');
        }
      });
    }
  }

  // ==========================================================================
  // 7. DONATION HISTORY & FILTERS
  // ==========================================================================
  function renderDonationsUI(donations) {
    const list = document.getElementById('donations-timeline-container');
    if (!list) return;

    if (!donations || donations.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--color-text-secondary); background: var(--color-surface); border-radius: var(--radius-lg); border: 1px solid var(--color-border);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 44px; height: 44px; margin-bottom: 0.75rem; color: var(--color-text-tertiary);"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
          <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">No Recorded Donations Yet</h4>
          <p style="font-size: 0.85rem;">Schedule an appointment or present your digital donor ID at an authorized blood bank to register your first life-saving unit.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = donations.map(d => {
      const isVerified = d.verification_status === 'verified';
      const statusBadge = isVerified
        ? `<span class="donation-status-badge verified"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Verified by Hospital</span>`
        : `<span class="donation-status-badge pending"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Awaiting Hospital Verification</span>`;

      return `
        <div class="donation-record-card" data-ref="${d.reference_number}" data-type="${d.donation_type}">
          <div class="donation-facility-meta">
            <div style="width: 48px; height: 48px; border-radius: var(--radius-md); background: var(--color-soft-red); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-family: var(--font-family-display);">
              ${d.units_donated || 1}U
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px;">
                <h4 style="font-size: 1.05rem; font-weight: 700;">${d.facility_name}</h4>
                ${statusBadge}
              </div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 0.75rem;">
                <span>📅 ${new Date(d.donation_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                <span>•</span>
                <span>Type: ${formatDonationType(d.donation_type)}</span>
                <span>•</span>
                <span>Ref: <code style="font-family: var(--font-family-mono); color: var(--color-primary);">${d.reference_number}</code></span>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm btn-view-donation-detail" data-id="${d.id}">
              Details
            </button>
            ${isVerified ? `
              <button class="btn btn-soft btn-sm btn-view-certificate" data-cert="${d.certificate_id || d.reference_number}" data-ref="${d.reference_number}" data-date="${d.donation_date}" data-facility="${d.facility_name}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
                Certificate
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind Details & Certificate Buttons
    document.querySelectorAll('.btn-view-donation-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const donation = allDonations.find(d => d.id === id);
        if (donation) openDonationDetailModal(donation);
      });
    });

    document.querySelectorAll('.btn-view-certificate').forEach(btn => {
      btn.addEventListener('click', () => {
        openCertificateModal({
          certId: btn.getAttribute('data-cert'),
          ref: btn.getAttribute('data-ref'),
          date: btn.getAttribute('data-date'),
          facility: btn.getAttribute('data-facility'),
          donorName: currentProfile?.full_name || 'Donor Hero',
          bloodGroup: currentProfile?.blood_group || 'O-'
        });
      });
    });
  }

  function formatDonationType(type) {
    const map = {
      whole_blood: 'Whole Blood (450 mL)',
      platelets: 'Platelets (Apheresis)',
      plasma: 'Plasma Unit',
      double_red: 'Double Red Cell'
    };
    return map[type] || 'Whole Blood';
  }

  function setupHistoryFilters() {
    const searchInput = document.getElementById('history-search-input');
    const typeSelect = document.getElementById('history-type-filter');

    function applyFilter() {
      const q = searchInput?.value.toLowerCase().trim() || '';
      const type = typeSelect?.value || 'all';

      const filtered = allDonations.filter(d => {
        const matchesQuery = d.facility_name.toLowerCase().includes(q) || d.reference_number.toLowerCase().includes(q);
        const matchesType = type === 'all' || d.donation_type === type;
        return matchesQuery && matchesType;
      });

      renderDonationsUI(filtered);
    }

    if (searchInput) searchInput.addEventListener('input', applyFilter);
    if (typeSelect) typeSelect.addEventListener('change', applyFilter);
  }

  // ==========================================================================
  // 8. APPOINTMENTS & CAMPS
  // ==========================================================================
  function renderCampsUI(camps) {
    const container = document.getElementById('available-camps-grid');
    if (!container) return;

    container.innerHTML = camps.map(camp => `
      <div class="camp-card">
        <div>
          <div class="camp-card-header">
            <div>
              <span class="badge-pill" style="font-size: 0.65rem; margin-bottom: 0.35rem;">${camp.organizer_name}</span>
              <h4 style="font-size: 1.1rem; font-weight: 700;">${camp.title}</h4>
            </div>
            <span class="camp-slots-pill">${camp.slots_available} Slots Available</span>
          </div>
          <div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem;">
            <div class="camp-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>Date: ${new Date(camp.camp_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div class="camp-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>Hours: ${camp.start_time} - ${camp.end_time}</span>
            </div>
            <div class="camp-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <span>${camp.address}, ${camp.city}</span>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-sm btn-book-slot" data-camp-id="${camp.id}" data-camp-title="${camp.title}" data-camp-date="${camp.camp_date}">
          Book Appointment Slot &rarr;
        </button>
      </div>
    `).join('');

    // Bind booking triggers
    document.querySelectorAll('.btn-book-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        openBookingModal({
          campId: btn.getAttribute('data-camp-id'),
          facilityName: btn.getAttribute('data-camp-title'),
          date: btn.getAttribute('data-camp-date')
        });
      });
    });
  }

  function renderAppointmentsUI(appointments) {
    const container = document.getElementById('my-appointments-list');
    const upcomingBanner = document.getElementById('overview-upcoming-appointment-card');
    if (!container) return;

    const scheduled = appointments.filter(a => a.status === 'scheduled');

    // Overview widget
    if (upcomingBanner) {
      if (scheduled.length > 0) {
        const next = scheduled[0];
        upcomingBanner.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
            <div>
              <span class="badge-pill" style="font-size: 0.65rem; margin-bottom: 0.25rem;">Upcoming Appointment</span>
              <h4 style="font-size: 1.1rem; margin-bottom: 2px;">${next.facility_name}</h4>
              <p style="font-size: 0.8rem; color: var(--color-text-secondary); margin: 0;">
                📅 ${next.appointment_date} at ${next.appointment_time} (${formatDonationType(next.donation_type)})
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="document.querySelector('.sidebar-nav-btn[data-tab=\\'tab-appointments\\']').click();">
              Manage
            </button>
          </div>
        `;
        upcomingBanner.style.display = 'block';
      } else {
        upcomingBanner.style.display = 'none';
      }
    }

    if (appointments.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--color-text-secondary); background: var(--color-surface); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
          No scheduled appointments. Browse the available camps below to reserve your slot.
        </div>
      `;
      return;
    }

    container.innerHTML = appointments.map(a => `
      <div style="padding: 1.25rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px;">
            <h4 style="font-size: 1rem; font-weight: 700;">${a.facility_name}</h4>
            <span class="badge-pill" style="font-size: 0.65rem; background: ${a.status === 'scheduled' ? 'var(--color-success-bg)' : 'var(--color-bg-tertiary)'}; color: ${a.status === 'scheduled' ? 'var(--color-success)' : 'var(--color-text-tertiary)'}; border: none;">
              ${a.status.toUpperCase()}
            </span>
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
            <span>📅 ${a.appointment_date} at ${a.appointment_time}</span>
            <span>•</span>
            <span>${formatDonationType(a.donation_type)}</span>
          </div>
        </div>
        ${a.status === 'scheduled' ? `
          <button class="btn btn-ghost btn-sm btn-cancel-appointment" data-id="${a.id}" style="color: var(--color-primary);">
            Cancel
          </button>
        ` : ''}
      </div>
    `).join('');

    // Bind cancellation
    document.querySelectorAll('.btn-cancel-appointment').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to cancel this donation appointment?')) return;

        const user = window.BloodLinkSession.getUser();
        await window.BloodLinkDonorService.cancelAppointment(id, user?.id || 'dev-user-uuid');
        allAppointments = await window.BloodLinkDonorService.getAppointments(user?.id || 'dev-user-uuid');
        renderAppointmentsUI(allAppointments);
        window.BloodLinkToast?.info('Appointment cancelled.', 'Schedule Updated');
      });
    });
  }

  function setupAppointmentActions(userId) {
    const form = document.getElementById('appointment-booking-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const facilityName = document.getElementById('book-facility-name').value;
        const campId = document.getElementById('book-camp-id').value;
        const date = document.getElementById('book-date').value;
        const time = document.getElementById('book-time').value;
        const donationType = document.getElementById('book-donation-type').value;

        try {
          await window.BloodLinkDonorService.bookAppointment({
            donor_id: userId,
            camp_id: campId || null,
            facility_name: facilityName,
            appointment_date: date,
            appointment_time: time,
            donation_type: donationType
          });

          closeModal('modal-book-appointment');
          allAppointments = await window.BloodLinkDonorService.getAppointments(userId);
          renderAppointmentsUI(allAppointments);
          window.BloodLinkToast?.success(`Appointment reserved at ${facilityName}!`, 'Booking Confirmed');
        } catch (err) {
          window.BloodLinkToast?.error(err.message, 'Booking Failed');
        }
      });
    }
  }

  // ==========================================================================
  // 9. NOTIFICATIONS & MODALS
  // ==========================================================================
  function renderNotificationsUI(notifs) {
    const badge = document.getElementById('unread-notif-count');
    const unread = notifs.filter(n => !n.is_read);
    if (badge) {
      badge.textContent = unread.length;
      badge.style.display = unread.length > 0 ? 'inline-block' : 'none';
    }

    const drawerList = document.getElementById('notifications-drawer-list');
    if (drawerList) {
      drawerList.innerHTML = notifs.map(n => `
        <div style="padding: 0.85rem; border-bottom: 1px solid var(--color-border-subtle); display: flex; gap: 0.75rem; background: ${n.is_read ? 'transparent' : 'var(--color-soft-red)'};">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); margin-top: 6px; flex-shrink: 0; opacity: ${n.is_read ? 0 : 1};"></div>
          <div>
            <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 2px;">${n.title}</div>
            <div style="font-size: 0.75rem; color: var(--color-text-secondary); line-height: 1.35;">${n.message}</div>
          </div>
        </div>
      `).join('');
    }
  }

  function setupNotificationDropdown() {
    const btn = document.getElementById('btn-top-notifications');
    const drawer = document.getElementById('notifications-dropdown-menu');

    if (btn && drawer) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        drawer.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
        if (!drawer.contains(e.target) && !btn.contains(e.target)) {
          drawer.classList.remove('open');
        }
      });
    }
  }

  function openBookingModal(data) {
    setInputValue('book-facility-name', data.facilityName);
    setInputValue('book-camp-id', data.campId);
    setInputValue('book-date', data.date);
    openModal('modal-book-appointment');
  }

  function openDonationDetailModal(donation) {
    const modal = document.getElementById('modal-donation-detail');
    if (!modal) return;

    modal.querySelector('#modal-detail-facility').textContent = donation.facility_name;
    modal.querySelector('#modal-detail-date').textContent = donation.donation_date;
    modal.querySelector('#modal-detail-type').textContent = formatDonationType(donation.donation_type);
    modal.querySelector('#modal-detail-ref').textContent = donation.reference_number;
    modal.querySelector('#modal-detail-units').textContent = `${donation.units_donated || 1} Unit(s)`;
    modal.querySelector('#modal-detail-notes').textContent = donation.notes || 'Routine donation recorded and verified.';

    openModal('modal-donation-detail');
  }

  function openCertificateModal(data) {
    const modal = document.getElementById('modal-certificate-viewer');
    if (!modal) return;

    modal.querySelector('#cert-modal-donor-name').textContent = data.donorName;
    modal.querySelector('#cert-modal-blood-group').textContent = data.bloodGroup;
    modal.querySelector('#cert-modal-facility').textContent = data.facility;
    modal.querySelector('#cert-modal-date').textContent = data.date;
    modal.querySelector('#cert-modal-number').textContent = data.certId;

    openModal('modal-certificate-viewer');
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  // Expose global modal close handler
  window.closeDonorModal = closeModal;

  function setupSignOut() {
    const btns = document.querySelectorAll('.btn-donor-signout');
    btns.forEach(b => {
      b.addEventListener('click', () => {
        window.BloodLinkSession?.signOut();
      });
    });
  }

  // ==========================================================================
  // EMERGENCY BROADCASTS & INVITATIONS
  // ==========================================================================
  async function setupEmergencyInvitations(userId) {
    const refreshBtn = document.getElementById('btn-refresh-donor-invitations');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => loadAndRenderInvitations(userId));
    }
    await loadAndRenderInvitations(userId);
  }

  async function loadAndRenderInvitations(userId) {
    try {
      const invitations = await window.BloodLinkDonorService.getDonorInvitations();
      const commitments = await window.BloodLinkDonorService.getDonorCommitments();
      renderInvitationsList(invitations, userId);
      renderCommitmentsList(commitments);
    } catch (err) {
      console.error('Error loading donor invitations:', err);
    }
  }

  function renderInvitationsList(invitations, userId) {
    const container = document.getElementById('donor-invitations-list');
    const badge = document.getElementById('donor-invitation-badge-count');
    if (!container) return;

    const pending = (invitations || []).filter(i => i.status === 'pending');
    if (badge) {
      badge.textContent = `${pending.length} Pending`;
      badge.style.display = pending.length ? 'inline-block' : 'none';
    }

    if (pending.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-lg);">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #ECFDF5; display: inline-flex; align-items: center; justify-content: center; color: #059669; margin-bottom: 0.75rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">No Urgent Broadcasts Pending</h4>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); max-width: 440px; margin: 0 auto;">
            You have responded to all emergency transfusion calls for your compatible blood group. You will be notified instantly when a hospital triage desk issues a priority requisition.
          </p>
        </div>
      `;
      return;
    }

    let html = '';
    pending.forEach(inv => {
      const req = inv.blood_requests || {};
      const priorityLabel = (req.urgency_priority || 'urgent').toUpperCase();
      const priorityClass = req.urgency_priority === 'critical' ? 'CODE RED: Immediate Trauma OR' : 'Urgent Transfusion Requisition';

      html += `
        <div style="padding: 1.5rem; background: var(--color-surface); border: 1.5px solid var(--color-soft-red-border); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: space-between; gap: 1.25rem; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 260px;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 6px; flex-wrap: wrap;">
              <span class="request-code-pill" style="font-size: 0.72rem;">${req.request_code || 'REQ-LIVE'}</span>
              <span class="badge-pill" style="font-size: 0.65rem; background: var(--color-soft-red); color: var(--color-primary); font-weight: 700;">${priorityClass}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-tertiary); font-weight: 600;">Broadcast dispatched ${inv.created_at ? 'recently' : 'just now'}</span>
            </div>
            <h4 style="font-size: 1.2rem; font-weight: 700; margin: 0.2rem 0;">${escapeHtml(req.hospital_name || 'Regional Medical Facility')}</h4>
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0.35rem 0;">
              Requires <strong>${req.units_needed || 1} Unit(s)</strong> of <strong>${req.blood_group || 'O-'} (${formatDonationType(req.blood_component || 'packed_red_cells')})</strong> in ${escapeHtml(req.hospital_city || 'Metro Central')}.
            </p>
            <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">
              Confidentiality Guaranteed: Your personal phone and email remain private. Hospital triage receives your confirmation code.
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-danger btn-sm" style="display: flex; align-items: center; gap: 0.4rem;" onclick="handleInvitationAction('${inv.id}', 'accepted', '${userId}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Accept Emergency Call
            </button>
            <button class="btn btn-secondary btn-sm" onclick="handleInvitationAction('${inv.id}', 'declined', '${userId}')">
              Decline
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderCommitmentsList(commitments) {
    const container = document.getElementById('donor-commitments-list');
    const badge = document.getElementById('donor-commitments-badge-count');
    if (!container) return;

    const activeList = (commitments || []).filter(c => c.status === 'accepted');
    if (badge) {
      badge.textContent = `${activeList.length} Active`;
      badge.style.display = activeList.length ? 'inline-block' : 'none';
    }

    if (activeList.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--color-text-secondary); background: var(--color-bg); border-radius: var(--radius-md); border: 1px dashed var(--color-border); font-size: 0.85rem;">
          No active emergency donation commitments currently in progress.
        </div>
      `;
      return;
    }

    let html = '';
    activeList.forEach(comm => {
      const req = comm.blood_requests || {};
      const targetTime = req.required_datetime ? new Date(req.required_datetime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Immediate Arrival';

      html += `
        <div style="padding: 1.25rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 4px;">
              <span class="badge-pill" style="background: #DCFCE7; color: #16A34A; font-size: 0.65rem; font-weight: 700;">CONFIRMED COMMITMENT</span>
              <span class="request-code-pill" style="font-size: 0.72rem;">${req.request_code || 'REQ-LIVE'}</span>
            </div>
            <h4 style="font-size: 1.1rem; font-weight: 700; margin: 0.2rem 0;">${escapeHtml(req.hospital_name || 'Hospital Trauma Center')}</h4>
            <div style="font-size: 0.85rem; color: #15803D;">
              Target Arrival: <strong>${targetTime}</strong> • Location: <strong>${escapeHtml(req.hospital_city || 'Metro Central')}</strong>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="badge-pill" style="background: #16A34A; color: white; font-size: 0.7rem;">Hospital Triage Alerted</span>
            <div style="font-size: 0.72rem; color: #15803D; margin-top: 4px;">Present your Digital Donor Pass on check-in</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  window.handleInvitationAction = async function (invitationId, action, userId) {
    try {
      await window.BloodLinkDonorService.respondToInvitation(invitationId, action);
      if (action === 'accepted') {
        window.BloodLinkToast?.success('Emergency donation intent confirmed! Hospital triage coordinator has been notified.', 'Commitment Confirmed');
      } else {
        window.BloodLinkToast?.info('Invitation declined. The matching engine will re-route to alternative donor nodes.', 'Broadcast Declined');
      }
      await loadAndRenderInvitations(userId);
    } catch (err) {
      window.BloodLinkToast?.error('Failed to record response: ' + err.message, 'Action Failed');
    }
  };

  // Self initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommandCenter);
  } else {
    initCommandCenter();
  }
})();
