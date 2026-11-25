"""
TESTS FOR PATIENT EMERGENCY PORTAL & REQUEST APIS (test_patient_routes.py)
Validates patient dashboard telemetry, emergency blood request creation,
validation, live timeline tracking, cancellation, and facility directory.
"""

from datetime import datetime, timezone, timedelta
import pytest


def test_patient_dashboard_unauthorized(client):
    """GET /api/v1/patient/dashboard without token must return 401."""
    response = client.get("/api/v1/patient/dashboard")
    assert response.status_code == 401
    assert response.json["status"] == "error"
    assert response.json["code"] == "AUTH_HEADER_MISSING"


def test_patient_dashboard_authenticated(client, generate_jwt):
    """GET /api/v1/patient/dashboard with valid token returns telemetry."""
    token = generate_jwt(
        user_id="pat-uuid-1001",
        email="patient@example.com",
        account_type="patient",
        full_name="Marcus Vance"
    )
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/patient/dashboard", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert data["patient"]["id"] == "pat-uuid-1001"
    assert "metrics" in data
    assert "clinical_disclaimer" in data
    assert "Selecting a blood group or component does not establish transfusion compatibility" in data["clinical_disclaimer"]


def test_create_request_missing_patient_name(client, generate_jwt):
    """POST /api/v1/patient/requests with missing patient name returns 400."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/patient/requests",
        headers=headers,
        json={"blood_group": "O-", "units_needed": 2}
    )
    assert response.status_code == 400
    assert response.json["code"] == "MISSING_PATIENT_NAME"


def test_create_request_invalid_blood_group(client, generate_jwt):
    """POST /api/v1/patient/requests with invalid blood group returns 400."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/patient/requests",
        headers=headers,
        json={
            "patient_name": "Eleanor Vance",
            "blood_group": "C_POSITIVE_INVALID",
            "units_needed": 2
        }
    )
    assert response.status_code == 400
    assert response.json["code"] == "INVALID_BLOOD_GROUP"


def test_create_request_invalid_component(client, generate_jwt):
    """POST /api/v1/patient/requests with invalid component returns 400."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/patient/requests",
        headers=headers,
        json={
            "patient_name": "Eleanor Vance",
            "blood_group": "O-",
            "blood_component": "magic_elixir",
            "units_needed": 2
        }
    )
    assert response.status_code == 400
    assert response.json["code"] == "INVALID_BLOOD_COMPONENT"


def test_create_request_invalid_units(client, generate_jwt):
    """POST /api/v1/patient/requests with units > 20 or < 1 returns 400."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/patient/requests",
        headers=headers,
        json={
            "patient_name": "Eleanor Vance",
            "blood_group": "O-",
            "blood_component": "whole_blood",
            "units_needed": 35  # Max is 20
        }
    )
    assert response.status_code == 400
    assert response.json["code"] == "INVALID_UNITS"


def test_create_request_valid(client, generate_jwt):
    """POST /api/v1/patient/requests with valid parameters succeeds with 201."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    req_time = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()

    response = client.post(
        "/api/v1/patient/requests",
        headers=headers,
        json={
            "patient_name": "Eleanor Vance",
            "blood_group": "A-",
            "blood_component": "packed_red_cells",
            "units_needed": 2,
            "hospital_name": "St. Jude Memorial Hospital",
            "hospital_city": "Metro Central",
            "hospital_district": "East Wing",
            "hospital_address": "120 St. Jude Way",
            "required_datetime": req_time,
            "urgency_priority": "urgent",
            "clinical_reason": "Pre-operative cardiovascular surgery reserves",
            "treating_doctor": "Dr. Sarah Chen",
            "doctor_contact": "+1 (555) 019-2041",
            "requester_relationship": "Parent",
            "requester_phone": "+1 (555) 019-8800",
            "consent_acknowledged": True
        }
    )
    assert response.status_code == 201
    data = response.json["data"]
    assert "request" in data
    assert data["request"]["patient_name"] == "Eleanor Vance"
    assert data["request"]["blood_group"] == "A-"
    assert data["request"]["status"] == "submitted"
    assert "clinical_disclaimer" in data


def test_get_patient_requests_list(client, generate_jwt):
    """GET /api/v1/patient/requests retrieves requests list."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/patient/requests", headers=headers)

    assert response.status_code == 200
    assert "requests" in response.json["data"]


def test_get_request_timeline(client, generate_jwt):
    """GET /api/v1/patient/requests/<request_id>/timeline returns audit events."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/patient/requests/req-demo-01/timeline", headers=headers)

    assert response.status_code == 200
    assert "timeline" in response.json["data"]
    assert len(response.json["data"]["timeline"]) > 0


def test_cancel_request(client, generate_jwt):
    """PATCH /api/v1/patient/requests/<request_id>/cancel cancels active request."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.patch(
        "/api/v1/patient/requests/req-demo-01/cancel",
        headers=headers,
        json={"reason": "Emergency surgery successfully rescheduled."}
    )
    assert response.status_code == 200
    assert response.json["data"]["status"] == "cancelled"


def test_list_facilities(client):
    """GET /api/v1/facilities is publicly accessible."""
    response = client.get("/api/v1/facilities")
    assert response.status_code == 200
    data = response.json["data"]
    assert "facilities" in data
    assert len(data["facilities"]) > 0
    assert "name" in data["facilities"][0]


def test_get_facility_detail(client):
    """GET /api/v1/facilities/<facility_id> returns facility and verified inventory."""
    response = client.get("/api/v1/facilities/fac-hospital-01")
    assert response.status_code == 200
    data = response.json["data"]
    assert "facility" in data
    assert "inventory" in data


def test_patient_notifications_and_read(client, generate_jwt):
    """GET & PATCH /api/v1/patient/notifications."""
    token = generate_jwt(user_id="pat-uuid-1001")
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch
    get_res = client.get("/api/v1/patient/notifications", headers=headers)
    assert get_res.status_code == 200
    assert "notifications" in get_res.json["data"]

    # Mark read
    patch_res = client.patch("/api/v1/patient/notifications/notif-pat-01/read", headers=headers)
    assert patch_res.status_code == 200
    assert patch_res.json["data"]["is_read"] is True
