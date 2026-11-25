"""
BLOODLINK INTELLIGENT MATCHING & DONOR DISCOVERY ROUTES (matching_routes.py)
Endpoints for clinical compatibility matching, privacy-preserving donor discovery,
facility inventory reservations, emergency broadcast invitations, and donor commitments.
"""

from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.services.matching_engine import MatchingEngine
from backend.services.compatibility_service import CompatibilityService, CLINICAL_DISCLAIMER
from backend.services.supabase_service import SupabaseService
from backend.utils.response import success_response, error_response

matching_bp = Blueprint("matching_routes", __name__)


# =============================================================================
# CLINICAL COMPATIBILITY & RULES
# =============================================================================

@matching_bp.route("/api/v1/clinical/compatibility-rules", methods=["GET"])
@rate_limit(limit=120)
def get_compatibility_rules():
    """
    GET /api/v1/clinical/compatibility-rules
    Returns active clinical compatibility matrix metadata, authority, reviewer,
    and statutory clinical disclaimer.
    """
    meta = CompatibilityService.get_active_ruleset_metadata()
    return success_response(
        data=meta,
        message="Active clinical compatibility matrix retrieved."
    )


# =============================================================================
# MATCHING RUN EXECUTION & RESULTS
# =============================================================================

@matching_bp.route("/api/v1/requests/<request_id>/run-matching", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def execute_matching_for_request(request_id):
    """
    POST /api/v1/requests/<request_id>/run-matching
    Executes the intelligent multi-factor matching engine for a blood request.
    Categorizes candidates into potential donors, facility inventory, awaiting responses,
    confirmed responses, and unavailable options.
    """
    body = request.get_json(silent=True) or {}
    search_radius_km = float(body.get("search_radius_km", 25.0))

    try:
        results = MatchingEngine.run_matching_for_request(
            request_id=request_id,
            triggered_by=g.user_id,
            search_radius_km=search_radius_km
        )
        return success_response(
            data=results,
            message="Intelligent matching executed successfully."
        )
    except ValueError as ve:
        err_msg = str(ve)
        status_code = 404 if "not found" in err_msg.lower() else 400
        return error_response(message=err_msg, status_code=status_code, code="MATCHING_ERROR")
    except Exception as e:
        return error_response(
            message=f"Matching execution failed: {str(e)}",
            status_code=500,
            code="MATCHING_EXECUTION_ERROR"
        )


@matching_bp.route("/api/v1/requests/<request_id>/matches", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_matches_for_request(request_id):
    """
    GET /api/v1/requests/<request_id>/matches
    Retrieves matching candidates and discovery progress for a request.
    Donor private info (phone, email, street address) is never exposed.
    """
    try:
        results = MatchingEngine.run_matching_for_request(
            request_id=request_id,
            triggered_by=g.user_id
        )
        return success_response(
            data=results,
            message="Matching options retrieved successfully."
        )
    except ValueError as ve:
        err_msg = str(ve)
        status_code = 404 if "not found" in err_msg.lower() else 400
        return error_response(message=err_msg, status_code=status_code, code="MATCHING_ERROR")
    except Exception as e:
        return error_response(
            message=f"Failed to retrieve matches: {str(e)}",
            status_code=500,
            code="MATCHING_FETCH_ERROR"
        )


# =============================================================================
# DONOR INVITATIONS & RESPONSE MANAGEMENT
# =============================================================================

@matching_bp.route("/api/v1/donor/invitations", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_donor_invitations():
    """
    GET /api/v1/donor/invitations
    Fetches emergency request invitations dispatched to the authenticated donor.
    Query params: status ('pending', 'accepted', 'declined', or 'all').
    """
    donor_id = g.user_id
    status_filter = request.args.get("status")
    invitations = SupabaseService.get_donor_invitations(donor_id=donor_id, status=status_filter)

    return success_response(
        data={
            "invitations": invitations,
            "total": len(invitations)
        },
        message="Donor emergency invitations retrieved."
    )


@matching_bp.route("/api/v1/donor/invitations/<invitation_id>", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_donor_invitation_detail(invitation_id):
    """
    GET /api/v1/donor/invitations/<invitation_id>
    Fetches single invitation details for the donor.
    """
    inv = SupabaseService.get_invitation_by_id(invitation_id)
    if not inv:
        return error_response(message="Invitation not found.", status_code=404, code="NOT_FOUND")

    return success_response(data=inv, message="Invitation retrieved.")


@matching_bp.route("/api/v1/donor/invitations/<invitation_id>/respond", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def respond_to_invitation(invitation_id):
    """
    POST /api/v1/donor/invitations/<invitation_id>/respond
    Accepts or declines an emergency broadcast invitation.
    Prevents duplicate responses and responses to fulfilled or cancelled requests.
    """
    body = request.get_json(silent=True) or {}
    action = body.get("action")
    notes = body.get("response_notes") or body.get("notes")

    if action not in ["accepted", "declined"]:
        return error_response(
            message="Invalid response action. Must be 'accepted' or 'declined'.",
            status_code=400,
            code="INVALID_ACTION"
        )

    success, msg = SupabaseService.respond_to_donor_invitation(
        invitation_id=invitation_id,
        donor_id=g.user_id,
        action=action,
        notes=notes
    )

    if not success:
        return error_response(
            message=msg,
            status_code=400,
            code="RESPONSE_ERROR"
        )

    return success_response(
        data={
            "invitation_id": invitation_id,
            "status": action,
            "notes": notes
        },
        message=f"Invitation response '{action}' recorded successfully."
    )


@matching_bp.route("/api/v1/donor/commitments", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_donor_commitments():
    """
    GET /api/v1/donor/commitments
    Lists active emergency donation commitments accepted by the donor.
    """
    donor_id = g.user_id
    commitments = SupabaseService.get_donor_commitments(donor_id)

    return success_response(
        data={
            "commitments": commitments,
            "total": len(commitments)
        },
        message="Active donor commitments retrieved."
    )


# =============================================================================
# FACILITY INVENTORY RESERVATIONS & REQUEST DIRECTORY
# =============================================================================

@matching_bp.route("/api/v1/facility/matching-requests", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_facility_matching_requests():
    """
    GET /api/v1/facility/matching-requests
    Retrieves active emergency requests relevant to the facility's region and stock.
    """
    facility_id = request.args.get("facility_id", g.user_id)
    city = request.args.get("city")
    requests_list = SupabaseService.get_facility_matching_requests(facility_id=facility_id, city=city)

    return success_response(
        data={
            "requests": requests_list,
            "total": len(requests_list)
        },
        message="Matching emergency requests retrieved for facility."
    )


@matching_bp.route("/api/v1/facility/inventory/reservations", methods=["POST"])
@require_auth
@rate_limit(limit=60)
def create_inventory_reservation():
    """
    POST /api/v1/facility/inventory/reservations
    Atomically creates a time-locked reservation on blood bank/hospital units.
    Prevents race conditions and duplicate allocation.
    """
    body = request.get_json(silent=True) or {}
    inventory_id = body.get("inventory_id")
    request_id = body.get("request_id")
    facility_id = body.get("facility_id") or g.user_id
    units_to_reserve = body.get("units_to_reserve")
    duration_hours = int(body.get("duration_hours", 12))

    if not inventory_id or not request_id or not units_to_reserve:
        return error_response(
            message="Missing required parameters: inventory_id, request_id, and units_to_reserve are required.",
            status_code=400,
            code="MISSING_PARAMETERS"
        )

    try:
        units_int = int(units_to_reserve)
        if units_int <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return error_response(
            message="units_to_reserve must be a positive integer.",
            status_code=400,
            code="INVALID_UNITS"
        )

    try:
        reservation = MatchingEngine.create_inventory_reservation(
            inventory_id=inventory_id,
            request_id=request_id,
            facility_id=facility_id,
            units_to_reserve=units_int,
            confirmed_by=g.user_id,
            reservation_duration_hours=duration_hours
        )
        return success_response(
            data=reservation,
            message="Facility inventory units successfully reserved.",
            status_code=201
        )
    except Exception as e:
        return error_response(
            message=f"Failed to reserve inventory: {str(e)}",
            status_code=400,
            code="RESERVATION_ERROR"
        )


@matching_bp.route("/api/v1/facility/inventory/reservations/<reservation_id>", methods=["DELETE"])
@require_auth
@rate_limit(limit=60)
def release_inventory_reservation(reservation_id):
    """
    DELETE /api/v1/facility/inventory/reservations/<reservation_id>
    Releases an active inventory reservation, unlocking units for general emergency stock.
    """
    try:
        success = MatchingEngine.release_inventory_reservation(
            reservation_id=reservation_id,
            actor_id=g.user_id
        )
        if not success:
            return error_response(
                message="Failed to release reservation. It may already be released or does not exist.",
                status_code=400,
                code="RELEASE_FAILED"
            )

        return success_response(
            data={"reservation_id": reservation_id, "status": "released"},
            message="Inventory reservation released successfully."
        )
    except Exception as e:
        return error_response(
            message=f"Error releasing reservation: {str(e)}",
            status_code=500,
            code="RELEASE_ERROR"
        )


# =============================================================================
# ADMIN / AUDIT MATCHING ANALYTICS
# =============================================================================

@matching_bp.route("/api/v1/admin/matching-analytics", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_matching_analytics():
    """
    GET /api/v1/admin/matching-analytics
    Aggregates matching engine performance, discovery rates, response latency,
    and ruleset versioning for operational oversight.
    """
    data = SupabaseService.get_matching_analytics_data()
    return success_response(
        data=data,
        message="Matching engine analytics retrieved successfully."
    )
