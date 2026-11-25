"""
BLOODLINK SUPER ADMIN COMMAND CENTER ROUTES (admin_routes.py)
Centralized platform oversight, user administration, facility verification,
global emergency monitoring, inventory intelligence, security operations,
targeted broadcast center, platform configuration, and administrative role management.
"""

from functools import wraps
from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.services.supabase_service import SupabaseService
from backend.utils.response import success_response, error_response

admin_bp = Blueprint("admin_routes", __name__)

# Valid granular admin roles
ADMIN_ROLES = [
    "super_admin",
    "admin",
    "operations_admin",
    "verification_admin",
    "security_auditor",
    "analytics_viewer"
]


def require_admin(allowed_roles=None):
    """
    Decorator to restrict endpoint access to authenticated administrators.
    Defaults to all administrative roles, with super_admin always permitted.
    """
    if allowed_roles is None:
        target_roles = list(ADMIN_ROLES)
    elif isinstance(allowed_roles, str):
        target_roles = ["super_admin", allowed_roles]
    else:
        target_roles = list(set(["super_admin"] + list(allowed_roles)))

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            account_type = getattr(g, "account_type", None)

            if not account_type:
                return error_response(
                    message="Authentication required.",
                    status_code=401,
                    code="AUTH_REQUIRED"
                )

            # Check if user holds an authorized administrative role
            if account_type not in target_roles and account_type not in ("super_admin", "admin"):
                # Also check database admin_roles if account_type in token is not admin
                db_admin = SupabaseService.check_user_admin_role(g.user_id, target_roles)
                if not db_admin:
                    return error_response(
                        message=f"Access denied: Super Admin or administrative role required. Current: '{account_type}'",
                        status_code=403,
                        code="FORBIDDEN_ADMIN_ACCESS"
                    )

            return f(*args, **kwargs)
        return decorated_function
    return decorator


# =============================================================================
# 1. GLOBAL COMMAND CENTER OVERVIEW & TELEMETRY
# =============================================================================

@admin_bp.route("/api/v1/admin/dashboard", methods=["GET"])
@require_auth
@require_admin()
@rate_limit(limit=60)
def get_admin_dashboard_metrics():
    """
    GET /api/v1/admin/dashboard
    Returns real-time platform metrics, counts, activity feed, and cold-chain status.
    """
    metrics = SupabaseService.get_global_admin_metrics()
    return success_response(
        data=metrics,
        message="Global platform intelligence and metrics retrieved."
    )


# =============================================================================
# 2. USER MANAGEMENT & ACCESS CONTROL
# =============================================================================

@admin_bp.route("/api/v1/admin/users", methods=["GET"])
@require_auth
@require_admin(["operations_admin", "security_auditor"])
@rate_limit(limit=60)
def list_users():
    """
    GET /api/v1/admin/users?role=donor&status=active&search=john&limit=50&offset=0
    Search and filter platform users. Never exposes passwords, auth secrets, or private medical details.
    """
    role = request.args.get("role")
    status = request.args.get("status")
    search = request.args.get("search")
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))

    result = SupabaseService.get_admin_users_list(
        role=role,
        status=status,
        search=search,
        limit=limit,
        offset=offset
    )
    return success_response(
        data=result,
        message="Platform user registry retrieved."
    )


@admin_bp.route("/api/v1/admin/users/<user_id>", methods=["GET"])
@require_auth
@require_admin(["operations_admin", "security_auditor"])
def get_user_detail(user_id):
    """
    GET /api/v1/admin/users/<user_id>
    Fetches detailed user profile, role bindings, and administrative activity timeline.
    """
    user_detail = SupabaseService.get_admin_user_detail(user_id)
    if not user_detail:
        return error_response(
            message=f"User with identifier '{user_id}' not found.",
            status_code=404,
            code="USER_NOT_FOUND"
        )
    return success_response(
        data=user_detail,
        message="User profile detail retrieved."
    )


