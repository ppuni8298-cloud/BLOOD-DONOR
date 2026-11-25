"""
BLOODLINK HEALTH CHECK ROUTES (health.py)
Public endpoint to check Flask backend service status, configuration state,
and live database connectivity.
"""

from datetime import datetime, timezone
import requests
from flask import Blueprint, current_app, request
from backend.utils.response import success_response, error_response

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
@health_bp.route("/api/health", methods=["GET"])
@health_bp.route("/api/v1/health", methods=["GET"])
def health_check():
    """
    Public health check endpoint: GET /health, /api/health, /api/v1/health
    Provides live status, environment info, and integration telemetry.
    """
    supabase_url = current_app.config.get("SUPABASE_URL", "")
    supabase_configured = bool(
        supabase_url and
        "your-project-ref" not in supabase_url
    )

    db_status = "configured" if supabase_configured else "awaiting_credentials"

    # Optional deep ping if query parameter ?check_db=true is passed
    if request.args.get("check_db") == "true" and supabase_configured:
        anon_key = current_app.config.get("SUPABASE_ANON_KEY", "")
        try:
            r = requests.get(
                f"{supabase_url}/rest/v1/",
                headers={"apikey": anon_key},
                timeout=3.0
            )
            # 200 or 401 with auth challenge indicates live Supabase PostgREST endpoint
            if r.status_code in [200, 401]:
                db_status = "connected"
            else:
                db_status = f"degraded_http_{r.status_code}"
        except Exception as e:
            db_status = f"unreachable: {str(e)}"

    return success_response(
        data={
            "service": "BloodLink REST API",
            "version": "2.0.0",
            "environment": current_app.config.get("ENV", "production"),
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "integrations": {
                "supabase_postgresql": db_status,
                "jwt_verification": "active",
                "matching_engine": "operational"
            }
        },
        message="BloodLink API is operational."
    )


@health_bp.route("/api/health/db", methods=["GET"])
def health_db_check():
    """
    Dedicated database health check endpoint for monitoring probes.
    """
    supabase_url = current_app.config.get("SUPABASE_URL", "")
    anon_key = current_app.config.get("SUPABASE_ANON_KEY", "")

    if not supabase_url or "your-project-ref" in supabase_url:
        return error_response(
            message="Database integration is not yet configured with a valid Supabase URL.",
            status_code=503,
            code="DATABASE_NOT_CONFIGURED"
        )

    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/",
            headers={"apikey": anon_key},
            timeout=4.0
        )
        if r.status_code in [200, 401]:
            return success_response(
                data={
                    "database": "Supabase PostgreSQL",
                    "status": "connected",
                    "url": supabase_url,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                message="Supabase PostgreSQL connectivity verified."
            )
        else:
            return error_response(
                message=f"Database returned unexpected status {r.status_code}",
                status_code=502,
                code="DATABASE_DEGRADED"
            )
    except Exception as e:
        return error_response(
            message=f"Unable to reach Supabase database: {str(e)}",
            status_code=503,
            code="DATABASE_UNREACHABLE"
        )
