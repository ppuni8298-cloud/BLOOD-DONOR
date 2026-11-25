"""
TESTS FOR SUPER ADMIN COMMAND CENTER & GLOBAL PLATFORM APIS (test_admin_routes.py)
Validates:
- Super Admin authentication & authorization enforcement
- Rejection of unauthenticated (401) and non-administrative (403) access
- Global dashboard telemetry and aggregate health indicators
- User search, filter, and administrative suspension workflows
- Facility accreditation review and verification decisions
- Global emergency operations monitoring
- Inventory intelligence and cold-chain shortage alerts
- Platform analytics and reporting
- Targeted broadcast dispatching and audience validation
- Security audit events and incident management
- Platform configuration with clinical compatibility governance guards
- Administrative role management and privilege self-escalation protection
"""

import pytest


# =============================================================================
# 1. AUTHENTICATION & ACCESS CONTROL TESTS
# =============================================================================

def test_admin_dashboard_unauthorized(client):
    """GET /api/v1/admin/dashboard without token must return 401."""
    response = client.get("/api/v1/admin/dashboard")
    assert response.status_code == 401
    assert response.json["status"] == "error"
    assert response.json["code"] == "AUTH_HEADER_MISSING"


def test_admin_dashboard_forbidden_for_regular_roles(client, generate_jwt):
    """Donors, patients, hospitals, and blood banks must be forbidden from administrative routes."""
    for role in ["donor", "patient", "hospital", "blood_bank"]:
        token = generate_jwt(user_id=f"user-{role}", account_type=role)
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/v1/admin/dashboard", headers=headers)
        assert response.status_code == 403
        assert response.json["code"] == "FORBIDDEN_ADMIN_ACCESS"


def test_admin_dashboard_authorized_for_super_admin(client, generate_jwt):
    """Super Admin receives comprehensive global metrics."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin", email="superadmin@bloodlink.net")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/dashboard", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "total_users" in data
    assert "active_donors" in data
    assert "verified_hospitals" in data
    assert "verified_bloodbanks" in data
    assert "active_emergency_requests" in data
    assert "system_health" in data
    assert data["system_health"]["database_status"] == "healthy"


# =============================================================================
# 2. USER MANAGEMENT TESTS
# =============================================================================

def test_list_users_with_filters(client, generate_jwt):
    """Search and filter platform users."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/users?role=donor&status=active&search=Elena", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "users" in data
    assert isinstance(data["users"], list)
    # Ensure passwords and sensitive tokens are absent
    for user in data["users"]:
        assert "password" not in user
        assert "password_hash" not in user
        assert "token" not in user


def test_get_user_detail(client, generate_jwt):
    """Fetch user profile detail and security timeline."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/users/usr-101", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "profile" in data
    assert "timeline" in data
    assert "security_flags" in data


def test_update_user_status_validation(client, generate_jwt):
    """Updating status requires a valid status and administrative reason."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}

    # Missing reason
    res1 = client.patch("/api/v1/admin/users/usr-103/status", headers=headers, json={"status": "suspended"})
    assert res1.status_code == 400
    assert res1.json["code"] == "REASON_REQUIRED"

    # Invalid status
    res2 = client.patch("/api/v1/admin/users/usr-103/status", headers=headers, json={"status": "invalid_status", "reason": "Testing"})
    assert res2.status_code == 400
    assert res2.json["code"] == "INVALID_STATUS"


