/**
 * BLOODLINK - HOSPITAL COMMAND CENTER CONTROLLER (hospital-command-center.js)
 * Coordinates the 13 Hospital Operations modules:
 * 1. Overview & Emergency Telemetry
 * 2. Emergency Request Management
 * 3. Request Verification Drawer
 * 4. Blood Inventory Overview (Trauma Reserves)
 * 5. Matching Results
 * 6. Donor Coordination
 * 7. Blood Bank Coordination
 * 8. Donation Records
 * 9. Fulfilment Tracking (Crossmatch & Administration)
 * 10. Staff Management
 * 11. Reports & Analytics
 * 12. Notifications & Alerts
 * 13. Facility Settings
 */

(function () {
  'use strict';

  const Service = window.BloodLinkHospitalService;

  let currentRequests = [];
  let currentInventory = [];
  let selectedRequestId = null;

  // Initialize UI on DOM Ready
  document.addEventListener('DOMContentLoaded', initHospitalCommandCenter);

  async function initHospitalCommandCenter() {
    setupTabNavigation();
    setupModals();
    setupSearchAndFilters();
    await loadDashboardData();
  }

  // =========================================================================
  // 1. TAB NAVIGATION
  // =========================================================================
  function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.hospital-sidebar .sidebar-nav-btn');
    const tabPanes = document.querySelectorAll('.hospital-tab-pane');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;

        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        tabPanes.forEach(pane => {
          if (pane.id === targetTab) {
            pane.classList.add('active');
          } else {
            pane.classList.remove('active');
          }
        });

        // Trigger module specific load if necessary
        onTabActivated(targetTab);
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('hospital-menu-toggle');
    const sidebar = document.querySelector('.hospital-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
        }
      });
    }
  }

  function onTabActivated(tabId) {
    if (tabId === 'tab-requests' || tabId === 'tab-verification') {
      renderRequestsTable();
    } else if (tabId === 'tab-inventory') {
      loadInventory();
    } else if (tabId === 'tab-staff') {
      loadStaff();
    } else if (tabId === 'tab-reports') {
      loadReports();
    } else if (tabId === 'tab-donations') {
      loadDonations();
    }
  }

  // =========================================================================
  // 2. DASHBOARD METRICS & TELEMETRY
  // =========================================================================
  async function loadDashboardData() {
    try {
      const metrics = await Service.getDashboardMetrics();
      renderMetrics(metrics);

      currentRequests = await Service.getEmergencyRequests();
      renderRequestsTable();
      renderOverviewRecentRequests();

      currentInventory = await Service.getTraumaInventory();
      renderTraumaReserveGrid();

      loadAlerts();
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    }
  }

  function renderMetrics(metrics) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('stat-active-requests', metrics.active_emergency_requests ?? 4);
    setVal('stat-critical-review', metrics.critical_awaiting_review ?? 2);
    setVal('stat-verified-requests', metrics.verified_requests ?? 5);
    setVal('stat-awaiting-blood', metrics.awaiting_blood_availability ?? 2);
    setVal('stat-confirmed-fulfilments', metrics.confirmed_fulfilments ?? 11);
    setVal('stat-trauma-units', (metrics.trauma_reserve_units ?? 32) + ' Units');
    setVal('stat-pending-reservations', metrics.pending_inventory_confirmations ?? 2);
    setVal('stat-active-alerts', metrics.active_alerts_count ?? 2);
  }

  function renderOverviewRecentRequests() {
    const tbody = document.getElementById('overview-requests-tbody');
    if (!tbody) return;

    tbody.innerHTML = currentRequests.slice(0, 3).map(req => `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-text);">${req.patient_name}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-tertiary); font-family: monospace;">${req.id}</div>
        </td>
        <td>
          <span class="badge-pill" style="font-weight: 800; font-size: 0.9rem; color: var(--color-primary); background: var(--color-soft-red);">
            ${req.blood_group}
          </span>
        </td>
        <td>${req.units_requested} Units</td>
        <td>
          <span class="badge-pill" style="font-size: 0.7rem; ${req.priority === 'critical' ? 'background: rgba(199,25,50,0.15); color: var(--color-primary); border-color: rgba(199,25,50,0.3);' : ''}">
            ${req.priority ? req.priority.toUpperCase() : 'STANDARD'}
          </span>
        </td>
        <td>
          <span class="badge-pill" style="font-size: 0.7rem; ${req.verification_status === 'verified' ? 'background: rgba(16,185,129,0.15); color: var(--color-success); border-color: rgba(16,185,129,0.3);' : 'background: rgba(245,158,11,0.15); color: var(--color-warning);'}">
            ${req.verification_status ? req.verification_status.toUpperCase() : 'PENDING'}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="window.openVerificationModal('${req.id}')">
            Review
          </button>
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 3. EMERGENCY REQUEST MANAGEMENT & VERIFICATION
  // =========================================================================
  function renderRequestsTable(filtered = null) {
    const list = filtered || currentRequests;
    const tbody = document.getElementById('requests-table-tbody');
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No emergency blood requests found matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(req => `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--color-text);">${req.patient_name}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-tertiary); font-family: monospace;">${req.id}</div>
        </td>
        <td>
          <span class="badge-pill" style="font-weight: 800; color: var(--color-primary); background: var(--color-soft-red);">
            ${req.blood_group} (${formatComponent(req.blood_component)})
          </span>
        </td>
        <td><strong>${req.units_requested}</strong> Units</td>
        <td>
          <span class="badge-pill" style="font-size: 0.72rem; ${req.priority === 'critical' ? 'background: rgba(199,25,50,0.15); color: var(--color-primary);' : ''}">
            ${(req.priority || 'standard').toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge-pill" style="font-size: 0.72rem; ${req.verification_status === 'verified' ? 'background: rgba(16,185,129,0.15); color: var(--color-success);' : req.verification_status === 'rejected' ? 'background: rgba(199,25,50,0.1); color: var(--color-primary);' : 'background: rgba(245,158,11,0.15); color: var(--color-warning);'}">
            ${(req.verification_status || 'pending').toUpperCase()}
          </span>
        </td>
        <td>
          <span class="badge-pill" style="font-size: 0.72rem; ${req.status === 'fulfilled' ? 'background: rgba(16,185,129,0.15); color: var(--color-success);' : ''}">
            ${(req.status || 'submitted').replace('_', ' ').toUpperCase()}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-secondary btn-sm" onclick="window.openVerificationModal('${req.id}')" title="Clinical Verification">
              Verify
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.openFulfilmentModal('${req.id}', '${req.blood_group}')" title="Crossmatch & Transfuse">
              Transfuse
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function formatComponent(comp) {
    if (!comp) return 'PRBC';
    return comp.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // =========================================================================
  // 4. TRAUMA INVENTORY RESERVES
  // =========================================================================
  function renderTraumaReserveGrid() {
    const container = document.getElementById('trauma-inventory-grid');
    if (!container) return;

    const bloodGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
    const groupTotals = {};
    bloodGroups.forEach(g => { groupTotals[g] = 0; });

    currentInventory.forEach(b => {
      if (groupTotals[b.blood_group] !== undefined) {
        groupTotals[b.blood_group] += Number(b.units_count || 1);
      }
    });

    container.innerHTML = bloodGroups.map(bg => {
      const count = groupTotals[bg];
      const isCritical = count < 5 && (bg === 'O-' || bg === 'A-');
      return `
        <div style="padding: 1.25rem; background: var(--color-surface); border: 1px solid ${isCritical ? 'var(--color-primary)' : 'var(--color-border)'}; border-radius: var(--radius-lg); text-align: center; position: relative;">
          ${isCritical ? '<span style="position: absolute; top: 6px; right: 6px; font-size: 0.65rem; background: var(--color-primary); color: #fff; padding: 1px 6px; border-radius: 10px; font-weight: 700;">SHORTAGE</span>' : ''}
          <div style="font-family: var(--font-family-display); font-size: 1.6rem; font-weight: 800; color: ${bg.includes('-') ? 'var(--color-primary)' : 'var(--color-text)'};">${bg}</div>
          <div style="font-size: 1.15rem; font-weight: 700; margin: 0.2rem 0;">${count} Units</div>
          <div style="font-size: 0.72rem; color: var(--color-text-secondary);">${isCritical ? 'Order reserve replenishment' : 'Adequate surgical reserve'}</div>
        </div>
      `;
    }).join('');
  }

  async function loadInventory() {
    currentInventory = await Service.getTraumaInventory();
    renderTraumaReserveGrid();
    const tbody = document.getElementById('inventory-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = currentInventory.map(b => `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${b.batch_number}</td>
        <td><span class="badge-pill" style="font-weight: 800; color: var(--color-primary);">${b.blood_group}</span></td>
        <td>${formatComponent(b.blood_component)}</td>
        <td><strong>${b.units_count}</strong> (${b.volume_ml} mL)</td>
        <td>${b.storage_location} <span style="font-size: 0.7rem; color: var(--color-text-tertiary); display: block;">${b.storage_temperature_celsius}°C</span></td>
        <td><span class="badge-pill" style="background: rgba(16,185,129,0.15); color: var(--color-success); font-size: 0.72rem;">${(b.screening_status || 'passed').toUpperCase()}</span></td>
        <td>${b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : 'N/A'}</td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 5. STAFF MANAGEMENT
  // =========================================================================
  async function loadStaff() {
    const staff = await Service.getStaff();
    const tbody = document.getElementById('staff-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = staff.map(s => `
      <tr>
        <td>
          <div style="font-weight: 700;">${s.name || s.email}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">${s.email}</div>
        </td>
        <td><span class="badge-pill" style="font-size: 0.72rem;">${(s.staff_role || '').replace('_', ' ').toUpperCase()}</span></td>
        <td>${s.department || 'Trauma Center'}</td>
        <td style="font-family: monospace; font-size: 0.8rem;">${s.license_number || 'N/A'}</td>
        <td><span class="badge-pill" style="background: rgba(16,185,129,0.15); color: var(--color-success); font-size: 0.72rem;">ACTIVE</span></td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 6. REPORTS & ANALYTICS
  // =========================================================================
  async function loadReports() {
    const data = await Service.getReports();
    const m = data.metrics || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('rep-transfused', m.total_units_transfused || 146);
    setVal('rep-pass-rate', (m.testing_pass_rate_pct || 98.4) + '%');
    setVal('rep-compatibility', (m.crossmatch_compatibility_rate_pct || 99.6) + '%');
    setVal('rep-transit-time', (m.average_transit_time_minutes || 24.2) + 'm');
  }

  // =========================================================================
  // 7. DONATIONS & ALERTS
  // =========================================================================
  async function loadDonations() {
    const donations = await Service.getDonations();
    const tbody = document.getElementById('donations-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = donations.map(d => `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${d.id}</td>
        <td><span class="badge-pill" style="font-weight: 800; color: var(--color-primary);">${d.blood_group}</span></td>
        <td>${formatComponent(d.donation_type)}</td>
        <td>${d.units_collected} Unit (${d.volume_ml} mL)</td>
        <td>${d.donation_date}</td>
        <td><span class="badge-pill" style="background: rgba(16,185,129,0.15); color: var(--color-success); font-size: 0.72rem;">${d.verification_status.toUpperCase()}</span></td>
        <td><span style="font-size: 0.8rem; color: var(--color-text-secondary);">${d.notes || ''}</span></td>
      </tr>
    `).join('');
  }

  async function loadAlerts() {
    const alerts = await Service.getAlerts();
    const container = document.getElementById('alerts-feed-container');
    if (!container) return;

    container.innerHTML = alerts.map(a => `
      <div style="padding: 1rem 1.25rem; background: var(--color-surface); border: 1px solid var(--color-border); border-left: 4px solid ${a.severity === 'critical' ? 'var(--color-primary)' : 'var(--color-warning)'}; border-radius: var(--radius-md); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-weight: 700; font-size: 0.9rem; color: var(--color-text); margin-bottom: 0.2rem;">
            ${a.alert_type ? a.alert_type.replace(/_/g, ' ').toUpperCase() : 'ALERT'}: ${a.blood_group || ''}
          </div>
          <div style="font-size: 0.82rem; color: var(--color-text-secondary);">${a.message}</div>
        </div>
        <span style="font-size: 0.75rem; color: var(--color-text-tertiary);">${new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('');
  }

  // =========================================================================
  // 8. MODALS & FORMS HANDLERS
  // =========================================================================
  function setupModals() {
    // Modal Overlay Close logic
    document.querySelectorAll('.hospital-modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
        }
      });
    });

    document.querySelectorAll('.hospital-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.hospital-modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });

    // Verification Submit
    const verifyForm = document.getElementById('verification-form');
    if (verifyForm) {
      verifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const action = document.getElementById('verify-action-select').value;
        const notes = document.getElementById('verify-notes-input').value;

        if (!selectedRequestId) return;

        const res = await Service.verifyRequest(selectedRequestId, action, notes);
        if (res.success) {
          window.BloodLinkToast?.success(`Blood request marked as '${action}'.`, 'Clinical Verification');
          document.getElementById('verification-modal').classList.remove('open');
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to verify request.', 'Verification Error');
        }
      });
    }

    // Fulfilment Submit
    const fulfilForm = document.getElementById('fulfilment-form');
    if (fulfilForm) {
      fulfilForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reqId = document.getElementById('fulfil-request-id').value;
        const batchId = document.getElementById('fulfil-batch-id').value;
        const crossmatch = document.getElementById('fulfil-crossmatch-select').value;
        const doc = document.getElementById('fulfil-doctor-input').value;
        const notes = document.getElementById('fulfil-notes-input').value;

        const res = await Service.recordFulfilment({
          request_id: reqId,
          batch_id: batchId,
          crossmatch_result: crossmatch,
          administered_by: doc,
          notes: notes
        });

        if (res.success) {
          window.BloodLinkToast?.success('Transfusion fulfilment recorded & status updated.', 'Transfusion Complete');
          document.getElementById('fulfilment-modal').classList.remove('open');
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to record fulfilment.', 'Fulfilment Error');
        }
      });
    }

    // Staff Provision Form
    const staffForm = document.getElementById('provision-staff-form');
    if (staffForm) {
      staffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('staff-email-input').value;
        const role = document.getElementById('staff-role-select').value;
        const dept = document.getElementById('staff-dept-input').value;
        const license = document.getElementById('staff-license-input').value;

        const res = await Service.provisionStaff({
          email: email,
          staff_role: role,
          department: dept,
          license_number: license
        });

        if (res.success) {
          window.BloodLinkToast?.success(`Staff credential provisioned for ${email}.`, 'Staff Provisioned');
          document.getElementById('staff-modal').classList.remove('open');
          staffForm.reset();
          loadStaff();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to provision staff.', 'Error');
        }
      });
    }
  }

  window.openVerificationModal = function (requestId) {
    selectedRequestId = requestId;
    const req = currentRequests.find(r => r.id === requestId);
    if (!req) return;

    const modal = document.getElementById('verification-modal');
    if (!modal) return;

    document.getElementById('verify-patient-label').textContent = `${req.patient_name} (${req.id})`;
    document.getElementById('verify-group-label').textContent = `${req.blood_group} • ${req.units_requested} Units (${formatComponent(req.blood_component)})`;
    document.getElementById('verify-indication-label').textContent = req.clinical_indication || 'Emergency surgical trauma reserve';

    modal.classList.add('open');
  };

  window.openFulfilmentModal = function (requestId, bloodGroup) {
    const modal = document.getElementById('fulfilment-modal');
    if (!modal) return;

    document.getElementById('fulfil-request-id').value = requestId;
    document.getElementById('fulfil-req-label').textContent = `Request ${requestId} • Target Blood Group: ${bloodGroup}`;

    modal.classList.add('open');
  };

  window.openStaffModal = function () {
    const modal = document.getElementById('staff-modal');
    if (modal) modal.classList.add('open');
  };

  // =========================================================================
  // 9. SEARCH & FILTERING
  // =========================================================================
  function setupSearchAndFilters() {
    const searchInput = document.getElementById('requests-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = currentRequests.filter(r =>
          (r.patient_name && r.patient_name.toLowerCase().includes(query)) ||
          (r.id && r.id.toLowerCase().includes(query)) ||
          (r.blood_group && r.blood_group.toLowerCase().includes(query))
        );
        renderRequestsTable(filtered);
      });
    }

    const priorityFilter = document.getElementById('requests-priority-filter');
    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        const val = e.target.value;
        const filtered = val ? currentRequests.filter(r => r.priority === val) : currentRequests;
        renderRequestsTable(filtered);
      });
    }
  }

})();
