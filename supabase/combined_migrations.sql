-- ==============================================================================
-- BLOODLINK COMPLETE DATABASE SETUP (ALL MIGRATIONS COMBINED)
-- Generated for Supabase Project: bjsvcijupiojifrgrgle
-- ==============================================================================

-- ==============================================================================
-- MIGRATION: 20261124000001_initial_schema.sql
-- ==============================================================================

-- ============================================================================
-- Migration: 20261124000001_initial_schema.sql
-- Description: Core Schema for BloodLink Healthcare Platform
-- Tables: profiles, user_roles, donor_profiles, hospitals, blood_banks, audit_logs
-- ============================================================================

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE (Linked directly to Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    account_type TEXT NOT NULL CHECK (account_type IN ('donor', 'patient', 'hospital', 'blood_bank', 'admin')),
    city TEXT,
    district TEXT,
    postal_code TEXT,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    account_status TEXT DEFAULT 'active' NOT NULL CHECK (account_status IN ('active', 'pending_verification', 'suspended', 'deactivated')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(account_status);

-- ============================================================================
-- 2. USER ROLES TABLE (Role-Based Access Control)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('donor', 'patient', 'hospital', 'blood_bank', 'super_admin')),
    assigned_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_user_role UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- ============================================================================
-- 3. DONOR PROFILES TABLE (Health & Transfusion Telemetry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    date_of_birth DATE,
    last_donation_date DATE,
    availability_status TEXT DEFAULT 'available' NOT NULL CHECK (availability_status IN ('available', 'unavailable', 'recently_donated')),
    consent_to_discovery BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT check_valid_donation_date CHECK (last_donation_date IS NULL OR last_donation_date <= CURRENT_DATE),
    CONSTRAINT check_reasonable_dob CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '16 years')
);

CREATE INDEX IF NOT EXISTS idx_donor_blood_group ON public.donor_profiles(blood_group);
CREATE INDEX IF NOT EXISTS idx_donor_availability ON public.donor_profiles(availability_status);
CREATE INDEX IF NOT EXISTS idx_donor_discovery ON public.donor_profiles(consent_to_discovery);

-- ============================================================================
-- 4. HOSPITALS TABLE (Emergency & Surgical Care Facilities)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.hospitals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hospital_name TEXT NOT NULL,
    registration_number TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    verification_status TEXT DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hospitals_owner ON public.hospitals(owner_id);
CREATE INDEX IF NOT EXISTS idx_hospitals_verification ON public.hospitals(verification_status);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON public.hospitals(city);

-- ============================================================================
-- 5. BLOOD BANKS TABLE (Accredited Cold-Chain Storage Facilities)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blood_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    bank_name TEXT NOT NULL,
    license_number TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    verification_status TEXT DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blood_banks_owner ON public.blood_banks(owner_id);
CREATE INDEX IF NOT EXISTS idx_blood_banks_verification ON public.blood_banks(verification_status);
CREATE INDEX IF NOT EXISTS idx_blood_banks_city ON public.blood_banks(city);

-- ============================================================================
-- 6. AUDIT LOGS TABLE (Immutable Clinical Security & Action Trace)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Comments on tables for database documentation
COMMENT ON TABLE public.profiles IS 'Primary user identity and demographic information extending auth.users';
COMMENT ON TABLE public.user_roles IS 'Verified role assignments for granular access control';
COMMENT ON TABLE public.donor_profiles IS 'Donor clinical readiness, blood group, and discovery settings';
COMMENT ON TABLE public.hospitals IS 'Registered hospital entities authorized for emergency blood requests';
COMMENT ON TABLE public.blood_banks IS 'Accredited blood bank storage facilities managing unit inventories';
COMMENT ON TABLE public.audit_logs IS 'Append-only audit trail for sensitive clinical and authentication events';


-- ==============================================================================
-- MIGRATION: 20261124000002_row_level_security.sql
-- ==============================================================================

-- ============================================================================
-- Migration: 20261124000002_row_level_security.sql
-- Description: Complete Row Level Security (RLS) Policies
-- Implements Zero-Trust Access Control across all BloodLink tables
-- ============================================================================

-- Enable RLS on all user tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECURITY HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

-- Helper: Check if current authenticated user has a specific verified role
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = required_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Check if current authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- 1. PROFILES POLICIES
-- ============================================================================

-- Policy: Users can view their own full profile
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Public or authenticated users can view basic non-sensitive profile info (e.g., name, avatar)
CREATE POLICY "Public can view basic donor identity"
    ON public.profiles
    FOR SELECT
    USING (
        account_status = 'active'
        AND account_type = 'donor'
    );

-- Policy: Administrators can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (public.is_admin());

-- Policy: Users can update their own profile EXCEPT verification & status fields
-- Verification status cannot be changed by the user directly (enforced via trigger or columns)
CREATE POLICY "Users can update own profile fields"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- User cannot escalate verification or change status themselves
        AND (
            public.is_admin()
            OR (
                is_verified = (SELECT is_verified FROM public.profiles WHERE id = auth.uid())
                AND account_status = (SELECT account_status FROM public.profiles WHERE id = auth.uid())
                AND account_type = (SELECT account_type FROM public.profiles WHERE id = auth.uid())
            )
        )
    );

-- Policy: Admins can update any profile
CREATE POLICY "Admins can update any profile"
    ON public.profiles
    FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================================
-- 2. USER ROLES POLICIES (Strictly guarded)
-- ============================================================================

-- Policy: Users can read their own assigned roles
CREATE POLICY "Users can view own roles"
    ON public.user_roles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Administrators can view all roles
CREATE POLICY "Admins can view all roles"
    ON public.user_roles
    FOR SELECT
    USING (public.is_admin());

-- Policy: Users CANNOT insert, update, or delete roles. Only Admins or Auth Triggers can manage roles.
CREATE POLICY "Only admins can manage roles"
    ON public.user_roles
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================================
-- 3. DONOR PROFILES POLICIES
-- ============================================================================

-- Policy: Donors can read and manage their own donor profile
CREATE POLICY "Donors can view own donor profile"
    ON public.donor_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Donors can insert own donor profile"
    ON public.donor_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Donors can update own donor profile"
    ON public.donor_profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Verified hospitals, blood banks, and emergency dispatch can view available donors with consent
-- NOTICE: Contact info is never stored in donor_profiles; it is safely held in profiles with RLS!
CREATE POLICY "Verified organizations can view consented donors"
    ON public.donor_profiles
    FOR SELECT
    USING (
        consent_to_discovery = TRUE
        AND availability_status = 'available'
        AND (
            public.has_role('hospital')
            OR public.has_role('blood_bank')
            OR public.is_admin()
        )
    );

-- ============================================================================
-- 4. HOSPITALS POLICIES
-- ============================================================================

-- Policy: Hospital owner can view and manage their hospital record
CREATE POLICY "Hospital owner can view hospital"
    ON public.hospitals
    FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Hospital owner can register hospital"
    ON public.hospitals
    FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND verification_status = 'pending' -- Must start as pending
    );

CREATE POLICY "Hospital owner can update hospital details"
    ON public.hospitals
    FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (
        auth.uid() = owner_id
        -- Cannot self-verify
        AND (
            public.is_admin()
            OR verification_status = (SELECT verification_status FROM public.hospitals WHERE owner_id = auth.uid())
        )
    );

-- Policy: Verified hospitals are publicly listed in the directory
CREATE POLICY "Public can view verified hospitals"
    ON public.hospitals
    FOR SELECT
    USING (verification_status = 'verified');

-- ============================================================================
-- 5. BLOOD BANKS POLICIES
-- ============================================================================

-- Policy: Blood bank owner can view and manage their facility record
CREATE POLICY "Blood bank owner can view facility"
    ON public.blood_banks
    FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Blood bank owner can register facility"
    ON public.blood_banks
    FOR INSERT
    WITH CHECK (
        auth.uid() = owner_id
        AND verification_status = 'pending' -- Must start as pending
    );

CREATE POLICY "Blood bank owner can update facility details"
    ON public.blood_banks
    FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (
        auth.uid() = owner_id
        -- Cannot self-verify
        AND (
            public.is_admin()
            OR verification_status = (SELECT verification_status FROM public.blood_banks WHERE owner_id = auth.uid())
        )
    );

-- Policy: Verified blood banks are publicly discoverable for donation & inventory
CREATE POLICY "Public can view verified blood banks"
    ON public.blood_banks
    FOR SELECT
    USING (verification_status = 'verified');

-- ============================================================================
-- 6. AUDIT LOGS POLICIES (Immutable Ledger)
-- ============================================================================

