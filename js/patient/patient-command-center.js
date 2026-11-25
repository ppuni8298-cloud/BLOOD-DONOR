/**
 * BLOODLINK - PATIENT EMERGENCY COMMAND CENTER CONTROLLER (patient-command-center.js)
 * Master controller for patient and guardian emergency blood request management:
 * - Sidebar navigation and deep tab switching (9 panels)
 * - Emergency request submission with client validation & clinical disclaimers
 * - Live request tracking timeline with 9-node clinical stepper
 * - Nearby hospital & blood bank discovery with inventory inspection
 * - Request cancellation with audit reason logging
 * - Printable clinical request report generation
 * - In-app notification alerts
 */

(function () {
  'use strict';

  let currentDashboardData = null;
  let allRequests = [];
  let allFacilities = [];
  let activeTrackingRequestId = null;

  // ==========================================================================
  // 1. INITIALIZATION & ROUTE GUARD
  // ==========================================================================
  async function initPatientCommandCenter() {
    // Enforce patient role authorization
    const isAuthorized = await window.BloodLinkSession?.requireAuth({
      allowedRoles: ['patient']
    });
    if (!isAuthorized) return;

    const user = window.BloodLinkSession.getUser();
    const profile = window.BloodLinkSession.getProfile();
    const userId = user?.id || 'dev-patient-uuid';

    // 1. Setup Navigation
    setupTabNavigation();

    // 2. Setup Forms & Actions
    setupRequestForm(userId);
    setupPrioritySelector();
    setupFacilitySearch();
    setupHistoryFilters();
    setupModals();
    setupSignOut();

    // 3. Load Initial Data
    await loadDashboardData(userId);
  }

  // ==========================================================================
  // 2. TAB NAVIGATION
  // ==========================================================================
  function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.patient-sidebar .sidebar-nav-btn[data-tab]');
    const tabPanels = document.querySelectorAll('.patient-tab-panel');

    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTabId = btn.getAttribute('data-tab');

        // Update active sidebar button
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show matching tab panel
        tabPanels.forEach(panel => {
          if (panel.id === targetTabId) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });

        // Close mobile drawer if open
        const sidebar = document.querySelector('.patient-sidebar');
        if (sidebar) sidebar.classList.remove('mobile-open');

        // Scroll to top of content
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Mobile sidebar toggle
    const mobileBtn = document.getElementById('btn-mobile-patient-sidebar');
    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        const sidebar = document.querySelector('.patient-sidebar');
        if (sidebar) sidebar.classList.toggle('mobile-open');
      });
    }
  }

  // ==========================================================================
  // 3. DATA LOADING & TELEMETRY
  // ==========================================================================
  async function loadDashboardData(userId) {
    try {
      currentDashboardData = await window.BloodLinkPatientService.getPatientDashboard(userId);
      renderDashboardOverview(currentDashboardData);

      // Load requests
      allRequests = await window.BloodLinkPatientService.getMyRequests(userId);
      renderActiveRequests(allRequests);
      renderHistoryRequests(allRequests);

      // Load tracking for latest request
      if (currentDashboardData.current_active_request) {
        activeTrackingRequestId = currentDashboardData.current_active_request.id;
        renderTrackingView(currentDashboardData.current_active_request, currentDashboardData.current_timeline);
      }

      // Load facilities
      allFacilities = await window.BloodLinkPatientService.getFacilities();
      renderFacilities(allFacilities);

      // Load notifications
      const notifs = await window.BloodLinkPatientService.getNotifications(userId);
      renderNotifications(notifs);

    } catch (err) {
      console.error('[Patient Command Center] Data loading error:', err);
      window.BloodLinkToast?.error('Failed to synchronize patient telemetry: ' + err.message, 'Data Sync');
    }
  }

  function renderDashboardOverview(data) {
    if (!data) return;

    // Metrics
    const metrics = data.metrics || {};
    const activeEl = document.getElementById('dash-stat-active-count');
    const totalEl = document.getElementById('dash-stat-total-count');
    const fulfilledEl = document.getElementById('dash-stat-fulfilled-count');
    const unreadEl = document.getElementById('unread-notif-badge');

    if (activeEl) activeEl.textContent = metrics.active_requests_count || 0;
    if (totalEl) totalEl.textContent = metrics.total_requests_count || 0;
    if (fulfilledEl) fulfilledEl.textContent = metrics.fulfilled_requests_count || 0;
    if (unreadEl && metrics.unread_notifications_count > 0) {
      unreadEl.textContent = metrics.unread_notifications_count;
      unreadEl.style.display = 'inline-block';
    }

    // Patient display name
    const patientName = data.patient?.name || 'Patient';
    document.querySelectorAll('.dynamic-patient-name').forEach(el => el.textContent = patientName);
  }

  // ==========================================================================
  // 4. CREATE EMERGENCY BLOOD REQUEST
  // ==========================================================================
  function setupPrioritySelector() {
    const buttons = document.querySelectorAll('.priority-option-btn');
    const hiddenInput = document.getElementById('form-urgency-priority');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (hiddenInput) {
          hiddenInput.value = btn.getAttribute('data-priority');
        }
      });
    });
  }

  function setupRequestForm(userId) {
    const form = document.getElementById('emergency-blood-request-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const patientName = document.getElementById('form-patient-name')?.value.trim();
      const bloodGroup = document.getElementById('form-blood-group')?.value;
      const bloodComponent = document.getElementById('form-blood-component')?.value;
      const unitsNeeded = parseInt(document.getElementById('form-units-needed')?.value, 10);
      const hospitalName = document.getElementById('form-hospital-name')?.value.trim();
      const hospitalCity = document.getElementById('form-hospital-city')?.value.trim();
      const hospitalDistrict = document.getElementById('form-hospital-district')?.value.trim();
      const hospitalAddress = document.getElementById('form-hospital-address')?.value.trim();
      const requiredDatetime = document.getElementById('form-required-datetime')?.value;
      const urgencyPriority = document.getElementById('form-urgency-priority')?.value || 'urgent';
      const clinicalReason = document.getElementById('form-clinical-reason')?.value.trim();
      const treatingDoctor = document.getElementById('form-treating-doctor')?.value.trim();
      const doctorContact = document.getElementById('form-doctor-contact')?.value.trim();
      const requesterRelationship = document.getElementById('form-requester-relationship')?.value;
      const requesterPhone = document.getElementById('form-requester-phone')?.value.trim();
      const requesterEmail = document.getElementById('form-requester-email')?.value.trim();
      const consentAcknowledged = document.getElementById('form-consent-check')?.checked;

      // Validation
      if (!consentAcknowledged) {
        window.BloodLinkToast?.warning('You must acknowledge the clinical consent and crossmatching declaration.', 'Consent Required');
        return;
      }

      if (!patientName || !hospitalName || !hospitalCity || !hospitalAddress || !requiredDatetime || !clinicalReason || !requesterPhone) {
        window.BloodLinkToast?.error('Please complete all required fields.', 'Validation Error');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-emergency-request');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
          Logging into Emergency Dispatch Queue...
        `;
      }

      try {
        const payload = {
          patient_name: patientName,
          blood_group: bloodGroup,
          blood_component: bloodComponent,
          units_needed: unitsNeeded,
          hospital_name: hospitalName,
          hospital_city: hospitalCity,
          hospital_district: hospitalDistrict,
          hospital_address: hospitalAddress,
          required_datetime: requiredDatetime,
          urgency_priority: urgencyPriority,
          clinical_reason: clinicalReason,
          treating_doctor: treatingDoctor,
          doctor_contact: doctorContact,
          requester_relationship: requesterRelationship,
          requester_phone: requesterPhone,
          requester_email: requesterEmail,
          consent_acknowledged: true
        };

        const created = await window.BloodLinkPatientService.createRequest(payload);

        window.BloodLinkToast?.success(
          `Emergency Request ${created.request_code || ''} registered. Hospital trauma coordinators alerted.`,
          'Request Submitted'
        );

        // Reset form
        form.reset();

        // Refresh requests and switch to tracking
        await loadDashboardData(userId);
        activeTrackingRequestId = created.id;
        document.querySelector('.sidebar-nav-btn[data-tab="tab-tracking"]')?.click();

      } catch (err) {
        console.error('Request creation error:', err);
        window.BloodLinkToast?.error('Failed to submit emergency request: ' + err.message, 'Submission Error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            Broadcast Emergency Blood Request
          `;
        }
      }
    });
  }

  // ==========================================================================
  // 5. LIVE REQUEST TRACKING TIMELINE
  // ==========================================================================
  const STATUS_STEPS = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'awaiting_verification', label: 'Hospital Triage' },
    { key: 'verified', label: 'Verified' },
    { key: 'matching_in_progress', label: 'Matching Nodes' },
    { key: 'response_received', label: 'Responses' },
    { key: 'fulfilment_in_progress', label: 'Cold-Chain Transit' },
    { key: 'fulfilled', label: 'Fulfilled' }
  ];

  function renderTrackingView(request, timelineEvents) {
    if (!request) return;

    // Header info
    const codeEl = document.getElementById('tracking-request-code');
    const patientEl = document.getElementById('tracking-patient-name');
    const hospitalEl = document.getElementById('tracking-hospital-name');
    const bloodPill = document.getElementById('tracking-blood-badge');
    const priorityPill = document.getElementById('tracking-priority-badge');
    const unitsEl = document.getElementById('tracking-units-summary');
    const cancelBtn = document.getElementById('btn-tracking-cancel-request');

    if (codeEl) codeEl.textContent = request.request_code || 'REQ-LIVE';
    if (patientEl) patientEl.textContent = request.patient_name;
    if (hospitalEl) hospitalEl.textContent = `${request.hospital_name} (${request.hospital_city})`;
    if (bloodPill) bloodPill.textContent = `${request.blood_group} • ${formatComponent(request.blood_component)}`;
    if (priorityPill) {
      priorityPill.textContent = (request.urgency_priority || 'urgent').toUpperCase();
      priorityPill.className = `badge-pill priority-${request.urgency_priority}`;
    }
    if (unitsEl) unitsEl.textContent = `${request.units_fulfilled || 0} / ${request.units_needed} Units Fulfilled`;

    if (cancelBtn) {
      if (['fulfilled', 'cancelled'].includes(request.status)) {
        cancelBtn.style.display = 'none';
      } else {
        cancelBtn.style.display = 'inline-flex';
        cancelBtn.onclick = () => openCancelModal(request.id, request.request_code);
      }
    }

    // Stepper nodes
    renderTrackingStepper(request.status);

    // Event audit list
    renderTimelineEvents(timelineEvents || []);
  }

  function renderTrackingStepper(currentStatus) {
    const container = document.getElementById('tracking-stepper-container');
    if (!container) return;

    const statusOrder = [
      'submitted',
      'awaiting_verification',
      'verified',
      'matching_in_progress',
      'response_received',
      'fulfilment_in_progress',
      'fulfilled'
    ];

    let currentIndex = statusOrder.indexOf(currentStatus);
    if (currentIndex === -1 && currentStatus === 'cancelled') currentIndex = 0;

    let html = '';
    STATUS_STEPS.forEach((step, idx) => {
      let stateClass = '';
      if (currentStatus === 'cancelled') {
        stateClass = idx === 0 ? 'completed' : '';
      } else if (idx < currentIndex) {
        stateClass = 'completed';
      } else if (idx === currentIndex) {
        stateClass = 'active';
      }

      html += `
        <div class="tracking-step ${stateClass}">
          <div class="tracking-step-node">
            ${idx < currentIndex ? '✓' : idx + 1}
          </div>
          <span class="tracking-step-label">${step.label}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderTimelineEvents(events) {
    const container = document.getElementById('tracking-timeline-events');
    if (!container) return;

    if (!events || events.length === 0) {
      container.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--color-text-secondary); font-size: 0.85rem;">
          Awaiting verification logs from treating hospital.
        </div>
      `;
      return;
    }

    let html = '';
    events.forEach(evt => {
      const dateFormatted = new Date(evt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ', ' + new Date(evt.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });

      html += `
        <div class="timeline-event-item ${evt.status_snapshot || ''}">
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
              <strong style="font-size: 0.95rem; color: var(--color-text);">${escapeHtml(evt.title)}</strong>
              <span style="font-size: 0.72rem; color: var(--color-text-tertiary); font-family: var(--font-family-mono);">${dateFormatted}</span>
            </div>
            <p style="font-size: 0.825rem; color: var(--color-text-secondary); margin: 0;">${escapeHtml(evt.description)}</p>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==========================================================================
  // 6. ACTIVE REQUESTS & HISTORY LISTS
  // ==========================================================================
  function renderActiveRequests(requests) {
    const container = document.getElementById('active-requests-grid');
    if (!container) return;

    const activeList = requests.filter(r => !['fulfilled', 'cancelled'].includes(r.status));

    if (activeList.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; padding: 3rem 1.5rem; text-align: center; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-xl);">
          <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--color-soft-red); display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); margin-bottom: 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          </div>
          <h4 style="font-size: 1.15rem; margin-bottom: 0.25rem;">No Active Emergency Requests</h4>
          <p style="font-size: 0.85rem; color: var(--color-text-secondary); max-width: 420px; margin: 0 auto 1.25rem auto;">
            When an urgent transfusion is required, register a new request to notify regional hospital networks and verified donors.
          </p>
          <button class="btn btn-primary btn-sm" onclick="document.querySelector('.sidebar-nav-btn[data-tab=\\'tab-create-request\\']').click();">
            Create Emergency Request
          </button>
        </div>
      `;
      return;
    }

    let html = '';
    activeList.forEach(req => {
      html += `
        <div class="facility-card" style="border-left: 4px solid var(--color-primary);">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
              <span class="request-code-pill">${req.request_code || 'REQ-LIVE'}</span>
              <span class="badge-pill priority-${req.urgency_priority || 'urgent'}">${(req.urgency_priority || 'urgent').toUpperCase()}</span>
            </div>
            <h4 style="font-size: 1.15rem; margin-bottom: 0.25rem;">${escapeHtml(req.patient_name)}</h4>
            <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 0.75rem;">
              <strong>${req.blood_group}</strong> • ${formatComponent(req.blood_component)} • <strong>${req.units_needed} Units</strong>
            </div>
            <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 1rem;">
              🏥 ${escapeHtml(req.hospital_name)}, ${escapeHtml(req.hospital_city)}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-border-subtle); padding-top: 0.75rem; flex-wrap: wrap;">
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick="trackSpecificRequest('${req.id}')">
                Track Timeline &rarr;
              </button>
              <button class="btn btn-secondary btn-sm" onclick="openMatchingCandidatesModal('${req.id}', '${req.request_code}')">
                Matches
              </button>
            </div>
            <button class="btn btn-ghost btn-sm" style="color: var(--color-primary);" onclick="openCancelModal('${req.id}', '${req.request_code}')">
              Cancel
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderHistoryRequests(requests) {
    const container = document.getElementById('history-requests-table-body');
    if (!container) return;

    if (requests.length === 0) {
      container.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No historical records found.</td></tr>`;
      return;
    }

    let html = '';
    requests.forEach(req => {
      const dateStr = new Date(req.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
      html += `
        <tr>
          <td><span class="request-code-pill">${req.request_code || 'REQ'}</span></td>
          <td><strong>${escapeHtml(req.patient_name)}</strong></td>
          <td><span class="badge-pill">${req.blood_group}</span></td>
          <td>${req.units_needed} Unit(s)</td>
          <td>${escapeHtml(req.hospital_name)}</td>
          <td><span class="badge-pill status-${req.status}">${req.status.replace(/_/g, ' ')}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openReportModal('${req.id}')" title="Print/Export Report">
              Report
            </button>
          </td>
        </tr>
      `;
    });

    container.innerHTML = html;
  }

  function setupHistoryFilters() {
    const searchInput = document.getElementById('history-search-input');
    const statusSelect = document.getElementById('history-status-filter');

    function applyFilter() {
      const query = (searchInput?.value || '').toLowerCase();
      const statusVal = statusSelect?.value || 'all';

      let filtered = allRequests.filter(r => {
        const matchesQuery = !query ||
          (r.request_code && r.request_code.toLowerCase().includes(query)) ||
          (r.patient_name && r.patient_name.toLowerCase().includes(query)) ||
          (r.hospital_name && r.hospital_name.toLowerCase().includes(query));
        const matchesStatus = statusVal === 'all' || r.status === statusVal;
        return matchesQuery && matchesStatus;
      });

      renderHistoryRequests(filtered);
    }

    searchInput?.addEventListener('input', applyFilter);
    statusSelect?.addEventListener('change', applyFilter);
  }

  // ==========================================================================
  // 7. NEARBY HOSPITALS & BLOOD BANKS DIRECTORY
  // ==========================================================================
  function setupFacilitySearch() {
    const searchInput = document.getElementById('facility-city-search');
    const typeButtons = document.querySelectorAll('.facility-type-filter-btn');

    typeButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        typeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filterType = btn.getAttribute('data-type');
        const cityQuery = searchInput?.value.trim() || '';
        const list = await window.BloodLinkPatientService.getFacilities(cityQuery, filterType);
        renderFacilities(list);
      });
    });

    searchInput?.addEventListener('input', debounce(async () => {
      const activeTypeBtn = document.querySelector('.facility-type-filter-btn.active');
      const filterType = activeTypeBtn?.getAttribute('data-type') || 'all';
      const cityQuery = searchInput.value.trim();
      const list = await window.BloodLinkPatientService.getFacilities(cityQuery, filterType);
      renderFacilities(list);
    }, 300));
  }

  function renderFacilities(facilities) {
    const container = document.getElementById('facilities-display-grid');
    if (!container) return;

    if (!facilities || facilities.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; padding: 2rem; text-align: center; color: var(--color-text-secondary);">No medical facilities found matching search criteria.</div>`;
      return;
    }

    let html = '';
    facilities.forEach(fac => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fac.name + ', ' + fac.address + ', ' + fac.city)}`;
      html += `
        <div class="facility-card">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <span class="badge-pill" style="font-size: 0.65rem;">${fac.type === 'hospital' ? 'Trauma Center' : 'Blood Bank'}</span>
              <span class="badge-pill" style="color: #10B981; border-color: rgba(16,185,129,0.3); font-size: 0.65rem;">● Verified</span>
            </div>
            <h4 style="font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(fac.name)}</h4>
            <p style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 0.75rem;">
              📍 ${escapeHtml(fac.address)}, ${escapeHtml(fac.city)} ${fac.postal_code || ''}
            </p>
            <div style="font-size: 0.8rem; margin-bottom: 1rem;">
              📞 <a href="tel:${fac.phone || ''}" style="color: var(--color-primary); font-weight: 600;">${fac.phone || '24/7 Helpline'}</a>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: space-between; align-items: center; border-top: 1px solid var(--color-border-subtle); padding-top: 0.75rem;">
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-size: 0.75rem;">
              Google Maps Directions ↗
            </a>
            <button class="btn btn-primary btn-sm" onclick="selectFacilityForRequest('${escapeHtml(fac.name)}', '${escapeHtml(fac.city)}', '${escapeHtml(fac.address)}')">
              Request Blood Here
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  // ==========================================================================
  // 8. NOTIFICATIONS CENTER
  // ==========================================================================
  function renderNotifications(notifs) {
    const listContainer = document.getElementById('patient-notifications-list');
    if (!listContainer) return;

    if (!notifs || notifs.length === 0) {
      listContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-text-secondary);">No notifications at this time.</div>`;
      return;
    }

    let html = '';
    notifs.forEach(n => {
      html += `
        <div style="padding: 1.25rem; border-bottom: 1px solid var(--color-border-subtle); display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; ${n.is_read ? 'opacity: 0.75;' : 'background: rgba(199,25,50,0.02);'}">
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.2rem; color: var(--color-text);">${escapeHtml(n.title)}</div>
            <p style="font-size: 0.85rem; color: var(--color-text-secondary); margin: 0 0 0.5rem 0;">${escapeHtml(n.message)}</p>
            <span style="font-size: 0.72rem; color: var(--color-text-tertiary);">${n.created_at || 'Recently'}</span>
          </div>
          ${!n.is_read ? `<button class="btn btn-ghost btn-sm" style="font-size: 0.75rem;" onclick="markNotifRead('${n.id}')">Mark Read</button>` : ''}
        </div>
      `;
    });

    listContainer.innerHTML = html;
  }

  // ==========================================================================
  // 9. MODALS: CANCELLATION, PRINTABLE SUMMARY REPORT & MATCHING DISCOVERY
  // ==========================================================================
  let activeMatchingData = null;
  let activeMatchingRequestId = null;

  function setupModals() {
    // Cancel confirmation button
    const confirmCancelBtn = document.getElementById('btn-confirm-cancel-request');
    if (confirmCancelBtn) {
      confirmCancelBtn.addEventListener('click', async () => {
        const reqId = document.getElementById('cancel-modal-request-id')?.value;
        const reason = document.getElementById('cancel-modal-reason')?.value.trim() || 'Cancelled by patient/guardian.';

        if (!reqId) return;

        try {
          await window.BloodLinkPatientService.cancelRequest(reqId, reason);
          window.BloodLinkToast?.info('Emergency request has been cancelled.', 'Request Cancelled');
          closeModal('modal-cancel-request');

          // Reload data
          const user = window.BloodLinkSession?.getUser();
          if (user) await loadDashboardData(user.id);
        } catch (err) {
          window.BloodLinkToast?.error('Failed to cancel request: ' + err.message, 'Cancellation Error');
        }
      });
    }

    // View Matching Candidates button in live tracking
    const viewMatchingBtn = document.getElementById('btn-view-matching-candidates');
    if (viewMatchingBtn) {
      viewMatchingBtn.addEventListener('click', () => {
        const reqId = activeTrackingRequestId || currentDashboardData?.active_request?.id || 'req-demo-9042';
        const reqCode = document.getElementById('tracking-request-code')?.textContent || 'REQ-2026-9042';
        openMatchingCandidatesModal(reqId, reqCode);
      });
    }

    // Re-run Discovery button in matching modal
    const rerunBtn = document.getElementById('btn-rerun-matching');
    if (rerunBtn) {
      rerunBtn.addEventListener('click', async () => {
        if (!activeMatchingRequestId) return;
        try {
          rerunBtn.disabled = true;
          rerunBtn.innerHTML = 'Scoring Candidates...';
          const freshData = await window.BloodLinkPatientService.runMatching(activeMatchingRequestId);
          activeMatchingData = freshData;
          renderMatchingModal(freshData);
          window.BloodLinkToast?.success('Discovery engine re-calculated compatibility and inventory scores.', 'Matching Updated');
        } catch (err) {
          window.BloodLinkToast?.error('Failed to re-run matching: ' + err.message, 'Matching Error');
        } finally {
          rerunBtn.disabled = false;
          rerunBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Re-run Discovery
          `;
        }
      });
    }

    // Category filter pills in matching modal
    const filterPills = document.querySelectorAll('.matching-category-filter');
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const cat = pill.getAttribute('data-category');
        renderMatchingCandidatesList(activeMatchingData, cat);
      });
    });
  }

  window.openMatchingCandidatesModal = async function (requestId, requestCode) {
    activeMatchingRequestId = requestId;
    const modal = document.getElementById('modal-matching-candidates');
    if (!modal) return;

    const codeLabel = document.getElementById('matching-modal-request-code');
    if (codeLabel) codeLabel.textContent = requestCode || 'REQ-LIVE';

    modal.classList.add('open');

    const container = document.getElementById('matching-candidates-container');
    if (container) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: var(--color-text-secondary);">
          <div class="live-pulse-dot" style="margin: 0 auto 0.75rem auto; width: 14px; height: 14px;"></div>
          Executing component-specific compatibility matrix &amp; discovering matching options...
        </div>
      `;
    }

    try {
      const data = await window.BloodLinkPatientService.getMatchingCandidates(requestId);
      activeMatchingData = data;
      renderMatchingModal(data);
    } catch (err) {
      if (container) {
        container.innerHTML = `
          <div style="padding: 1.5rem; text-align: center; color: var(--color-primary);">
            Error loading candidates: ${escapeHtml(err.message)}
          </div>
        `;
      }
    }
  };

  function renderMatchingModal(data) {
    if (!data) return;

    const summary = data.summary || {};
    const candidates = data.candidates || {};

    const statDonors = document.getElementById('matching-stat-donors');
    const statInventory = document.getElementById('matching-stat-inventory');
    const statAwaiting = document.getElementById('matching-stat-awaiting');
    const statConfirmed = document.getElementById('matching-stat-confirmed');

    if (statDonors) statDonors.textContent = candidates.potential_donors?.length || summary.donors_count || 0;
    if (statInventory) statInventory.textContent = candidates.facility_inventory?.length || summary.facilities_count || 0;
    if (statAwaiting) statAwaiting.textContent = candidates.awaiting_responses?.length || summary.awaiting_responses_count || 0;
    if (statConfirmed) statConfirmed.textContent = candidates.confirmed_responses?.length || summary.confirmed_responses_count || 0;

    // Default to active category
    const activePill = document.querySelector('.matching-category-filter.active');
    const category = activePill ? activePill.getAttribute('data-category') : 'all';
    renderMatchingCandidatesList(data, category);
  }

  function renderMatchingCandidatesList(data, category = 'all') {
    const container = document.getElementById('matching-candidates-container');
    if (!container || !data || !data.candidates) return;

    const cand = data.candidates;
    const donors = cand.potential_donors || [];
    const facilities = cand.facility_inventory || [];
    const awaiting = cand.awaiting_responses || [];
    const confirmed = cand.confirmed_responses || [];
    const unavailable = cand.unavailable_options || [];

    let items = [];

    if (category === 'all' || category === 'donors') {
      donors.forEach(d => items.push({ type: 'donor', item: d }));
    }
    if (category === 'all' || category === 'inventory') {
      facilities.forEach(f => items.push({ type: 'facility', item: f }));
    }
    if (category === 'all' || category === 'responses') {
      awaiting.forEach(a => items.push({ type: 'awaiting', item: a }));
      confirmed.forEach(c => items.push({ type: 'confirmed', item: c }));
    }
    if (category === 'all' || category === 'unavailable') {
      unavailable.forEach(u => items.push({ type: 'unavailable', item: u }));
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: var(--color-text-secondary); background: var(--color-bg); border-radius: var(--radius-md); border: 1px dashed var(--color-border);">
          No candidates found in '${category}' filter.
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach(({ type, item }) => {
      if (type === 'donor') {
        const score = item.match_score || 85.0;
        html += `
          <div style="padding: 1rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                <span class="badge-pill" style="background: var(--color-soft-red); color: var(--color-primary); font-size: 0.7rem; font-weight: 700;">VOLUNTARY DONOR</span>
                <strong style="font-family: var(--font-family-mono); font-size: 0.85rem;">${item.donor_display_id || 'DONOR-NODE'}</strong>
                <span class="badge-pill" style="font-size: 0.65rem; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0;">Verified Clinical Profile</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 0.25rem;">
                <strong>${item.blood_group}</strong> • ${formatComponent(item.component)} • Service Area: <strong>${escapeHtml(item.service_area || 'Metro Area')}</strong> (~${item.approximate_distance_km || 5} km)
              </div>
              <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">
                ${escapeHtml(item.explanation?.compatibility || 'Compatible group')} • ${escapeHtml(item.explanation?.location_score || 'Exact area')}
              </div>
            </div>
            <div style="text-align: right; min-width: 120px;">
              <div style="font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600;">Match Score</div>
              <div style="font-size: 1.4rem; font-weight: 800; color: var(--color-primary);">${score}%</div>
              <span class="badge-pill" style="font-size: 0.65rem;">Broadcast Invited</span>
            </div>
          </div>
        `;
      } else if (type === 'facility') {
        const score = item.match_score || 95.0;
        const freshHours = item.freshness_hours !== undefined ? item.freshness_hours : 0.5;
        html += `
          <div style="padding: 1rem; background: var(--color-surface); border: 1.5px solid var(--color-soft-red-border); border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                <span class="badge-pill" style="background: var(--color-secondary); color: white; font-size: 0.7rem; font-weight: 700;">COLD-CHAIN INVENTORY</span>
                <strong style="font-size: 0.95rem;">${escapeHtml(item.facility_name)}</strong>
              </div>
              <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 0.25rem;">
                Available Reserve: <strong>${item.units_available} Units</strong> of <strong>${item.blood_group}</strong> (${formatComponent(item.component)}) • ${escapeHtml(item.city || 'Metro Central')}
              </div>
              <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">
                ${escapeHtml(item.explanation?.coverage || 'Full coverage')} • <span style="color: #059669; font-weight: 600;">Inspected ${freshHours}h ago (Optimal)</span>
              </div>
            </div>
            <div style="text-align: right; min-width: 120px;">
              <div style="font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600;">Match Score</div>
              <div style="font-size: 1.4rem; font-weight: 800; color: var(--color-secondary);">${score}%</div>
              <button class="btn btn-secondary btn-sm" style="margin-top: 0.25rem; font-size: 0.75rem;" onclick="window.BloodLinkToast?.success('Cold-chain unit requisition logged for hospital courier dispatch.', 'Reservation Created');">
                Reserve Unit
              </button>
            </div>
          </div>
        `;
      } else if (type === 'awaiting') {
        html += `
          <div style="padding: 0.85rem 1rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span class="badge-pill" style="background: #FEF3C7; color: #D97706; font-size: 0.65rem; font-weight: 700;">AWAITING CONFIRMATION</span>
              <strong style="font-size: 0.85rem; margin-left: 0.5rem;">${escapeHtml(item.donor_masked_label || 'Consenting Donor')}</strong>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-top: 2px;">Broadcast dispatched ${item.sent_at || 'recently'} • Expires ${item.expires_at || 'soon'}</div>
            </div>
            <span class="live-pulse-dot" style="background: #D97706;"></span>
          </div>
        `;
      } else if (type === 'confirmed') {
        html += `
          <div style="padding: 0.85rem 1rem; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span class="badge-pill" style="background: #DCFCE7; color: #16A34A; font-size: 0.65rem; font-weight: 700;">CONFIRMED / RESERVED</span>
              <strong style="font-size: 0.85rem; margin-left: 0.5rem;">${escapeHtml(item.facility_name || item.donor_masked_label || 'Transfusion Resource')}</strong>
              <div style="font-size: 0.75rem; color: #15803D; margin-top: 2px;">${escapeHtml(item.message || `Code: ${item.reservation_code || 'RSV-CONFIRMED'}`)}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" style="width: 18px; height: 18px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
        `;
      } else if (type === 'unavailable') {
        const statusLabel = item.status_label ? `<span class="badge-pill" style="background: #FEF3C7; color: #D97706; font-size: 0.65rem;">${escapeHtml(item.status_label)}</span>` : '';
        html += `
          <div style="padding: 0.85rem 1rem; background: var(--color-bg); border: 1px dashed var(--color-border); border-radius: var(--radius-md); opacity: 0.8; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px;">
                <span class="badge-pill" style="font-size: 0.65rem; background: var(--color-surface); border: 1px solid var(--color-border);">FILTERED</span>
                <strong style="font-size: 0.85rem;">${escapeHtml(item.facility_name || item.donor_id_masked || 'Option')}</strong>
                ${statusLabel}
              </div>
              <div style="font-size: 0.75rem; color: var(--color-text-secondary);">${escapeHtml(item.reason || 'Filtered by clinical ruleset')}</div>
            </div>
            <span style="font-size: 0.7rem; color: var(--color-text-tertiary); font-style: italic;">Omitted from primary match</span>
          </div>
        `;
      }
    });

    container.innerHTML = html;
  }

  window.openCancelModal = function (requestId, requestCode) {
    const input = document.getElementById('cancel-modal-request-id');
    const label = document.getElementById('cancel-modal-code-label');
    if (input) input.value = requestId;
    if (label) label.textContent = requestCode || 'REQ';

    const modal = document.getElementById('modal-cancel-request');
    if (modal) modal.classList.add('open');
  };

  window.openReportModal = async function (requestId) {
    try {
      const req = await window.BloodLinkPatientService.getRequestDetail(requestId);
      if (!req) return;

      const modal = document.getElementById('modal-request-report');
      if (!modal) return;

      document.getElementById('report-modal-code').textContent = req.request_code || 'REQ';
      document.getElementById('report-modal-patient').textContent = req.patient_name;
      document.getElementById('report-modal-blood').textContent = `${req.blood_group} (${formatComponent(req.blood_component)})`;
      document.getElementById('report-modal-units').textContent = `${req.units_needed} Units`;
      document.getElementById('report-modal-hospital').textContent = req.hospital_name;
      document.getElementById('report-modal-address').textContent = `${req.hospital_address}, ${req.hospital_city}`;
      document.getElementById('report-modal-priority').textContent = (req.urgency_priority || 'urgent').toUpperCase();
      document.getElementById('report-modal-status').textContent = (req.status || 'submitted').replace(/_/g, ' ').toUpperCase();
      document.getElementById('report-modal-reason').textContent = req.clinical_reason;
      document.getElementById('report-modal-date').textContent = new Date(req.created_at).toLocaleString();

      modal.classList.add('open');
    } catch (err) {
      window.BloodLinkToast?.error('Could not load request report: ' + err.message, 'Report Error');
    }
  };

  window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
  };

  window.trackSpecificRequest = async function (requestId) {
    try {
      const req = await window.BloodLinkPatientService.getRequestDetail(requestId);
      const timeline = await window.BloodLinkPatientService.getRequestTimeline(requestId);
      renderTrackingView(req, timeline);
      document.querySelector('.sidebar-nav-btn[data-tab="tab-tracking"]')?.click();
    } catch (err) {
      window.BloodLinkToast?.error('Could not load tracking timeline: ' + err.message, 'Tracking Error');
    }
  };

  window.selectFacilityForRequest = function (name, city, address) {
    const nameInput = document.getElementById('form-hospital-name');
    const cityInput = document.getElementById('form-hospital-city');
    const addrInput = document.getElementById('form-hospital-address');

    if (nameInput) nameInput.value = name;
    if (cityInput) cityInput.value = city;
    if (addrInput) addrInput.value = address;

    document.querySelector('.sidebar-nav-btn[data-tab="tab-create-request"]')?.click();
    window.BloodLinkToast?.info(`Hospital fields filled for: ${name}`, 'Hospital Selected');
  };

  window.markNotifRead = async function (id) {
    await window.BloodLinkPatientService.markNotificationRead(id);
    const user = window.BloodLinkSession?.getUser();
    if (user) {
      const notifs = await window.BloodLinkPatientService.getNotifications(user.id);
      renderNotifications(notifs);
    }
  };

  function setupSignOut() {
    document.querySelectorAll('.btn-patient-signout').forEach(btn => {
      btn.addEventListener('click', () => {
        window.BloodLinkSession?.signOut();
      });
    });
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  function formatComponent(comp) {
    if (!comp) return 'Whole Blood';
    const map = {
      whole_blood: 'Whole Blood',
      packed_red_cells: 'Packed Red Blood Cells',
      platelets: 'Platelets (Apheresis)',
      plasma: 'Fresh Frozen Plasma',
      cryoprecipitate: 'Cryoprecipitate'
    };
    return map[comp] || comp.replace(/_/g, ' ');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Self-boot on ready
  document.addEventListener('DOMContentLoaded', initPatientCommandCenter);
})();
