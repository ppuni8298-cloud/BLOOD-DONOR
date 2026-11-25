/**
 * BLOODLINK - PROFILE & ENTITY SERVICE (profile-service.js)
 * Interacts with Supabase PostgreSQL tables: profiles, user_roles,
 * donor_profiles, hospitals, and blood_banks via Row Level Security (RLS).
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

  const ProfileService = {
    /**
     * Fetch user profile by ID
     */
    async getProfile(userId) {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Update permitted profile fields for the authenticated user
     */
    async updateProfile(userId, updates) {
      const supabase = getClient();

      // Filter out protected fields that regular users cannot alter
      const safeUpdates = { ...updates };
      delete safeUpdates.id;
      delete safeUpdates.is_verified;
      delete safeUpdates.account_status;
      delete safeUpdates.account_type;
      delete safeUpdates.created_at;

      const { data, error } = await supabase
        .from('profiles')
        .update(safeUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Fetch donor profile by user ID
     */
    async getDonorProfile(userId) {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('donor_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    /**
     * Upsert donor clinical readiness, blood group, & discovery consent
     */
    async upsertDonorProfile(userId, donorData) {
      const supabase = getClient();
      const payload = {
        user_id: userId,
        blood_group: donorData.blood_group,
        date_of_birth: donorData.date_of_birth || null,
        last_donation_date: donorData.last_donation_date || null,
        availability_status: donorData.availability_status || 'available',
        consent_to_discovery: donorData.consent_to_discovery !== false
      };

      const { data, error } = await supabase
        .from('donor_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Fetch hospital organization record by owner user ID
     */
    async getHospital(ownerId) {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    /**
     * Register a new hospital facility (starts in pending verification)
     */
    async registerHospital(hospitalData) {
      const supabase = getClient();
      const session = window.BloodLinkSession?.getSession();
      if (!session?.user?.id) throw new Error('Authentication required');

      const payload = {
        owner_id: session.user.id,
        hospital_name: hospitalData.hospital_name,
        registration_number: hospitalData.registration_number,
        address: hospitalData.address,
        city: hospitalData.city,
        postal_code: hospitalData.postal_code,
        verification_status: 'pending' // Enforced by RLS
      };

      const { data, error } = await supabase
        .from('hospitals')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Fetch blood bank record by owner user ID
     */
    async getBloodBank(ownerId) {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('blood_banks')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },

    /**
     * Register a new blood bank facility (starts in pending verification)
     */
    async registerBloodBank(bankData) {
      const supabase = getClient();
      const session = window.BloodLinkSession?.getSession();
      if (!session?.user?.id) throw new Error('Authentication required');

      const payload = {
        owner_id: session.user.id,
        bank_name: bankData.bank_name,
        license_number: bankData.license_number,
        address: bankData.address,
        city: bankData.city,
        postal_code: bankData.postal_code,
        verification_status: 'pending' // Enforced by RLS
      };

      const { data, error } = await supabase
        .from('blood_banks')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    /**
     * Read verified roles assigned to the user
     */
    async getUserRoles(userId) {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, assigned_at')
        .eq('user_id', userId);

      if (error) throw error;
      return data.map(r => r.role);
    }
  };

  window.BloodLinkProfile = ProfileService;
})();