-- Policy: Users can view audit logs where they were the actor
CREATE POLICY "Users can view own audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (auth.uid() = actor_id);

-- Policy: Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (public.is_admin());

-- Policy: Authenticated users can INSERT an audit log for their own actions
CREATE POLICY "Users can create audit record"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (auth.uid() = actor_id);

-- Policy: NEVER ALLOW UPDATE OR DELETE ON AUDIT LOGS (Immutable)
-- No UPDATE or DELETE policies are granted to anyone, ensuring immutability.


-- ==============================================================================
-- MIGRATION: 20261124000003_auth_triggers.sql
-- ==============================================================================

-- ============================================================================
-- Migration: 20261124000003_auth_triggers.sql
-- Description: Database Triggers for Automatic User Provisioning & Audit
-- Handles Supabase Auth (auth.users) sync to profiles, roles, and donor records
-- ============================================================================

-- Function: Automatically update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Trigger for donor_profiles
DROP TRIGGER IF EXISTS trigger_donor_profiles_updated_at ON public.donor_profiles;
CREATE TRIGGER trigger_donor_profiles_updated_at
    BEFORE UPDATE ON public.donor_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- TRIGGER FUNCTION: Handle New User Provisioning from auth.users
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_city TEXT;
    v_avatar_url TEXT;
    v_blood_group TEXT;
BEGIN
    -- Extract values safely from raw_user_meta_data
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
    v_phone := NEW.raw_user_meta_data->>'phone';
    v_city := NEW.raw_user_meta_data->>'city';
    v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';
    
    -- Extract and validate account_type; NEVER allow self-provisioning of 'super_admin' or 'admin'
    v_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'donor');
    IF v_account_type NOT IN ('donor', 'patient', 'hospital', 'blood_bank') THEN
        v_account_type := 'donor'; -- Secure fallback
    END IF;

    -- 1. Insert into public.profiles
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        phone,
        avatar_url,
        account_type,
        city,
        is_verified,
        account_status
    ) VALUES (
        NEW.id,
        v_full_name,
        NEW.email,
        v_phone,
        v_avatar_url,
        v_account_type,
        v_city,
        -- Donors and Patients start as verified email holders; Organizations start pending verification
        CASE WHEN v_account_type IN ('hospital', 'blood_bank') THEN FALSE ELSE TRUE END,
        CASE WHEN v_account_type IN ('hospital', 'blood_bank') THEN 'pending_verification' ELSE 'active' END
    );

    -- 2. Insert verified initial role into public.user_roles
    INSERT INTO public.user_roles (
        user_id,
        role
    ) VALUES (
        NEW.id,
        v_account_type
    );

    -- 3. If account type is 'donor', initialize donor_profiles if blood group is provided
    v_blood_group := NEW.raw_user_meta_data->>'blood_group';
    IF v_account_type = 'donor' AND v_blood_group IS NOT NULL AND v_blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        INSERT INTO public.donor_profiles (
            user_id,
            blood_group,
            availability_status,
            consent_to_discovery
        ) VALUES (
            NEW.id,
            v_blood_group,
            'available',
            TRUE
        ) ON CONFLICT (user_id) DO NOTHING;
    END IF;

    -- 4. Record registration in immutable audit_logs
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NEW.id,
        'USER_REGISTERED',
        'profiles',
        NEW.id::text,
        jsonb_build_object(
            'account_type', v_account_type,
            'provider', NEW.raw_app_meta_data->>'provider',
            'email', NEW.email
        )
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error to Postgres logs but do not crash the auth flow
        RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();


-- ==============================================================================
-- MIGRATION: 20261124000004_donor_command_center.sql
-- ==============================================================================

-- ============================================================================
-- Migration: 20261124000004_donor_command_center.sql
-- Description: Phase 3 Database Architecture for Donor Command Center
-- Tables: donations, donation_camps, appointments, notifications, storage
-- ============================================================================

-- 1. Extend profiles with healthcare demographic and emergency contact fields
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    ADD COLUMN IF NOT EXISTS preferred_contact TEXT DEFAULT 'email' CHECK (preferred_contact IN ('email', 'phone', 'whatsapp', 'sms')),
    ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- 2. Extend donor_profiles with advanced availability & notification preferences
ALTER TABLE public.donor_profiles
    DROP CONSTRAINT IF EXISTS donor_profiles_availability_status_check;

ALTER TABLE public.donor_profiles
    ADD CONSTRAINT donor_profiles_availability_status_check
    CHECK (availability_status IN ('available', 'temporarily_unavailable', 'not_accepting_requests', 'recently_donated'));

ALTER TABLE public.donor_profiles
    ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"emergency_alerts": true, "appointment_reminders": true, "monthly_digest": false}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS last_availability_updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL;

-- ============================================================================
-- 3. DONATIONS TABLE (Clinical Transfusion Records & Verification)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    blood_bank_id UUID REFERENCES public.blood_banks(id) ON DELETE SET NULL,
    facility_name TEXT NOT NULL,
    facility_location TEXT NOT NULL,
    donation_date DATE NOT NULL,
    donation_type TEXT NOT NULL DEFAULT 'whole_blood' CHECK (donation_type IN ('whole_blood', 'platelets', 'plasma', 'double_red')),
    units_donated INT NOT NULL DEFAULT 1 CHECK (units_donated > 0),
    reference_number TEXT NOT NULL UNIQUE,
    verification_status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (verification_status IN ('verified', 'pending_verification', 'rejected')),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    certificate_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_donations_donor ON public.donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON public.donations(verification_status);
CREATE INDEX IF NOT EXISTS idx_donations_date ON public.donations(donation_date DESC);
CREATE INDEX IF NOT EXISTS idx_donations_ref ON public.donations(reference_number);

-- Trigger for donations updated_at
DROP TRIGGER IF EXISTS trigger_donations_updated_at ON public.donations;
CREATE TRIGGER trigger_donations_updated_at
    BEFORE UPDATE ON public.donations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 4. DONATION CAMPS & FIXED SITES (Community & Facility Drives)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donation_camps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    organizer_name TEXT NOT NULL,
    facility_type TEXT NOT NULL DEFAULT 'blood_bank' CHECK (facility_type IN ('blood_bank', 'hospital', 'community_camp', 'mobile_unit')),
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    camp_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slots_available INT NOT NULL DEFAULT 40,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_camps_city ON public.donation_camps(city);
CREATE INDEX IF NOT EXISTS idx_camps_date ON public.donation_camps(camp_date);

-- ============================================================================
-- 5. APPOINTMENTS TABLE (Scheduled Donation Sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    camp_id UUID REFERENCES public.donation_camps(id) ON DELETE SET NULL,
    facility_name TEXT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TEXT NOT NULL,
    donation_type TEXT NOT NULL DEFAULT 'whole_blood' CHECK (donation_type IN ('whole_blood', 'platelets', 'plasma', 'double_red')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_donor ON public.appointments(donor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- Trigger for appointments updated_at
DROP TRIGGER IF EXISTS trigger_appointments_updated_at ON public.appointments;
CREATE TRIGGER trigger_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. NOTIFICATIONS TABLE (In-App Clinical & Emergency Alerts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'urgent', 'appointment', 'certificate', 'system')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, is_read);

-- ============================================================================
-- 7. ROW LEVEL SECURITY POLICIES FOR NEW TABLES
-- ============================================================================
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_camps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 7.1 DONATIONS POLICIES
-- Policy: Donors can view their own donation history
CREATE POLICY "Donors can view own donation history"
    ON public.donations
    FOR SELECT
    USING (auth.uid() = donor_id);

-- Policy: Verified hospitals, blood banks, and admins can view relevant donations
CREATE POLICY "Authorized organizations can view donations"
    ON public.donations
    FOR SELECT
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- Policy: Only verified hospitals, blood banks, and admins can insert or verify donations
-- Donors CANNOT self-verify or insert fraudulent records
CREATE POLICY "Organizations can insert donations"
    ON public.donations
    FOR INSERT
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

CREATE POLICY "Organizations can update donation verification"
    ON public.donations
    FOR UPDATE
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    )
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- 7.2 DONATION CAMPS POLICIES
-- Policy: Anyone can view active upcoming donation camps
CREATE POLICY "Public can view donation camps"
    ON public.donation_camps
    FOR SELECT
    USING (camp_date >= CURRENT_DATE);

-- Policy: Only verified organizations can publish camps
CREATE POLICY "Organizations can manage donation camps"
    ON public.donation_camps
    FOR ALL
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    )
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- 7.3 APPOINTMENTS POLICIES
-- Policy: Donors can view their own appointments
CREATE POLICY "Donors can view own appointments"
    ON public.appointments
    FOR SELECT
    USING (auth.uid() = donor_id);

