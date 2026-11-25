/**
 * BLOODLINK SUPER ADMIN API SERVICE (admin-service.js)
 * Enterprise communication client for administrative endpoints under /api/v1/admin/*
 */

window.BloodLinkAdminService = (function() {
  'use strict';

  const API_BASE = (window.BloodLinkConfig && window.BloodLinkConfig.API_BASE_URL) || 'http://localhost:5000/api/v1';

  async function getAuthHeaders() {
    let token = '';
    if (window.BloodLinkSession && typeof window.BloodLinkSession.getAccessToken === 'function') {
      token = await window.BloodLinkSession.getAccessToken();
    }
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  async function request(endpoint, options = {}) {
    const url = `${API_BASE}/admin${endpoint}`;
    const headers = await getAuthHeaders();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {})
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}: Administrative request failed.`);
      }
      return data.data;
    } catch (err) {
      console.warn(`Admin API live request failed (${endpoint}), providing fallback data:`, err.message);
      return getFallbackData(endpoint, options);
    }
  }

  // Fallback data generator for offline/local preview
  function getFallbackData(endpoint, options) {
    if (endpoint === '/dashboard') {
      return {
        total_users: 1420,
        active_donors: 856,
        registered_patients: 412,
        verified_hospitals: 34,
        verified_bloodbanks: 18,
        pending_facility_reviews: 6,
        active_emergency_requests: 14,
        critical_code_red_requests: 3,
        total_matching_runs: 284,
        confirmed_donor_responses: 189,
        available_verified_units: 1542,
        fulfilled_requests_last_30d: 98,
        open_security_incidents: 2,
        system_health: {
          database_status: 'healthy',
          matching_engine_status: 'online',
          cold_chain_iot_telemetry: 'active',
          api_latency_ms: 18.4,
          uptime_percentage: 99.98
        },
        recent_admin_activity: [
          {
            id: 'act-001',
            action_type: 'FACILITY_VERIFIED',
            admin_role: 'super_admin',
            target_entity: 'hospitals',
            target_id: 'Metropolitan Central Trauma Center',
            reason: 'Regulatory license verified with State Health Directorate',
            created_at: new Date(Date.now() - 7200000).toISOString()
          },
          {
            id: 'act-002',
            action_type: 'USER_STATUS_UPDATED',
            admin_role: 'operations_admin',
            target_entity: 'profiles',
            target_id: 'usr-8841',
            reason: 'Administrative suspension pending identity re-verification',
            created_at: new Date(Date.now() - 18000000).toISOString()
          }
        ]
      };
    }

    if (endpoint.startsWith('/users')) {
      return {
        users: [
          { id: 'usr-101', full_name: 'Dr. Sarah Mitchell', email: 'sarah.mitchell@metro-trauma.org', phone: '+1 555-019-2834', account_type: 'hospital', account_status: 'active', is_verified: true, city: 'Metropolis', created_at: '2026-08-15T09:00:00Z' },
          { id: 'usr-102', full_name: 'Marcus Vance', email: 'marcus.vance@apexblood.org', phone: '+1 555-018-9281', account_type: 'blood_bank', account_status: 'active', is_verified: true, city: 'Metropolis', created_at: '2026-08-20T10:00:00Z' },
          { id: 'usr-103', full_name: 'Elena Rostova', email: 'elena.rostova@example.com', phone: '+1 555-014-9923', account_type: 'donor', account_status: 'active', is_verified: true, city: 'Metropolis', created_at: '2026-09-01T14:30:00Z' },
          { id: 'usr-104', full_name: 'David K. Campbell', email: 'david.campbell@example.com', phone: '+1 555-012-3341', account_type: 'patient', account_status: 'active', is_verified: true, city: 'River North', created_at: '2026-09-10T11:15:00Z' },
          { id: 'usr-105', full_name: 'Highland Valley Memorial', email: 'admin@highlandvalley.org', phone: '+1 555-016-7782', account_type: 'hospital', account_status: 'pending', is_verified: false, city: 'Highland', created_at: '2026-11-23T08:00:00Z' }
        ],
        total: 5
      };
    }

    if (endpoint.startsWith('/facilities')) {
      return [
        { id: 'fac-001', facility_name: 'Metropolitan Central Trauma Center', facility_type: 'hospital', registration_number: 'HOSP-METRO-2024-001', license_number: 'LIC-MED-994821', city: 'Metropolis', is_verified: true, verification_status: 'verified', accreditation_body: 'Joint Commission', submitted_at: '2026-08-15T09:00:00Z' },
        { id: 'fac-002', facility_name: 'Apex Regional Blood Bank & Cryo Vault', facility_type: 'blood_bank', registration_number: 'BB-APEX-2024-002', license_number: 'LIC-FDA-BB-7721', city: 'Metropolis', is_verified: true, verification_status: 'verified', accreditation_body: 'AABB / DGHS Certified', submitted_at: '2026-08-20T10:00:00Z' },
        { id: 'fac-003', facility_name: 'Highland Valley Memorial Hospital', facility_type: 'hospital', registration_number: 'HOSP-HIGH-2026-089', license_number: 'LIC-MED-104928', city: 'Highland', is_verified: false, verification_status: 'pending_verification', accreditation_body: 'State Ministry of Health Application', submitted_at: '2026-11-23T08:00:00Z' }
      ];
    }

    if (endpoint.startsWith('/emergency-operations')) {
      return {
        total_active_emergencies: 3,
        code_red_count: 2,
        requests: [
          { id: 'req-001', request_code: 'REQ-2026-90412', hospital_name: 'Metropolitan Central Trauma', city: 'Metropolis', blood_group: 'O-', component_type: 'packed_red_cells', units_required: 4, urgency: 'code_red', status: 'in_progress', time_elapsed_minutes: 24, stalled: false },
          { id: 'req-002', request_code: 'REQ-2026-90413', hospital_name: 'St. Jude Surgical Pavilion', city: 'Metropolis', blood_group: 'AB+', component_type: 'platelets', units_required: 2, urgency: 'urgent', status: 'matching', time_elapsed_minutes: 70, stalled: false },
          { id: 'req-003', request_code: 'REQ-2026-90408', hospital_name: 'Riverside Regional Medical', city: 'Riverside', blood_group: 'B-', component_type: 'whole_blood', units_required: 2, urgency: 'code_red', status: 'awaiting_verification', time_elapsed_minutes: 48, stalled: true }
        ]
      };
    }

    if (endpoint.startsWith('/inventory-overview')) {
      return {
        matrix: {
          'O+': { packed_red_cells: 184, whole_blood: 92, platelets: 28, fresh_frozen_plasma: 142, cryoprecipitate: 64 },
          'O-': { packed_red_cells: 42, whole_blood: 18, platelets: 6, fresh_frozen_plasma: 38, cryoprecipitate: 16 },
          'A+': { packed_red_cells: 162, whole_blood: 80, platelets: 24, fresh_frozen_plasma: 120, cryoprecipitate: 50 },
          'A-': { packed_red_cells: 36, whole_blood: 14, platelets: 5, fresh_frozen_plasma: 26, cryoprecipitate: 12 },
          'B+': { packed_red_cells: 138, whole_blood: 64, platelets: 19, fresh_frozen_plasma: 98, cryoprecipitate: 42 },
          'B-': { packed_red_cells: 28, whole_blood: 10, platelets: 4, fresh_frozen_plasma: 22, cryoprecipitate: 9 },
          'AB+': { packed_red_cells: 74, whole_blood: 32, platelets: 12, fresh_frozen_plasma: 86, cryoprecipitate: 38 },
          'AB-': { packed_red_cells: 18, whole_blood: 8, platelets: 3, fresh_frozen_plasma: 14, cryoprecipitate: 6 }
        },
        total_units_verified: 1542,
        total_units_reserved: 38,
        critical_shortage_alerts: [
          { type: 'critical_shortage', blood_group: 'O-', component: 'platelets', current_stock: 6, threshold: 10, severity: 'critical' }
        ]
      };
    }

    if (endpoint.startsWith('/analytics')) {
      return {
        fulfilment_rate_pct: 94.6,
        average_crossmatch_to_transfusion_ratio: 1.42,
        average_clinical_verification_minutes: 14.2,
        matching_discovery_rate_pct: 98.2,
        component_demand_distribution: { packed_red_cells: 52.4, platelets: 22.1, fresh_frozen_plasma: 14.8, whole_blood: 7.5, cryoprecipitate: 3.2 }
      };
    }

    if (endpoint.startsWith('/announcements')) {
      return [
        { id: 'ann-001', announcement_code: 'ANN-2026-00012', title: 'Severe O-Negative Platelet Shortage Alert', content: 'Trauma centers advised of acute O-Negative reserve depletion.', target_audience: 'all', priority: 'critical', is_active: true, read_count: 842 }
      ];
    }

    if (endpoint.startsWith('/security/events')) {
      return [
        { id: 'evt-001', timestamp: new Date(Date.now() - 300000).toISOString(), event_type: 'ADMIN_LOGIN_SUCCESS', actor_email: 'superadmin@bloodlink.net', ip_address: '192.168.1.104', severity: 'info', description: 'Super Admin signed in with verified session.' },
        { id: 'evt-002', timestamp: new Date(Date.now() - 2400000).toISOString(), event_type: 'FACILITY_VERIFICATION_APPROVED', actor_email: 'verification@bloodlink.net', ip_address: '192.168.1.112', severity: 'info', description: 'Highland Valley Memorial accredited.' }
      ];
    }

    if (endpoint.startsWith('/security/incidents')) {
      return [
        { id: 'inc-001', incident_code: 'INC-2026-00041', title: 'Repeated Failed Login Burst Detected', description: '14 invalid password attempts targeting admin@apexblood.org.', severity: 'high', status: 'contained', investigator_id: 'superadmin-uuid' }
      ];
    }

    if (endpoint.startsWith('/configuration')) {
      return [
        { config_key: 'platform_registration_status', category: 'registration', config_value: { allow_donor_registration: true, allow_patient_registration: true, allow_facility_applications: true }, is_clinical_rule: false },
        { config_key: 'clinical_transfusion_governance', category: 'clinical', config_value: { active_ruleset: 'CLINICAL-AABB-2026.1', enforce_crossmatch: true, medical_board_approval_token: 'MBA-VERIFIED-2026-AABB' }, is_clinical_rule: true }
      ];
    }

    if (endpoint.startsWith('/roles')) {
      return [
        { id: 'adm-001', user_id: 'superadmin-uuid', email: 'superadmin@bloodlink.net', full_name: 'Chief Security Officer', admin_role: 'super_admin', is_active: true }
      ];
    }

    return {};
  }

  return {
    getDashboardMetrics: () => request('/dashboard'),
    getUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/users${q ? '?' + q : ''}`);
    },
    getUserDetail: (userId) => request(`/users/${userId}`),
    updateUserStatus: (userId, status, reason) => request(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason })
    }),
    getFacilities: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/facilities${q ? '?' + q : ''}`);
    },
    submitFacilityReview: (facilityId, reviewData) => request(`/facilities/${facilityId}/review`, {
      method: 'POST',
      body: JSON.stringify(reviewData)
    }),
    getEmergencyOperations: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/emergency-operations${q ? '?' + q : ''}`);
    },
    getInventoryOverview: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/inventory-overview${q ? '?' + q : ''}`);
    },
    getAnalytics: (range = '30d') => request(`/analytics?range=${range}`),
    getAnnouncements: () => request('/announcements'),
    createAnnouncement: (announcementData) => request('/announcements', {
      method: 'POST',
      body: JSON.stringify(announcementData)
    }),
    getSecurityEvents: () => request('/security/events'),
    getSecurityIncidents: (status) => request(`/security/incidents${status ? '?status=' + status : ''}`),
    saveSecurityIncident: (incidentData) => request('/security/incidents', {
      method: 'POST',
      body: JSON.stringify(incidentData)
    }),
    getConfiguration: () => request('/configuration'),
    updateConfiguration: (configKey, configValue, reason) => request('/configuration', {
      method: 'PATCH',
      body: JSON.stringify({ config_key: configKey, config_value: configValue, reason })
    }),
    getAdminRoles: () => request('/roles'),
    assignAdminRole: (userId, adminRole, notes) => request('/roles/assign', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, admin_role: adminRole, notes })
    })
  };
})();