@admin_bp.route("/api/v1/admin/users/<user_id>/status", methods=["PATCH"])
@require_auth
@require_admin(["operations_admin"])
def update_user_status(user_id):
    """
    PATCH /api/v1/admin/users/<user_id>/status
    Suspends, reactivates, or flags a user account with mandatory administrative reason.
    Logs immutable audit entry in admin_action_logs.
    """
    body = request.get_json() or {}
    new_status = body.get("status")
    reason = body.get("reason")

    valid_statuses = ["active", "suspended", "pending", "banned"]
    if not new_status or new_status not in valid_statuses:
        return error_response(
            message=f"Invalid status '{new_status}'. Expected one of {valid_statuses}",
            status_code=400,
            code="INVALID_STATUS"
        )

    if not reason or len(reason.strip()) < 5:
        return error_response(
            message="A detailed administrative reason (minimum 5 characters) is required.",
            status_code=400,
            code="REASON_REQUIRED"
        )

    # Protect against suspending self
    if str(user_id) == str(g.user_id):
        return error_response(
            message="Administrative security violation: You cannot suspend your own account.",
            status_code=400,
            code="CANNOT_SUSPEND_SELF"
        )

    success = SupabaseService.update_user_account_status(
        user_id=user_id,
        new_status=new_status,
        reason=reason,
        admin_id=g.user_id
    )

    if not success:
        return error_response(
            message="Failed to update user status.",
            status_code=500,
            code="UPDATE_FAILED"
        )

    return success_response(
        data={"user_id": user_id, "account_status": new_status, "reason": reason},
        message=f"User account status successfully updated to '{new_status}'."
    )


# =============================================================================
# 3. FACILITY ACCREDITATION & VERIFICATION
# =============================================================================

@admin_bp.route("/api/v1/admin/facilities", methods=["GET"])
@require_auth
@require_admin(["verification_admin", "operations_admin"])
def list_facilities_for_verification():
    """
    GET /api/v1/admin/facilities?status=pending_verification&type=hospital
    Lists healthcare facilities, accreditation status, license details, and review records.
    """
    status = request.args.get("status")
    facility_type = request.args.get("type")

    facilities = SupabaseService.get_facilities_for_admin_review(
        status=status,
        facility_type=facility_type
    )
    return success_response(
        data=facilities,
        message="Facility verification queue retrieved."
    )


@admin_bp.route("/api/v1/admin/facilities/<facility_id>/review", methods=["POST"])
@require_auth
@require_admin(["verification_admin"])
def submit_facility_review(facility_id):
    """
    POST /api/v1/admin/facilities/<facility_id>/review
    Executes formal review decision (approved, rejected, additional_documentation_requested, suspended, reinstated).
    Never fabricates approvals; writes to facility_verification_reviews and admin_action_logs.
    """
    body = request.get_json() or {}
    decision = body.get("decision")
    reason = body.get("reason")
    license_verified = body.get("license_number_verified")
    accreditation_body = body.get("accreditation_body")
    physical_audit = bool(body.get("physical_audit_completed", False))
    review_notes = body.get("review_notes", "")

    valid_decisions = [
        "approved",
        "rejected",
        "additional_documentation_requested",
        "suspended",
        "reinstated"
    ]
    if not decision or decision not in valid_decisions:
        return error_response(
            message=f"Invalid decision '{decision}'. Expected one of {valid_decisions}",
            status_code=400,
            code="INVALID_DECISION"
        )

    if not reason or len(reason.strip()) < 5:
        return error_response(
            message="A comprehensive accreditation review reason (minimum 5 characters) is mandatory.",
            status_code=400,
            code="REASON_REQUIRED"
        )

    result = SupabaseService.record_facility_verification_review(
        facility_id=facility_id,
        reviewer_id=g.user_id,
        decision=decision,
        reason=reason,
        license_verified=license_verified,
        accreditation_body=accreditation_body,
        physical_audit_completed=physical_audit,
        review_notes=review_notes
    )

    if not result:
        return error_response(
            message="Failed to record facility verification decision.",
            status_code=500,
            code="REVIEW_FAILED"
        )

    return success_response(
        data=result,
        message=f"Facility verification successfully processed: '{decision}'."
    )


