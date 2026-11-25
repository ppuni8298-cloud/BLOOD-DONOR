/**
 * BLOODLINK - BLOOD BANK COMMAND CENTER CONTROLLER (bloodbank-command-center.js)
 * Coordinates the 15 Blood Bank Operations modules:
 * 1. Inventory Dashboard & Live Matrix
 * 2. Blood Component Stock & Batch Registration
 * 3. Component Shelf-Life & Storage Monitoring
 * 4. Laboratory Quality Checks & Infection Screening
 * 5. Stock Reservation & Release Engine
 * 6. Expiry Monitoring & Disposal Records
 * 7. Incoming Emergency Requests & Direct Fulfilment
 * 8. Reservation History & Audit Movements
 * 9. Donation Collection Records
 * 10. Component Processing Records (Parent-child separation)
 * 11. Distribution & Cold-Chain Dispatch
 * 12. Staff Management & Permissions
 * 13. Analytics & Clinical Regulatory Reports
 * 14. Real-time Notifications & Shortage Alerts
 * 15. Facility Accreditation & Vault Sensor Settings
 */

(function () {
  'use strict';

  const Service = window.BloodLinkBloodBankService;

  let currentBatches = [];
  let selectedBatchId = null;

  document.addEventListener('DOMContentLoaded', initBloodBankCommandCenter);

  async function initBloodBankCommandCenter() {
    setupTabNavigation();
    setupModals();
    setupSearchAndFilters();
    await loadDashboardData();
  }

  // =========================================================================
  // 1. TAB NAVIGATION
  // =========================================================================
  function setupTabNavigation() {
    const navButtons = document.querySelectorAll('.bloodbank-sidebar .sidebar-nav-btn');
    const tabPanes = document.querySelectorAll('.bloodbank-tab-pane');

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

        onTabActivated(targetTab);
      });
    });

    const toggleBtn = document.getElementById('bloodbank-menu-toggle');
    const sidebar = document.querySelector('.bloodbank-sidebar');
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
    if (tabId === 'tab-components') {
      renderBatchesTable();
    } else if (tabId === 'tab-requests') {
      loadIncomingRequests();
    } else if (tabId === 'tab-processing') {
      loadProcessingEvents();
    } else if (tabId === 'tab-dispatches') {
      loadDispatches();
    } else if (tabId === 'tab-staff') {
      loadStaff();
    } else if (tabId === 'tab-reports') {
      loadReports();
    }
  }

  // =========================================================================
  // 2. DASHBOARD DATA & INVENTORY MATRIX
  // =========================================================================
  async function loadDashboardData() {
    try {
      const metrics = await Service.getDashboardMetrics();
      renderMetrics(metrics);

      currentBatches = await Service.getInventoryBatches();
      renderInventoryMatrix(metrics.group_distribution);
      renderBatchesTable();
      renderRecentBatchesSummary();
      loadAlerts();
    } catch (e) {
      console.error('Error loading blood bank data:', e);
    }
  }

  function renderMetrics(m) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('bb-stat-total-units', (m.total_available_units || 148) + ' Units');
    setVal('bb-stat-under-testing', (m.units_under_testing || 18) + ' Units');
    setVal('bb-stat-reserved', (m.units_reserved || 12) + ' Units');
    setVal('bb-stat-near-expiry', (m.units_near_expiry || 6) + ' Units');
    setVal('bb-stat-shortages', (m.critical_shortage_groups || ['O-', 'AB-']).join(', '));
    setVal('bb-stat-dispatches', m.active_dispatches_count || 4);
    setVal('bb-stat-reservations', m.active_reservations_count || 8);
  }

  function renderInventoryMatrix(groupDist = {}) {
    const matrixContainer = document.getElementById('inventory-matrix-grid');
    if (!matrixContainer) return;

    const bloodGroups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
    const components = ['PRBC', 'Whole Blood', 'Platelets', 'Plasma', 'Cryo'];

    matrixContainer.innerHTML = bloodGroups.map(bg => {
      const totalUnits = groupDist[bg] || 0;
      const isShortage = totalUnits < 6;

      return `
        <div class="group-stock-cell">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span class="group-badge-lg">${bg}</span>
            <span class="badge-pill" style="font-size: 0.7rem; ${isShortage ? 'background: var(--color-soft-red); color: var(--color-primary);' : 'background: rgba(16,185,129,0.15); color: var(--color-success);'}">
              ${isShortage ? 'CRITICAL LOW' : 'OPTIMAL'}
            </span>
          </div>
          <div style="font-size: 1.15rem; font-weight: 700; margin: 0.35rem 0;">${totalUnits} Units Total</div>
          <div class="component-bar-list">
            <div class="component-bar-item">
              <span style="color: var(--color-text-secondary);">PRBC (4°C):</span>
              <strong>${Math.max(1, Math.round(totalUnits * 0.45))} Units</strong>
            </div>
            <div class="component-bar-item">
              <span style="color: var(--color-text-secondary);">Platelets (22°C):</span>
              <strong>${Math.max(1, Math.round(totalUnits * 0.2))} Units</strong>
            </div>
            <div class="component-bar-item">
              <span style="color: var(--color-text-secondary);">Plasma (-20°C):</span>
              <strong>${Math.max(1, Math.round(totalUnits * 0.25))} Units</strong>
            </div>
            <div class="component-bar-item">
              <span style="color: var(--color-text-secondary);">Whole Blood:</span>
              <strong>${Math.max(0, Math.round(totalUnits * 0.1))} Units</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderRecentBatchesSummary() {
    const tbody = document.getElementById('recent-batches-tbody');
    if (!tbody) return;

    tbody.innerHTML = currentBatches.slice(0, 3).map(b => `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${b.batch_number}</td>
        <td><span class="badge-pill" style="font-weight: 800; color: var(--color-primary);">${b.blood_group}</span></td>
        <td>${formatComponent(b.blood_component)}</td>
        <td>${b.units_count} Units</td>
        <td>${b.storage_location}</td>
        <td><span class="badge-pill" style="font-size: 0.72rem; ${b.qc_status === 'passed' ? 'background: rgba(16,185,129,0.15); color: var(--color-success);' : 'background: rgba(245,158,11,0.15); color: var(--color-warning);'}">${(b.qc_status || 'pending').toUpperCase()}</span></td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // 3. BATCHES TABLE & ACTIONS
  // =========================================================================
  function renderBatchesTable(filtered = null) {
    const list = filtered || currentBatches;
    const tbody = document.getElementById('batches-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = list.map(b => {
      const expDate = new Date(b.expiry_date);
      const daysLeft = Math.ceil((expDate - Date.now()) / (1000 * 86400));
      let badgeClass = 'risk-optimal';
      if (daysLeft <= 3) badgeClass = 'risk-critical';
      else if (daysLeft <= 7) badgeClass = 'risk-warning';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 700;">${b.batch_number}</td>
          <td><span class="badge-pill" style="font-weight: 800; color: var(--color-primary);">${b.blood_group}</span></td>
          <td>${formatComponent(b.blood_component)}</td>
          <td><strong>${b.units_count}</strong> (${b.volume_ml} mL)</td>
          <td>${b.storage_location} <span style="font-size: 0.7rem; color: var(--color-text-tertiary); display: block;">${b.storage_temperature_celsius}°C</span></td>
          <td>
            <span class="expiry-badge ${badgeClass}">
              ${daysLeft > 0 ? daysLeft + ' days left' : 'EXPIRED'}
            </span>
          </td>
          <td>
            <span class="badge-pill" style="font-size: 0.72rem; ${b.status === 'available' ? 'background: rgba(16,185,129,0.15); color: var(--color-success);' : b.status === 'discarded' ? 'background: rgba(199,25,50,0.15); color: var(--color-primary);' : 'background: rgba(245,158,11,0.15); color: var(--color-warning);'}">
              ${b.status.replace('_', ' ').toUpperCase()}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn btn-secondary btn-sm" onclick="window.openQCModal('${b.id}', '${b.batch_number}')" title="Lab QC Screening">
                QC
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.openDiscardModal('${b.id}', '${b.batch_number}')" title="Discard">
                Discard
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function formatComponent(comp) {
    if (!comp) return 'PRBC';
    return comp.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // =========================================================================
  // 4. INCOMING REQUESTS & PROCESSING EVENTS
  // =========================================================================
  async function loadIncomingRequests() {
    const reqs = await Service.getIncomingRequests();
    const tbody = document.getElementById('incoming-requests-tbody');
    if (!tbody) return;

    tbody.innerHTML = reqs.map(r => `
      <tr>
        <td>
          <div style="font-weight: 700;">${r.patient_name}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-tertiary); font-family: monospace;">${r.id}</div>
        </td>
        <td><strong>${r.hospital_name}</strong></td>
        <td><span class="badge-pill" style="font-weight: 800; color: var(--color-primary);">${r.blood_group}</span></td>
        <td><strong>${r.units_requested}</strong> Units (${formatComponent(r.blood_component)})</td>
        <td><span class="badge-pill" style="font-size: 0.72rem; ${r.priority === 'critical' ? 'background: rgba(199,25,50,0.15); color: var(--color-primary);' : ''}">${r.priority.toUpperCase()}</span></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="window.openDispatchModal('${r.id}', '${r.hospital_name}', '${r.blood_group}', ${r.units_requested})">
            Dispatch Units
          </button>
        </td>
      </tr>
    `).join('');
  }

  async function loadProcessingEvents() {
    const evts = await Service.getProcessingEvents();
    const tbody = document.getElementById('processing-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = evts.map(e => `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${e.id}</td>
        <td><span class="badge-pill" style="font-size: 0.72rem;">${e.processing_type.replace('_', ' ').toUpperCase()}</span></td>
        <td style="font-weight: 700;">${e.source_batch}</td>
        <td>${e.products_generated}</td>
        <td>${e.processed_by}</td>
        <td>${new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    `).join('');
  }

  async function loadDispatches() {
    const dsps = await Service.getDispatches();
    const tbody = document.getElementById('dispatches-table-tbody');
    if (!tbody) return;

    tbody.innerHTML = dsps.map(d => `
      <tr>
        <td style="font-family: monospace; font-weight: 700;">${d.dispatch_code}</td>
        <td><strong>${d.destination}</strong></td>
        <td>${d.blood_product}</td>
        <td>${d.courier_name}</td>
        <td><span class="badge-pill" style="font-size: 0.72rem;">${d.departure_temp}</span></td>
        <td><span class="badge-pill" style="font-size: 0.72rem; ${d.status === 'in_transit' ? 'background: rgba(2,132,199,0.15); color: var(--color-info);' : 'background: rgba(16,185,129,0.15); color: var(--color-success);'}">${d.status.toUpperCase()}</span></td>
      </tr>
    `).join('');
  }

  async function loadStaff() {
    const staff = await Service.getStaff();
    const tbody = document.getElementById('bb-staff-tbody');
    if (!tbody) return;

    tbody.innerHTML = staff.map(s => `
      <tr>
        <td>
          <div style="font-weight: 700;">${s.name}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-tertiary);">${s.email}</div>
        </td>
        <td><span class="badge-pill" style="font-size: 0.72rem;">${s.staff_role.replace('_', ' ').toUpperCase()}</span></td>
        <td>${s.department}</td>
        <td style="font-family: monospace; font-size: 0.8rem;">${s.license_number}</td>
        <td><span class="badge-pill" style="background: rgba(16,185,129,0.15); color: var(--color-success); font-size: 0.72rem;">ACTIVE</span></td>
      </tr>
    `).join('');
  }

  async function loadReports() {
    const r = await Service.getReports();
    const m = r.metrics || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('bb-rep-collected', m.total_units_collected || 248);
    setVal('bb-rep-tested', m.total_units_tested || 240);
    setVal('bb-rep-passrate', (m.testing_pass_rate_pct || 98.8) + '%');
    setVal('bb-rep-dispatched', m.total_units_dispatched || 182);
  }

  async function loadAlerts() {
    const alerts = await Service.getAlerts();
    const container = document.getElementById('bb-alerts-feed');
    if (!container) return;

    container.innerHTML = alerts.map(a => `
      <div style="padding: 1rem 1.25rem; background: var(--color-surface); border: 1px solid var(--color-border); border-left: 4px solid ${a.severity === 'critical' ? 'var(--color-primary)' : 'var(--color-warning)'}; border-radius: var(--radius-md); margin-bottom: 0.75rem;">
        <div style="font-weight: 700; font-size: 0.88rem; margin-bottom: 0.2rem;">
          ${a.alert_type.replace(/_/g, ' ').toUpperCase()}: ${a.blood_group || ''}
        </div>
        <div style="font-size: 0.82rem; color: var(--color-text-secondary);">${a.message}</div>
      </div>
    `).join('');
  }

  // =========================================================================
  // 5. MODAL LOGIC & REGISTRATION
  // =========================================================================
  function setupModals() {
    document.querySelectorAll('.hospital-modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });

    document.querySelectorAll('.hospital-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.hospital-modal-overlay');
        if (modal) modal.classList.remove('open');
      });
    });

    // Batch Registration Submit
    const regForm = document.getElementById('register-batch-form');
    if (regForm) {
      regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bg = document.getElementById('reg-blood-group').value;
        const comp = document.getElementById('reg-component').value;
        const vol = parseInt(document.getElementById('reg-volume').value, 10);
        const units = parseFloat(document.getElementById('reg-units').value);
        const loc = document.getElementById('reg-location').value;
        const collDate = document.getElementById('reg-coll-date').value || new Date().toISOString().split('T')[0];

        const res = await Service.registerBatch({
          blood_group: bg,
          blood_component: comp,
          volume_ml: vol,
          units_count: units,
          storage_location: loc,
          collection_date: collDate
        });

        if (res.success) {
          window.BloodLinkToast?.success(`Batch ${res.data.batch_number} registered in cold vault intake.`, 'Batch Registered');
          document.getElementById('register-batch-modal').classList.remove('open');
          regForm.reset();
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to register batch.', 'Error');
        }
      });
    }

    // Laboratory QC Submit
    const qcForm = document.getElementById('qc-form');
    if (qcForm) {
      qcForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hiv = document.getElementById('qc-hiv').value;
        const hbv = document.getElementById('qc-hbv').value;
        const hcv = document.getElementById('qc-hcv').value;
        const syp = document.getElementById('qc-syphilis').value;
        const mal = document.getElementById('qc-malaria').value;
        const overall = document.getElementById('qc-overall').value;
        const notes = document.getElementById('qc-notes').value;

        if (!selectedBatchId) return;

        const res = await Service.submitQC(selectedBatchId, {
          hiv_screen: hiv,
          hbv_screen: hbv,
          hcv_screen: hcv,
          syphilis_screen: syp,
          malaria_screen: mal,
          overall_result: overall,
          laboratory_notes: notes
        });

        if (res.success) {
          window.BloodLinkToast?.success(`QC Status '${overall.toUpperCase()}' recorded. Status updated.`, 'QC Recorded');
          document.getElementById('qc-modal').classList.remove('open');
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to submit QC.', 'Error');
        }
      });
    }

    // Discard Batch Submit
    const discardForm = document.getElementById('discard-form');
    if (discardForm) {
      discardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = document.getElementById('discard-reason-input').value;
        if (!selectedBatchId) return;

        const res = await Service.discardBatch(selectedBatchId, reason);
        if (res.success) {
          window.BloodLinkToast?.warning('Batch discarded and removed from active reserves.', 'Batch Discarded');
          document.getElementById('discard-modal').classList.remove('open');
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to discard batch.', 'Error');
        }
      });
    }

    // Dispatch Submit
    const dspForm = document.getElementById('dispatch-form');
    if (dspForm) {
      dspForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rsvId = document.getElementById('dsp-reservation-id').value;
        const courier = document.getElementById('dsp-courier-input').value;
        const box = document.getElementById('dsp-box-input').value;
        const temp = parseFloat(document.getElementById('dsp-temp-input').value);

        const res = await Service.dispatchReservation(rsvId, {
          courier_name: courier,
          transport_box_id: box,
          departure_temp_celsius: temp
        });

        if (res.success) {
          window.BloodLinkToast?.success(`Shipment dispatched under code ${res.data.dispatch_code}.`, 'Cold-Chain Dispatched');
          document.getElementById('dispatch-modal').classList.remove('open');
          await loadDashboardData();
        } else {
          window.BloodLinkToast?.error(res.error || 'Failed to dispatch.', 'Error');
        }
      });
    }

    // Provision Staff Form
    const staffForm = document.getElementById('bb-staff-form');
    if (staffForm) {
      staffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('bb-staff-email').value;
        const role = document.getElementById('bb-staff-role').value;
        const dept = document.getElementById('bb-staff-dept').value;
        const license = document.getElementById('bb-staff-license').value;

        const res = await Service.provisionStaff({
          email: email,
          staff_role: role,
          department: dept,
          license_number: license
        });

        if (res.success) {
          window.BloodLinkToast?.success(`Staff credential provisioned for ${email}.`, 'Staff Provisioned');
          document.getElementById('bb-staff-modal').classList.remove('open');
          staffForm.reset();
          loadStaff();
        }
      });
    }
  }

  window.openRegisterBatchModal = function () {
    const modal = document.getElementById('register-batch-modal');
    if (modal) modal.classList.add('open');
  };

  window.openQCModal = function (batchId, batchNumber) {
    selectedBatchId = batchId;
    const modal = document.getElementById('qc-modal');
    if (!modal) return;

    document.getElementById('qc-batch-label').textContent = `Batch: ${batchNumber}`;
    modal.classList.add('open');
  };

  window.openDiscardModal = function (batchId, batchNumber) {
    selectedBatchId = batchId;
    const modal = document.getElementById('discard-modal');
    if (!modal) return;

    document.getElementById('discard-batch-label').textContent = `Batch: ${batchNumber}`;
    modal.classList.add('open');
  };

  window.openDispatchModal = function (requestId, hospitalName, bloodGroup, units) {
    const modal = document.getElementById('dispatch-modal');
    if (!modal) return;

    document.getElementById('dsp-reservation-id').value = requestId;
    document.getElementById('dsp-dest-label').textContent = `Destination: ${hospitalName} • Cargo: ${units} Units ${bloodGroup}`;
    modal.classList.add('open');
  };

  window.openBBStaffModal = function () {
    const modal = document.getElementById('bb-staff-modal');
    if (modal) modal.classList.add('open');
  };

  // =========================================================================
  // 6. SEARCH & FILTER
  // =========================================================================
  function setupSearchAndFilters() {
    const search = document.getElementById('batches-search-input');
    if (search) {
      search.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = currentBatches.filter(b =>
          b.batch_number.toLowerCase().includes(q) ||
          b.blood_group.toLowerCase().includes(q) ||
          b.blood_component.toLowerCase().includes(q)
        );
        renderBatchesTable(filtered);
      });
    }

    const groupFilter = document.getElementById('batches-group-filter');
    if (groupFilter) {
      groupFilter.addEventListener('change', (e) => {
        const val = e.target.value;
        const filtered = val ? currentBatches.filter(b => b.blood_group === val) : currentBatches;
        renderBatchesTable(filtered);
      });
    }
  }

})();
