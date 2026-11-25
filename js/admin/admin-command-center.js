/**
 * BLOODLINK SUPER ADMIN COMMAND CENTER CONTROLLER (admin-command-center.js)
 * Enterprise controller orchestrating 10 operational modules, modal dialogs,
 * real-time telemetry rendering, search filtering, and audit logging.
 */

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // 1. Session & Access Guard
  // Requires authenticated administrator session
  if (window.BloodLinkSession && typeof window.BloodLinkSession.requireAuth === 'function') {
    await window.BloodLinkSession.requireAuth({
      allowedRoles: ['super_admin', 'admin', 'operations_admin', 'verification_admin', 'security_auditor', 'analytics_viewer'],
      redirectToLogin: true
    });
  }

  // 2. Initialize 3D Globe Telemetry Scene
  if (window.BloodLinkAdmin3DGlobe) {
    window.BloodLinkAdmin3DGlobe.init('admin-3d-globe-viewport');
  }

  // 3. Tab Switching Architecture
  const navItems = document.querySelectorAll('.sidebar-nav-item[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');

  function switchTab(tabId) {
    navItems.forEach(item => {
      const active = item.getAttribute('data-tab') === tabId;
      item.classList.toggle('active', active);
    });

    tabPanes.forEach(pane => {
      const active = pane.id === tabId;
      pane.classList.toggle('active', active);
    });

    // Lazy load data for selected tab
    loadTabData(tabId);
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      if (tabId) switchTab(tabId);
    });
  });

  // Mobile sidebar toggle
  const mobileMenuBtn = document.getElementById('btn-mobile-menu');
  const sidebar = document.querySelector('.admin-sidebar');
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }

  // Initial load
  loadTabData('tab-overview');

  // =========================================================================
  // DATA LOADERS
  // =========================================================================

  async function loadTabData(tabId) {
    switch (tabId) {
      case 'tab-overview':
        await loadOverviewMetrics();
        break;
      case 'tab-users':
        await loadUsers();
        break;
      case 'tab-facilities':
        await loadFacilities();
        break;
      case 'tab-emergency':
        await loadEmergencyOperations();
        break;
      case 'tab-inventory':
        await loadInventoryIntelligence();
        break;
      case 'tab-analytics':
        await loadAnalytics();
        break;
      case 'tab-broadcast':
        await loadBroadcasts();
        break;
      case 'tab-security':
        await loadSecurityCenter();
        break;
      case 'tab-configuration':
        await loadConfigurations();
        break;
      case 'tab-roles':
        await loadAdminRoles();
        break;
    }
  }

  // 1. Overview Telemetry
  async function loadOverviewMetrics() {
    try {
      const data = await window.BloodLinkAdminService.getDashboardMetrics();
      if (!data) return;

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined && val !== null ? val : '—';
      };

      setTxt('stat-total-users', data.total_users);
      setTxt('stat-active-donors', data.active_donors);
      setTxt('stat-registered-patients', data.registered_patients);
      setTxt('stat-verified-hospitals', data.verified_hospitals);
      setTxt('stat-verified-bloodbanks', data.verified_bloodbanks);
      setTxt('stat-pending-reviews', data.pending_facility_reviews);
      setTxt('stat-active-emergencies', data.active_emergency_requests);
      setTxt('stat-critical-emergencies', data.critical_code_red_requests);
      setTxt('stat-available-units', data.available_verified_units);
      setTxt('stat-open-incidents', data.open_security_incidents);

      // Render recent activity list
      const activityList = document.getElementById('overview-activity-list');
      if (activityList && data.recent_admin_activity) {
        activityList.innerHTML = data.recent_admin_activity.map(act => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--color-border-subtle);gap:1rem;">
            <div>
              <div style="font-weight:700;font-size:0.85rem;color:var(--color-text);">${escapeHtml(act.action_type)}</div>
              <div style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:2px;">${escapeHtml(act.reason || '')} • <span style="font-weight:600;">${escapeHtml(act.target_id || '')}</span></div>
            </div>
            <div style="font-size:0.72rem;color:var(--color-text-tertiary);white-space:nowrap;">${formatRelativeTime(act.created_at)}</div>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading overview metrics:', err);
    }
  }

  // 2. User Administration
  async function loadUsers() {
    const role = document.getElementById('user-filter-role')?.value || '';
    const status = document.getElementById('user-filter-status')?.value || '';
    const search = document.getElementById('user-search-input')?.value || '';

    try {
      const data = await window.BloodLinkAdminService.getUsers({ role, status, search });
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;

      const users = (data && data.users) || [];
      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-tertiary);">No users found matching query.</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(u => `
        <tr>
          <td>
            <div style="font-weight:700;color:var(--color-text);">${escapeHtml(u.full_name || 'Anonymous')}</div>
            <div style="font-size:0.76rem;color:var(--color-text-tertiary);">${escapeHtml(u.email || '')}</div>
          </td>
          <td><span class="badge" style="background:rgba(0,0,0,0.06);">${escapeHtml(u.account_type || 'user')}</span></td>
          <td>${getStatusBadge(u.account_status)}</td>
          <td>${u.is_verified ? '<span class="badge badge-verified">Verified</span>' : '<span class="badge badge-pending">Unverified</span>'}</td>
          <td><span style="font-size:0.78rem;color:var(--color-text-secondary);">${escapeHtml(u.city || '—')}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.openUserStatusModal('${u.id}', '${escapeHtml(u.full_name)}', '${u.account_status}')">
              Manage Status
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  // 3. Facility Verification Queue
  async function loadFacilities() {
    const status = document.getElementById('facility-filter-status')?.value || '';
    const type = document.getElementById('facility-filter-type')?.value || '';

    try {
      const facilities = await window.BloodLinkAdminService.getFacilities({ status, type });
      const tbody = document.getElementById('facilities-table-body');
      if (!tbody) return;

      if (!facilities || facilities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-tertiary);">No facilities awaiting accreditation review.</td></tr>';
        return;
      }

      tbody.innerHTML = facilities.map(fac => `
        <tr>
          <td>
            <div style="font-weight:700;color:var(--color-text);">${escapeHtml(fac.facility_name)}</div>
            <div style="font-size:0.75rem;color:var(--color-text-tertiary);">${escapeHtml(fac.city || '')} • Reg: ${escapeHtml(fac.registration_number || 'N/A')}</div>
          </td>
          <td><span class="badge" style="background:rgba(0,0,0,0.06);">${fac.facility_type === 'hospital' ? 'Trauma Hospital' : 'Blood Bank'}</span></td>
          <td><code style="font-size:0.8rem;background:var(--color-bg);padding:0.2rem 0.4rem;border-radius:4px;">${escapeHtml(fac.license_number || 'PENDING')}</code></td>
          <td>${fac.is_verified ? '<span class="badge badge-verified">Accredited</span>' : '<span class="badge badge-pending">Pending Review</span>'}</td>
          <td><span style="font-size:0.78rem;color:var(--color-text-secondary);">${escapeHtml(fac.accreditation_body || 'Standard')}</span></td>
          <td>
            <button class="btn btn-primary btn-sm" onclick="window.openFacilityReviewModal('${fac.id}', '${escapeHtml(fac.facility_name)}', '${escapeHtml(fac.license_number || '')}', '${escapeHtml(fac.accreditation_body || '')}')">
              Review Accreditation
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading facilities:', err);
    }
  }

  // 4. Global Emergency Operations
  async function loadEmergencyOperations() {
    const urgency = document.getElementById('emergency-filter-urgency')?.value || '';
    try {
      const data = await window.BloodLinkAdminService.getEmergencyOperations({ urgency });
      const tbody = document.getElementById('emergency-table-body');
      if (!tbody) return;

      const requests = (data && data.requests) || [];
      if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--color-text-tertiary);">No active emergency requisitions.</td></tr>';
        return;
      }

      tbody.innerHTML = requests.map(req => `
        <tr>
          <td><span style="font-family:var(--font-family-mono);font-weight:700;">${escapeHtml(req.request_code)}</span></td>
          <td>
            <div style="font-weight:600;">${escapeHtml(req.hospital_name)}</div>
            <div style="font-size:0.74rem;color:var(--color-text-tertiary);">${escapeHtml(req.city)}</div>
          </td>
          <td><span style="font-weight:800;color:var(--color-primary);">${escapeHtml(req.blood_group)}</span> <span style="font-size:0.75rem;color:var(--color-text-secondary);">(${escapeHtml(req.component_type)})</span></td>
          <td><span style="font-weight:700;">${req.units_required} Units</span></td>
          <td>${req.urgency === 'code_red' ? '<span class="badge badge-code-red">Code-Red</span>' : '<span class="badge badge-urgent">Urgent</span>'}</td>
          <td><span class="badge" style="background:rgba(0,0,0,0.06);">${escapeHtml(req.status)}</span></td>
          <td>${req.stalled ? '<span class="badge badge-suspended" title="Triage exceeded target response SLA">Stalled Triage</span>' : '<span class="badge badge-verified">On Track</span>'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading emergency operations:', err);
    }
  }

  // 5. Global Inventory Intelligence
  async function loadInventoryIntelligence() {
    try {
      const data = await window.BloodLinkAdminService.getInventoryOverview();
      if (!data) return;

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('inv-total-verified', data.total_units_verified);
      setTxt('inv-total-reserved', data.total_units_reserved);

      // Render Matrix Grid
      const matrixBody = document.getElementById('inventory-matrix-body');
      if (matrixBody && data.matrix) {
        const groups = Object.keys(data.matrix);
        matrixBody.innerHTML = groups.map(grp => {
          const comps = data.matrix[grp];
          return `
            <tr>
              <td><span style="font-weight:800;font-size:0.95rem;color:var(--color-primary);">${grp}</span></td>
              <td><span style="font-weight:700;">${comps.packed_red_cells || 0}</span></td>
              <td><span style="font-weight:700;">${comps.platelets || 0}</span></td>
              <td><span style="font-weight:700;">${comps.whole_blood || 0}</span></td>
              <td><span style="font-weight:700;">${comps.fresh_frozen_plasma || 0}</span></td>
              <td><span style="font-weight:700;">${comps.cryoprecipitate || 0}</span></td>
            </tr>
          `;
        }).join('');
      }

      // Render Shortage Alerts
      const alertsContainer = document.getElementById('inventory-alerts-container');
      if (alertsContainer && data.critical_shortage_alerts) {
        alertsContainer.innerHTML = data.critical_shortage_alerts.map(a => `
          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-md);padding:0.75rem 1rem;display:flex;align-items:center;justify-content:space-between;">
            <div>
              <span class="badge badge-suspended" style="margin-right:0.5rem;">Critical Alert</span>
              <span style="font-weight:700;font-size:0.85rem;">Group ${a.blood_group} ${a.component}</span>
              <span style="font-size:0.8rem;color:var(--color-text-secondary);margin-left:0.5rem;">Current Stock: ${a.current_stock || 0} (Threshold: ${a.threshold || 10})</span>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window.openBroadcastForGroup('${a.blood_group}', '${a.component}')">Dispatch Broadcast</button>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading inventory intelligence:', err);
    }
  }

  // 6. Analytics & Hemovigilance
  async function loadAnalytics() {
    try {
      const data = await window.BloodLinkAdminService.getAnalytics();
      if (!data) return;

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('stat-fulfilment-rate', `${data.fulfilment_rate_pct}%`);
      setTxt('stat-ct-ratio', data.average_crossmatch_to_transfusion_ratio);
      setTxt('stat-avg-verify-mins', `${data.average_clinical_verification_minutes} min`);
      setTxt('stat-discovery-rate', `${data.matching_discovery_rate_pct}%`);
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }

  // 7. Notification & Broadcast Center
  async function loadBroadcasts() {
    try {
      const announcements = await window.BloodLinkAdminService.getAnnouncements();
      const list = document.getElementById('broadcasts-list-container');
      if (!list) return;

      if (!announcements || announcements.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--color-text-tertiary);">No platform broadcasts dispatched yet.</div>';
        return;
      }

      list.innerHTML = announcements.map(ann => `
        <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.4rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span style="font-family:var(--font-family-mono);font-weight:700;font-size:0.8rem;">${escapeHtml(ann.announcement_code)}</span>
              ${ann.priority === 'critical' ? '<span class="badge badge-code-red">Critical Priority</span>' : '<span class="badge" style="background:rgba(0,0,0,0.06);">Standard</span>'}
              <span class="badge" style="background:rgba(199,25,50,0.08);color:var(--color-primary);">${escapeHtml(ann.target_audience)}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--color-text-tertiary);">${ann.read_count || 0} Recipients Read</div>
          </div>
          <div style="font-weight:700;font-size:0.95rem;color:var(--color-text);">${escapeHtml(ann.title)}</div>
          <div style="font-size:0.82rem;color:var(--color-text-secondary);line-height:1.45;">${escapeHtml(ann.content)}</div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Error loading broadcasts:', err);
    }
  }

  // 8. Security & Incident Center
  async function loadSecurityCenter() {
    try {
      const [events, incidents] = await Promise.all([
        window.BloodLinkAdminService.getSecurityEvents(),
        window.BloodLinkAdminService.getSecurityIncidents()
      ]);

      const eventsContainer = document.getElementById('security-events-container');
      if (eventsContainer && events) {
        eventsContainer.innerHTML = events.map(e => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--color-border-subtle);gap:1rem;">
            <div>
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span class="badge" style="background:rgba(0,0,0,0.06);font-size:0.72rem;">${escapeHtml(e.event_type)}</span>
                <span style="font-weight:700;font-size:0.82rem;">${escapeHtml(e.actor_email || 'System')}</span>
                <span style="font-size:0.74rem;color:var(--color-text-tertiary);font-family:var(--font-family-mono);">${escapeHtml(e.ip_address || '')}</span>
              </div>
              <div style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:2px;">${escapeHtml(e.description || '')}</div>
            </div>
            <div style="font-size:0.72rem;color:var(--color-text-tertiary);white-space:nowrap;">${formatRelativeTime(e.timestamp)}</div>
          </div>
        `).join('');
      }

      const incidentsContainer = document.getElementById('security-incidents-container');
      if (incidentsContainer && incidents) {
        incidentsContainer.innerHTML = incidents.map(inc => `
          <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.4rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span style="font-family:var(--font-family-mono);font-weight:700;font-size:0.8rem;">${escapeHtml(inc.incident_code)}</span>
                ${inc.severity === 'high' ? '<span class="badge badge-suspended">High Severity</span>' : '<span class="badge badge-pending">Medium Severity</span>'}
                <span class="badge badge-verified">${escapeHtml(inc.status)}</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="window.openIncidentModal('${inc.id}', '${escapeHtml(inc.incident_code)}', '${escapeHtml(inc.title)}', '${inc.status}')">Investigate</button>
            </div>
            <div style="font-weight:700;font-size:0.9rem;">${escapeHtml(inc.title)}</div>
            <div style="font-size:0.8rem;color:var(--color-text-secondary);">${escapeHtml(inc.description)}</div>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Error loading security center:', err);
    }
  }

  // 9. Platform Configuration
  async function loadConfigurations() {
    try {
      const configs = await window.BloodLinkAdminService.getConfiguration();
      const tbody = document.getElementById('config-table-body');
      if (!tbody) return;

      if (!configs || configs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">No configurations found.</td></tr>';
        return;
      }

      tbody.innerHTML = configs.map(c => `
        <tr>
          <td><code style="font-weight:700;color:var(--color-primary);">${escapeHtml(c.config_key)}</code></td>
          <td><span class="badge" style="background:rgba(0,0,0,0.06);">${escapeHtml(c.category)}</span></td>
          <td><pre style="margin:0;font-size:0.75rem;max-width:320px;overflow:hidden;text-overflow:ellipsis;background:var(--color-bg);padding:0.35rem 0.6rem;border-radius:4px;">${escapeHtml(JSON.stringify(c.config_value))}</pre></td>
          <td>${c.is_clinical_rule ? '<span class="badge badge-code-red" title="Requires Medical Board Authorization Token">Protected Clinical Rule</span>' : '<span class="badge badge-verified">Operational</span>'}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.openConfigModal('${escapeHtml(c.config_key)}', ${JSON.stringify(c.config_value).replace(/"/g, '&quot;')}, ${c.is_clinical_rule})">
              Edit Setting
            </button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading configurations:', err);
    }
  }

  // 10. Admin Roles
  async function loadAdminRoles() {
    try {
      const roles = await window.BloodLinkAdminService.getAdminRoles();
      const tbody = document.getElementById('admin-roles-table-body');
      if (!tbody) return;

      if (!roles || roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">No administrators provisioned.</td></tr>';
        return;
      }

      tbody.innerHTML = roles.map(r => `
        <tr>
          <td>
            <div style="font-weight:700;">${escapeHtml(r.full_name || 'Admin')}</div>
            <div style="font-size:0.75rem;color:var(--color-text-tertiary);">${escapeHtml(r.email || '')}</div>
          </td>
          <td><span class="badge badge-verified">${escapeHtml(r.admin_role)}</span></td>
          <td><code style="font-size:0.75rem;">${escapeHtml(r.user_id)}</code></td>
          <td>${r.is_active ? '<span class="badge badge-verified">Active</span>' : '<span class="badge badge-suspended">Inactive</span>'}</td>
          <td><span style="font-size:0.75rem;color:var(--color-text-tertiary);">${r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : '—'}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading admin roles:', err);
    }
  }

  // =========================================================================
  // MODAL CONTROLLERS & ACTIONS
  // =========================================================================

  // 1. User Status Modal
  window.openUserStatusModal = function(userId, userName, currentStatus) {
    document.getElementById('modal-user-id').value = userId;
    document.getElementById('modal-user-name').textContent = userName;
    document.getElementById('modal-user-status-select').value = currentStatus;
    document.getElementById('modal-user-reason').value = '';
    document.getElementById('user-status-modal').classList.add('active');
  };

  document.getElementById('btn-save-user-status')?.addEventListener('click', async () => {
    const userId = document.getElementById('modal-user-id').value;
    const status = document.getElementById('modal-user-status-select').value;
    const reason = document.getElementById('modal-user-reason').value.trim();

    if (!reason || reason.length < 5) {
      alert('A detailed administrative justification (minimum 5 characters) is required.');
      return;
    }

    try {
      await window.BloodLinkAdminService.updateUserStatus(userId, status, reason);
      alert('User status successfully updated.');
      closeAllModals();
      loadUsers();
    } catch (err) {
      alert(`Error updating user status: ${err.message}`);
    }
  });

  // 2. Facility Accreditation Review Modal
  window.openFacilityReviewModal = function(facId, facName, license, body) {
    document.getElementById('modal-fac-id').value = facId;
    document.getElementById('modal-fac-name').textContent = facName;
    document.getElementById('modal-fac-license').value = license;
    document.getElementById('modal-fac-body').value = body;
    document.getElementById('modal-fac-reason').value = '';
    document.getElementById('modal-fac-notes').value = '';
    document.getElementById('modal-fac-audit').checked = false;
    document.getElementById('facility-review-modal').classList.add('active');
  };

  document.getElementById('btn-submit-facility-review')?.addEventListener('click', async () => {
    const facilityId = document.getElementById('modal-fac-id').value;
    const decision = document.getElementById('modal-fac-decision').value;
    const reason = document.getElementById('modal-fac-reason').value.trim();
    const licenseVerified = document.getElementById('modal-fac-license').value.trim();
    const accreditationBody = document.getElementById('modal-fac-body').value.trim();
    const physicalAudit = document.getElementById('modal-fac-audit').checked;
    const reviewNotes = document.getElementById('modal-fac-notes').value.trim();

    if (!reason || reason.length < 5) {
      alert('A comprehensive accreditation review reason (minimum 5 characters) is required.');
      return;
    }

    try {
      await window.BloodLinkAdminService.submitFacilityReview(facilityId, {
        decision,
        reason,
        license_number_verified: licenseVerified,
        accreditation_body: accreditationBody,
        physical_audit_completed: physicalAudit,
        review_notes: reviewNotes
      });
      alert(`Facility review successfully recorded: ${decision}`);
      closeAllModals();
      loadFacilities();
    } catch (err) {
      alert(`Error recording facility review: ${err.message}`);
    }
  });

  // 3. Broadcast Composer Modal
  window.openBroadcastModal = function() {
    document.getElementById('modal-broadcast-title').value = '';
    document.getElementById('modal-broadcast-content').value = '';
    document.getElementById('modal-broadcast-audience').value = 'all';
    document.getElementById('modal-broadcast-priority').value = 'standard';
    document.getElementById('broadcast-modal').classList.add('active');
  };

  window.openBroadcastForGroup = function(group, comp) {
    window.openBroadcastModal();
    document.getElementById('modal-broadcast-title').value = `Urgent Stock Alert: Group ${group} ${comp}`;
    document.getElementById('modal-broadcast-content').value = `Certified trauma centers are reporting acute shortages for Group ${group} ${comp}. Compatible voluntary donors are requested to schedule appointments.`;
    document.getElementById('modal-broadcast-audience').value = 'donors';
    document.getElementById('modal-broadcast-priority').value = 'critical';
  };

  document.getElementById('btn-dispatch-broadcast')?.addEventListener('click', async () => {
    const title = document.getElementById('modal-broadcast-title').value.trim();
    const content = document.getElementById('modal-broadcast-content').value.trim();
    const audience = document.getElementById('modal-broadcast-audience').value;
    const priority = document.getElementById('modal-broadcast-priority').value;

    if (!title || !content) {
      alert('Broadcast title and content are mandatory.');
      return;
    }

    if (!confirm(`Confirm dispatching this broadcast to audience: '${audience.toUpperCase()}'?`)) {
      return;
    }

    try {
      await window.BloodLinkAdminService.createAnnouncement({
        title,
        content,
        target_audience: audience,
        priority
      });
      alert('Platform broadcast successfully queued and dispatched.');
      closeAllModals();
      loadBroadcasts();
    } catch (err) {
      alert(`Error dispatching broadcast: ${err.message}`);
    }
  });

  // 4. Incident Modal
  window.openIncidentModal = function(incId, incCode, title, status) {
    document.getElementById('modal-inc-id').value = incId;
    document.getElementById('modal-inc-code').textContent = incCode;
    document.getElementById('modal-inc-title').textContent = title;
    document.getElementById('modal-inc-status').value = status;
    document.getElementById('modal-inc-notes').value = '';
    document.getElementById('modal-inc-resolution').value = '';
    document.getElementById('incident-modal').classList.add('active');
  };

  document.getElementById('btn-save-incident')?.addEventListener('click', async () => {
    const incidentId = document.getElementById('modal-inc-id').value;
    const status = document.getElementById('modal-inc-status').value;
    const notes = document.getElementById('modal-inc-notes').value.trim();
    const resolution = document.getElementById('modal-inc-resolution').value.trim();

    try {
      await window.BloodLinkAdminService.saveSecurityIncident({
        incident_id: incidentId,
        status,
        investigation_notes: notes,
        resolution_summary: resolution
      });
      alert('Security incident record updated.');
      closeAllModals();
      loadSecurityCenter();
    } catch (err) {
      alert(`Error updating incident: ${err.message}`);
    }
  });

  // 5. Configuration Modal
  window.openConfigModal = function(key, val, isClinical) {
    document.getElementById('modal-config-key').value = key;
    document.getElementById('modal-config-key-label').textContent = key;
    document.getElementById('modal-config-value').value = JSON.stringify(val, null, 2);
    document.getElementById('modal-config-reason').value = '';
    const clinicalNotice = document.getElementById('modal-clinical-notice');
    if (clinicalNotice) {
      clinicalNotice.style.display = isClinical ? 'block' : 'none';
    }
    document.getElementById('config-modal').classList.add('active');
  };

  document.getElementById('btn-save-config')?.addEventListener('click', async () => {
    const key = document.getElementById('modal-config-key').value;
    const reason = document.getElementById('modal-config-reason').value.trim();
    let parsedVal;

    try {
      parsedVal = JSON.parse(document.getElementById('modal-config-value').value);
    } catch (e) {
      alert('Configuration value must be valid JSON.');
      return;
    }

    try {
      await window.BloodLinkAdminService.updateConfiguration(key, parsedVal, reason);
      alert('System configuration setting updated.');
      closeAllModals();
      loadConfigurations();
    } catch (err) {
      alert(`Configuration update blocked: ${err.message}`);
    }
  });

  // 6. Admin Role Modal
  window.openRoleModal = function() {
    document.getElementById('modal-role-user-id').value = '';
    document.getElementById('modal-role-select').value = 'operations_admin';
    document.getElementById('modal-role-notes').value = '';
    document.getElementById('role-modal').classList.add('active');
  };

  document.getElementById('btn-assign-admin-role')?.addEventListener('click', async () => {
    const targetUserId = document.getElementById('modal-role-user-id').value.trim();
    const targetRole = document.getElementById('modal-role-select').value;
    const notes = document.getElementById('modal-role-notes').value.trim();

    if (!targetUserId) {
      alert('Target user UUID is required.');
      return;
    }

    try {
      await window.BloodLinkAdminService.assignAdminRole(targetUserId, targetRole, notes);
      alert(`Role '${targetRole}' successfully assigned.`);
      closeAllModals();
      loadAdminRoles();
    } catch (err) {
      alert(`Role assignment error: ${err.message}`);
    }
  });

  // Modal Closers
  window.closeAllModals = function() {
    document.querySelectorAll('.admin-modal-backdrop').forEach(m => m.classList.remove('active'));
  };

  document.querySelectorAll('.btn-close-modal, .admin-modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el) closeAllModals();
    });
  });

  // Global search trigger
  const globalSearch = document.getElementById('admin-global-search');
  if (globalSearch) {
    globalSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = globalSearch.value.trim();
        if (query) {
          switchTab('tab-users');
          const userSearch = document.getElementById('user-search-input');
          if (userSearch) {
            userSearch.value = query;
            loadUsers();
          }
        }
      }
    });
  }

  // Logout wiring
  const logoutBtn = document.getElementById('btn-sidebar-logout');
  if (logoutBtn && window.BloodLinkSession) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Sign out from BloodLink Super Admin Command Center?')) {
        window.BloodLinkSession.signOut();
      }
    });
  }

  // =========================================================================
  // UTILITIES
  // =========================================================================

  function getStatusBadge(status) {
    switch (status) {
      case 'active':
        return '<span class="badge badge-verified">Active</span>';
      case 'suspended':
        return '<span class="badge badge-suspended">Suspended</span>';
      case 'banned':
        return '<span class="badge badge-suspended">Banned</span>';
      default:
        return '<span class="badge badge-pending">Pending</span>';
    }
  }

  function formatRelativeTime(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