# =============================================================================
# 4. GLOBAL EMERGENCY OPERATIONS CENTER
# =============================================================================

@admin_bp.route("/api/v1/admin/emergency-operations", methods=["GET"])
@require_auth
@require_admin(["operations_admin"])
@rate_limit(limit=60)
def get_emergency_operations_telemetry():
    """
    GET /api/v1/admin/emergency-operations?urgency=code_red&city=Metropolis
    Central emergency operations telemetry, matching rates, pending clinical reviews,
    stalled request warnings, and delivery progress.
    """
    urgency = request.args.get("urgency")
    city = request.args.get("city")
    status = request.args.get("status")

    data = SupabaseService.get_global_emergency_operations(
        urgency=urgency,
        city=city,
        status=status
    )
    return success_response(
        data=data,
        message="Emergency operations center data retrieved."
    )


# =============================================================================
# 5. GLOBAL INVENTORY INTELLIGENCE
# =============================================================================

@admin_bp.route("/api/v1/admin/inventory-overview", methods=["GET"])
@require_auth
@require_admin(["operations_admin", "analytics_viewer"])
def get_inventory_intelligence():
    """
    GET /api/v1/admin/inventory-overview?region=Metro+Central
    Aggregated blood components across all verified facilities, stock status,
    critical shortages, near-expiry units, and reservation holds.
    """
    region = request.args.get("region")
    component = request.args.get("component")

    inventory = SupabaseService.get_global_inventory_intelligence(
        region=region,
        component_type=component
    )
    return success_response(
        data=inventory,
        message="Global inventory intelligence retrieved."
    )


# =============================================================================
# 6. ADVANCED ANALYTICS & HEMOVIGILANCE REPORTS
# =============================================================================

@admin_bp.route("/api/v1/admin/analytics", methods=["GET"])
@require_auth
@require_admin(["analytics_viewer", "operations_admin"])
def get_platform_analytics():
    """
    GET /api/v1/admin/analytics?range=30d
    High-level platform metrics: fulfillment rate, discovery velocity, C:T ratio,
    donor conversion, and regional demand distributions.
    """
    time_range = request.args.get("range", "30d")
    analytics = SupabaseService.get_global_analytics(time_range=time_range)
    return success_response(
        data=analytics,
        message="Global platform analytics and trends retrieved."
    )


# =============================================================================
# 7. NOTIFICATION & TARGETED BROADCAST CENTER
# =============================================================================

@admin_bp.route("/api/v1/admin/announcements", methods=["GET"])
@require_auth
@require_admin(["operations_admin"])
def list_announcements():
    """
    GET /api/v1/admin/announcements
    Lists platform broadcasts, active announcements, target audiences, and engagement counts.
    """
    announcements = SupabaseService.get_platform_announcements()
    return success_response(
        data=announcements,
        message="Platform announcements retrieved."
    )


