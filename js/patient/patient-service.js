/**
 * BLOODLINK - PATIENT SERVICE CLIENT (patient-service.js)
 * Coordinates data operations between Patient Command Center, Supabase PostgreSQL,
 * and the Python Flask REST API.
 */

(function () {
  'use strict';

  function getSupabase() {
    return window.BloodLinkSupabase?.getClient() || null;
  }

  const SAMPLE_FACILITIES = [
    {
      id: 'fac-metro-01',
      name: 'Metropolitan Central Trauma Care',
      type: 'hospital',
      address: '842 Medical Center Blvd, Sector 4',
      city: 'Metro Central',
      district: 'Sector 4',
      postal_code: '94016',
      phone: '+1 (555) 019-4400',
      verification_status: 'verified',
      inventory: [
        { blood_group: 'O-', blood_component: 'packed_red_cells', units_available: 14, status: 'optimal' },
        { blood_group: 'A+', blood_component: 'whole_blood', units_available: 22, status: 'optimal' },
        { blood_group: 'B-', blood_component: 'platelets', units_available: 4, status: 'low' }
      ]
    },
    {
      id: 'fac-redcross-02',
      name: 'Red Cross Regional Transfusion Center',
      type: 'blood_bank',
      address: '120 St. Jude Way, East Wing',
      city: 'Metro Central',
      district: 'East Wing',
      postal_code: '94016',
      phone: '+1 (555) 019-5511',
      verification_status: 'verified',
      inventory: [
        { blood_group: 'O+', blood_component: 'whole_blood', units_available: 45, status: 'optimal' },
        { blood_group: 'O-', blood_component: 'whole_blood', units_available: 8, status: 'moderate' },
        { blood_group: 'AB-', blood_component: 'plasma', units_available: 12, status: 'optimal' }
      ]
    },
    {
      id: 'fac-children-03',
      name: "City Children's Hospital Trauma Wing",
      type: 'hospital',
      address: '419 University Crescent',
      city: 'Metro Central',
      district: 'University Hub',
      postal_code: '94018',
      phone: '+1 (555) 019-7722',
      verification_status: 'verified',
      inventory: [
        { blood_group: 'O-', blood_component: 'packed_red_cells', units_available: 6, status: 'low' },
        { blood_group: 'A-', blood_component: 'platelets', units_available: 2, status: 'critical_depleted' }
      ]
    }
  ];

  const SAMPLE_ACTIVE_REQUEST = {
    id: 'req-demo-9042',
    request_code: 'REQ-2026-9042',
    patient_name: 'Eleanor Vance',
    blood_group: 'O-',
    blood_component: 'packed_red_cells',
    units_needed: 2,
    hospital_name: 'Metropolitan Central Trauma Care',
    hospital_city: 'Metro Central',
    hospital_district: 'Sector 4',
    hospital_address: '842 Medical Center Blvd',
    required_datetime: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    urgency_priority: 'critical',
    clinical_reason: 'Emergency cardiovascular surgery transfusion reserve',
    treating_doctor: 'Dr. Sarah Chen',
    doctor_contact: '+1 (555) 019-4400',
    requester_relationship: 'Parent',
    requester_phone: '+1 (555) 019-8800',
    verification_status: 'verified',
    status: 'matching_in_progress',
    matched_nodes_count: 4,
    units_fulfilled: 1,
    created_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString()
  };

  const SAMPLE_TIMELINE = [
    {
      id: 'evt-01',
      request_id: 'req-demo-9042',
      event_type: 'REQUEST_SUBMITTED',
      status_snapshot: 'submitted',
      title: 'Emergency Request Registered',
      description: 'Logged into regional trauma dispatch queue. Attending physician notification queued.',
      created_at: new Date(Date.now() - 2.5 * 3600 * 1000).toISOString()
    },
    {
      id: 'evt-02',
      request_id: 'req-demo-9042',
      event_type: 'HOSPITAL_VERIFIED',
      status_snapshot: 'verified',
      title: 'Hospital Verification Confirmed',
      description: 'Metropolitan Central Trauma Blood Bank confirmed clinical indication and crossmatching requisition.',
      created_at: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString()
    },
    {
      id: 'evt-03',
      request_id: 'req-demo-9042',
      event_type: 'MATCHING_INITIATED',
      status_snapshot: 'matching_in_progress',
      title: 'Automated Regional Compatibility Triage',
      description: 'Broadcasted to 4 verified compatible donor nodes within a 15 km radius.',
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
    }
  ];

  const PatientService = {
    /**
     * Get patient command center dashboard telemetry
     */
    async getPatientDashboard(userId) {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        const storedRequests = JSON.parse(localStorage.getItem('bloodlink_patient_requests_dev') || '[]');
        const requests = storedRequests.length > 0 ? storedRequests : [SAMPLE_ACTIVE_REQUEST];
        const activeRequests = requests.filter(r => !['fulfilled', 'cancelled'].includes(r.status));

        return {
          metrics: {
            active_requests_count: activeRequests.length,
            total_requests_count: requests.length,
            fulfilled_requests_count: requests.filter(r => r.status === 'fulfilled').length,
            unread_notifications_count: 1
          },
          current_active_request: activeRequests[0] || null,
          current_timeline: SAMPLE_TIMELINE,
          clinical_disclaimer:
            'Clinical Notice: Selecting a blood group or component does not establish transfusion compatibility. ' +
            'All compatibility, component selection, and crossmatching must be strictly verified by qualified medical professionals.'
        };
      }

      // Live Backend API call with JWT
      const res = await window.BloodLinkApiClient?.get('/api/v1/patient/dashboard');
      if (res && res.data) return res.data;
      throw new Error('Could not retrieve patient dashboard telemetry.');
    },

    /**
     * Create an emergency blood request
     */
    async createRequest(requestData) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        const randSeq = Math.floor(10000 + Math.random() * 90000);
        const newReq = {
          id: 'req-' + Date.now(),
          request_code: `REQ-${new Date().getFullYear()}-${randSeq}`,
          ...requestData,
          verification_status: 'pending',
          status: 'submitted',
          matched_nodes_count: 0,
          units_fulfilled: 0,
          created_at: new Date().toISOString()
        };

        const existing = JSON.parse(localStorage.getItem('bloodlink_patient_requests_dev') || '[]');
        existing.unshift(newReq);
        localStorage.setItem('bloodlink_patient_requests_dev', JSON.stringify(existing));

        return newReq;
      }

      const res = await window.BloodLinkApiClient?.post('/api/v1/patient/requests', requestData);
      if (res && res.data) return res.data.request;
      throw new Error(res?.message || 'Could not submit emergency blood request.');
    },

    /**
     * Get patient's blood requests list
     */
    async getMyRequests(userId, status = null, priority = null) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        const stored = JSON.parse(localStorage.getItem('bloodlink_patient_requests_dev') || '[]');
        let list = stored.length > 0 ? stored : [SAMPLE_ACTIVE_REQUEST];
        if (status && status !== 'all') list = list.filter(r => r.status === status);
        if (priority && priority !== 'all') list = list.filter(r => r.urgency_priority === priority);
        return list;
      }

      let url = '/api/v1/patient/requests?';
      if (status) url += `status=${status}&`;
      if (priority) url += `priority=${priority}&`;

      const res = await window.BloodLinkApiClient?.get(url);
      return res?.data?.requests || [];
    },

    /**
     * Get single request details
     */
    async getRequestDetail(requestId) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        const list = await this.getMyRequests();
        const found = list.find(r => r.id === requestId || r.request_code === requestId);
        return found || SAMPLE_ACTIVE_REQUEST;
      }

      const res = await window.BloodLinkApiClient?.get(`/api/v1/patient/requests/${requestId}`);
      return res?.data?.request || null;
    },

    /**
     * Get request audit timeline
     */
    async getRequestTimeline(requestId) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        return SAMPLE_TIMELINE;
      }

      const res = await window.BloodLinkApiClient?.get(`/api/v1/patient/requests/${requestId}/timeline`);
      return res?.data?.timeline || [];
    },

    /**
     * Cancel an active blood request
     */
    async cancelRequest(requestId, reason) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        const stored = JSON.parse(localStorage.getItem('bloodlink_patient_requests_dev') || '[]');
        const target = stored.find(r => r.id === requestId);
        if (target) {
          target.status = 'cancelled';
          target.cancellation_reason = reason;
          localStorage.setItem('bloodlink_patient_requests_dev', JSON.stringify(stored));
        }
        return true;
      }

      const res = await window.BloodLinkApiClient?.patch(`/api/v1/patient/requests/${requestId}/cancel`, { reason });
      return !!res?.data;
    },

    /**
     * List nearby hospitals and blood banks
     */
    async getFacilities(city = '', facilityType = '') {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        let list = [...SAMPLE_FACILITIES];
        if (facilityType && facilityType !== 'all') {
          list = list.filter(f => f.type === facilityType);
        }
        if (city) {
          list = list.filter(f => f.city.toLowerCase().includes(city.toLowerCase()) || f.postal_code.includes(city));
        }
        return list;
      }

      let url = '/api/v1/facilities?';
      if (city) url += `city=${encodeURIComponent(city)}&`;
      if (facilityType) url += `type=${encodeURIComponent(facilityType)}&`;

      const res = await window.BloodLinkApiClient?.get(url);
      return res?.data?.facilities || [];
    },

    /**
     * Get facility details and verified inventory
     */
    async getFacilityDetail(facilityId) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        const found = SAMPLE_FACILITIES.find(f => f.id === facilityId);
        return {
          facility: found || SAMPLE_FACILITIES[0],
          inventory: found ? found.inventory : SAMPLE_FACILITIES[0].inventory
        };
      }

      const res = await window.BloodLinkApiClient?.get(`/api/v1/facilities/${facilityId}`);
      return res?.data || null;
    },

    /**
     * Fetch patient in-app notifications
     */
    async getNotifications(userId) {
      const isLive = window.BloodLinkConfig?.isConfigured();

      if (!isLive) {
        return [
          {
            id: 'notif-p1',
            title: 'Triage Matching Underway',
            message: 'Your emergency request REQ-2026-9042 is being matched against verified regional blood donors.',
            type: 'urgent',
            is_read: false,
            created_at: '45 mins ago'
          },
          {
            id: 'notif-p2',
            title: 'Hospital Verification Complete',
            message: 'Metropolitan Central Trauma Care verified request REQ-2026-9042.',
            type: 'verified',
            is_read: true,
            created_at: '2 hours ago'
          }
        ];
      }

      const res = await window.BloodLinkApiClient?.get('/api/v1/patient/notifications');
      return res?.data?.notifications || [];
    },

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId) {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) return true;
      const res = await window.BloodLinkApiClient?.patch(`/api/v1/patient/notifications/${notificationId}/read`);
      return !!res?.data;
    },

    /**
     * Fetch matching candidates (donors, facilities, responses) for a request
     */
    async getMatchingCandidates(requestId) {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        return {
          request_id: requestId,
          status: 'completed',
          ruleset: {
            version_code: 'CLINICAL-AABB-2026.1',
            title: 'AABB / WHO Clinically Validated Transfusion Compatibility Matrix v2026.1',
            status: 'approved'
          },
          clinical_disclaimer: 'BloodLink provides donor and inventory discovery support only. Final blood component selection, compatibility verification, antibody screening and crossmatching must be performed and authorized by qualified medical transfusion professionals.',
          candidates: {
            potential_donors: [
              {
                candidate_type: 'donor',
                candidate_id: 'cand-donor-0101',
                donor_display_id: 'DONOR-0101',
                blood_group: 'O-',
                component: 'packed_red_cells',
                match_score: 95.0,
                location_match_quality: 'exact_city',
                approximate_distance_km: 4.8,
                service_area: 'Metro Central (Sector 4)',
                is_identical_match: true,
                units_available: 1,
                verification_status: 'verified',
                explanation: {
                  compatibility: 'Clinically verified O- to O- compatibility for packed_red_cells.',
                  location_score: 'Matched by exact city (Sector 4).',
                  consent_verified: true
                }
              },
              {
                candidate_type: 'donor',
                candidate_id: 'cand-donor-0102',
                donor_display_id: 'DONOR-0102',
                blood_group: 'O-',
                component: 'packed_red_cells',
                match_score: 91.0,
                location_match_quality: 'exact_city',
                approximate_distance_km: 7.2,
                service_area: 'Metro Central (East Wing)',
                is_identical_match: true,
                units_available: 1,
                verification_status: 'verified',
                explanation: {
                  compatibility: 'Clinically verified O- to O- compatibility for packed_red_cells.',
                  location_score: 'Matched by exact city (East Wing).',
                  consent_verified: true
                }
              }
            ],
            facility_inventory: [
              {
                candidate_type: 'facility_inventory',
                candidate_id: 'cand-inv-001',
                inventory_id: 'inv-001',
                facility_name: 'Metropolitan Central Trauma Care',
                facility_type: 'hospital',
                blood_group: 'O-',
                component: 'packed_red_cells',
                units_available: 14,
                units_covered: 2,
                freshness_hours: 0.5,
                is_stale: false,
                match_score: 98.0,
                location_match_quality: 'exact_city',
                city: 'Metro Central',
                explanation: {
                  stock_status: '14 units available in cold-chain reserve.',
                  freshness: 'Inspected 0.5 hours ago.',
                  coverage: 'Covers 2 of 2 requested units.'
                }
              },
              {
                candidate_type: 'facility_inventory',
                candidate_id: 'cand-inv-002',
                inventory_id: 'inv-002',
                facility_name: 'Red Cross Regional Transfusion Center',
                facility_type: 'blood_bank',
                blood_group: 'O-',
                component: 'packed_red_cells',
                units_available: 8,
                units_covered: 2,
                freshness_hours: 1.2,
                is_stale: false,
                match_score: 96.0,
                location_match_quality: 'exact_city',
                city: 'Metro Central',
                explanation: {
                  stock_status: '8 units available in cold-chain reserve.',
                  freshness: 'Inspected 1.2 hours ago.',
                  coverage: 'Covers 2 of 2 requested units.'
                }
              }
            ],
            awaiting_responses: [
              {
                invitation_id: 'inv-demo-01',
                donor_masked_label: 'Donor Node #0101',
                status: 'pending',
                sent_at: '25m ago',
                expires_at: 'In 3 hours'
              }
            ],
            confirmed_responses: [
              {
                response_type: 'facility_reserved',
                reservation_code: 'RSV-2026-90421',
                facility_name: 'Metropolitan Central Trauma Care',
                units_reserved: 1,
                status: 'reserved',
                expires_at: 'In 11 hours'
              }
            ],
            unavailable_options: [
              {
                candidate_type: 'donor',
                donor_id_masked: 'DONOR-0104',
                reason: 'Discovery consent not granted or withdrawn.'
              },
              {
                candidate_type: 'facility_inventory',
                facility_name: 'Outdated Blood Bank',
                blood_group: 'O-',
                reason: 'Stock data outdated (50h ago). Availability requires confirmation.',
                status_label: 'Availability requires confirmation'
              }
            ]
          },
          summary: {
            total_candidates: 4,
            donors_count: 2,
            facilities_count: 2,
            awaiting_responses_count: 1,
            confirmed_responses_count: 1,
            execution_time_ms: 120
          }
        };
      }

      const res = await window.BloodLinkApiClient?.get(`/api/v1/requests/${requestId}/matches`);
      return res?.data || null;
    },

    /**
     * Re-execute matching engine for request
     */
    async runMatching(requestId, searchRadiusKm = 25.0) {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        return this.getMatchingCandidates(requestId);
      }
      const res = await window.BloodLinkApiClient?.post(`/api/v1/requests/${requestId}/run-matching`, {
        search_radius_km: searchRadiusKm
      });
      return res?.data || null;
    }
  };

  window.BloodLinkPatientService = PatientService;
})();