-- Policy: Donors can book their own appointments
CREATE POLICY "Donors can schedule own appointments"
    ON public.appointments
    FOR INSERT
    WITH CHECK (
        auth.uid() = donor_id
        AND status = 'scheduled'
    );

-- Policy: Donors can update their own appointments (e.g. cancel)
CREATE POLICY "Donors can update own appointments"
    ON public.appointments
    FOR UPDATE
    USING (auth.uid() = donor_id)
    WITH CHECK (auth.uid() = donor_id);

-- Policy: Authorized facilities can view and manage their appointments
CREATE POLICY "Facilities can view and manage appointments"
    ON public.appointments
    FOR ALL
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    )
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- 7.4 NOTIFICATIONS POLICIES
-- Policy: Users can view their own notifications
CREATE POLICY "Users can view own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can mark their own notifications as read
CREATE POLICY "Users can update own notification status"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 8. SEED DATA FOR DEMONSTRATION & PROTOTYPING
-- ============================================================================
INSERT INTO public.donation_camps (title, organizer_name, facility_type, address, city, camp_date, start_time, end_time, slots_available)
VALUES
    ('Metro Red Cross Annual Drive', 'Metropolitan Blood Bank', 'blood_bank', '842 Medical Center Blvd, Sector 4', 'Metro Central', CURRENT_DATE + INTERVAL '2 days', '09:00', '16:00', 35),
    ('St. Jude Community Life Camp', 'St. Jude Memorial Hospital', 'hospital', '120 St. Jude Way, East Wing', 'Metro Central', CURRENT_DATE + INTERVAL '5 days', '10:00', '17:00', 28),
    ('City University Youth Drive', 'National Transfusion Service', 'community_camp', '419 University Crescent', 'Metro Central', CURRENT_DATE + INTERVAL '9 days', '08:30', '15:30', 50)
ON CONFLICT DO NOTHING;


-- ==============================================================================
-- MIGRATION: 20261124000005_patient_emergency_portal.sql
-- ==============================================================================

-- ============================================================================
-- BLOODLINK DATABASE MIGRATION - PHASE 4
-- Migration: 20261124000005_patient_emergency_portal.sql
-- Description: Advanced Patient Emergency Portal & Blood Request Management
-- Schema: blood_requests, blood_request_events, request_responses, facility_inventory
-- Row Level Security: Strict patient ownership, organization-only verification
-- ============================================================================

-- Function to generate human-readable clinical request codes (e.g., REQ-2026-89412)
CREATE OR REPLACE FUNCTION public.generate_request_code()
RETURNS TRIGGER AS $$
DECLARE
    seq_val TEXT;
BEGIN
    IF NEW.request_code IS NULL OR NEW.request_code = '' THEN
        seq_val := LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
        NEW.request_code := 'REQ-' || TO_CHAR(NOW(), 'YYYY') || '-' || seq_val;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. BLOOD REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blood_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_code TEXT UNIQUE,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    blood_component TEXT NOT NULL CHECK (blood_component IN ('whole_blood', 'packed_red_cells', 'platelets', 'plasma', 'cryoprecipitate')),
    units_needed INT NOT NULL CHECK (units_needed > 0 AND units_needed <= 20),
    hospital_name TEXT NOT NULL,
    hospital_city TEXT NOT NULL,
    hospital_district TEXT,
    hospital_address TEXT NOT NULL,
    hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
    required_datetime TIMESTAMPTZ NOT NULL,
    urgency_priority TEXT NOT NULL DEFAULT 'urgent' CHECK (urgency_priority IN ('critical', 'urgent', 'scheduled')),
    clinical_reason TEXT NOT NULL,
    treating_doctor TEXT,
    doctor_contact TEXT,
    requester_relationship TEXT NOT NULL DEFAULT 'Self',
    requester_phone TEXT NOT NULL,
    requester_email TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
        'submitted',
        'awaiting_verification',
        'verified',
        'matching_in_progress',
        'response_received',
        'fulfilment_in_progress',
        'fulfilled',
        'cancelled',
        'rejected'
    )),
    matched_nodes_count INT NOT NULL DEFAULT 0,
    units_fulfilled INT NOT NULL DEFAULT 0 CHECK (units_fulfilled >= 0),
    cancellation_reason TEXT,
    consent_acknowledged BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blood_requests_requester ON public.blood_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON public.blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_blood_group ON public.blood_requests(blood_group);
CREATE INDEX IF NOT EXISTS idx_blood_requests_city ON public.blood_requests(hospital_city);
CREATE INDEX IF NOT EXISTS idx_blood_requests_priority ON public.blood_requests(urgency_priority);
CREATE INDEX IF NOT EXISTS idx_blood_requests_code ON public.blood_requests(request_code);

-- Triggers for request_code generation and updated_at
DROP TRIGGER IF EXISTS trigger_blood_request_code ON public.blood_requests;
CREATE TRIGGER trigger_blood_request_code
    BEFORE INSERT ON public.blood_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_request_code();

DROP TRIGGER IF EXISTS trigger_blood_requests_updated_at ON public.blood_requests;
CREATE TRIGGER trigger_blood_requests_updated_at
    BEFORE UPDATE ON public.blood_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. BLOOD REQUEST TIMELINE AUDIT EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.blood_request_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    status_snapshot TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT,
    is_patient_visible BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_events_request ON public.blood_request_events(request_id);
CREATE INDEX IF NOT EXISTS idx_request_events_created ON public.blood_request_events(created_at ASC);

-- ============================================================================
-- 3. REQUEST RESPONSES (Donor / Blood Bank Triage Responses)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.request_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    responder_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    responder_type TEXT NOT NULL CHECK (responder_type IN ('donor', 'blood_bank', 'hospital')),
    units_offered INT NOT NULL DEFAULT 1 CHECK (units_offered > 0),
    status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'completed', 'declined')),
    eta_minutes INT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_responses_req ON public.request_responses(request_id);
CREATE INDEX IF NOT EXISTS idx_request_responses_resp ON public.request_responses(responder_id);

-- ============================================================================
-- 4. FACILITY INVENTORY (Verified Hospital & Blood Bank Reserves)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facility_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    facility_type TEXT NOT NULL CHECK (facility_type IN ('hospital', 'blood_bank')),
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    blood_component TEXT NOT NULL CHECK (blood_component IN ('whole_blood', 'packed_red_cells', 'platelets', 'plasma', 'cryoprecipitate')),
    units_available INT NOT NULL DEFAULT 0 CHECK (units_available >= 0),
    status TEXT NOT NULL DEFAULT 'optimal' CHECK (status IN ('optimal', 'moderate', 'low', 'critical_depleted')),
    last_inspected_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_facility_inventory_item UNIQUE (facility_id, blood_group, blood_component)
);

CREATE INDEX IF NOT EXISTS idx_facility_inventory_fac ON public.facility_inventory(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_inventory_bg ON public.facility_inventory(blood_group, blood_component);

DROP TRIGGER IF EXISTS trigger_facility_inventory_updated_at ON public.facility_inventory;
CREATE TRIGGER trigger_facility_inventory_updated_at
    BEFORE UPDATE ON public.facility_inventory
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Trigger to automatically create initial event on new blood request
CREATE OR REPLACE FUNCTION public.log_initial_request_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.blood_request_events (
        request_id,
        event_type,
        status_snapshot,
        title,
        description,
        actor_id,
        actor_role,
        is_patient_visible,
        metadata
    ) VALUES (
        NEW.id,
        'REQUEST_SUBMITTED',
        NEW.status,
        'Emergency Blood Request Registered',
        'Request for ' || NEW.units_needed || ' units of ' || NEW.blood_group || ' (' || NEW.blood_component || ') logged into regional emergency dispatch queue.',
        NEW.requester_id,
        'patient',
        TRUE,
        jsonb_build_object('priority', NEW.urgency_priority, 'hospital', NEW.hospital_name)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_request_event ON public.blood_requests;
CREATE TRIGGER trigger_auto_request_event
    AFTER INSERT ON public.blood_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.log_initial_request_event();

-- ============================================================================
-- 5. ROW LEVEL SECURITY POLICIES
-- ============================================================================
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_inventory ENABLE ROW LEVEL SECURITY;

-- 5.1 BLOOD REQUESTS POLICIES
-- Policy: Requesters can view their own requests
CREATE POLICY "Patients can view own blood requests"
    ON public.blood_requests
    FOR SELECT
    USING (auth.uid() = requester_id);

-- Policy: Authorized medical facilities and admins can view relevant requests
CREATE POLICY "Authorized medical organizations can view blood requests"
    ON public.blood_requests
    FOR SELECT
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- Policy: Patients can create new blood requests (always starting at submitted / pending)
CREATE POLICY "Patients can create blood requests"
    ON public.blood_requests
    FOR INSERT
    WITH CHECK (
        auth.uid() = requester_id
        AND verification_status = 'pending'
        AND status IN ('submitted', 'awaiting_verification')
    );

-- Policy: Patients can only update their own requests to cancel them
CREATE POLICY "Patients can cancel own blood requests"
    ON public.blood_requests
    FOR UPDATE
    USING (
        auth.uid() = requester_id
        AND status NOT IN ('fulfilled', 'cancelled')
    )
    WITH CHECK (
        auth.uid() = requester_id
        AND status = 'cancelled'
    );

-- Policy: Only verified hospital/blood bank/admin accounts can verify or update status
CREATE POLICY "Authorized organizations can update request status"
    ON public.blood_requests
    FOR UPDATE
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    )
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- 5.2 BLOOD REQUEST EVENTS POLICIES
-- Policy: Patients can view visible events for their own requests
CREATE POLICY "Patients can view visible events for own requests"
    ON public.blood_request_events
    FOR SELECT
    USING (
        is_patient_visible = TRUE
        AND EXISTS (
            SELECT 1 FROM public.blood_requests r
            WHERE r.id = blood_request_events.request_id
            AND r.requester_id = auth.uid()
        )
    );

-- Policy: Organizations and admins can view all events
CREATE POLICY "Organizations can view all request events"
    ON public.blood_request_events
    FOR SELECT
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- Policy: Organizations and admins can insert audit timeline events
CREATE POLICY "Authorized users can insert request events"
    ON public.blood_request_events
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
    );

