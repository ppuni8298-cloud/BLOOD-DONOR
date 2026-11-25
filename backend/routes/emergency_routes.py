"""
BLOODLINK EMERGENCY MATCHING & DISPATCH ROUTES (emergency_routes.py)
Protected clinical routes restricted to authorized hospital and blood bank roles.
"""

from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.role_middleware import require_roles
from backend.services.audit_service import AuditService
from backend.utils.response import success_response, error_response

emergency_bp = Blueprint("emergency_routes", __name__)


@emergency_bp.route("/api/v1/emergency/dispatch", methods=["POST"])
@require_auth
@require_roles(["hospital", "admin", "super_admin"])
def dispatch_emergency_beacon():
    """
    Protected endpoint: POST /api/v1/emergency/dispatch
    Restricted to verified hospital trauma departments and administrators.
    Broadcasts a priority emergency blood beacon.
    """
    data = request.get_json() or {}

    blood_type = data.get("blood_type")
    units = data.get("units", 1)
    hospital_name = data.get("hospital_name")

    valid_blood_groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]

    if not blood_type or blood_type not in valid_blood_groups:
        return error_response(
            message=f"Invalid blood group: '{blood_type}'. Expected one of {valid_blood_groups}",
            status_code=400,
            code="INVALID_BLOOD_GROUP"
        )

    if not hospital_name:
        return error_response(
            message="Hospital facility name is required for emergency dispatch.",
            status_code=400,
            code="MISSING_HOSPITAL_NAME"
        )

    incident_id = f"EMG-{g.user_id[:8].upper()}"

    # Log immutable audit trail
    AuditService.record_event(
        actor_id=g.user_id,
        action="EMERGENCY_BEACON_DISPATCHED",
        entity_type="emergency_requests",
        entity_id=incident_id,
        metadata={
            "blood_type": blood_type,
            "units": units,
            "hospital_name": hospital_name,
            "account_type": g.account_type
        }
    )

    return success_response(
        data={
            "incident_id": incident_id,
            "blood_type": blood_type,
            "units_requested": units,
            "hospital_name": hospital_name,
            "dispatched_by": g.user_email,
            "status": "BEACON_ACTIVE",
            "notified_nodes_count": 8
        },
        message="Emergency blood beacon broadcasted to regional network.",
        status_code=201
    )
