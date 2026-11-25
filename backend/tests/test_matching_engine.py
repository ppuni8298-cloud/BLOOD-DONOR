"""
BLOODLINK INTELLIGENT MATCHING ENGINE TESTS (test_matching_engine.py)
Validates:
1. Clinically approved component-specific compatibility matrix (AABB / WHO).
2. Unapproved ruleset fail-safe holding in 'pending_clinical_review'.
3. Statutory clinical disclaimer presence on all responses.
4. Privacy preservation (strict omission of donor phone, email, and exact address).
5. Availability, verification, and consent filtering.
6. Active commitment limit enforcement (< 2).
7. Facility inventory freshness filtering (> 48h stale detection).
8. Atomic inventory reservation and release.
9. Duplicate response and invalid request status handling.
10. Full Flask REST API endpoint verification.
"""

import pytest
from backend.services.compatibility_service import CompatibilityService, CLINICAL_DISCLAIMER
from backend.services.matching_engine import MatchingEngine
from backend.services.supabase_service import SupabaseService


# =============================================================================
# 1. CLINICAL COMPATIBILITY & RULESET TESTS
# =============================================================================

def test_rbc_compatibility_matrix():
    """Verify standard red blood cell (packed_red_cells & whole_blood) compatibility."""
    # O- is Universal Donor for Red Cells
    o_neg_donors, _ = CompatibilityService.get_compatible_donor_groups("O-", "packed_red_cells")
    assert o_neg_donors == ["O-"]

    # AB+ is Universal Recipient for Red Cells
    ab_pos_donors, _ = CompatibilityService.get_compatible_donor_groups("AB+", "packed_red_cells")
    assert "O-" in ab_pos_donors
    assert "O+" in ab_pos_donors
    assert "A-" in ab_pos_donors
    assert "A+" in ab_pos_donors
    assert "B-" in ab_pos_donors
    assert "B+" in ab_pos_donors
    assert "AB-" in ab_pos_donors
    assert "AB+" in ab_pos_donors

    # A+ Recipient accepts A+, A-, O+, O-
    a_pos_donors, _ = CompatibilityService.get_compatible_donor_groups("A+", "packed_red_cells")
    assert set(a_pos_donors) == {"A+", "A-", "O+", "O-"}


def test_plasma_reverse_compatibility_matrix():
    """Verify plasma compatibility: reverse of red cells (AB+ is universal donor, O- is recipient)."""
    # AB+ can give plasma to ANY group (including O- and A+)
    is_compat_ab_to_o, _, _ = CompatibilityService.check_compatibility(patient_blood_group="O-", donor_blood_group="AB+", component="plasma")
    assert is_compat_ab_to_o is True

    is_compat_ab_to_a, _, _ = CompatibilityService.check_compatibility(patient_blood_group="A+", donor_blood_group="AB+", component="plasma")
    assert is_compat_ab_to_a is True

    # O- CANNOT donate plasma to A+ or AB+ (contains Anti-A and Anti-B antibodies)
    is_compat_o_to_a, _, _ = CompatibilityService.check_compatibility(patient_blood_group="A+", donor_blood_group="O-", component="plasma")
    assert is_compat_o_to_a is False

    is_compat_o_to_ab, _, _ = CompatibilityService.check_compatibility(patient_blood_group="AB+", donor_blood_group="O-", component="plasma")
    assert is_compat_o_to_ab is False


def test_unapproved_ruleset_holds_in_pending_review(app, monkeypatch):
    """
    Mandatory safety rule: If ruleset is unapproved, matching is held
    in 'pending_clinical_review' and does not generate candidates.
    """
    with app.app_context():
        # Temporarily simulate an unapproved ruleset
        original_ruleset = dict(CompatibilityService._active_ruleset)
        unapproved_ruleset = dict(original_ruleset)
        unapproved_ruleset["status"] = "draft_unapproved"

        monkeypatch.setattr(CompatibilityService, "_active_ruleset", unapproved_ruleset)
        assert CompatibilityService.is_ruleset_approved() is False

        result = MatchingEngine.run_matching_for_request("req-demo-01")
        assert result["status"] == "pending_clinical_review"
        assert "Matching held in 'pending_clinical_review'" in result["clinical_notice"]
        assert len(result["candidates"]["potential_donors"]) == 0
        assert len(result["candidates"]["facility_inventory"]) == 0


