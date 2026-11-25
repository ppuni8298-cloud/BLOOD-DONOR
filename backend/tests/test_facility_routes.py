"""
TESTS FOR ADVANCED HOSPITAL & BLOOD BANK MANAGEMENT APIS (test_facility_routes.py)
Validates:
- Hospital dashboard operational metrics & emergency triage
- Clinical verification by medical officers (strict role enforcement; patient/donor forbidden 403)
- Blood bank inventory management: batch registration, component shelf life, negative stock prevention
- Laboratory infectious disease QC screening (HIV, HBV, HCV, Syphilis, Malaria)
- Cold-chain dispatch coordination (DSP-YYYY-XXXXX) & temperature intake
- Transfusion crossmatch and fulfilment tracking
- Facility staff management, stock alerts, and clinical reports
"""

from datetime import datetime, timezone, timedelta
import pytest


# =============================================================================
# 1. HOSPITAL COMMAND CENTER TESTS
# =============================================================================

def test_hospital_dashboard_unauthorized(client):
    """GET /api/v1/hospital/dashboard without token must return 401."""
    response = client.get("/api/v1/hospital/dashboard")
    assert response.status_code == 401
    assert response.json["status"] == "error"
    assert response.json["code"] == "AUTH_HEADER_MISSING"


def test_hospital_dashboard_forbidden_for_donor_and_patient(client, generate_jwt):
    """Donors and patients are strictly forbidden from accessing hospital operations."""
    for role in ["donor", "patient"]:
        token = generate_jwt(user_id=f"user-{role}", account_type=role)
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/v1/hospital/dashboard", headers=headers)
        assert response.status_code == 403
        assert response.json["code"] == "FORBIDDEN_HOSPITAL_ROLE"


def test_hospital_dashboard_authorized(client, generate_jwt):
    """Hospital facility role receives operational metrics."""
    token = generate_jwt(
        user_id="hosp-uuid-101",
        account_type="hospital",
        full_name="Metropolitan Trauma Hospital"
    )
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/hospital/dashboard", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "active_emergency_requests" in data
    assert "critical_awaiting_review" in data
    assert "verified_requests" in data
    assert "awaiting_blood_availability" in data
    assert "confirmed_fulfilments" in data
    assert "trauma_reserve_units" in data
    assert "active_alerts_count" in data


def test_hospital_emergency_requests_list(client, generate_jwt):
    """Hospital staff can query emergency requests with filters."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/hospital/requests?priority=critical", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "requests" in data
    assert isinstance(data["requests"], list)


def test_verify_patient_request_invalid_action(client, generate_jwt):
    """Invalid verification action returns 400."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/hospital/requests/req-001/verify",
        headers=headers,
        json={"action": "INVALID_ACTION"}
    )
    assert response.status_code == 400
    assert response.json["code"] == "INVALID_VERIFICATION_ACTION"


def test_verify_patient_request_success(client, generate_jwt):
    """Authorized medical staff verifies request clinical need."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/hospital/requests/req-001/verify",
        headers=headers,
        json={
            "action": "verified",
            "notes": "Patient admitted to Trauma Bay 3; Hb 6.8 g/dL; immediate PRBC transfusion required."
        }
    )
    assert response.status_code == 200
    data = response.json["data"]
    assert data["verification_status"] == "verified"


def test_record_transfusion_fulfilment_validation(client, generate_jwt):
    """Missing fields or invalid crossmatch returns 400."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}

    # Missing fields
    res1 = client.post("/api/v1/hospital/fulfilment", headers=headers, json={})
    assert res1.status_code == 400
    assert res1.json["code"] == "MISSING_FIELDS"

    # Invalid crossmatch
    res2 = client.post(
        "/api/v1/hospital/fulfilment",
        headers=headers,
        json={"request_id": "req-001", "crossmatch_result": "MAYBE_COMPATIBLE"}
    )
    assert res2.status_code == 400
    assert res2.json["code"] == "INVALID_CROSSMATCH"


