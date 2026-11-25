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