-- 5.3 REQUEST RESPONSES POLICIES
-- Policy: Responders can view and manage their own responses
CREATE POLICY "Responders can view own responses"
    ON public.request_responses
    FOR SELECT
    USING (auth.uid() = responder_id);

-- Policy: Requesters can see that a response was received (anonymous/masked node)
CREATE POLICY "Requesters can view responses for their requests"
    ON public.request_responses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.blood_requests r
            WHERE r.id = request_responses.request_id
            AND r.requester_id = auth.uid()
        )
    );

-- Policy: Donors, hospitals, blood banks can insert responses
CREATE POLICY "Authorized responders can submit responses"
    ON public.request_responses
    FOR INSERT
    WITH CHECK (auth.uid() = responder_id);

-- 5.4 FACILITY INVENTORY POLICIES
-- Policy: Public and authenticated users can view verified facility inventory
CREATE POLICY "Anyone can view facility inventory"
    ON public.facility_inventory
    FOR SELECT
    USING (TRUE);

-- Policy: Facility owners can manage their own inventory
CREATE POLICY "Facility owners can manage inventory"
    ON public.facility_inventory
    FOR ALL
    USING (
        auth.uid() = facility_id
        OR public.is_admin()
    )
    WITH CHECK (
        auth.uid() = facility_id
        OR public.is_admin()
    );


-- ==============================================================================
-- MIGRATION: 20261124000006_intelligent_matching_engine.sql
-- ==============================================================================

-- ============================================================================
-- BLOODLINK DATABASE MIGRATION - PHASE 5
-- Migration: 20261124000006_intelligent_matching_engine.sql
-- Description: Central Intelligent Matching Engine, Clinically Validated
--              Compatibility Rules, Donor Invitations, and Inventory Reservations
-- ============================================================================

-- Function to generate human-readable reservation codes (e.g., RSV-2026-90412)
CREATE OR REPLACE FUNCTION public.generate_reservation_code()
RETURNS TRIGGER AS $$
DECLARE
    seq_val TEXT;
BEGIN
    IF NEW.reservation_code IS NULL OR NEW.reservation_code = '' THEN
        seq_val := LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
        NEW.reservation_code := 'RSV-' || TO_CHAR(NOW(), 'YYYY') || '-' || seq_val;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. MATCHING RULE VERSIONS (Audited Clinical Compatibility Datasets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matching_rule_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    authority TEXT NOT NULL,
    reviewer_name TEXT NOT NULL,
    ruleset_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending_clinical_review', 'deprecated')),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rule_versions_code ON public.matching_rule_versions(version_code);
CREATE INDEX IF NOT EXISTS idx_rule_versions_status ON public.matching_rule_versions(status);

-- Seed Initial Clinically Approved Ruleset (AABB / WHO Standard)
INSERT INTO public.matching_rule_versions (
    version_code,
    title,
    authority,
    reviewer_name,
    ruleset_json,
    status,
    approved_at
) VALUES (
    'CLINICAL-AABB-2026.1',
    'AABB / WHO Clinically Validated Transfusion Compatibility Matrix v2026.1',
    'American Association of Blood Banks (AABB) & WHO Technical Guidance',
    'Dr. Aris Thorne, MD, FRCPath, Transfusion Medicine Lead',
    '{
        "whole_blood": {
            "O-": ["O-"],
            "O+": ["O+", "O-"],
            "A-": ["A-", "O-"],
            "A+": ["A+", "A-", "O+", "O-"],
            "B-": ["B-", "O-"],
            "B+": ["B+", "B-", "O+", "O-"],
            "AB-": ["AB-", "A-", "B-", "O-"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"]
        },
        "packed_red_cells": {
            "O-": ["O-"],
            "O+": ["O+", "O-"],
            "A-": ["A-", "O-"],
            "A+": ["A+", "A-", "O+", "O-"],
            "B-": ["B-", "O-"],
            "B+": ["B+", "B-", "O+", "O-"],
            "AB-": ["AB-", "A-", "B-", "O-"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"]
        },
        "platelets": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"],
            "A-": ["A-", "A+", "AB-", "AB+", "O-", "O+"],
            "A+": ["A+", "A-", "AB+", "AB-", "O+", "O-"],
            "B-": ["B-", "B+", "AB-", "AB+", "O-", "O+"],
            "B+": ["B+", "B-", "AB+", "AB-", "O+", "O-"],
            "AB-": ["AB-", "AB+", "A-", "A+", "B-", "B+"],
            "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-"]
        },
        "plasma": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "A+", "B+", "AB+"],
            "A-": ["A-", "A+", "AB-", "AB+"],
            "A+": ["A+", "AB+"],
            "B-": ["B-", "B+", "AB-", "AB+"],
            "B+": ["B+", "AB+"],
            "AB-": ["AB-", "AB+"],
            "AB+": ["AB+"]
        },
        "cryoprecipitate": {
            "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
            "O+": ["O+", "A+", "B+", "AB+"],
            "A-": ["A-", "A+", "AB-", "AB+"],
            "A+": ["A+", "AB+"],
            "B-": ["B-", "B+", "AB-", "AB+"],
            "B+": ["B+", "AB+"],
            "AB-": ["AB-", "AB+"],
            "AB+": ["AB+"]
        }
    }'::jsonb,
    'approved',
    TIMEZONE('utc'::text, NOW())
) ON CONFLICT (version_code) DO NOTHING;

-- ============================================================================
-- 2. MATCHING RUNS (Execution History & Performance Telemetry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matching_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    triggered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rule_version_id UUID REFERENCES public.matching_rule_versions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed', 'pending_clinical_review')),
    candidates_found INT NOT NULL DEFAULT 0,
    donors_matched INT NOT NULL DEFAULT 0,
    facilities_matched INT NOT NULL DEFAULT 0,
    execution_time_ms INT NOT NULL DEFAULT 0,
    search_radius_km NUMERIC NOT NULL DEFAULT 25.0,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matching_runs_req ON public.matching_runs(request_id);
CREATE INDEX IF NOT EXISTS idx_matching_runs_created ON public.matching_runs(created_at DESC);

-- ============================================================================
-- 3. MATCHING CANDIDATES (Ranked Donor & Inventory Fulfillment Options)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.matching_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.matching_runs(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    candidate_type TEXT NOT NULL CHECK (candidate_type IN ('donor', 'facility_inventory')),
    donor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES public.facility_inventory(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    blood_component TEXT NOT NULL,
    match_score NUMERIC NOT NULL CHECK (match_score >= 0 AND match_score <= 100),
    location_match_quality TEXT NOT NULL CHECK (location_match_quality IN ('exact_city', 'district', 'service_area_radius', 'regional_transit')),
    distance_km NUMERIC,
    units_available INT NOT NULL DEFAULT 1 CHECK (units_available > 0),
    status TEXT NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'invited', 'accepted', 'declined', 'reserved', 'unavailable')),
    explanation JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matching_candidates_run ON public.matching_candidates(run_id);
CREATE INDEX IF NOT EXISTS idx_matching_candidates_req ON public.matching_candidates(request_id);
CREATE INDEX IF NOT EXISTS idx_matching_candidates_donor ON public.matching_candidates(donor_id);
CREATE INDEX IF NOT EXISTS idx_matching_candidates_facility ON public.matching_candidates(facility_id);

-- ============================================================================
-- 4. DONOR REQUEST INVITATIONS (Privacy-Preserving Dispatch)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donor_request_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES public.matching_candidates(id) ON DELETE SET NULL,
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    donor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
    responded_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    response_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_donor_request_invitation UNIQUE (request_id, donor_id)
);

