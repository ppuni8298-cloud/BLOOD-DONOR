"""
TESTS FOR DONOR COMMAND CENTER ENDPOINTS (test_donor_routes.py)
Validates donor telemetry, eligibility calculations, availability sync,
camp listings, and appointment scheduling.
"""

from datetime import datetime, timezone, timedelta
import pytest


def test_donor_summary_unauthorized(client):
    """GET /api/v1/donor/summary without token must return 401."""
    response = client.get("/api/v1/donor/summary")
    assert response.status_code == 401
    assert response.json["status"] == "error"
    assert response.json["code"] == "AUTH_HEADER_MISSING"


def test_donor_summary_authenticated(client, generate_jwt):
    """GET /api/v1/donor/summary with valid token returns telemetry metrics."""
    token = generate_jwt(
        user_id="donor-uuid-5678",
        email="donor@example.com",
        account_type="donor",
        full_name="Sarah Jenkins"
    )
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/donor/summary", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert data["donor_id"] == "donor-uuid-5678"
    assert data["full_name"] == "Sarah Jenkins"
    assert "metrics" in data
    assert "clinical_eligibility" in data
    assert data["clinical_eligibility"]["recovery_period_days"] == 56


def test_donor_history_retrieval(client, generate_jwt):
    """GET /api/v1/donor/history returns donation logs."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/donor/history?status=verified", headers=headers)

    assert response.status_code == 200
    assert "donations" in response.json["data"]
    assert response.json["data"]["filter"] == "verified"


def test_update_availability_invalid(client, generate_jwt):
    """PATCH /api/v1/donor/availability with invalid status returns 400."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.patch(
        "/api/v1/donor/availability",
        headers=headers,
        json={"availability_status": "super_ready_invalid_status"}
    )
    assert response.status_code == 400
    assert response.json["code"] == "INVALID_AVAILABILITY_STATUS"


def test_update_availability_valid(client, generate_jwt):
    """PATCH /api/v1/donor/availability with valid status updates state."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.patch(
        "/api/v1/donor/availability",
        headers=headers,
        json={
            "availability_status": "temporarily_unavailable",
            "discovery_consent": False
        }
    )
    assert response.status_code == 200
    data = response.json["data"]
    assert data["availability_status"] == "temporarily_unavailable"
    assert data["consent_to_discovery"] is False
    assert "clinical_notice" in data


def test_list_camps_public(client):
    """GET /api/v1/camps is publicly queryable."""
    response = client.get("/api/v1/camps")
    assert response.status_code == 200
    data = response.json["data"]
    assert "camps" in data
    assert len(data["camps"]) > 0
    assert "camp_name" in data["camps"][0]


def test_book_appointment_missing_fields(client, generate_jwt):
    """POST /api/v1/donor/appointments with missing fields returns 400."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/donor/appointments",
        headers=headers,
        json={"camp_id": "camp-metro-01"}
    )
    assert response.status_code == 400
    assert response.json["code"] == "MISSING_APPOINTMENT_DATA"


def test_book_appointment_past_date(client, generate_jwt):
    """POST /api/v1/donor/appointments with past date returns 400."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    past_date = (datetime.now(timezone.utc).date() - timedelta(days=5)).isoformat()
    response = client.post(
        "/api/v1/donor/appointments",
        headers=headers,
        json={
            "camp_id": "camp-metro-01",
            "appointment_date": past_date,
            "time_slot": "10:00 AM - 10:30 AM"
        }
    )
    assert response.status_code == 400
    assert response.json["code"] == "PAST_DATE_ERROR"


def test_book_and_cancel_appointment(client, generate_jwt):
    """POST /api/v1/donor/appointments then DELETE cancels it."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    future_date = (datetime.now(timezone.utc).date() + timedelta(days=3)).isoformat()

    # Book
    book_res = client.post(
        "/api/v1/donor/appointments",
        headers=headers,
        json={
            "camp_id": "camp-metro-01",
            "appointment_date": future_date,
            "time_slot": "11:00 AM - 11:30 AM",
            "donation_type": "whole_blood"
        }
    )
    assert book_res.status_code == 201
    appt = book_res.json["data"]["appointment"]
    appt_id = appt.get("id") or "appt-1234"

    # Cancel
    cancel_res = client.delete(f"/api/v1/donor/appointments/{appt_id}", headers=headers)
    assert cancel_res.status_code == 200
    assert cancel_res.json["data"]["status"] == "cancelled"


def test_donor_notifications(client, generate_jwt):
    """GET /api/v1/donor/notifications returns notification stream."""
    token = generate_jwt(user_id="donor-uuid-5678")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/donor/notifications", headers=headers)

    assert response.status_code == 200
    assert "notifications" in response.json["data"]
    assert "unread_count" in response.json["data"]