def test_record_transfusion_fulfilment_success(client, generate_jwt):
    """Successful transfusion administration with compatible crossmatch."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post(
        "/api/v1/hospital/fulfilment",
        headers=headers,
        json={
            "request_id": "req-001",
            "batch_id": "batch-prbc-001",
            "crossmatch_result": "compatible",
            "notes": "Direct antiglobulin & major crossmatch compatible. 1 unit PRBC infused without adverse reaction."
        }
    )
    assert response.status_code == 201
    data = response.json["data"]
    assert data["crossmatch_result"] == "compatible"
    assert data["transfusion_outcome"] == "successful"


# =============================================================================
# 2. BLOOD BANK COMMAND CENTER TESTS
# =============================================================================

def test_bloodbank_dashboard_forbidden_for_non_facilities(client, generate_jwt):
    """Donors and patients cannot access blood bank inventory."""
    token = generate_jwt(user_id="donor-001", account_type="donor")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/bloodbank/dashboard", headers=headers)
    assert response.status_code == 403
    assert response.json["code"] == "FORBIDDEN_BLOOD_BANK_ROLE"


def test_bloodbank_dashboard_authorized(client, generate_jwt):
    """Blood bank facility role receives stock telemetry & group breakdown."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/bloodbank/dashboard", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "total_available_units" in data
    assert "units_under_testing" in data
    assert "units_near_expiry" in data
    assert "group_distribution" in data
    assert "critical_shortages_count" in data


def test_register_batch_validation(client, generate_jwt):
    """Validates blood group, component, and positive quantities."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    # Invalid blood group
    res1 = client.post(
        "/api/v1/bloodbank/inventory",
        headers=headers,
        json={"blood_group": "X+", "blood_component": "packed_red_cells", "volume_ml": 450}
    )
    assert res1.status_code == 400
    assert res1.json["code"] == "INVALID_BLOOD_GROUP"

    # Invalid component
    res2 = client.post(
        "/api/v1/bloodbank/inventory",
        headers=headers,
        json={"blood_group": "O-", "blood_component": "synthetic_substitute", "volume_ml": 450}
    )
    assert res2.status_code == 400
    assert res2.json["code"] == "INVALID_COMPONENT"

    # Negative volume / units
    res3 = client.post(
        "/api/v1/bloodbank/inventory",
        headers=headers,
        json={"blood_group": "O-", "blood_component": "packed_red_cells", "volume_ml": -100, "units_count": 0}
    )
    assert res3.status_code == 400
    assert res3.json["code"] == "INVALID_QUANTITY"


def test_register_platelets_batch_shelf_life(client, generate_jwt):
    """Platelets must receive acute 5-day shelf life at 20-24°C."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    today = datetime.now(timezone.utc).date()
    response = client.post(
        "/api/v1/bloodbank/inventory",
        headers=headers,
        json={
            "blood_group": "A+",
            "blood_component": "platelets",
            "volume_ml": 250,
            "units_count": 1.0,
            "collection_date": today.isoformat(),
            "storage_location": "Incubator Agitator Unit 1"
        }
    )
    assert response.status_code == 201
    data = response.json["data"]
    assert data["blood_component"] == "platelets"
    assert data["storage_temperature_celsius"] == 22.0
    assert data["status"] == "under_testing"

    # Expiry verification
    exp_dt = datetime.fromisoformat(data["expiry_date"].replace("Z", "+00:00")).date()
    assert (exp_dt - today).days in (5, 6) # 5 days difference


def test_register_prbc_batch_shelf_life(client, generate_jwt):
    """PRBC must receive 42-day shelf life at 4°C."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    today = datetime.now(timezone.utc).date()
    response = client.post(
        "/api/v1/bloodbank/inventory",
        headers=headers,
        json={
            "blood_group": "O-",
            "blood_component": "packed_red_cells",
            "volume_ml": 450,
            "units_count": 1.0,
            "collection_date": today.isoformat()
        }
    )
    assert response.status_code == 201
    data = response.json["data"]
    assert data["storage_temperature_celsius"] == 4.0

    exp_dt = datetime.fromisoformat(data["expiry_date"].replace("Z", "+00:00")).date()
    assert (exp_dt - today).days in (42, 43)


def test_laboratory_qc_screening(client, generate_jwt):
    """Submits laboratory infectious disease screening."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    # Passed QC advances to available
    response = client.post(
        "/api/v1/bloodbank/inventory/batch-prbc-001/qc",
        headers=headers,
        json={
            "hiv_screen": "negative",
            "hbv_screen": "negative",
            "hcv_screen": "negative",
            "syphilis_screen": "negative",
            "malaria_screen": "negative",
            "overall_result": "passed",
            "laboratory_notes": "All chemiluminescent immunoassays non-reactive."
        }
    )
    assert response.status_code == 200
    data = response.json["data"]
    assert data["status"] == "available"
    assert data["screening_status"] == "passed"