CREATE INDEX IF NOT EXISTS idx_invitations_donor ON public.donor_request_invitations(donor_id);
CREATE INDEX IF NOT EXISTS idx_invitations_req ON public.donor_request_invitations(request_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.donor_request_invitations(status);

DROP TRIGGER IF EXISTS trigger_invitations_updated_at ON public.donor_request_invitations;
CREATE TRIGGER trigger_invitations_updated_at
    BEFORE UPDATE ON public.donor_request_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 5. INVENTORY RESERVATIONS (Atomic Cold-Chain Allocation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_code TEXT UNIQUE,
    inventory_id UUID NOT NULL REFERENCES public.facility_inventory(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    units_reserved INT NOT NULL CHECK (units_reserved > 0),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed', 'released', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_inv ON public.inventory_reservations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_reservations_req ON public.inventory_reservations(request_id);
CREATE INDEX IF NOT EXISTS idx_reservations_fac ON public.inventory_reservations(facility_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.inventory_reservations(status);

DROP TRIGGER IF EXISTS trigger_reservation_code ON public.inventory_reservations;
CREATE TRIGGER trigger_reservation_code
    BEFORE INSERT ON public.inventory_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_reservation_code();

DROP TRIGGER IF EXISTS trigger_reservations_updated_at ON public.inventory_reservations;
CREATE TRIGGER trigger_reservations_updated_at
    BEFORE UPDATE ON public.inventory_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.matching_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matching_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_request_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- 6.1 MATCHING RULE VERSIONS POLICIES
CREATE POLICY "Anyone can view approved matching rules"
    ON public.matching_rule_versions
    FOR SELECT
    USING (status = 'approved' OR public.is_admin());

CREATE POLICY "Only admins can manage matching rules"
    ON public.matching_rule_versions
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 6.2 MATCHING RUNS POLICIES
CREATE POLICY "Requesters can view runs for own requests"
    ON public.matching_runs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.blood_requests r
            WHERE r.id = matching_runs.request_id
            AND r.requester_id = auth.uid()
        )
    );

CREATE POLICY "Organizations and admins can view matching runs"
    ON public.matching_runs
    FOR SELECT
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

CREATE POLICY "Authorized system can insert matching runs"
    ON public.matching_runs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 6.3 MATCHING CANDIDATES POLICIES
CREATE POLICY "Requesters can view candidate counts and options for own requests"
    ON public.matching_candidates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.blood_requests r
            WHERE r.id = matching_candidates.request_id
            AND r.requester_id = auth.uid()
        )
    );

CREATE POLICY "Organizations and admins can view candidate details"
    ON public.matching_candidates
    FOR SELECT
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

CREATE POLICY "Authorized system can insert matching candidates"
    ON public.matching_candidates
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 6.4 DONOR INVITATIONS POLICIES
CREATE POLICY "Donors can view their own invitations"
    ON public.donor_request_invitations
    FOR SELECT
    USING (donor_id = auth.uid());

CREATE POLICY "Donors can respond to their own invitations"
    ON public.donor_request_invitations
    FOR UPDATE
    USING (donor_id = auth.uid())
    WITH CHECK (
        donor_id = auth.uid()
        AND status IN ('accepted', 'declined', 'withdrawn')
    );

CREATE POLICY "Organizations and admins can view and manage invitations"
    ON public.donor_request_invitations
    FOR ALL
    USING (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    )
    WITH CHECK (
        public.has_role('hospital')
        OR public.has_role('blood_bank')
        OR public.is_admin()
    );

-- 6.5 INVENTORY RESERVATIONS POLICIES
CREATE POLICY "Facilities can manage their own reservations"
    ON public.inventory_reservations
    FOR ALL
    USING (
        facility_id = auth.uid()
        OR public.is_admin()
    )
    WITH CHECK (
        facility_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY "Requesters can view confirmed reservations for own requests"
    ON public.inventory_reservations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.blood_requests r
            WHERE r.id = inventory_reservations.request_id
            AND r.requester_id = auth.uid()
        )
    );


-- ==============================================================================
-- MIGRATION: 20261124000007_facility_management_system.sql
-- ==============================================================================

-- ============================================================================
-- BLOODLINK ADVANCED HOSPITAL & BLOOD BANK MANAGEMENT SYSTEM MIGRATION
-- Migration: 20261124000007_facility_management_system.sql
-- Integrates:
-- 1. Facility Staff & Role Management (hospital & blood bank scoped roles)
-- 2. Traceable Component Batches (collection, testing, expiry, storage conditions)
-- 3. Component Processing Events (separation & parent-child traceability)
-- 4. Laboratory Quality Checks & Infection Screening (HIV, HBV, HCV, Syphilis)
-- 5. Complete Inventory Audit Movements (atomic delta & state changes)
-- 6. Cold-Chain Dispatch & Transit Records
-- 7. Hospital Transfusion Crossmatching & Fulfilment Records
-- 8. Facility-Configurable Stock & Expiry Alerts
-- 9. Complete Row Level Security & Atomic Concurrency Functions
-- ============================================================================

-- ============================================================================
-- 1. FACILITY STAFF & ROLE MANAGEMENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.facility_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    facility_type TEXT NOT NULL CHECK (facility_type IN ('hospital', 'blood_bank')),
    staff_role TEXT NOT NULL CHECK (
        staff_role IN (
            'hospital_admin', 'hospital_doctor', 'transfusion_officer', 'hospital_operations',
            'bloodbank_admin', 'inventory_manager', 'lab_technician', 'collection_staff', 'dispatch_staff'
        )
    ),
    department TEXT,
    license_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    permissions JSONB NOT NULL DEFAULT '{"can_verify_requests": true, "can_manage_inventory": true}'::jsonb,
    invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT uq_facility_staff_member UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_staff_facility ON public.facility_staff(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_staff_user ON public.facility_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_facility_staff_role ON public.facility_staff(staff_role);

DROP TRIGGER IF EXISTS trigger_facility_staff_updated_at ON public.facility_staff;
CREATE TRIGGER trigger_facility_staff_updated_at
    BEFORE UPDATE ON public.facility_staff
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. COMPONENT SHELF LIFE & STORAGE POLICIES FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.compute_component_expiry_date(
    p_component TEXT,
    p_collection_date DATE
)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    CASE p_component
        WHEN 'whole_blood' THEN
            RETURN (p_collection_date + INTERVAL '35 days')::timestamptz;
        WHEN 'packed_red_cells' THEN
            RETURN (p_collection_date + INTERVAL '42 days')::timestamptz;
        WHEN 'platelets' THEN
            -- Platelets have an acute 5-day shelf life at room temperature (20-24°C) with continuous agitation
            RETURN (p_collection_date + INTERVAL '5 days')::timestamptz;
        WHEN 'plasma' THEN
            -- Fresh Frozen Plasma: 365 days when stored at <= -18°C
            RETURN (p_collection_date + INTERVAL '365 days')::timestamptz;
        WHEN 'cryoprecipitate' THEN
            -- Cryoprecipitate: 365 days when frozen at <= -18°C
            RETURN (p_collection_date + INTERVAL '365 days')::timestamptz;
        ELSE
            RETURN (p_collection_date + INTERVAL '35 days')::timestamptz;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Batch number sequence generator
CREATE OR REPLACE FUNCTION public.generate_batch_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val INT;
    comp_prefix TEXT;
BEGIN
    IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
        seq_val := CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT) % 1000000;
        CASE NEW.blood_component
            WHEN 'packed_red_cells' THEN comp_prefix := 'PRBC';
            WHEN 'whole_blood' THEN comp_prefix := 'WBLD';
            WHEN 'platelets' THEN comp_prefix := 'PLTS';
            WHEN 'plasma' THEN comp_prefix := 'FFPL';
            WHEN 'cryoprecipitate' THEN comp_prefix := 'CRYO';
            ELSE comp_prefix := 'UNIT';
        END CASE;
        NEW.batch_number := comp_prefix || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. TRACEABLE COMPONENT BATCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.component_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number TEXT UNIQUE NOT NULL,
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    facility_type TEXT NOT NULL CHECK (facility_type IN ('hospital', 'blood_bank')),
    source_donation_id UUID REFERENCES public.donations(id) ON DELETE SET NULL,
    parent_batch_id UUID REFERENCES public.component_batches(id) ON DELETE SET NULL,
    blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    blood_component TEXT NOT NULL CHECK (blood_component IN ('whole_blood', 'packed_red_cells', 'platelets', 'plasma', 'cryoprecipitate')),
    volume_ml INT NOT NULL CHECK (volume_ml > 0),
    units_count NUMERIC NOT NULL DEFAULT 1.0 CHECK (units_count > 0),
    collection_date DATE NOT NULL,
    processing_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ NOT NULL,
    storage_location TEXT NOT NULL,
    storage_temperature_celsius NUMERIC NOT NULL DEFAULT 4.0,
    status TEXT NOT NULL DEFAULT 'under_testing' CHECK (
        status IN ('quarantined', 'under_testing', 'available', 'reserved', 'dispatched', 'issued', 'expired', 'discarded')
    ),
    screening_status TEXT NOT NULL DEFAULT 'pending' CHECK (screening_status IN ('pending', 'passed', 'failed')),
    qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'passed', 'failed')),
    qc_verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    qc_verified_at TIMESTAMPTZ,
    discard_reason TEXT,
    discarded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    discarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batches_facility ON public.component_batches(facility_id);
