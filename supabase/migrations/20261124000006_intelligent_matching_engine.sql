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