def test_update_user_status_success(client, generate_jwt):
    """Successfully suspend an account with audit reason."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "status": "suspended",
        "reason": "Administrative suspension pending documentation re-verification."
    }
    response = client.patch("/api/v1/admin/users/usr-106/status", headers=headers, json=payload)
    assert response.status_code == 200
    assert response.json["data"]["account_status"] == "suspended"


def test_prevent_suspending_self(client, generate_jwt):
    """Super Admin cannot suspend their own account."""
    admin_id = "superadmin-1"
    token = generate_jwt(user_id=admin_id, account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.patch(f"/api/v1/admin/users/{admin_id}/status", headers=headers, json={
        "status": "suspended",
        "reason": "Self-suspension attempt"
    })
    assert response.status_code == 400
    assert response.json["code"] == "CANNOT_SUSPEND_SELF"


# =============================================================================
# 3. FACILITY ACCREDITATION & REVIEW TESTS
# =============================================================================

def test_list_facilities_for_verification(client, generate_jwt):
    """Retrieve facility verification queue."""
    token = generate_jwt(user_id="verify-admin-1", account_type="verification_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/facilities?status=pending", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert isinstance(data, list)
    for fac in data:
        assert "facility_name" in fac
        assert "license_number" in fac


def test_submit_facility_review_validation(client, generate_jwt):
    """Facility review requires valid decision and comprehensive reason."""
    token = generate_jwt(user_id="verify-admin-1", account_type="verification_admin")
    headers = {"Authorization": f"Bearer {token}"}

    # Missing reason
    res1 = client.post("/api/v1/admin/facilities/fac-003/review", headers=headers, json={"decision": "approved"})
    assert res1.status_code == 400
    assert res1.json["code"] == "REASON_REQUIRED"

    # Invalid decision
    res2 = client.post("/api/v1/admin/facilities/fac-003/review", headers=headers, json={
        "decision": "fake_approval",
        "reason": "Valid reason text"
    })
    assert res2.status_code == 400
    assert res2.json["code"] == "INVALID_DECISION"


def test_submit_facility_review_success(client, generate_jwt):
    """Successfully approve and record facility accreditation."""
    token = generate_jwt(user_id="verify-admin-1", account_type="verification_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "decision": "approved",
        "reason": "State health directorate license LIC-MED-104928 and trauma blood bank inspected.",
        "license_number_verified": "LIC-MED-104928",
        "accreditation_body": "State Ministry of Health",
        "physical_audit_completed": True,
        "review_notes": "All storage freezers and platelet agitators meet cold-chain compliance."
    }
    response = client.post("/api/v1/admin/facilities/fac-003/review", headers=headers, json=payload)

    assert response.status_code == 200
    data = response.json["data"]
    assert data["decision"] == "approved"
    assert data["new_status"] == "verified"
    assert data["physical_audit_completed"] is True


# =============================================================================
# 4. EMERGENCY OPERATIONS & INVENTORY INTELLIGENCE TESTS
# =============================================================================

def test_emergency_operations_telemetry(client, generate_jwt):
    """Global emergency requests telemetry."""
    token = generate_jwt(user_id="ops-admin-1", account_type="operations_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/emergency-operations?urgency=code_red", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "total_active_emergencies" in data
    assert "code_red_count" in data
    assert "requests" in data
    assert isinstance(data["requests"], list)


def test_inventory_intelligence(client, generate_jwt):
    """Platform-wide inventory matrix and shortage detection."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/inventory-overview", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "matrix" in data
    assert "total_units_verified" in data
    assert "critical_shortage_alerts" in data


def test_platform_analytics(client, generate_jwt):
    """Analytics trends, C:T ratios, and regional demand."""
    token = generate_jwt(user_id="analytics-user", account_type="analytics_viewer")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/analytics?range=30d", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "fulfilment_rate_pct" in data
    assert "average_crossmatch_to_transfusion_ratio" in data
    assert "component_demand_distribution" in data


# =============================================================================
# 5. BROADCASTS & NOTIFICATIONS TESTS
# =============================================================================

def test_create_platform_broadcast(client, generate_jwt):
    """Dispatches targeted announcements with audience validation."""
    token = generate_jwt(user_id="ops-admin-1", account_type="operations_admin")
    headers = {"Authorization": f"Bearer {token}"}

    # Invalid audience
    res1 = client.post("/api/v1/admin/announcements", headers=headers, json={
        "title": "Broadcast Test",
        "content": "Test content",
        "target_audience": "invalid_audience"
    })
    assert res1.status_code == 400
    assert res1.json["code"] == "INVALID_AUDIENCE"

    # Valid broadcast
    payload = {
        "title": "Severe O-Negative Platelet Alert",
        "content": "Immediate voluntary O-Negative donors needed across Metro Central.",
        "target_audience": "donors",
        "priority": "critical"
    }
    res2 = client.post("/api/v1/admin/announcements", headers=headers, json=payload)
    assert res2.status_code == 201
    assert res2.json["data"]["target_audience"] == "donors"
    assert res2.json["data"]["priority"] == "critical"


