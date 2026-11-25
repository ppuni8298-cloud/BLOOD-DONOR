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
