"""
BLOODLINK PROTECTED USER IDENTITY & PROFILE ROUTES (auth_routes.py)
Implements GET /api/v1/me and profile update endpoints with strict JWT validation.
"""

from flask import Blueprint, g, request
from backend.middleware.auth_middleware import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.services.supabase_service import SupabaseService
from backend.utils.response import success_response, error_response

auth_bp = Blueprint("auth_routes", __name__)


@auth_bp.route("/api/v1/me", methods=["GET"])
@require_auth
@rate_limit(limit=100)
def get_current_user():
    """
    Protected endpoint: GET /api/v1/me
    Verifies the Supabase Bearer token and returns the authenticated user's permitted profile.
    Never trusts IDs passed in query parameters or request bodies.
    """
    user_id = g.user_id
    email = g.user_email
    token_metadata = g.user.get("user_metadata", {})

    # Attempt to fetch rich database profile from Supabase PostgreSQL
    db_profile = SupabaseService.get_profile_by_id(user_id)

    if db_profile:
        profile_data = {
            "id": db_profile.get("id"),
            "full_name": db_profile.get("full_name"),
            "email": db_profile.get("email"),
            "phone": db_profile.get("phone"),
            "account_type": db_profile.get("account_type"),
            "city": db_profile.get("city"),
            "district": db_profile.get("district"),
            "is_verified": db_profile.get("is_verified", False),
            "account_status": db_profile.get("account_status", "active"),
            "created_at": db_profile.get("created_at")
        }
    else:
        # Fallback to verified JWT metadata when database rows are pending trigger sync
        profile_data = {
            "id": user_id,
            "full_name": token_metadata.get("full_name", email.split("@")[0]),
            "email": email,
            "account_type": token_metadata.get("account_type", "donor"),
            "is_verified": False,
            "account_status": "active"
        }

    return success_response(
        data={"user": profile_data},
        message="Authenticated user profile retrieved."
    )


@auth_bp.route("/api/v1/me/profile", methods=["PATCH"])
@require_auth
def update_profile():
    """
    Protected endpoint: PATCH /api/v1/me/profile
    Allows user to update permitted profile fields (city, phone, full_name).
    Prevents self-escalation of verification status or account type.
    """
    user_id = g.user_id
    data = request.get_json() or {}

    # Strict whitelist of allowed fields
    allowed_fields = ["full_name", "phone", "city", "district", "postal_code", "avatar_url"]
    updates = {k: v for k, v in data.items() if k in allowed_fields}

    if not updates:
        return error_response(
            message="No valid profile fields provided for update.",
            status_code=400,
            code="NO_UPDATABLE_FIELDS"
        )

    success = SupabaseService.update_profile(user_id, updates)

    if not success:
        return error_response(
            message="Could not update profile in database.",
            status_code=500,
            code="DB_UPDATE_ERROR"
        )

    return success_response(
        data={"updated_fields": list(updates.keys())},
        message="Profile updated successfully."
    )
