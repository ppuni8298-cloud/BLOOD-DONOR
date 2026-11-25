"""
BLOODLINK ADVANCED HOSPITAL & BLOOD BANK MANAGEMENT ROUTES (facility_routes.py)
Endpoints for:
- Hospital operations: request review, clinical verification, cold-chain reserve inspection, transfusion fulfilment
- Blood bank operations: component batch registration, shelf life calculation, laboratory QC, dispatch, expiry monitoring
- Cross-facility coordination: reservation allocation, cold-chain dispatch (DSP-YYYY-XXXXX), transit tracking
- Facility staff management, real database analytics, and immutable audit logging
"""

from datetime import datetime, timezone, timedelta
from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.services.supabase_service import SupabaseService
from backend.services.audit_service import AuditService
from backend.services.compatibility_service import CLINICAL_DISCLAIMER
from backend.utils.response import success_response, error_response

facility_bp = Blueprint("facility_routes", __name__)

VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
VALID_COMPONENTS = ["whole_blood", "packed_red_cells", "platelets", "plasma", "cryoprecipitate"]

COMPONENT_SHELF_LIFE_DAYS = {
    "whole_blood": 35,
    "packed_red_cells": 42,
    "platelets": 5,        # 5 days at 20-24°C with continuous agitation
    "plasma": 365,         # 365 days frozen at <= -18°C
    "cryoprecipitate": 365 # 365 days frozen at <= -18°C
}

COMPONENT_TEMP_CELSIUS = {
    "whole_blood": 4.0,
    "packed_red_cells": 4.0,
    "platelets": 22.0,
    "plasma": -20.0,
    "cryoprecipitate": -20.0
}


def _verify_facility_access(required_types):
    """Verifies that the authenticated actor belongs to authorized facility types or admin."""
    user_type = getattr(g, "account_type", None)
    if user_type not in required_types and user_type not in ["admin", "super_admin"]:
        return False
    return True


# =============================================================================
# 1. HOSPITAL COMMAND CENTER ENDPOINTS
# =============================================================================