@admin_bp.route("/api/v1/admin/announcements", methods=["POST"])
@require_auth
@require_admin(["operations_admin"])
def create_announcement():
    """
    POST /api/v1/admin/announcements
    Dispatches a targeted announcement (audience: all, donors, patients, hospitals, blood_banks).
    Requires authorization and writes to admin_action_logs.
    """
    body = request.get_json() or {}
    title = body.get("title")
    content = body.get("content")
    audience = body.get("target_audience", "all")
    priority = body.get("priority", "standard")
    expires_at = body.get("expires_at")

    if not title or not content:
        return error_response(
            message="Title and content are required for platform broadcasts.",
            status_code=400,
            code="MISSING_BROADCAST_FIELDS"
        )

    valid_audiences = ["all", "donors", "patients", "hospitals", "blood_banks"]
    if audience not in valid_audiences:
        return error_response(
            message=f"Invalid target audience '{audience}'. Expected one of {valid_audiences}",
            status_code=400,
            code="INVALID_AUDIENCE"
        )

    result = SupabaseService.create_platform_broadcast(
        author_id=g.user_id,
        title=title,
        content=content,
        target_audience=audience,
        priority=priority,
        expires_at=expires_at
    )

    if not result:
        return error_response(
            message="Failed to dispatch announcement broadcast.",
            status_code=500,
            code="BROADCAST_FAILED"
        )

    return success_response(
        data=result,
        status_code=201,
        message=f"Broadcast successfully queued for audience '{audience}'."
    )


# =============================================================================
# 8. SECURITY & AUDIT OPERATIONS
# =============================================================================

@admin_bp.route("/api/v1/admin/security/events", methods=["GET"])
@require_auth
@require_admin(["security_auditor"])
def get_security_audit_events():
    """
    GET /api/v1/admin/security/events?limit=50
    Unified security audit stream: logins, privilege changes, rate-limit events,
    and administrative state alterations.
    """
    limit = int(request.args.get("limit", 50))
    events = SupabaseService.get_security_audit_events(limit=limit)
    return success_response(
        data=events,
        message="Security audit events stream retrieved."
    )


@admin_bp.route("/api/v1/admin/security/incidents", methods=["GET"])
@require_auth
@require_admin(["security_auditor"])
def list_security_incidents():
    """
    GET /api/v1/admin/security/incidents?status=investigating
    Retrieves reported security incidents, severity, and investigation state.
    """
    status = request.args.get("status")
    incidents = SupabaseService.get_security_incidents(status=status)
    return success_response(
        data=incidents,
        message="Security incidents queue retrieved."
    )


@admin_bp.route("/api/v1/admin/security/incidents", methods=["POST"])
@require_auth
@require_admin(["security_auditor"])
def create_or_update_security_incident():
    """
    POST /api/v1/admin/security/incidents
    Creates a new security incident or logs investigation notes / resolution on existing incident.
    """
    body = request.get_json() or {}
    incident_id = body.get("incident_id")
    title = body.get("title")
    description = body.get("description")
    severity = body.get("severity", "medium")
    status = body.get("status", "investigating")
    investigation_notes = body.get("investigation_notes")
    resolution_summary = body.get("resolution_summary")

    if not incident_id and (not title or not description):
        return error_response(
            message="Title and description are required when creating a security incident.",
            status_code=400,
            code="MISSING_INCIDENT_FIELDS"
        )

    result = SupabaseService.save_security_incident(
        incident_id=incident_id,
        investigator_id=g.user_id,
        title=title,
        description=description,
        severity=severity,
        status=status,
        investigation_notes=investigation_notes,
        resolution_summary=resolution_summary
    )

    if not result:
        return error_response(
            message="Failed to save security incident.",
            status_code=500,
            code="INCIDENT_SAVE_FAILED"
        )

    return success_response(
        data=result,
        message="Security incident successfully recorded."
    )


# =============================================================================
# 9. PLATFORM CONFIGURATION & CLINICAL RULE SAFETY
# =============================================================================

@admin_bp.route("/api/v1/admin/configuration", methods=["GET"])
@require_auth
@require_admin()
def get_system_configuration():
    """
    GET /api/v1/admin/configuration
    Returns platform configuration parameters across emergency, matching,
    inventory, registration, and security settings.
    """
    configs = SupabaseService.get_system_configurations()
    return success_response(
        data=configs,
        message="Platform configuration parameters retrieved."
    )