# =============================================================================
# 6. SECURITY INCIDENT OPERATIONS TESTS
# =============================================================================

def test_security_audit_events_and_incidents(client, generate_jwt):
    """Security events feed and incident management."""
    token = generate_jwt(user_id="sec-auditor-1", account_type="security_auditor")
    headers = {"Authorization": f"Bearer {token}"}

    # Get events
    res_events = client.get("/api/v1/admin/security/events", headers=headers)
    assert res_events.status_code == 200
    assert isinstance(res_events.json["data"], list)

    # Create incident
    incident_payload = {
        "title": "Anomalous Login Frequency",
        "description": "Multiple failed attempts from untrusted subnet.",
        "severity": "high",
        "status": "investigating",
        "investigation_notes": "Subnet blocked via token bucket rate limiter."
    }
    res_inc = client.post("/api/v1/admin/security/incidents", headers=headers, json=incident_payload)
    assert res_inc.status_code == 200
    assert res_inc.json["data"]["status"] == "investigating"


# =============================================================================
# 7. PLATFORM CONFIGURATION & CLINICAL RULE SAFETY TESTS
# =============================================================================

def test_system_configuration_read(client, generate_jwt):
    """Retrieve platform configuration settings."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/configuration", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert isinstance(data, list)
    keys = [c["config_key"] for c in data]
    assert "clinical_transfusion_governance" in keys
    assert "emergency_triage_priorities" in keys


def test_clinical_rule_modification_blocked_without_token(client, generate_jwt):
    """Casual or unverified modification of clinical compatibility rules is rejected."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "config_key": "clinical_transfusion_governance",
        "config_value": {"active_ruleset": "MODIFIED-UNAPPROVED-PROTOCOL"},
        "reason": "Attempted casual modification"
    }
    response = client.patch("/api/v1/admin/configuration", headers=headers, json=payload)
    assert response.status_code == 403
    assert response.json["code"] == "CLINICAL_RULE_MODIFICATION_BLOCKED"


def test_clinical_rule_modification_allowed_with_medical_board_token(client, generate_jwt):
    """Clinical compatibility update succeeds with validated medical board token."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "config_key": "clinical_transfusion_governance",
        "config_value": {
            "active_ruleset": "CLINICAL-AABB-2026.1",
            "enforce_crossmatch": True,
            "medical_board_approval_token": "MBA-VERIFIED-2026-AABB"
        },
        "reason": "Formal clinical protocol verification"
    }
    response = client.patch("/api/v1/admin/configuration", headers=headers, json=payload)
    assert response.status_code == 200
    assert response.json["data"]["config_key"] == "clinical_transfusion_governance"


# =============================================================================
# 8. ADMINISTRATIVE ROLE MANAGEMENT & PRIVILEGE ESCALATION TESTS
# =============================================================================

def test_list_admin_roles(client, generate_jwt):
    """List administrative roles."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/admin/roles", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json["data"], list)


def test_ordinary_admin_cannot_assign_roles(client, generate_jwt):
    """Ordinary admin roles (operations_admin) cannot assign or escalate administrative privileges."""
    token = generate_jwt(user_id="ops-admin-1", account_type="operations_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "user_id": "usr-999",
        "admin_role": "super_admin",
        "notes": "Attempted self-elevation"
    }
    response = client.post("/api/v1/admin/roles/assign", headers=headers, json=payload)
    assert response.status_code == 403
    assert response.json["code"] == "SUPER_ADMIN_REQUIRED"


def test_super_admin_can_assign_roles(client, generate_jwt):
    """Super Admin can provision granular administrative roles."""
    token = generate_jwt(user_id="superadmin-1", account_type="super_admin")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "user_id": "usr-888",
        "admin_role": "operations_admin",
        "notes": "Provisioned for regional dispatch coordination"
    }
    response = client.post("/api/v1/admin/roles/assign", headers=headers, json=payload)
    assert response.status_code == 200
    assert response.json["data"]["admin_role"] == "operations_admin"