@facility_bp.route("/api/v1/hospital/dashboard", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_hospital_dashboard():
    """
    GET /api/v1/hospital/dashboard
    Returns real hospital operational metrics: active emergency requests,
    unverified requests, critical trauma cases, local inventory reserves, and alerts.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Hospital facility role required.", status_code=403, code="FORBIDDEN_HOSPITAL_ROLE")

    hospital_id = g.user_id
    metrics = SupabaseService.get_hospital_dashboard_metrics(hospital_id)
    return success_response(data=metrics, message="Hospital dashboard operational metrics retrieved.")


@facility_bp.route("/api/v1/hospital/requests", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_hospital_requests():
    """
    GET /api/v1/hospital/requests
    Lists emergency blood requests assigned to or in the municipality of this hospital.
    Query params: status, priority, verification_status.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Hospital facility role required.", status_code=403, code="FORBIDDEN_HOSPITAL_ROLE")

    hospital_id = g.user_id
    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")
    verification_filter = request.args.get("verification_status")

    requests_list = SupabaseService.get_hospital_emergency_requests(
        hospital_id=hospital_id,
        status=status_filter,
        priority=priority_filter,
        verification_status=verification_filter
    )
    return success_response(
        data={"requests": requests_list, "total": len(requests_list)},
        message="Hospital emergency blood requests retrieved."
    )


@facility_bp.route("/api/v1/hospital/requests/<request_id>/verify", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def verify_patient_request(request_id):
    """
    POST /api/v1/hospital/requests/<request_id>/verify
    Authorized hospital medical officer verifies clinical admission, crossmatch need,
    and advances request to 'verified' or marks 'rejected'.
    Patients/guardians are strictly forbidden from self-verifying.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Only authorized hospital staff can verify requests.", status_code=403, code="FORBIDDEN_VERIFICATION")

    body = request.get_json(silent=True) or {}
    action = body.get("action")  # 'verified', 'rejected', 'pending_info'
    notes = body.get("notes", "").strip()

    if action not in ["verified", "rejected", "pending_info"]:
        return error_response(
            message="Invalid verification action. Must be 'verified', 'rejected', or 'pending_info'.",
            status_code=400,
            code="INVALID_VERIFICATION_ACTION"
        )

    success, result_or_err = SupabaseService.verify_hospital_request(
        request_id=request_id,
        hospital_id=g.user_id,
        verified_by_user_id=g.user_id,
        verification_action=action,
        notes=notes
    )

    if not success:
        return error_response(message=result_or_err, status_code=400, code="VERIFICATION_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action=f"REQUEST_{action.upper()}",
        entity_type="blood_requests",
        entity_id=request_id,
        metadata={"action": action, "notes": notes, "hospital_id": g.user_id}
    )

    return success_response(data=result_or_err, message=f"Blood request clinical verification updated to '{action}'.")


@facility_bp.route("/api/v1/hospital/inventory", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_hospital_inventory():
    """
    GET /api/v1/hospital/inventory
    Retrieves cold-chain trauma reserve inventory batches currently held at this hospital.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Hospital facility role required.", status_code=403, code="FORBIDDEN_HOSPITAL_ROLE")

    hospital_id = g.user_id
    batches = SupabaseService.get_facility_component_batches(hospital_id)
    return success_response(data={"inventory": batches, "total": len(batches)}, message="Hospital inventory retrieved.")


@facility_bp.route("/api/v1/hospital/fulfilment", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def record_transfusion_fulfilment():
    """
    POST /api/v1/hospital/fulfilment
    Records hospital transfusion completion: crossmatch confirmation, administering doctor,
    batch barcode, and sets blood request to 'fulfilled'.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Hospital facility role required.", status_code=403, code="FORBIDDEN_HOSPITAL_ROLE")

    body = request.get_json(silent=True) or {}
    request_id = body.get("request_id")
    batch_id = body.get("batch_id")
    crossmatch_result = body.get("crossmatch_result")
    administered_by = body.get("administered_by") or g.user_id
    notes = body.get("notes", "")

    if not request_id or not crossmatch_result:
        return error_response(message="Missing required fields: request_id and crossmatch_result are required.", status_code=400, code="MISSING_FIELDS")

    if crossmatch_result not in ["compatible", "incompatible"]:
        return error_response(message="crossmatch_result must be 'compatible' or 'incompatible'.", status_code=400, code="INVALID_CROSSMATCH")

    success, record_or_err = SupabaseService.record_transfusion_fulfilment(
        request_id=request_id,
        hospital_id=g.user_id,
        batch_id=batch_id,
        crossmatch_result=crossmatch_result,
        administered_by=administered_by,
        notes=notes
    )

    if not success:
        return error_response(message=record_or_err, status_code=400, code="FULFILMENT_ERROR")

    AuditService.record_event(
        actor_id=g.user_id,
        action="TRANSFUSION_FULFILLED",
        entity_type="fulfilment_records",
        entity_id=record_or_err.get("id"),
        metadata={"request_id": request_id, "crossmatch": crossmatch_result}
    )

    return success_response(data=record_or_err, message="Transfusion fulfilment and crossmatch recorded successfully.", status_code=201)


# =============================================================================
# 2. BLOOD BANK COMMAND CENTER ENDPOINTS
# =============================================================================

@facility_bp.route("/api/v1/bloodbank/dashboard", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_bloodbank_dashboard():
    """
    GET /api/v1/bloodbank/dashboard
    Returns real blood bank operational metrics: total reserve units, near-expiry count,
    critical shortages, pending quality checks, active reservations, and dispatch volume.
    """
    if not _verify_facility_access(["blood_bank"]):
        return error_response(message="Access denied: Blood bank facility role required.", status_code=403, code="FORBIDDEN_BLOOD_BANK_ROLE")

    bank_id = g.user_id
    metrics = SupabaseService.get_bloodbank_dashboard_metrics(bank_id)
    return success_response(data=metrics, message="Blood bank dashboard operational metrics retrieved.")


@facility_bp.route("/api/v1/bloodbank/inventory", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_bloodbank_inventory():
    """
    GET /api/v1/bloodbank/inventory
    Lists traceable component batches held in cold storage, filterable by group,
    component, status (available, under_testing, quarantined, reserved, etc.).
    """
    if not _verify_facility_access(["blood_bank"]):
        return error_response(message="Access denied: Blood bank facility role required.", status_code=403, code="FORBIDDEN_BLOOD_BANK_ROLE")

    bank_id = g.user_id
    group_filter = request.args.get("blood_group")
    comp_filter = request.args.get("component")
    status_filter = request.args.get("status")

    batches = SupabaseService.get_facility_component_batches(
        facility_id=bank_id,
        blood_group=group_filter,
        component=comp_filter,
        status=status_filter
    )
    return success_response(data={"batches": batches, "total": len(batches)}, message="Blood bank inventory batches retrieved.")


@facility_bp.route("/api/v1/bloodbank/inventory", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def register_component_batch():
    """
    POST /api/v1/bloodbank/inventory
    Registers a newly collected or processed blood component batch.
    Computes shelf life automatically based on component-specific clinical guidelines.
    Prevents negative stock and enforces input validation.
    """
    if not _verify_facility_access(["blood_bank", "hospital"]):
        return error_response(message="Access denied: Facility role required to register inventory.", status_code=403, code="FORBIDDEN_INVENTORY_ACTION")

    body = request.get_json(silent=True) or {}
    blood_group = body.get("blood_group")
    component = body.get("blood_component")
    volume_ml = body.get("volume_ml", 450)
    units_count = body.get("units_count", 1.0)
    collection_date_str = body.get("collection_date") or datetime.now(timezone.utc).date().isoformat()
    storage_location = body.get("storage_location", "Main Cold Room - Shelf A1")
    source_donation_id = body.get("source_donation_id")

    if blood_group not in VALID_BLOOD_GROUPS:
        return error_response(message=f"Invalid blood group '{blood_group}'. Expected one of {VALID_BLOOD_GROUPS}.", status_code=400, code="INVALID_BLOOD_GROUP")
    if component not in VALID_COMPONENTS:
        return error_response(message=f"Invalid component '{component}'. Expected one of {VALID_COMPONENTS}.", status_code=400, code="INVALID_COMPONENT")

    try:
        units_float = float(units_count)
        vol_int = int(volume_ml)
        if units_float <= 0 or vol_int <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return error_response(message="Volume and units count must be positive numbers.", status_code=400, code="INVALID_QUANTITY")

    # Component-specific shelf life calculation
    try:
        coll_date = datetime.strptime(str(collection_date_str)[:10], "%Y-%m-%d").date()
    except Exception:
        coll_date = datetime.now(timezone.utc).date()

    shelf_life_days = COMPONENT_SHELF_LIFE_DAYS.get(component, 35)
    expiry_dt = datetime(coll_date.year, coll_date.month, coll_date.day, 23, 59, 59, tzinfo=timezone.utc) + timedelta(days=shelf_life_days)
    target_temp = COMPONENT_TEMP_CELSIUS.get(component, 4.0)

    batch_payload = {
        "facility_id": g.user_id,
        "facility_type": g.account_type if g.account_type in ["blood_bank", "hospital"] else "blood_bank",
        "blood_group": blood_group,
        "blood_component": component,
        "volume_ml": vol_int,
        "units_count": units_float,
        "collection_date": coll_date.isoformat(),
        "expiry_date": expiry_dt.isoformat(),
        "storage_location": storage_location,
        "storage_temperature_celsius": target_temp,
        "status": "under_testing", # Newly collected batches are held under testing until QC
        "screening_status": "pending",
        "qc_status": "pending",
        "source_donation_id": source_donation_id
    }

    created_batch = SupabaseService.add_component_batch(batch_payload, actor_id=g.user_id)

    AuditService.record_event(
        actor_id=g.user_id,
        action="COMPONENT_BATCH_REGISTERED",
        entity_type="component_batches",
        entity_id=created_batch.get("id"),
        metadata={
            "batch_number": created_batch.get("batch_number"),
            "blood_group": blood_group,
            "component": component,
            "units": units_float
        }
    )

    return success_response(data=created_batch, message="Component batch registered successfully into cold-chain intake.", status_code=201)


@facility_bp.route("/api/v1/bloodbank/inventory/<batch_id>/qc", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def submit_laboratory_qc(batch_id):
    """
    POST /api/v1/bloodbank/inventory/<batch_id>/qc
    Submits laboratory infectious disease screening (HIV, HBV, HCV, Syphilis, Malaria).
    If passed, batch status advances to 'available'. If failed, batch is quarantined or discarded.
    """
    if not _verify_facility_access(["blood_bank", "hospital"]):
        return error_response(message="Access denied: Facility role required for quality control.", status_code=403, code="FORBIDDEN_QC_ACTION")

    body = request.get_json(silent=True) or {}
    hiv = body.get("hiv_screen", "negative")
    hbv = body.get("hbv_screen", "negative")
    hcv = body.get("hcv_screen", "negative")
    syphilis = body.get("syphilis_screen", "negative")
    malaria = body.get("malaria_screen", "negative")
    overall = body.get("overall_result")  # 'passed', 'failed'
    notes = body.get("laboratory_notes", "")

    if overall not in ["passed", "failed"]:
        return error_response(message="overall_result must be 'passed' or 'failed'.", status_code=400, code="INVALID_QC_RESULT")

    qc_payload = {
        "hiv_screen": hiv,
        "hbv_screen": hbv,
        "hcv_screen": hcv,
        "syphilis_screen": syphilis,
        "malaria_screen": malaria,
        "overall_result": overall,
        "laboratory_notes": notes
    }

    success, updated_batch = SupabaseService.update_batch_qc_status(batch_id, qc_payload, actor_id=g.user_id)
    if not success:
        return error_response(message="Failed to record QC status.", status_code=400, code="QC_RECORD_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action=f"LAB_QC_{overall.upper()}",
        entity_type="component_batches",
        entity_id=batch_id,
        metadata={"overall_result": overall, "notes": notes}
    )

    return success_response(data=updated_batch, message=f"Laboratory QC status recorded as '{overall}'.")


@facility_bp.route("/api/v1/bloodbank/inventory/<batch_id>/discard", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def discard_inventory_batch(batch_id):
    """
    POST /api/v1/bloodbank/inventory/<batch_id>/discard
    Records disposal/discard of expired, contaminated, or damaged blood units.
    """
    if not _verify_facility_access(["blood_bank", "hospital"]):
        return error_response(message="Access denied: Facility role required to discard stock.", status_code=403, code="FORBIDDEN_DISCARD_ACTION")

    body = request.get_json(silent=True) or {}
    reason = body.get("reason", "Expired or failed quality-control threshold.")

    success, result = SupabaseService.discard_component_batch(batch_id, reason, actor_id=g.user_id)
    if not success:
        return error_response(message="Failed to discard batch.", status_code=400, code="DISCARD_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action="BATCH_DISCARDED",
        entity_type="component_batches",
        entity_id=batch_id,
        metadata={"reason": reason}
    )

    return success_response(data=result, message="Batch discarded and removed from active reserves.")


# =============================================================================
# 3. DISPATCH & COLD-CHAIN TRANSIT COORDINATION
# =============================================================================

@facility_bp.route("/api/v1/bloodbank/reservations/<reservation_id>/dispatch", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def dispatch_reservation(reservation_id):
    """
    POST /api/v1/bloodbank/reservations/<reservation_id>/dispatch
    Dispatches reserved cold-chain blood units from blood bank to destination hospital.
    Generates traceable dispatch code DSP-YYYY-XXXXX and logs departure temperature.
    """
    if not _verify_facility_access(["blood_bank", "hospital"]):
        return error_response(message="Access denied: Facility role required to dispatch units.", status_code=403, code="FORBIDDEN_DISPATCH_ACTION")

    body = request.get_json(silent=True) or {}
    courier_name = body.get("courier_name", "Emergency Medical Courier Service")
    transport_box_id = body.get("transport_box_id", "COLDBOX-01")
    departure_temp = float(body.get("departure_temp_celsius", 4.0))

    success, dispatch_record = SupabaseService.dispatch_inventory_reservation(
        reservation_id=reservation_id,
        courier_name=courier_name,
        transport_box_id=transport_box_id,
        departure_temp=departure_temp,
        actor_id=g.user_id
    )

    if not success:
        return error_response(message=dispatch_record, status_code=400, code="DISPATCH_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action="COLD_CHAIN_DISPATCHED",
        entity_type="dispatch_records",
        entity_id=dispatch_record.get("id"),
        metadata={
            "dispatch_code": dispatch_record.get("dispatch_code"),
            "reservation_id": reservation_id,
            "courier": courier_name
        }
    )

    return success_response(data=dispatch_record, message="Blood units dispatched under cold-chain protocol.", status_code=201)


@facility_bp.route("/api/v1/hospital/dispatches/<dispatch_id>/receive", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def receive_dispatched_units(dispatch_id):
    """
    POST /api/v1/hospital/dispatches/<dispatch_id>/receive
    Hospital intake staff confirms courier delivery, logs receiving temperature,
    and accepts units into the trauma blood bank.
    """
    if not _verify_facility_access(["hospital"]):
        return error_response(message="Access denied: Hospital facility role required to receive units.", status_code=403, code="FORBIDDEN_HOSPITAL_ROLE")

    body = request.get_json(silent=True) or {}
    receiving_temp = float(body.get("receiving_temp_celsius", 4.2))
    notes = body.get("notes", "Cold-chain seal inspected and verified intact.")

    success, record = SupabaseService.receive_dispatched_units(
        dispatch_id=dispatch_id,
        hospital_id=g.user_id,
        receiving_temp=receiving_temp,
        notes=notes
    )

    if not success:
        return error_response(message="Failed to confirm delivery.", status_code=400, code="DELIVERY_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action="COLD_CHAIN_DELIVERED",
        entity_type="dispatch_records",
        entity_id=dispatch_id,
        metadata={"receiving_temp": receiving_temp}
    )

    return success_response(data=record, message="Dispatch delivery confirmed and logged into hospital reserves.")


# =============================================================================
# 4. STOCK ALERTS, STAFF & REPORTS
# =============================================================================

@facility_bp.route("/api/v1/facility/alerts", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_facility_alerts():
    """
    GET /api/v1/facility/alerts
    Returns facility alerts: critical shortages, near-expiry units (<7d), uninspected stock.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Facility role required.", status_code=403, code="FORBIDDEN_FACILITY_ROLE")

    alerts = SupabaseService.get_facility_alerts(g.user_id)
    return success_response(data={"alerts": alerts, "total": len(alerts)}, message="Facility inventory alerts retrieved.")


@facility_bp.route("/api/v1/facility/staff", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_facility_staff():
    """
    GET /api/v1/facility/staff
    Lists authorized medical staff and their assigned facility roles.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Facility role required.", status_code=403, code="FORBIDDEN_FACILITY_ROLE")

    staff = SupabaseService.get_facility_staff(g.user_id)
    return success_response(data={"staff": staff, "total": len(staff)}, message="Facility staff members retrieved.")


@facility_bp.route("/api/v1/facility/staff", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def add_facility_staff():
    """
    POST /api/v1/facility/staff
    Facility administrator provisions a new staff member with assigned permissions.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Facility administrator role required.", status_code=403, code="FORBIDDEN_STAFF_MANAGEMENT")

    body = request.get_json(silent=True) or {}
    email = body.get("email")
    staff_role = body.get("staff_role")
    department = body.get("department", "Transfusion Medicine")
    license_number = body.get("license_number")

    if not email or not staff_role:
        return error_response(message="email and staff_role are required.", status_code=400, code="MISSING_FIELDS")

    success, staff_record = SupabaseService.add_facility_staff(
        facility_id=g.user_id,
        facility_type=g.account_type,
        email=email,
        staff_role=staff_role,
        department=department,
        license_number=license_number,
        invited_by=g.user_id
    )

    if not success:
        return error_response(message=staff_record, status_code=400, code="STAFF_INVITATION_ERROR")

    return success_response(data=staff_record, message="Facility staff member provisioned successfully.", status_code=201)


@facility_bp.route("/api/v1/facility/reports", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_facility_reports():
    """
    GET /api/v1/facility/reports
    Returns aggregated clinical transfusion and inventory analytics for reporting and audit export.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Facility role required.", status_code=403, code="FORBIDDEN_FACILITY_ROLE")

    reports_data = SupabaseService.get_facility_reports(g.user_id, facility_type=g.account_type)
    return success_response(data=reports_data, message="Facility clinical and inventory reports retrieved.")


@facility_bp.route("/api/v1/facility/donations", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_facility_donations():
    """
    GET /api/v1/facility/donations
    Lists donation records collected at or submitted to this facility.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Facility role required.", status_code=403, code="FORBIDDEN_FACILITY_ROLE")

    donations = SupabaseService.get_facility_donations(g.user_id)
    return success_response(data={"donations": donations, "total": len(donations)}, message="Facility donation records retrieved.")


@facility_bp.route("/api/v1/facility/donations/<donation_id>/verify", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def verify_facility_donation(donation_id):
    """
    POST /api/v1/facility/donations/<donation_id>/verify
    Authorized facility medical staff verifies an actual donation record.
    """
    if not _verify_facility_access(["hospital", "blood_bank"]):
        return error_response(message="Access denied: Only authorized facility staff can verify donations.", status_code=403, code="FORBIDDEN_DONATION_VERIFY")

    body = request.get_json(silent=True) or {}
    units = float(body.get("units", 1.0))
    notes = body.get("notes", "Medical screening and whole blood phlebotomy verified.")

    success, record = SupabaseService.verify_donation_record(
        donation_id=donation_id,
        facility_id=g.user_id,
        verified_by=g.user_id,
        units=units,
        notes=notes
    )

    if not success:
        return error_response(message="Failed to verify donation record.", status_code=400, code="VERIFICATION_FAILED")

    AuditService.record_event(
        actor_id=g.user_id,
        action="DONATION_VERIFIED",
        entity_type="donations",
        entity_id=donation_id,
        metadata={"verified_by": g.user_id, "units": units}
    )

    return success_response(data=record, message="Donation record verified successfully.")