def test_inventory_batch_discard(client, generate_jwt):
    """Discards expired or compromised batch."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/api/v1/bloodbank/inventory/batch-prbc-001/discard",
        headers=headers,
        json={"reason": "Bag seal compromised during agitation."}
    )
    assert response.status_code == 200
    data = response.json["data"]
    assert data["status"] == "discarded"
    assert "Bag seal compromised" in data["discard_reason"]


# =============================================================================
# 3. DISPATCH & COLD-CHAIN TRANSIT TESTS
# =============================================================================

def test_cold_chain_dispatch_and_receive(client, generate_jwt):
    """Dispatches reserved units with DSP- code and confirms hospital intake."""
    bank_token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    hosp_token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")

    # Step 1: Blood bank dispatches units
    dsp_res = client.post(
        "/api/v1/bloodbank/reservations/rsv-001/dispatch",
        headers={"Authorization": f"Bearer {bank_token}"},
        json={
            "courier_name": "LifeFlight Medical Courier",
            "transport_box_id": "COLDBOX-774",
            "departure_temp_celsius": 3.8
        }
    )
    assert dsp_res.status_code == 201
    dsp_data = dsp_res.json["data"]
    assert "dispatch_code" in dsp_data
    assert dsp_data["dispatch_code"].startswith("DSP-")
    assert dsp_data["status"] == "in_transit"
    dispatch_id = dsp_data["id"]

    # Step 2: Hospital confirms delivery
    rcv_res = client.post(
        f"/api/v1/hospital/dispatches/{dispatch_id}/receive",
        headers={"Authorization": f"Bearer {hosp_token}"},
        json={
            "receiving_temp_celsius": 4.1,
            "notes": "Verified cold-chain temperature logger at 4.1°C. Units inspected intact."
        }
    )
    assert rcv_res.status_code == 200
    rcv_data = rcv_res.json["data"]
    assert rcv_data["status"] == "delivered"
    assert rcv_data["receiving_temp_celsius"] == 4.1


# =============================================================================
# 4. ALERTS, STAFF, REPORTS & DONATIONS
# =============================================================================

def test_facility_alerts_and_staff(client, generate_jwt):
    """Facility retrieves stock alerts and provisions staff."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    # Alerts
    res_alerts = client.get("/api/v1/facility/alerts", headers=headers)
    assert res_alerts.status_code == 200
    assert "alerts" in res_alerts.json["data"]

    # Staff list
    res_staff = client.get("/api/v1/facility/staff", headers=headers)
    assert res_staff.status_code == 200
    assert "staff" in res_staff.json["data"]

    # Provision staff member
    res_add = client.post(
        "/api/v1/facility/staff",
        headers=headers,
        json={
            "email": "sarah.chen@bloodlink.org",
            "staff_role": "lab_technician",
            "department": "Immunohematology Lab",
            "license_number": "LAB-TECH-99120"
        }
    )
    assert res_add.status_code == 201
    assert res_add.json["data"]["staff_role"] == "lab_technician"


def test_facility_reports_analytics(client, generate_jwt):
    """Facility clinical and inventory report retrieval."""
    token = generate_jwt(user_id="hosp-uuid-101", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get("/api/v1/facility/reports", headers=headers)

    assert response.status_code == 200
    data = response.json["data"]
    assert "metrics" in data
    assert "total_units_transfused" in data["metrics"]
    assert "testing_pass_rate_pct" in data["metrics"]


def test_facility_donation_verification(client, generate_jwt):
    """Facility retrieves and verifies donation phlebotomy sessions."""
    token = generate_jwt(user_id="bank-uuid-501", account_type="blood_bank")
    headers = {"Authorization": f"Bearer {token}"}

    # List donations
    res_list = client.get("/api/v1/facility/donations", headers=headers)
    assert res_list.status_code == 200
    assert "donations" in res_list.json["data"]

    # Verify donation
    res_verify = client.post(
        "/api/v1/facility/donations/don-001/verify",
        headers=headers,
        json={"units": 1.0, "notes": "Phlebotomy verified by Dr. Clara."}
    )
    assert res_verify.status_code == 200
    assert res_verify.json["data"]["verification_status"] == "verified"
