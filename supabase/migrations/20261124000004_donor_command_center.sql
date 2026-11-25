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
