"""
TEST SUITE: ROLE-BASED ACCESS CONTROL (RBAC)
"""


def test_emergency_dispatch_unauthenticated(client):
    """Must reject unauthenticated requests with 401."""
    response = client.post("/api/v1/emergency/dispatch", json={"blood_type": "O-", "hospital_name": "City General"})
    assert response.status_code == 401


def test_emergency_dispatch_donor_forbidden(client, generate_jwt):
    """Donor account must be forbidden (403) from dispatching hospital emergency beacons."""
    donor_token = generate_jwt(
        user_id="donor-uuid-1111",
        account_type="donor",
        email="donor@example.com"
    )

    response = client.post(
        "/api/v1/emergency/dispatch",
        headers={"Authorization": f"Bearer {donor_token}"},
        json={
            "blood_type": "O-",
            "units": 2,
            "hospital_name": "City General Trauma Hub"
        }
    )
    assert response.status_code == 403
    assert response.get_json()["code"] == "FORBIDDEN_ROLE"


def test_emergency_dispatch_hospital_authorized(client, generate_jwt):
    """Hospital account must be authorized (201) to dispatch emergency beacons."""
    hospital_token = generate_jwt(
        user_id="hosp-uuid-2222",
        account_type="hospital",
        email="emergency@cityhospital.org"
    )

    response = client.post(
        "/api/v1/emergency/dispatch",
        headers={"Authorization": f"Bearer {hospital_token}"},
        json={
            "blood_type": "O-",
            "units": 3,
            "hospital_name": "City General Trauma Hub"
        }
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "success"
    assert data["data"]["blood_type"] == "O-"
    assert data["data"]["units_requested"] == 3
    assert data["data"]["status"] == "BEACON_ACTIVE"


def test_emergency_dispatch_invalid_blood_group(client, generate_jwt):
    """Must validate clinical blood group parameters."""
    hospital_token = generate_jwt(
        user_id="hosp-uuid-2222",
        account_type="hospital"
    )

    response = client.post(
        "/api/v1/emergency/dispatch",
        headers={"Authorization": f"Bearer {hospital_token}"},
        json={
            "blood_type": "INVALID_TYPE",
            "hospital_name": "City General"
        }
    )
    assert response.status_code == 400
    assert response.get_json()["code"] == "INVALID_BLOOD_GROUP"