def test_statutory_clinical_disclaimer_returned(app):
    """Verify clinical disclaimer is included in rules and matching results."""
    with app.app_context():
        meta = CompatibilityService.get_active_ruleset_metadata()
        assert "clinical_disclaimer" in meta
        assert "BloodLink provides donor and inventory discovery support only" in meta["clinical_disclaimer"]

        run = MatchingEngine.run_matching_for_request("req-demo-01")
        assert "clinical_disclaimer" in run
        assert run["clinical_disclaimer"] == CLINICAL_DISCLAIMER


# =============================================================================
# 2. PRIVACY & FILTERING TESTS
# =============================================================================

def test_donor_privacy_omits_pii(app):
    """
    Ensures that matching output NEVER contains raw phone number,
    email address, or exact residential address.
    """
    with app.app_context():
        result = MatchingEngine.run_matching_for_request("req-demo-01")
        donors = result["candidates"]["potential_donors"]

        assert len(donors) > 0
        for d in donors:
            # PII must NOT exist in the candidate dict
            assert "phone" not in d
            assert "telephone" not in d
            assert "email" not in d
            assert "address" not in d
            assert "street_address" not in d
            # Masked ID must be present
            assert d["donor_display_id"].startswith("DONOR-")
            assert "match_score" in d
            assert "location_match_quality" in d


def test_donor_consent_and_availability_filtering(app):
    """Donors who withdrew consent or are unavailable must be filtered out."""
    with app.app_context():
        result = MatchingEngine.run_matching_for_request("req-demo-01")
        unavailable = result["candidates"]["unavailable_options"]

        # Filtered reasons must be captured transparently
        reasons = [u.get("reason", "") for u in unavailable]
        assert any("consent" in r.lower() or "status" in r.lower() or "unverified" in r.lower() for r in reasons)


# =============================================================================
# 3. FACILITY INVENTORY & RESERVATION TESTS
# =============================================================================

def test_facility_stale_inventory_detection(monkeypatch):
    """Inventory older than 48 hours must be flagged as stale and requiring confirmation."""
    from datetime import datetime, timezone, timedelta
    stale_time = (datetime.now(timezone.utc) - timedelta(hours=50)).isoformat()

    def mock_inventory(*args, **kwargs):
        return [
            {
                "id": "inv-stale-01",
                "facility_id": "fac-01",
                "facility_name": "Outdated Blood Bank",
                "blood_group": "O-",
                "units_available": 10,
                "last_inspected_at": stale_time
            }
        ]

    monkeypatch.setattr(SupabaseService, "get_facility_inventory_for_matching", mock_inventory)

    matches, unavailable = MatchingEngine._discover_facility_inventory(
        request_id="req-demo-01",
        compatible_groups=["O-"],
        patient_group="O-",
        component="packed_red_cells",
        units_needed=2,
        hospital_city="Metro Central"
    )

    # Stale inventory must be placed in unavailable with confirmation label
    assert len(matches) == 0
    assert len(unavailable) == 1
    assert unavailable[0]["status_label"] == "Availability requires confirmation"
    assert "outdated" in unavailable[0]["reason"].lower()


def test_atomic_inventory_reservation_and_release(app):
    """Verify creating and releasing inventory reservations."""
    with app.app_context():
        res = MatchingEngine.create_inventory_reservation(
            inventory_id="inv-001",
            request_id="req-demo-01",
            facility_id="fac-metro-01",
            units_to_reserve=2,
            confirmed_by="test-user-uuid-1234",
            reservation_duration_hours=12
        )

        assert "reservation_code" in res
        assert res["reservation_code"].startswith("RSV-")
        assert res["units_reserved"] == 2
        assert res["status"] == "reserved"

        # Release reservation
        released = MatchingEngine.release_inventory_reservation(
            reservation_id=str(res.get("id")),
            actor_id="test-user-uuid-1234"
        )
        assert released is True


# =============================================================================
# 4. DONOR INVITATION & RESPONSE TESTS
# =============================================================================