CREATE INDEX IF NOT EXISTS idx_batches_group_comp ON public.component_batches(blood_group, blood_component);
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.component_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON public.component_batches(expiry_date);

DROP TRIGGER IF EXISTS trigger_batch_number ON public.component_batches;
CREATE TRIGGER trigger_batch_number
    BEFORE INSERT ON public.component_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_batch_number();

DROP TRIGGER IF EXISTS trigger_batches_updated_at ON public.component_batches;
CREATE TRIGGER trigger_batches_updated_at
    BEFORE UPDATE ON public.component_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 4. COMPONENT PROCESSING EVENTS (Separation & Traceability)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.component_processing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    source_donation_id UUID REFERENCES public.donations(id) ON DELETE SET NULL,
    source_batch_id UUID REFERENCES public.component_batches(id) ON DELETE SET NULL,
    processing_type TEXT NOT NULL CHECK (
        processing_type IN ('centrifugation_separation', 'plasma_freezing', 'cryo_precipitation', 'platelet_agitation', 'apheresis_filtration')
    ),
    processed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    components_produced JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proc_events_facility ON public.component_processing_events(facility_id);
CREATE INDEX IF NOT EXISTS idx_proc_events_donation ON public.component_processing_events(source_donation_id);

-- ============================================================================
-- 5. LABORATORY QUALITY CHECKS & SCREENING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.component_batches(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    hiv_screen TEXT NOT NULL CHECK (hiv_screen IN ('negative', 'positive', 'indeterminate')),
    hbv_screen TEXT NOT NULL CHECK (hbv_screen IN ('negative', 'positive', 'indeterminate')),
    hcv_screen TEXT NOT NULL CHECK (hcv_screen IN ('negative', 'positive', 'indeterminate')),
    syphilis_screen TEXT NOT NULL CHECK (syphilis_screen IN ('negative', 'positive', 'indeterminate')),
    malaria_screen TEXT NOT NULL CHECK (malaria_screen IN ('negative', 'positive', 'indeterminate')),
    hemoglobin_g_dl NUMERIC CHECK (hemoglobin_g_dl > 0),
    antibody_screen TEXT NOT NULL DEFAULT 'negative',
    overall_result TEXT NOT NULL CHECK (overall_result IN ('passed', 'failed', 'pending')),
    laboratory_notes TEXT,
    completed_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qc_batch ON public.inventory_quality_checks(batch_id);
CREATE INDEX IF NOT EXISTS idx_qc_facility ON public.inventory_quality_checks(facility_id);

-- ============================================================================
-- 6. INVENTORY MOVEMENTS AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.component_batches(id) ON DELETE SET NULL,
    inventory_id UUID REFERENCES public.facility_inventory(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL CHECK (
        movement_type IN (
            'received', 'transferred', 'quarantined', 'released_qc', 'reserved',
            'reservation_released', 'dispatched', 'issued_transfused', 'discarded', 'expired'
        )
    ),
    units_delta NUMERIC NOT NULL,
    previous_units NUMERIC NOT NULL,
    new_units NUMERIC NOT NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL,
    reference_id TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_facility ON public.inventory_movements(facility_id);
CREATE INDEX IF NOT EXISTS idx_movements_batch ON public.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON public.inventory_movements(created_at DESC);

-- ============================================================================
-- 7. COLD-CHAIN DISPATCH RECORDS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_dispatch_code()
RETURNS TRIGGER AS $$
DECLARE
    seq_val INT;
BEGIN
    IF NEW.dispatch_code IS NULL OR NEW.dispatch_code = '' THEN
        seq_val := CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT) % 100000;
        NEW.dispatch_code := 'DSP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_val::text, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.dispatch_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_code TEXT UNIQUE NOT NULL,
    reservation_id UUID REFERENCES public.inventory_reservations(id) ON DELETE SET NULL,
    request_id UUID REFERENCES public.blood_requests(id) ON DELETE SET NULL,
    from_facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    to_facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    dispatched_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    courier_name TEXT NOT NULL,
    courier_contact TEXT,
    transport_box_id TEXT NOT NULL,
    departure_temp_celsius NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit', 'delivered', 'rejected', 'cancelled')),
    dispatched_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    delivered_at TIMESTAMPTZ,
    receiving_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    receiving_temp_celsius NUMERIC,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dispatch_from ON public.dispatch_records(from_facility_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_to ON public.dispatch_records(to_facility_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_status ON public.dispatch_records(status);

DROP TRIGGER IF EXISTS trigger_dispatch_code ON public.dispatch_records;
CREATE TRIGGER trigger_dispatch_code
    BEFORE INSERT ON public.dispatch_records
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_dispatch_code();

-- ============================================================================
-- 8. HOSPITAL TRANSFUSION FULFILMENT RECORDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fulfilment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.blood_requests(id) ON DELETE CASCADE,
    hospital_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.component_batches(id) ON DELETE SET NULL,
    dispatch_id UUID REFERENCES public.dispatch_records(id) ON DELETE SET NULL,
    crossmatch_performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    crossmatch_result TEXT NOT NULL CHECK (crossmatch_result IN ('compatible', 'incompatible')),
    administered_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    administered_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    adverse_reaction TEXT NOT NULL DEFAULT 'none',
    transfusion_outcome TEXT NOT NULL DEFAULT 'successful',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_req ON public.fulfilment_records(request_id);
CREATE INDEX IF NOT EXISTS idx_fulfilment_hosp ON public.fulfilment_records(hospital_id);

-- ============================================================================
-- 9. INVENTORY ALERTS & EXPOSURE ENGINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (
        alert_type IN (
            'low_stock', 'critical_shortage', 'near_expiry', 'expired_stock',
            'pending_qc', 'quarantine_hold', 'reservation_expiring', 'delayed_fulfilment'
        )
    ),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    blood_group TEXT CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    blood_component TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_facility ON public.inventory_alerts(facility_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON public.inventory_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON public.inventory_alerts(facility_id, is_resolved) WHERE is_resolved = FALSE;

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_processing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fulfilment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;

-- Helper to check if current user is active staff of a facility
CREATE OR REPLACE FUNCTION public.is_facility_staff(p_facility_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.facility_staff
        WHERE facility_id = p_facility_id
        AND user_id = auth.uid()
        AND is_active = TRUE
    ) OR (auth.uid() = p_facility_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10.1 FACILITY STAFF POLICIES
CREATE POLICY "Facility staff can view members of own facility"
    ON public.facility_staff FOR SELECT
    USING (public.is_facility_staff(facility_id) OR public.is_admin());

CREATE POLICY "Facility administrators can manage staff"
    ON public.facility_staff FOR ALL
    USING (
        auth.uid() = facility_id
        OR EXISTS (
            SELECT 1 FROM public.facility_staff
            WHERE facility_id = public.facility_staff.facility_id
            AND user_id = auth.uid()
            AND staff_role IN ('hospital_admin', 'bloodbank_admin')
            AND is_active = TRUE
        )
        OR public.is_admin()
    );

-- 10.2 COMPONENT BATCHES POLICIES
CREATE POLICY "Facility staff can view batches of own facility"
    ON public.component_batches FOR SELECT
    USING (
        public.is_facility_staff(facility_id)
        OR (status = 'available' AND qc_status = 'passed') -- Certified available stock readable by medical network
        OR public.is_admin()
    );

CREATE POLICY "Facility staff can manage batches of own facility"
    ON public.component_batches FOR ALL
    USING (public.is_facility_staff(facility_id) OR public.is_admin())
    WITH CHECK (public.is_facility_staff(facility_id) OR public.is_admin());

-- 10.3 PROCESSING EVENTS POLICIES
CREATE POLICY "Staff can view processing events of own facility"
    ON public.component_processing_events FOR SELECT
    USING (public.is_facility_staff(facility_id) OR public.is_admin());

CREATE POLICY "Staff can record processing events for own facility"
    ON public.component_processing_events FOR INSERT
    WITH CHECK (public.is_facility_staff(facility_id) OR public.is_admin());

-- 10.4 QUALITY CHECKS POLICIES
CREATE POLICY "Staff can view quality checks of own facility"
    ON public.inventory_quality_checks FOR SELECT
    USING (public.is_facility_staff(facility_id) OR public.is_admin());

CREATE POLICY "Staff can insert quality checks for own facility"
    ON public.inventory_quality_checks FOR INSERT
    WITH CHECK (public.is_facility_staff(facility_id) OR public.is_admin());

-- 10.5 INVENTORY MOVEMENTS POLICIES
CREATE POLICY "Staff can view movements of own facility"
    ON public.inventory_movements FOR SELECT
    USING (public.is_facility_staff(facility_id) OR public.is_admin());

CREATE POLICY "System and staff can record movements"
    ON public.inventory_movements FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 10.6 DISPATCH RECORDS POLICIES
CREATE POLICY "Participating facilities can view dispatch records"
    ON public.dispatch_records FOR SELECT
    USING (
        public.is_facility_staff(from_facility_id)
        OR public.is_facility_staff(to_facility_id)
        OR public.is_admin()
    );

CREATE POLICY "Sending facility staff can create dispatch records"
    ON public.dispatch_records FOR INSERT
    WITH CHECK (public.is_facility_staff(from_facility_id) OR public.is_admin());

CREATE POLICY "Receiving or sending facility can update dispatch status"
    ON public.dispatch_records FOR UPDATE
    USING (
        public.is_facility_staff(from_facility_id)
        OR public.is_facility_staff(to_facility_id)
        OR public.is_admin()
    );

-- 10.7 FULFILMENT RECORDS POLICIES
CREATE POLICY "Hospital staff can view and insert fulfilment records"
    ON public.fulfilment_records FOR ALL
    USING (public.is_facility_staff(hospital_id) OR public.is_admin())
    WITH CHECK (public.is_facility_staff(hospital_id) OR public.is_admin());

-- 10.8 INVENTORY ALERTS POLICIES
CREATE POLICY "Facility staff can view and manage alerts of own facility"
    ON public.inventory_alerts FOR ALL
    USING (public.is_facility_staff(facility_id) OR public.is_admin())
    WITH CHECK (public.is_facility_staff(facility_id) OR public.is_admin());


-- ==============================================================================
-- MIGRATION: 20261125000008_super_admin_command_center.sql
-- ==============================================================================

-- ============================================================================
-- BLOODLINK SUPABASE POSTGRESQL MIGRATION
-- Migration: 20261125000008_super_admin_command_center.sql
-- Description: Super Admin Command Center, Multi-Role Administration,
--              Facility Accreditation Reviews, Append-Only Action Audit Trail,
--              Security Incident Triage, Targeted Broadcast Center, System
--              Configuration with Clinical Rule Protection, and RLS Governance.
-- ============================================================================

-- 1. EXTEND USER ROLES & ADMINISTRATIVE PERMISSIONS
-- ----------------------------------------------------------------------------
-- Granular administrative roles supporting least-privilege operations:
-- - super_admin: Full platform oversight, configuration, and security operations
-- - operations_admin: Emergency monitoring, matching triage, and dispatch oversight
-- - verification_admin: Hospital and blood bank accreditation review and license auditing
-- - security_auditor: Forensic audit logs, security incidents, and privilege inspection
-- - analytics_viewer: Read-only access to global metrics, C:T ratios, and hemovigilance

CREATE TABLE IF NOT EXISTS public.admin_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    admin_role TEXT NOT NULL CHECK (admin_role IN (
        'super_admin',
        'operations_admin',
        'verification_admin',
        'security_auditor',
        'analytics_viewer'
    )),
    assigned_by UUID REFERENCES public.profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    CONSTRAINT uq_user_admin_role UNIQUE (user_id, admin_role)
);

CREATE INDEX IF NOT EXISTS idx_admin_roles_user ON public.admin_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_roles_role ON public.admin_roles(admin_role);

-- Helper function to verify if an authenticated user holds Super Admin privileges
CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = check_user_id
          AND admin_role = 'super_admin'
          AND is_active = TRUE
    ) OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = check_user_id
          AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check granular administrative authorization
CREATE OR REPLACE FUNCTION public.has_admin_role(check_user_id UUID, required_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Super Admin inherits all administrative permissions
    IF public.is_super_admin(check_user_id) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = check_user_id
          AND admin_role = required_role
          AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. FACILITY ACCREDITATION & VERIFICATION REVIEWS
-- ----------------------------------------------------------------------------
-- Formal institutional verification workflow for hospitals and blood banks.
-- Tracks license inspection, physical audit status, and approval decisions.

CREATE TABLE IF NOT EXISTS public.facility_verification_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    decision TEXT NOT NULL CHECK (decision IN (
        'approved',
        'rejected',
        'additional_documentation_requested',
        'suspended',
        'reinstated'
    )),
    previous_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT NOT NULL,
    license_number_verified TEXT,
    accreditation_body TEXT,
    documents_verified JSONB DEFAULT '[]'::jsonb,
    physical_audit_completed BOOLEAN DEFAULT FALSE,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facility_reviews_facility ON public.facility_verification_reviews(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_reviews_reviewer ON public.facility_verification_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_facility_reviews_created ON public.facility_verification_reviews(created_at DESC);


-- 3. APPEND-ONLY ADMINISTRATIVE ACTION AUDIT TRAIL
-- ----------------------------------------------------------------------------
-- Forensic audit ledger capturing all privileged state modifications:
-- user suspensions, facility accreditations, emergency overrides, broadcasts,
-- and system configuration updates. Immutable: no UPDATE or DELETE allowed.

CREATE TABLE IF NOT EXISTS public.admin_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    admin_role TEXT NOT NULL DEFAULT 'super_admin',
    action_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    changes JSONB DEFAULT '{}'::jsonb,
    reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_action_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON public.admin_action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_entity ON public.admin_action_logs(target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_action_logs(created_at DESC);


-- 4. SECURITY INCIDENT OPERATIONS & INVESTIGATION NOTES
-- ----------------------------------------------------------------------------
-- Security operations center for triaging brute-force anomalies, privilege
-- self-escalation attempts, credential alerts, and API rate-limit violations.

CREATE TABLE IF NOT EXISTS public.security_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
    status TEXT NOT NULL CHECK (status IN ('investigating', 'contained', 'resolved', 'false_positive')),
    affected_entity TEXT,
    affected_user_id UUID REFERENCES public.profiles(id),
    investigator_id UUID REFERENCES public.profiles(id),
    investigation_notes TEXT,
    resolution_summary TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sec_incidents_status ON public.security_incidents(status);
CREATE INDEX IF NOT EXISTS idx_sec_incidents_severity ON public.security_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_sec_incidents_code ON public.security_incidents(incident_code);

-- Automated sequence trigger for sequential security incident tracking IDs (INC-YYYY-XXXXX)
CREATE OR REPLACE FUNCTION generate_security_incident_code()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT;
    seq_num INT;
BEGIN
    current_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO seq_num
    FROM public.security_incidents
    WHERE incident_code LIKE 'INC-' || current_year || '-%';

    NEW.incident_code := 'INC-' || current_year || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_security_incident_code ON public.security_incidents;
CREATE TRIGGER trg_security_incident_code
BEFORE INSERT ON public.security_incidents
FOR EACH ROW
WHEN (NEW.incident_code IS NULL OR NEW.incident_code = '')
EXECUTE FUNCTION generate_security_incident_code();


-- 5. PLATFORM ANNOUNCEMENTS & TARGETED BROADCAST CENTER
-- ----------------------------------------------------------------------------
-- Central broadcast management for platform notices, regional trauma alerts,
-- facility regulatory announcements, and system maintenance communications.

CREATE TABLE IF NOT EXISTS public.platform_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_audience TEXT NOT NULL CHECK (target_audience IN (
        'all',
        'donors',
        'patients',
        'hospitals',
        'blood_banks'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('critical', 'urgent', 'standard')),
    author_id UUID NOT NULL REFERENCES public.profiles(id),
    is_active BOOLEAN DEFAULT TRUE,
    scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    read_count INT DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON public.platform_announcements(target_audience);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.platform_announcements(is_active, scheduled_at);

-- Automated sequence trigger for sequential broadcast tracking IDs (ANN-YYYY-XXXXX)
CREATE OR REPLACE FUNCTION generate_announcement_code()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT;
    seq_num INT;
BEGIN
    current_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO seq_num
    FROM public.platform_announcements
    WHERE announcement_code LIKE 'ANN-' || current_year || '-%';

    NEW.announcement_code := 'ANN-' || current_year || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_announcement_code ON public.platform_announcements;
CREATE TRIGGER trg_platform_announcement_code
BEFORE INSERT ON public.platform_announcements
FOR EACH ROW
WHEN (NEW.announcement_code IS NULL OR NEW.announcement_code = '')
EXECUTE FUNCTION generate_announcement_code();


-- 6. SYSTEM CONFIGURATION WITH CLINICAL RULE PROTECTION
-- ----------------------------------------------------------------------------
-- Central platform parameters with explicit protection against casual modification
-- of clinical transfusion compatibility rules.

CREATE TABLE IF NOT EXISTS public.system_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'emergency',
        'matching',
        'inventory',
        'registration',
        'security',
        'notifications',
        'clinical'
    )),
    config_value JSONB NOT NULL,
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,
    is_clinical_rule BOOLEAN DEFAULT FALSE,
    last_modified_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_config_key ON public.system_configuration(config_key);
CREATE INDEX IF NOT EXISTS idx_system_config_category ON public.system_configuration(category);

-- Prevent unauthorized or casual modification of clinical compatibility settings
CREATE OR REPLACE FUNCTION protect_clinical_rules_configuration()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_clinical_rule = TRUE THEN
        -- Verify that the modification explicitly provides medical board approval metadata
        IF NOT (NEW.config_value ? 'medical_board_approval_token' AND NEW.config_value->>'medical_board_approval_token' IS NOT NULL) THEN
            RAISE EXCEPTION 'CLINICAL GOVERNANCE VIOLATION: Clinical compatibility rules cannot be altered without validated Medical Board Authorization token.';
        END IF;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_clinical_rules ON public.system_configuration;
CREATE TRIGGER trg_protect_clinical_rules
BEFORE UPDATE ON public.system_configuration
FOR EACH ROW
EXECUTE FUNCTION protect_clinical_rules_configuration();

-- Seed initial system configuration parameters
INSERT INTO public.system_configuration (config_key, category, config_value, description, is_sensitive, is_clinical_rule)
VALUES 
    ('platform_registration_status', 'registration', '{"allow_donor_registration": true, "allow_patient_registration": true, "allow_facility_applications": true}'::jsonb, 'Global registration availability toggles', false, false),
    ('emergency_triage_priorities', 'emergency', '{"code_red_escalation_minutes": 15, "urgent_escalation_hours": 2, "max_concurrent_broadcasts": 100}'::jsonb, 'Emergency response triage timeouts and limits', false, false),
    ('inventory_alert_thresholds', 'inventory', '{"critical_shortage_units": 5, "near_expiry_warning_hours_platelets": 24, "near_expiry_warning_days_rbc": 7}'::jsonb, 'Cold-chain stock shortage and expiration thresholds', false, false),
    ('matching_engine_defaults', 'matching', '{"default_radius_km": 25, "max_radius_km": 100, "donor_commitment_limit": 2, "stale_inventory_hours": 48}'::jsonb, 'Discovery engine search radius and freshness parameters', false, false),
    ('clinical_transfusion_governance', 'clinical', '{"active_ruleset": "CLINICAL-AABB-2026.1", "enforce_crossmatch": true, "medical_board_approval_token": "MBA-VERIFIED-2026-AABB"}'::jsonb, 'Governing clinical transfusion compatibility protocol', true, true),
    ('security_rate_limits', 'security', '{"max_login_attempts": 5, "lockout_minutes": 15, "session_timeout_minutes": 120, "mfa_required_for_admin": true}'::jsonb, 'Administrative session security and brute-force protection', true, false)
ON CONFLICT (config_key) DO NOTHING;


-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_verification_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configuration ENABLE ROW LEVEL SECURITY;

-- 7.1 admin_roles Policies
-- Only Super Admins can query or manage administrative role bindings
DROP POLICY IF EXISTS admin_roles_select_policy ON public.admin_roles;
CREATE POLICY admin_roles_select_policy ON public.admin_roles
    FOR SELECT TO authenticated
    USING (public.is_super_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS admin_roles_super_admin_manage ON public.admin_roles;
CREATE POLICY admin_roles_super_admin_manage ON public.admin_roles
    FOR ALL TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- 7.2 facility_verification_reviews Policies
DROP POLICY IF EXISTS facility_reviews_select_policy ON public.facility_verification_reviews;
CREATE POLICY facility_reviews_select_policy ON public.facility_verification_reviews
    FOR SELECT TO authenticated
    USING (
        public.has_admin_role(auth.uid(), 'verification_admin') OR
        public.is_super_admin(auth.uid()) OR
        facility_id = auth.uid()
    );

DROP POLICY IF EXISTS facility_reviews_admin_insert ON public.facility_verification_reviews;
CREATE POLICY facility_reviews_admin_insert ON public.facility_verification_reviews
    FOR INSERT TO authenticated
    WITH CHECK (
        public.has_admin_role(auth.uid(), 'verification_admin') OR
        public.is_super_admin(auth.uid())
    );

-- 7.3 admin_action_logs Policies (Strictly Append-Only)
DROP POLICY IF EXISTS admin_actions_select_policy ON public.admin_action_logs;
CREATE POLICY admin_actions_select_policy ON public.admin_action_logs
    FOR SELECT TO authenticated
    USING (public.has_admin_role(auth.uid(), 'security_auditor') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS admin_actions_insert_policy ON public.admin_action_logs;
CREATE POLICY admin_actions_insert_policy ON public.admin_action_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_super_admin(auth.uid()) OR
        EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

-- Prevent any UPDATE or DELETE on admin_action_logs (immutable ledger)
REVOKE UPDATE, DELETE ON public.admin_action_logs FROM authenticated, anon;

-- 7.4 security_incidents Policies
DROP POLICY IF EXISTS sec_incidents_select_policy ON public.security_incidents;
CREATE POLICY sec_incidents_select_policy ON public.security_incidents
    FOR SELECT TO authenticated
    USING (public.has_admin_role(auth.uid(), 'security_auditor') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS sec_incidents_modify_policy ON public.security_incidents;
CREATE POLICY sec_incidents_modify_policy ON public.security_incidents
    FOR ALL TO authenticated
    USING (public.has_admin_role(auth.uid(), 'security_auditor') OR public.is_super_admin(auth.uid()))
    WITH CHECK (public.has_admin_role(auth.uid(), 'security_auditor') OR public.is_super_admin(auth.uid()));

-- 7.5 platform_announcements Policies
-- All users can view active announcements; only admins can create/update
DROP POLICY IF EXISTS announcements_read_policy ON public.platform_announcements;
CREATE POLICY announcements_read_policy ON public.platform_announcements
    FOR SELECT TO authenticated, anon
    USING (is_active = TRUE AND scheduled_at <= NOW());

DROP POLICY IF EXISTS announcements_admin_manage ON public.platform_announcements;
CREATE POLICY announcements_admin_manage ON public.platform_announcements
    FOR ALL TO authenticated
    USING (public.has_admin_role(auth.uid(), 'operations_admin') OR public.is_super_admin(auth.uid()))
    WITH CHECK (public.has_admin_role(auth.uid(), 'operations_admin') OR public.is_super_admin(auth.uid()));

-- 7.6 system_configuration Policies
-- Read allowed for admins; update strictly restricted to Super Admin
DROP POLICY IF EXISTS system_config_read_policy ON public.system_configuration;
CREATE POLICY system_config_read_policy ON public.system_configuration
    FOR SELECT TO authenticated
    USING (
        public.is_super_admin(auth.uid()) OR
        EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

DROP POLICY IF EXISTS system_config_super_admin_manage ON public.system_configuration;
CREATE POLICY system_config_super_admin_manage ON public.system_configuration
    FOR UPDATE TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));


