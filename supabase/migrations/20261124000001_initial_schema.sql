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