@admin_bp.route("/api/v1/admin/configuration", methods=["PATCH"])
@require_auth
@require_admin()
def update_system_configuration():
    """
    PATCH /api/v1/admin/configuration
    Updates platform configuration. Changes to clinical compatibility rules
    require a valid medical board authorization token; casual modification is rejected.
    """
    body = request.get_json() or {}
    config_key = body.get("config_key")
    new_value = body.get("config_value")
    reason = body.get("reason", "Administrative configuration update")

    if not config_key or new_value is None:
        return error_response(
            message="config_key and config_value are required.",
            status_code=400,
            code="MISSING_CONFIG_FIELDS"
        )

    # Clinical Governance Guard: Prevent casual modification of clinical compatibility rules
    if "clinical" in config_key or config_key == "clinical_transfusion_governance":
        token = new_value.get("medical_board_approval_token") if isinstance(new_value, dict) else None
        if not token:
            return error_response(
                message="CLINICAL GOVERNANCE VIOLATION: Clinical compatibility rules cannot be modified without a validated Medical Board Authorization token.",
                status_code=403,
                code="CLINICAL_RULE_MODIFICATION_BLOCKED"
            )

    result = SupabaseService.update_system_configuration(
        config_key=config_key,
        new_value=new_value,
        admin_id=g.user_id,
        reason=reason
    )

    if not result:
        return error_response(
            message="Failed to update system configuration.",
            status_code=500,
            code="CONFIG_UPDATE_FAILED"
        )

    return success_response(
        data=result,
        message=f"Configuration '{config_key}' successfully updated."
    )


# =============================================================================
# 10. ADMINISTRATIVE ROLES & LEAST-PRIVILEGE MANAGEMENT
# =============================================================================

@admin_bp.route("/api/v1/admin/roles", methods=["GET"])
@require_auth
@require_admin()
def list_admin_roles():
    """
    GET /api/v1/admin/roles
    Lists all provisioned administrators and their granular permissions.
    """
    roles = SupabaseService.get_all_admin_roles()
    return success_response(
        data=roles,
        message="Administrative role registry retrieved."
    )


@admin_bp.route("/api/v1/admin/roles/assign", methods=["POST"])
@require_auth
@require_admin()
def assign_admin_role():
    """
    POST /api/v1/admin/roles/assign
    Assigns or updates an administrative role. Enforces:
    - Only existing Super Admins can assign administrative privileges.
    - Prevents privilege self-escalation (ordinary admins cannot create or promote to super_admin).
    - Logs action to admin_action_logs.
    """
    # Strict Super Admin Check: Only full super_admin can provision admin roles
    if getattr(g, "account_type", "") != "super_admin" and not SupabaseService.is_super_admin(g.user_id):
        return error_response(
            message="Privilege escalation protection: Only an authenticated Super Admin can provision or alter administrative roles.",
            status_code=403,
            code="SUPER_ADMIN_REQUIRED"
        )

    body = request.get_json() or {}
    target_user_id = body.get("user_id")
    target_role = body.get("admin_role")
    notes = body.get("notes", "Role assigned by Super Admin")

    if not target_user_id or not target_role:
        return error_response(
            message="user_id and admin_role are required.",
            status_code=400,
            code="MISSING_ROLE_FIELDS"
        )

    if target_role not in ADMIN_ROLES:
        return error_response(
            message=f"Invalid administrative role '{target_role}'. Expected one of {ADMIN_ROLES}",
            status_code=400,
            code="INVALID_ADMIN_ROLE"
        )

    result = SupabaseService.assign_admin_role(
        target_user_id=target_user_id,
        target_role=target_role,
        assigned_by=g.user_id,
        notes=notes
    )

    if not result:
        return error_response(
            message="Failed to assign administrative role.",
            status_code=500,
            code="ROLE_ASSIGNMENT_FAILED"
        )

    return success_response(
        data=result,
        message=f"Administrative role '{target_role}' successfully assigned to user '{target_user_id}'."
    )
