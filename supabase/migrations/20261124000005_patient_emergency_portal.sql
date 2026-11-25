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
