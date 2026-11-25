/**
 * BLOODLINK - DONOR COMMAND CENTER SERVICE (donor-service.js)
 * Interacts directly with Supabase PostgreSQL and Supabase Storage for:
 * - Profiles and Donor clinical readiness telemetry
 * - Availability states and discovery consent
 * - Verified donation history and certificates
 * - Camps and appointment scheduling
 * - In-app notification alerts
 */

(function () {
  'use strict';

  function getClient() {
    const client = window.BloodLinkSupabase?.getClient();
    if (!client) {
      throw new Error('Supabase client is not initialized.');
    }
    return client;
  }

  // Demonstration and fallback data when live cloud credentials are pending
  const SAMPLE_CAMPS = [
    {
      id: 'camp-1',
      title: 'Metro Red Cross Annual Life Drive',
      organizer_name: 'Metropolitan Blood Bank',
      facility_type: 'blood_bank',
      address: '842 Medical Center Blvd, Sector 4',
      city: 'Metro Central',
      camp_date: '2026-11-28',
      start_time: '09:00',
      end_time: '16:00',
      slots_available: 24
    },
    {
      id: 'camp-2',
      title: 'St. Jude Community Trauma Camp',
      organizer_name: 'St. Jude Memorial Hospital',
      facility_type: 'hospital',
      address: '120 St. Jude Way, East Wing',
      city: 'Metro Central',
      camp_date: '2026-12-02',
      start_time: '10:00',
      end_time: '17:00',
      slots_available: 18
    },
    {
      id: 'camp-3',
      title: 'City University Youth Donation Camp',
      organizer_name: 'National Transfusion Service',
      facility_type: 'community_camp',
      address: '419 University Crescent',
      city: 'Metro Central',
      camp_date: '2026-12-08',
      start_time: '08:30',
      end_time: '15:30',
      slots_available: 45
    }
  ];

  const SAMPLE_DONATIONS = [
    {
      id: 'don-01',
      facility_name: 'Metropolitan Central Blood Bank',
      facility_location: '842 Medical Center Blvd, Sector 4',
      donation_date: '2026-08-14',
      donation_type: 'whole_blood',
      units_donated: 1,
      reference_number: 'BL-DON-2026-8941',
      verification_status: 'verified',
      certificate_id: 'CERT-BL-2026-8941',
      notes: 'Whole blood donation. Hemoglobin tested at 14.2 g/dL. Safe storage verified.'
    },
    {
      id: 'don-02',
      facility_name: 'St. Jude Trauma & Transfusion Hub',
      facility_location: '120 St. Jude Way',
      donation_date: '2026-05-10',
      donation_type: 'whole_blood',
      units_donated: 1,
      reference_number: 'BL-DON-2026-4412',
      verification_status: 'verified',
      certificate_id: 'CERT-BL-2026-4412',
      notes: 'Trauma emergency donation. Matched to pediatric emergency unit.'
    },
    {
      id: 'don-03',
      facility_name: 'Apex Children Care Blood Drive',
      facility_location: '419 University Crescent',
      donation_date: '2026-01-18',
      donation_type: 'whole_blood',
      units_donated: 1,
      reference_number: 'BL-DON-2026-1029',
      verification_status: 'verified',
      certificate_id: 'CERT-BL-2026-1029',
      notes: 'Routine voluntary whole blood donation.'
    }
  ];

  const DonorService = {
    /**
     * Get complete donor profile from profiles and donor_profiles
     */
    async getDonorFullProfile(userId) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const stored = localStorage.getItem('bloodlink_donor_profile_dev');
        if (stored) return JSON.parse(stored);

        return {
          id: userId,
          full_name: 'Dr. Elena Rostova',
          email: 'elena.rostova@bloodlink.org',
          phone: '+1 (555) 019-2041',
          blood_group: 'O-',
          date_of_birth: '1994-06-12',
          gender: 'female',
          city: 'Metro Central',
          district: 'Sector 4',
          postal_code: '94016',
          last_donation_date: '2026-08-14',
          preferred_contact: 'whatsapp',
          emergency_contact_name: 'Marcus Rostova',
          emergency_contact_phone: '+1 (555) 019-8821',
          availability_status: 'available',
          consent_to_discovery: true,
          is_verified: true,
          account_status: 'active',
          avatar_url: null,
          last_availability_updated_at: new Date().toISOString()
        };
      }

      // Live Supabase query
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (pErr) throw pErr;

      const { data: donorMeta, error: dErr } = await supabase
        .from('donor_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        ...profile,
        ...(donorMeta || {})
      };
    },

    /**
     * Update biographical and clinical preferences
     */
    async updateDonorProfile(userId, profileData, donorData) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const existing = await this.getDonorFullProfile(userId);
        const merged = { ...existing, ...profileData, ...donorData };
        localStorage.setItem('bloodlink_donor_profile_dev', JSON.stringify(merged));
        return merged;
      }

      // Update public.profiles
      const safeProfile = { ...profileData };
      delete safeProfile.id;
      delete safeProfile.is_verified;
      delete safeProfile.account_status;
      delete safeProfile.account_type;

      const { error: pErr } = await supabase
        .from('profiles')
        .update(safeProfile)
        .eq('id', userId);
      if (pErr) throw pErr;

      // Update public.donor_profiles
      if (donorData && Object.keys(donorData).length > 0) {
        const safeDonor = { ...donorData, user_id: userId };
        const { error: dErr } = await supabase
          .from('donor_profiles')
          .upsert(safeDonor, { onConflict: 'user_id' });
        if (dErr) throw dErr;
      }

      return this.getDonorFullProfile(userId);
    },

    /**
     * Instant availability state synchronization
     */
    async setAvailability(userId, status, consent) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const profile = await this.getDonorFullProfile(userId);
        profile.availability_status = status;
        if (consent !== undefined) profile.consent_to_discovery = consent;
        profile.last_availability_updated_at = new Date().toISOString();
        localStorage.setItem('bloodlink_donor_profile_dev', JSON.stringify(profile));
        return profile;
      }

      const updates = {
        availability_status: status,
        last_availability_updated_at: new Date().toISOString()
      };
      if (consent !== undefined) {
        updates.consent_to_discovery = consent;
      }

      const { data, error } = await supabase
        .from('donor_profiles')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Upload Avatar using Supabase Storage
     */
    async uploadAvatar(userId, file) {
      // Validate file
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file format. Please upload a JPG, PNG, or WebP image.');
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Image size exceeds 2 MB limit.');
      }

      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        // Create local object URL for prototype preview
        const localUrl = URL.createObjectURL(file);
        const profile = await this.getDonorFullProfile(userId);
        profile.avatar_url = localUrl;
        localStorage.setItem('bloodlink_donor_profile_dev', JSON.stringify(profile));
        return localUrl;
      }

      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/avatar-${Date.now()}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      return publicUrl;
    },

    /**
     * Fetch verified and pending donation records
     */
    async getDonations(userId) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const stored = localStorage.getItem('bloodlink_donations_dev');
        return stored ? JSON.parse(stored) : SAMPLE_DONATIONS;
      }

      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .eq('donor_id', userId)
        .order('donation_date', { ascending: false });

      if (error) throw error;
      return data && data.length > 0 ? data : SAMPLE_DONATIONS;
    },

    /**
     * Fetch upcoming donation camps and fixed sites
     */
    async getCamps(city = '') {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        return SAMPLE_CAMPS;
      }

      let query = supabase.from('donation_camps').select('*').gte('camp_date', new Date().toISOString().split('T')[0]);
      if (city) {
        query = query.ilike('city', `%${city}%`);
      }

      const { data, error } = await query.order('camp_date', { ascending: true });
      if (error) throw error;
      return data && data.length > 0 ? data : SAMPLE_CAMPS;
    },

    /**
     * Fetch donor's scheduled appointments
     */
    async getAppointments(userId) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const stored = localStorage.getItem('bloodlink_appointments_dev');
        if (stored) return JSON.parse(stored);
        return [
          {
            id: 'apt-01',
            facility_name: 'Metro Red Cross Annual Drive',
            appointment_date: '2026-11-28',
            appointment_time: '11:00 AM',
            donation_type: 'whole_blood',
            status: 'scheduled',
            notes: 'Registered online via BloodLink Command Center.'
          }
        ];
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('donor_id', userId)
        .order('appointment_date', { ascending: true });

      if (error) throw error;
      return data;
    },

    /**
     * Book a new donation appointment
     */
    async bookAppointment(appointmentData) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const list = await this.getAppointments(appointmentData.donor_id);
        const newApt = {
          id: `apt-${Date.now()}`,
          ...appointmentData,
          status: 'scheduled',
          created_at: new Date().toISOString()
        };
        list.push(newApt);
        localStorage.setItem('bloodlink_appointments_dev', JSON.stringify(list));
        return newApt;
      }

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          donor_id: appointmentData.donor_id,
          camp_id: appointmentData.camp_id || null,
          facility_name: appointmentData.facility_name,
          appointment_date: appointmentData.appointment_date,
          appointment_time: appointmentData.appointment_time,
          donation_type: appointmentData.donation_type || 'whole_blood',
          status: 'scheduled',
          notes: appointmentData.notes || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Cancel an existing appointment
     */
    async cancelAppointment(appointmentId, userId) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        const list = await this.getAppointments(userId);
        const updated = list.map(a => a.id === appointmentId ? { ...a, status: 'cancelled' } : a);
        localStorage.setItem('bloodlink_appointments_dev', JSON.stringify(updated));
        return true;
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId)
        .eq('donor_id', userId);

      if (error) throw error;
      return true;
    },

    /**
     * Fetch in-app notifications
     */
    async getNotifications(userId) {
      const supabase = getClient();
      const isLive = window.BloodLinkConfig.isConfigured();

      if (!isLive) {
        return [
          {
            id: 'notif-1',
            title: 'Urgent O- Needed nearby',
            message: 'City Trauma Hub requires 2 units of O- Negative for acute surgical resuscitation.',
            type: 'urgent',
            is_read: false,
            created_at: '10 mins ago'
          },
          {
            id: 'notif-2',
            title: 'Appointment Reminder',
            message: 'Your upcoming whole blood appointment at Metro Red Cross is in 4 days.',
            type: 'appointment',
            is_read: false,
            created_at: '2 hours ago'
          },
          {
            id: 'notif-3',
            title: 'Donation Certificate Ready',
            message: 'Your verified certificate for donation BL-DON-2026-8941 is available to view and download.',
            type: 'certificate',
            is_read: true,
            created_at: 'Yesterday'
          }
        ];
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },

    /**
     * Fetch emergency broadcast invitations dispatched to this donor
     */
    async getDonorInvitations(status = null) {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        return [
          {
            id: 'inv-demo-01',
            request_id: 'req-demo-9042',
            donor_id: 'dev-user-uuid',
            status: 'pending',
            created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
            expires_at: new Date(Date.now() + 2.5 * 3600 * 1000).toISOString(),
            blood_requests: {
              request_code: 'REQ-2026-9042',
              blood_group: 'O-',
              blood_component: 'packed_red_cells',
              units_needed: 2,
              hospital_name: 'Metropolitan Central Trauma Care',
              hospital_city: 'Metro Central',
              urgency_priority: 'critical',
              status: 'matching_in_progress'
            }
          }
        ];
      }

      const query = status && status !== 'all' ? `?status=${status}` : '';
      const res = await window.BloodLinkApiClient?.get(`/api/v1/donor/invitations${query}`);
      return res?.data?.invitations || [];
    },

    /**
     * Respond to emergency broadcast invitation ('accepted' or 'declined')
     */
    async respondToInvitation(invitationId, action, notes = '') {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        return { invitation_id: invitationId, status: action, notes };
      }

      const res = await window.BloodLinkApiClient?.post(`/api/v1/donor/invitations/${invitationId}/respond`, {
        action,
        notes
      });
      return res?.data || null;
    },

    /**
     * Fetch active accepted commitments for this donor
     */
    async getDonorCommitments() {
      const isLive = window.BloodLinkConfig?.isConfigured();
      if (!isLive) {
        return [
          {
            id: 'inv-comm-01',
            status: 'accepted',
            responded_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
            blood_requests: {
              request_code: 'REQ-2026-8819',
              hospital_name: 'Metropolitan Central Trauma Care — ICU Ward 4',
              hospital_city: 'Metro Central',
              blood_group: 'O-',
              urgency_priority: 'critical',
              required_datetime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
              status: 'fulfilment_in_progress'
            }
          }
        ];
      }

      const res = await window.BloodLinkApiClient?.get('/api/v1/donor/commitments');
      return res?.data?.commitments || [];
    }
  };

  window.BloodLinkDonorService = DonorService;
})();