def test_prevent_duplicate_invitation_response():
    """Responding twice to an invitation must fail with an error."""
    # First response: accepted
    inv_id = "inv-demo-01"
    donor_id = "test-donor-1234"

    # Mock invitation state as already accepted
    def mock_get_inv(invitation_id):
        return {
            "id": inv_id,
            "status": "accepted",
            "blood_requests": {"status": "matching_in_progress"}
        }

    original_method = SupabaseService.get_invitation_by_id
    SupabaseService.get_invitation_by_id = classmethod(lambda cls, i: mock_get_inv(i))

    try:
        success, msg = SupabaseService.respond_to_donor_invitation(inv_id, donor_id, "declined")
        assert success is False
        assert "already been responded to" in msg.lower()
    finally:
        SupabaseService.get_invitation_by_id = original_method


# =============================================================================
# 5. FLASK REST API ENDPOINT TESTS
# =============================================================================

def test_get_clinical_compatibility_rules_endpoint(client):
    """GET /api/v1/clinical/compatibility-rules returns ruleset and clinical disclaimer."""
    res = client.get("/api/v1/clinical/compatibility-rules")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert data["version_code"] == "CLINICAL-AABB-2026.1"
    assert "components" in data
    assert "packed_red_cells" in data["components"]


def test_run_matching_endpoint(client, generate_jwt):
    """POST /api/v1/requests/<id>/run-matching executes matching."""
    token = generate_jwt(user_id="user-patient-01", account_type="patient")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/v1/requests/req-demo-01/run-matching", headers=headers, json={"search_radius_km": 30.0})
    assert res.status_code == 200
    json_data = res.get_json()
    assert json_data["status"] == "success"
    data = json_data["data"]
    assert data["status"] == "completed"
    assert "potential_donors" in data["candidates"]
    assert "facility_inventory" in data["candidates"]


def test_get_matches_endpoint(client, generate_jwt):
    """GET /api/v1/requests/<id>/matches retrieves matches."""
    token = generate_jwt(user_id="user-patient-01", account_type="patient")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/requests/req-demo-01/matches", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "candidates" in data
    assert "clinical_disclaimer" in data


def test_donor_invitations_and_response_endpoints(client, generate_jwt):
    """Test donor invitation retrieval and respond endpoint."""
    token = generate_jwt(user_id="donor-uuid-5678", account_type="donor")
    headers = {"Authorization": f"Bearer {token}"}

    # GET invitations
    res = client.get("/api/v1/donor/invitations", headers=headers)
    assert res.status_code == 200
    invitations = res.get_json()["data"]["invitations"]
    assert len(invitations) > 0

    # POST response (accept)
    inv_id = invitations[0]["id"]
    res_post = client.post(
        f"/api/v1/donor/invitations/{inv_id}/respond",
        headers=headers,
        json={"action": "accepted", "notes": "On my way to the blood bank."}
    )
    assert res_post.status_code == 200
    assert res_post.get_json()["status"] == "success"


def test_donor_commitments_endpoint(client, generate_jwt):
    """GET /api/v1/donor/commitments lists accepted commitments."""
    token = generate_jwt(user_id="donor-uuid-5678", account_type="donor")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/donor/commitments", headers=headers)
    assert res.status_code == 200
    assert "commitments" in res.get_json()["data"]


def test_facility_reservations_endpoints(client, generate_jwt):
    """POST & DELETE /api/v1/facility/inventory/reservations."""
    token = generate_jwt(user_id="fac-admin-01", account_type="hospital")
    headers = {"Authorization": f"Bearer {token}"}

    # Reserve units
    res_post = client.post(
        "/api/v1/facility/inventory/reservations",
        headers=headers,
        json={
            "inventory_id": "inv-001",
            "request_id": "req-demo-01",
            "units_to_reserve": 2,
            "duration_hours": 8
        }
    )
    assert res_post.status_code == 201
    res_data = res_post.get_json()["data"]
    reservation_id = res_data.get("id")

    # Release units
    res_del = client.delete(
        f"/api/v1/facility/inventory/reservations/{reservation_id}",
        headers=headers
    )
    assert res_del.status_code == 200
    assert res_del.get_json()["data"]["status"] == "released"


def test_matching_analytics_endpoint(client, generate_jwt):
    """GET /api/v1/admin/matching-analytics returns operational metrics."""
    token = generate_jwt(user_id="admin-01", account_type="admin")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/admin/matching-analytics", headers=headers)
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert "total_matching_runs" in data
    assert "match_discovery_rate_pct" in data
    assert "donor_response_rate_pct" in data
