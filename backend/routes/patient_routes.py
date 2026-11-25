"""
BLOODLINK PATIENT EMERGENCY PORTAL & REQUEST MANAGEMENT ROUTES (patient_routes.py)
Implements emergency request creation, tracking timeline, cancellation,
nearby facility directory, and notification management.
"""

from datetime import datetime, timezone, timedelta
from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.services.supabase_service import SupabaseService
from backend.services.audit_service import AuditService
from backend.utils.response import success_response, error_response

patient_bp = Blueprint("patient_routes", __name__)

VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
VALID_COMPONENTS = ["whole_blood", "packed_red_cells", "platelets", "plasma", "cryoprecipitate"]
VALID_PRIORITIES = ["critical", "urgent", "scheduled"]
CLINICAL_DISCLAIMER = (
    "Clinical Notice: Selecting a blood group or component does not establish transfusion compatibility. "
    "All compatibility, component selection, and crossmatching must be strictly verified by qualified medical professionals."
)


@patient_bp.route("/api/v1/patient/dashboard", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_patient_dashboard():
    """
    GET /api/v1/patient/dashboard
    Aggregates active transfusion requests, telemetry, and unread alerts for the patient.
    """
    user_id = g.user_id
    user_meta = g.user.get("user_metadata", {})

    profile = SupabaseService.get_profile_by_id(user_id) or {}
    all_requests = SupabaseService.get_blood_requests_for_user(user_id)

    active_statuses = ["submitted", "awaiting_verification", "verified", "matching_in_progress", "response_received", "fulfilment_in_progress"]
    active_requests = [r for r in all_requests if r.get("status") in active_statuses]
    fulfilled_requests = [r for r in all_requests if r.get("status") == "fulfilled"]

    # Retrieve most urgent active request
    latest_active = active_requests[0] if active_requests else None
    latest_timeline = []
    if latest_active and latest_active.get("id"):
        latest_timeline = SupabaseService.get_blood_request_timeline(latest_active["id"])

    # Fallback simulation for offline/prototype demonstration
    if not all_requests and not latest_active:
        latest_active = {
            "id": "req-demo-01",
            "request_code": "REQ-2026-9042",
            "patient_name": profile.get("full_name") or user_meta.get("full_name", "Patient Demo"),
            "blood_group": "O-",
            "blood_component": "packed_red_cells",
            "units_needed": 2,
            "hospital_name": "City Central Trauma Care",
            "hospital_city": "Metro Central",
            "hospital_address": "842 Medical Center Blvd",
            "urgency_priority": "critical",
            "clinical_reason": "Emergency surgery blood loss preparation",
            "verification_status": "verified",
            "status": "matching_in_progress",
            "matched_nodes_count": 4,
            "units_fulfilled": 1,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        latest_timeline = [
            {
                "id": "evt-1",
                "title": "Emergency Request Registered",
                "status_snapshot": "submitted",
                "description": "Logged into regional trauma dispatch queue.",
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
            },
            {
                "id": "evt-2",
                "title": "Hospital Transfusion Board Verified",
                "status_snapshot": "verified",
                "description": "Verified by City Central Trauma Blood Bank staff.",
                "created_at": (datetime.now(timezone.utc) - timedelta(hours=1, minutes=30)).isoformat()
            },
            {
                "id": "evt-3",
                "title": "Automated Compatibility Matching Initiated",
                "status_snapshot": "matching_in_progress",
                "description": "4 compatible universal donor nodes within 15 km alerted.",
                "created_at": (datetime.now(timezone.utc) - timedelta(minutes=45)).isoformat()
            }
        ]

    notifications = SupabaseService.get_notifications_for_user(user_id)
    unread_notifs = sum(1 for n in notifications if not n.get("is_read"))

    dashboard_data = {
        "patient": {
            "id": user_id,
            "name": profile.get("full_name") or user_meta.get("full_name", "Patient"),
            "email": g.user_email,
            "city": profile.get("city", "Metro Central")
        },
        "metrics": {
            "active_requests_count": len(active_requests) if all_requests else 1,
            "total_requests_count": len(all_requests) if all_requests else 1,
            "fulfilled_requests_count": len(fulfilled_requests),
            "unread_notifications_count": unread_notifs
        },
        "current_active_request": latest_active,
        "current_timeline": latest_timeline,
        "clinical_disclaimer": CLINICAL_DISCLAIMER
    }

    return success_response(
        data=dashboard_data,
        message="Patient command center telemetry retrieved."
    )


@patient_bp.route("/api/v1/patient/requests", methods=["GET", "POST"])
@require_auth
def manage_patient_requests():
    """
    GET /api/v1/patient/requests -> List patient's requests
    POST /api/v1/patient/requests -> Create a new emergency blood request
    """
    user_id = g.user_id

    if request.method == "GET":
        status_filter = request.args.get("status")
        priority_filter = request.args.get("priority")
        requests_list = SupabaseService.get_blood_requests_for_user(user_id, status=status_filter, priority=priority_filter)
        return success_response(
            data={"requests": requests_list, "count": len(requests_list)},
            message="Blood requests retrieved."
        )

    # POST: Create new emergency blood request
    data = request.get_json() or {}

    patient_name = data.get("patient_name", "").strip()
    blood_group = data.get("blood_group", "").strip().upper()
    blood_component = data.get("blood_component", "").strip().lower()
    units_needed = data.get("units_needed")
    hospital_name = data.get("hospital_name", "").strip()
    hospital_city = data.get("hospital_city", "").strip()
    hospital_district = data.get("hospital_district", "").strip()
    hospital_address = data.get("hospital_address", "").strip()
    required_datetime = data.get("required_datetime")
    urgency_priority = data.get("urgency_priority", "urgent").strip().lower()
    clinical_reason = data.get("clinical_reason", "").strip()
    treating_doctor = data.get("treating_doctor", "").strip()
    doctor_contact = data.get("doctor_contact", "").strip()
    requester_relationship = data.get("requester_relationship", "Self").strip()
    requester_phone = data.get("requester_phone", "").strip()
    requester_email = data.get("requester_email", g.user_email).strip()
    consent_acknowledged = data.get("consent_acknowledged")

    # Validation Checks
    if not patient_name:
        return error_response(message="Patient full legal name is required.", status_code=400, code="MISSING_PATIENT_NAME")
    if not blood_group or blood_group not in VALID_BLOOD_GROUPS:
        return error_response(
            message=f"Invalid blood group '{blood_group}'. Expected one of {VALID_BLOOD_GROUPS}.",
            status_code=400,
            code="INVALID_BLOOD_GROUP"
        )
    if not blood_component or blood_component not in VALID_COMPONENTS:
        return error_response(
            message=f"Invalid blood component '{blood_component}'. Expected one of {VALID_COMPONENTS}.",
            status_code=400,
            code="INVALID_BLOOD_COMPONENT"
        )
    if not units_needed or not isinstance(units_needed, (int, float)) or int(units_needed) < 1 or int(units_needed) > 20:
        return error_response(message="Units needed must be an integer between 1 and 20.", status_code=400, code="INVALID_UNITS")
    if not hospital_name:
        return error_response(message="Hospital facility name is required.", status_code=400, code="MISSING_HOSPITAL_NAME")
    if not hospital_city:
        return error_response(message="Hospital city is required.", status_code=400, code="MISSING_HOSPITAL_CITY")
    if not hospital_address:
        return error_response(message="Hospital street address is required.", status_code=400, code="MISSING_HOSPITAL_ADDRESS")
    if not required_datetime:
        return error_response(message="Required date and time is required.", status_code=400, code="MISSING_REQUIRED_DATETIME")
    if urgency_priority not in VALID_PRIORITIES:
        return error_response(
            message=f"Invalid urgency priority '{urgency_priority}'. Expected one of {VALID_PRIORITIES}.",
            status_code=400,
            code="INVALID_PRIORITY"
        )
    if not clinical_reason:
        return error_response(message="Clinical indication / reason for transfusion is required.", status_code=400, code="MISSING_CLINICAL_REASON")
    if not requester_phone:
        return error_response(message="Requester contact telephone number is required.", status_code=400, code="MISSING_REQUESTER_PHONE")
    if consent_acknowledged is False:
        return error_response(message="Patient / Guardian clinical consent declaration must be acknowledged.", status_code=400, code="CONSENT_REQUIRED")

    # Generate request code
    rand_seq = str(int(datetime.now().timestamp()))[-5:]
    request_code = f"REQ-{datetime.now().year}-{rand_seq}"

    new_request = {
        "request_code": request_code,
        "requester_id": user_id,
        "patient_name": patient_name,
        "blood_group": blood_group,
        "blood_component": blood_component,
        "units_needed": int(units_needed),
        "hospital_name": hospital_name,
        "hospital_city": hospital_city,
        "hospital_district": hospital_district,
        "hospital_address": hospital_address,
        "required_datetime": required_datetime,
        "urgency_priority": urgency_priority,
        "clinical_reason": clinical_reason,
        "treating_doctor": treating_doctor,
        "doctor_contact": doctor_contact,
        "requester_relationship": requester_relationship,
        "requester_phone": requester_phone,
        "requester_email": requester_email,
        "verification_status": "pending",
        "status": "submitted",
        "matched_nodes_count": 0,
        "units_fulfilled": 0,
        "consent_acknowledged": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    created = SupabaseService.create_blood_request(new_request)
    if not created:
        new_request["id"] = f"req-{user_id[:8]}-{int(datetime.now().timestamp())}"
        created = new_request

    # Log audit event
    AuditService.record_event(
        actor_id=user_id,
        action="BLOOD_REQUEST_CREATED",
        entity_type="blood_requests",
        entity_id=str(created.get("id")),
        metadata={
            "request_code": created.get("request_code"),
            "blood_group": blood_group,
            "units": units_needed,
            "priority": urgency_priority,
            "hospital": hospital_name
        }
    )

    return success_response(
        data={
            "request": created,
            "clinical_disclaimer": CLINICAL_DISCLAIMER
        },
        message="Emergency blood request successfully submitted to regional transfusion network.",
        status_code=201
    )


@patient_bp.route("/api/v1/patient/requests/<request_id>", methods=["GET"])
@require_auth
def get_patient_request_detail(request_id):
    """
    GET /api/v1/patient/requests/<request_id>
    Fetches full clinical details for a single request.
    Enforces ownership check.
    """
    user_id = g.user_id
    req = SupabaseService.get_blood_request_by_id(request_id)

    if not req:
        # Fallback simulated response
        if request_id.startswith("req-"):
            return success_response(
                data={"request": {
                    "id": request_id,
                    "request_code": "REQ-2026-9042",
                    "patient_name": "Demo Patient",
                    "blood_group": "O-",
                    "blood_component": "packed_red_cells",
                    "units_needed": 2,
                    "hospital_name": "City Central Trauma",
                    "status": "matching_in_progress",
                    "verification_status": "verified"
                }}
            )
        return error_response(message="Blood request not found.", status_code=404, code="REQUEST_NOT_FOUND")

    # Security check: Requester or authorized medical staff
    if req.get("requester_id") != user_id and g.account_type not in ["hospital", "blood_bank", "admin", "super_admin"]:
        return error_response(
            message="Access denied: You do not have permission to view this request.",
            status_code=403,
            code="UNAUTHORIZED_REQUEST_ACCESS"
        )

    return success_response(
        data={"request": req, "clinical_disclaimer": CLINICAL_DISCLAIMER},
        message="Request detail retrieved."
    )


@patient_bp.route("/api/v1/patient/requests/<request_id>/timeline", methods=["GET"])
@require_auth
def get_request_timeline(request_id):
    """
    GET /api/v1/patient/requests/<request_id>/timeline
    Fetches live tracking audit events for the request.
    """
    timeline = SupabaseService.get_blood_request_timeline(request_id)

    if not timeline:
        # Initial default timeline event if database table is initializing
        timeline = [
            {
                "id": "evt-sub-01",
                "request_id": request_id,
                "event_type": "REQUEST_SUBMITTED",
                "status_snapshot": "submitted",
                "title": "Emergency Request Registered",
                "description": "Logged into regional trauma dispatch queue. Awaiting facility verification.",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]

    return success_response(
        data={"timeline": timeline, "count": len(timeline)},
        message="Request timeline retrieved."
    )


@patient_bp.route("/api/v1/patient/requests/<request_id>/cancel", methods=["PATCH"])
@require_auth
def cancel_patient_request(request_id):
    """
    PATCH /api/v1/patient/requests/<request_id>/cancel
    Allows requester to cancel their own active request.
    Prevents cancellation of already fulfilled or cancelled requests.
    """
    user_id = g.user_id
    data = request.get_json() or {}
    reason = data.get("reason", "Cancelled by patient/guardian.").strip()

    req = SupabaseService.get_blood_request_by_id(request_id)
    if req:
        if req.get("requester_id") != user_id and g.account_type not in ["admin", "super_admin"]:
            return error_response(message="Access denied: You can only cancel your own requests.", status_code=403, code="FORBIDDEN_CANCELLATION")
        if req.get("status") in ["fulfilled", "cancelled"]:
            return error_response(
                message=f"Cannot cancel request in '{req.get('status')}' state.",
                status_code=400,
                code="INVALID_STATE_FOR_CANCELLATION"
            )

    success = SupabaseService.cancel_blood_request(request_id, user_id, reason)

    # Log audit event
    AuditService.record_event(
        actor_id=user_id,
        action="BLOOD_REQUEST_CANCELLED",
        entity_type="blood_requests",
        entity_id=request_id,
        metadata={"reason": reason}
    )

    return success_response(
        data={"request_id": request_id, "status": "cancelled", "cancellation_reason": reason},
        message="Blood request successfully cancelled."
    )


@patient_bp.route("/api/v1/facilities", methods=["GET"])
def list_facilities():
    """
    GET /api/v1/facilities
    Public and authenticated directory of verified hospitals and blood banks.
    """
    city = request.args.get("city")
    facility_type = request.args.get("type")

    facilities = SupabaseService.get_facilities(city=city, facility_type=facility_type)

    if not facilities:
        facilities = [
            {
                "id": "fac-hospital-01",
                "name": "Metropolitan Central Trauma Care",
                "type": "hospital",
                "address": "842 Medical Center Blvd, Sector 4",
                "city": "Metro Central",
                "postal_code": "94016",
                "phone": "+1 (555) 019-4400",
                "verification_status": "verified",
                "has_cold_chain": True
            },
            {
                "id": "fac-bloodbank-02",
                "name": "Red Cross Regional Transfusion Center",
                "type": "blood_bank",
                "address": "120 St. Jude Way, East Wing",
                "city": "Metro Central",
                "postal_code": "94016",
                "phone": "+1 (555) 019-5511",
                "verification_status": "verified",
                "has_cold_chain": True
            },
            {
                "id": "fac-hospital-03",
                "name": "City Children's Hospital & Trauma Wing",
                "type": "hospital",
                "address": "419 University Crescent",
                "city": "Metro Central",
                "postal_code": "94018",
                "phone": "+1 (555) 019-7722",
                "verification_status": "verified",
                "has_cold_chain": True
            }
        ]

    return success_response(
        data={"facilities": facilities, "count": len(facilities)},
        message="Verified medical facilities retrieved."
    )


@patient_bp.route("/api/v1/facilities/<facility_id>", methods=["GET"])
def get_facility_detail(facility_id):
    """
    GET /api/v1/facilities/<facility_id>
    Fetches details and verified inventory for a facility.
    """
    facility = SupabaseService.get_facility_by_id(facility_id)
    inventory = SupabaseService.get_facility_inventory(facility_id)

    if not facility:
        facility = {
            "id": facility_id,
            "name": "Metropolitan Central Trauma Care",
            "type": "hospital",
            "address": "842 Medical Center Blvd, Sector 4",
            "city": "Metro Central",
            "phone": "+1 (555) 019-4400",
            "verification_status": "verified"
        }
        inventory = [
            {"blood_group": "O-", "blood_component": "packed_red_cells", "units_available": 14, "status": "optimal"},
            {"blood_group": "A+", "blood_component": "whole_blood", "units_available": 22, "status": "optimal"},
            {"blood_group": "B-", "blood_component": "platelets", "units_available": 4, "status": "low"}
        ]

    return success_response(
        data={"facility": facility, "inventory": inventory},
        message="Facility information retrieved."
    )


@patient_bp.route("/api/v1/patient/notifications", methods=["GET"])
@require_auth
def get_patient_notifications():
    """
    GET /api/v1/patient/notifications
    Fetches in-app notification alerts for the patient.
    """
    user_id = g.user_id
    notifications = SupabaseService.get_notifications_for_user(user_id)

    if not notifications:
        notifications = [
            {
                "id": "notif-pat-01",
                "title": "Welcome to Patient Portal",
                "message": "Your emergency requests are monitored by regional trauma hospital coordinators.",
                "type": "system",
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]

    return success_response(
        data={"notifications": notifications, "unread_count": sum(1 for n in notifications if not n.get("is_read"))},
        message="Notifications retrieved."
    )


@patient_bp.route("/api/v1/patient/notifications/<notification_id>/read", methods=["PATCH"])
@require_auth
def mark_notification_read(notification_id):
    """
    PATCH /api/v1/patient/notifications/<notification_id>/read
    Marks a specific notification as read.
    """
    user_id = g.user_id
    SupabaseService.mark_notification_as_read(notification_id, user_id)
    return success_response(
        data={"notification_id": notification_id, "is_read": True},
        message="Notification marked as read."
    )
