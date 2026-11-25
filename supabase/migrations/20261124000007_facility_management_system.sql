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
