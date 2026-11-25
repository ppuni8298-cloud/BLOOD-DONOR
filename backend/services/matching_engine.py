"""
BLOODLINK CENTRAL INTELLIGENT MATCHING ENGINE (matching_engine.py)
Automates multi-factor candidate discovery for patient emergency blood requests:
1. Clinically approved component-specific compatibility filtering
2. Verified consenting donor discovery with privacy preservation
3. Verified blood bank and hospital inventory matching with freshness checks
4. Transparent priority scoring (Critical, Urgent, Scheduled)
5. Atomic inventory reservations preventing race conditions & double allocation
6. Donor invitation and response management
"""

import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any
from flask import current_app

from backend.services.compatibility_service import CompatibilityService, CLINICAL_DISCLAIMER
from backend.services.supabase_service import SupabaseService
from backend.services.audit_service import AuditService

STALE_INVENTORY_THRESHOLD_HOURS = 48
DEFAULT_SEARCH_RADIUS_KM = 25.0


class MatchingEngine:

    @classmethod
    def run_matching_for_request(
        cls,
        request_id: str,
        triggered_by: Optional[str] = None,
        search_radius_km: float = DEFAULT_SEARCH_RADIUS_KM
    ) -> Dict[str, Any]:
        """
        Executes the intelligent matching algorithm for a given blood request.
        Returns full matching run summary and classified candidates.
        """
        start_time = time.time()

        # 1. Fetch Request
        req = SupabaseService.get_blood_request_by_id(request_id)
        if not req:
            raise ValueError(f"Blood request '{request_id}' not found.")

        req_status = req.get("status")
        if req_status in ["cancelled", "rejected"]:
            raise ValueError(f"Cannot run matching on {req_status} request.")

        patient_group = req.get("blood_group")
        component = req.get("blood_component", "packed_red_cells")
        units_needed = int(req.get("units_needed", 1))
        hospital_city = req.get("hospital_city", "").strip()
        hospital_district = req.get("hospital_district", "").strip()
        urgency_priority = req.get("urgency_priority", "urgent")
        required_datetime_str = req.get("required_datetime")

        # 2. Check Clinical Compatibility Ruleset Status
        ruleset_meta = CompatibilityService.get_active_ruleset_metadata()
        if not CompatibilityService.is_ruleset_approved():
            # Mandatory constraint: If ruleset is unapproved, matching is held in pending review
            run_result = {
                "request_id": request_id,
                "status": "pending_clinical_review",
                "ruleset_version": ruleset_meta.get("version_code"),
                "clinical_notice": "Matching held in 'pending_clinical_review'. Active compatibility dataset requires clinical review.",
                "candidates": {
                    "potential_donors": [],
                    "facility_inventory": [],
                    "awaiting_responses": [],
                    "confirmed_responses": [],
                    "unavailable_options": []
                },
                "summary": {
                    "total_candidates": 0,
                    "donors_count": 0,
                    "facilities_count": 0,
                    "execution_time_ms": int((time.time() - start_time) * 1000)
                }
            }
            return run_result

        compatible_groups, _ = CompatibilityService.get_compatible_donor_groups(patient_group, component)

        # 3. Discover Potential Consenting Donors
        potential_donors, unavailable_donors = cls._discover_donors(
            request_id=request_id,
            compatible_groups=compatible_groups,
            patient_group=patient_group,
            component=component,
            hospital_city=hospital_city,
            hospital_district=hospital_district,
            urgency_priority=urgency_priority
        )

        # 4. Discover Verified Facility Inventory
        facility_matches, unavailable_facilities = cls._discover_facility_inventory(
            request_id=request_id,
            compatible_groups=compatible_groups,
            patient_group=patient_group,
            component=component,
            units_needed=units_needed,
            hospital_city=hospital_city
        )

        # 5. Fetch Awaiting Invitations & Confirmed Responses
        awaiting_responses, confirmed_responses = cls._classify_invitations_and_responses(request_id)

        execution_time_ms = int((time.time() - start_time) * 1000)
        total_candidates = len(potential_donors) + len(facility_matches)

        # 6. Record Matching Run in Database / Audit
        run_record = {
            "request_id": request_id,
            "triggered_by": triggered_by,
            "status": "completed",
            "candidates_found": total_candidates,
            "donors_matched": len(potential_donors),
            "facilities_matched": len(facility_matches),
            "execution_time_ms": execution_time_ms,
            "search_radius_km": search_radius_km,
            "metadata": {
                "patient_group": patient_group,
                "component": component,
                "units_needed": units_needed,
                "urgency_priority": urgency_priority,
                "compatible_groups": compatible_groups,
                "ruleset_version": ruleset_meta.get("version_code")
            }
        }
        SupabaseService.save_matching_run(run_record)

        # Log audit trail
        AuditService.record_event(
            actor_id=triggered_by or req.get("requester_id"),
            action="MATCHING_RUN_EXECUTED",
            entity_type="blood_requests",
            entity_id=request_id,
            metadata={
                "candidates_count": total_candidates,
                "donors_count": len(potential_donors),
                "facilities_count": len(facility_matches)
            }
        )

        return {
            "request_id": request_id,
            "status": "completed",
            "ruleset": ruleset_meta,
            "request_summary": {
                "patient_name": req.get("patient_name"),
                "blood_group": patient_group,
                "component": component,
                "units_needed": units_needed,
                "urgency_priority": urgency_priority,
                "hospital_name": req.get("hospital_name"),
                "hospital_city": hospital_city
            },
            "candidates": {
                "potential_donors": potential_donors,
                "facility_inventory": facility_matches,
                "awaiting_responses": awaiting_responses,
                "confirmed_responses": confirmed_responses,
                "unavailable_options": unavailable_donors + unavailable_facilities
            },
            "summary": {
                "total_candidates": total_candidates,
                "donors_count": len(potential_donors),
                "facilities_count": len(facility_matches),
                "awaiting_responses_count": len(awaiting_responses),
                "confirmed_responses_count": len(confirmed_responses),
                "execution_time_ms": execution_time_ms
            },
            "clinical_disclaimer": CLINICAL_DISCLAIMER
        }

    # =========================================================================
    # DONOR DISCOVERY & PRIVACY-PRESERVING FILTERING
    # =========================================================================

    @classmethod
    def _discover_donors(
        cls,
        request_id: str,
        compatible_groups: List[str],
        patient_group: str,
        component: str,
        hospital_city: str,
        hospital_district: str,
        urgency_priority: str
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Discovers compatible donors while strictly preserving privacy:
        - NEVER exposes private phone, email, or exact residential address.
        - Filters out unverified profiles, withdrawn consent, unavailable states.
        - Computes priority and match quality scoring.
        """
        raw_donors = SupabaseService.get_active_donors_for_matching(
            compatible_groups=compatible_groups,
            city=hospital_city
        )

        potential_donors = []
        unavailable_donors = []

        for d in raw_donors:
            donor_id = d.get("id")
            donor_group = d.get("blood_group")
            city = d.get("city", "")
            district = d.get("district", "")
            is_verified = d.get("is_verified", False)
            consent = d.get("consent_to_discovery", False)
            availability = d.get("availability_status", "available")
            active_commitments = d.get("active_commitments_count", 0)

            # Safety and Consent Filters
            if not consent:
                unavailable_donors.append({
                    "candidate_type": "donor",
                    "donor_id_masked": f"DONOR-{donor_id[:6].upper()}",
                    "reason": "Discovery consent not granted or withdrawn."
                })
                continue

            if availability != "available":
                unavailable_donors.append({
                    "candidate_type": "donor",
                    "donor_id_masked": f"DONOR-{donor_id[:6].upper()}",
                    "reason": f"Donor status is '{availability}'."
                })
                continue

            if not is_verified:
                unavailable_donors.append({
                    "candidate_type": "donor",
                    "donor_id_masked": f"DONOR-{donor_id[:6].upper()}",
                    "reason": "Donor clinical profile unverified."
                })
                continue

            if active_commitments >= 2:
                unavailable_donors.append({
                    "candidate_type": "donor",
                    "donor_id_masked": f"DONOR-{donor_id[:6].upper()}",
                    "reason": "Donor currently has multiple active emergency commitments."
                })
                continue

            # Location match quality
            location_quality = "regional_transit"
            distance_approx = 25.0
            if city.lower() == hospital_city.lower():
                if district and hospital_district and district.lower() == hospital_district.lower():
                    location_quality = "district"
                    distance_approx = 6.0
                else:
                    location_quality = "exact_city"
                    distance_approx = 12.0

            # Match Score Computation (0 - 100)
            score = 60.0
            # Exact ABO/Rh match bonus
            if donor_group == patient_group:
                score += 25.0
            else:
                score += 15.0

            # Location bonus
            if location_quality == "district":
                score += 15.0
            elif location_quality == "exact_city":
                score += 10.0

            # Urgency factor
            if urgency_priority == "critical":
                score = min(100.0, score + 5.0)

            match_score = round(min(100.0, score), 1)

            # Privacy-Preserved Donor Candidate representation
            # Phone, email, and street address are omitted!
            potential_donors.append({
                "candidate_type": "donor",
                "candidate_id": f"cand-donor-{donor_id[:8]}",
                "donor_id": donor_id,
                "donor_display_id": f"DONOR-{donor_id[:6].upper()}",
                "blood_group": donor_group,
                "component": component,
                "match_score": match_score,
                "location_match_quality": location_quality,
                "approximate_distance_km": distance_approx,
                "service_area": f"{city} ({district})" if district else city,
                "is_identical_match": donor_group == patient_group,
                "units_available": 1,
                "verification_status": "verified",
                "explanation": {
                    "compatibility": f"Clinically verified {donor_group} to {patient_group} compatibility for {component}.",
                    "location_score": f"Matched by {location_quality.replace('_', ' ')}.",
                    "consent_verified": True
                }
            })

        # Sort potential donors by match score descending
        potential_donors.sort(key=lambda x: x["match_score"], reverse=True)
        return potential_donors, unavailable_donors

    # =========================================================================
    # FACILITY INVENTORY MATCHING & STALENESS FILTERING
    # =========================================================================

    @classmethod
    def _discover_facility_inventory(
        cls,
        request_id: str,
        compatible_groups: List[str],
        patient_group: str,
        component: str,
        units_needed: int,
        hospital_city: str
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Discovers verified inventory across blood banks and hospitals:
        - Filters out stale inventory (> 48 hours without inspection).
        - Prevents matching zero-stock items.
        - Calculates units coverage.
        """
        raw_inventory = SupabaseService.get_facility_inventory_for_matching(
            compatible_groups=compatible_groups,
            component=component,
            city=hospital_city
        )

        facility_matches = []
        unavailable_facilities = []
        now = datetime.now(timezone.utc)

        for inv in raw_inventory:
            inv_id = inv.get("id")
            facility_id = inv.get("facility_id")
            facility_name = inv.get("facility_name", "Regional Blood Bank")
            facility_type = inv.get("facility_type", "blood_bank")
            blood_group = inv.get("blood_group")
            units_available = int(inv.get("units_available", 0))
            city = inv.get("city", hospital_city)
            last_inspected_str = inv.get("last_inspected_at") or inv.get("updated_at")

            # Check Freshness
            is_stale = False
            hours_old = 0
            if last_inspected_str:
                try:
                    inspect_time = datetime.fromisoformat(str(last_inspected_str).replace("Z", "+00:00"))
                    hours_old = (now - inspect_time).total_seconds() / 3600.0
                    if hours_old > STALE_INVENTORY_THRESHOLD_HOURS:
                        is_stale = True
                except Exception:
                    pass

            if units_available <= 0:
                unavailable_facilities.append({
                    "candidate_type": "facility_inventory",
                    "facility_name": facility_name,
                    "reason": f"Depleted inventory for {blood_group} ({component})."
                })
                continue

            if is_stale:
                unavailable_facilities.append({
                    "candidate_type": "facility_inventory",
                    "facility_name": facility_name,
                    "blood_group": blood_group,
                    "reason": f"Stock data outdated ({int(hours_old)}h ago). Availability requires confirmation.",
                    "status_label": "Availability requires confirmation"
                })
                continue

            # Location Match Quality
            loc_quality = "exact_city" if city.lower() == hospital_city.lower() else "service_area_radius"

            # Scoring
            score = 70.0
            if blood_group == patient_group:
                score += 15.0
            if units_available >= units_needed:
                score += 15.0
            else:
                score += (units_available / units_needed) * 10.0

            match_score = round(min(100.0, score), 1)

            facility_matches.append({
                "candidate_type": "facility_inventory",
                "candidate_id": f"cand-inv-{inv_id[:8]}",
                "inventory_id": inv_id,
                "facility_id": facility_id,
                "facility_name": facility_name,
                "facility_type": facility_type,
                "blood_group": blood_group,
                "component": component,
                "units_available": units_available,
                "units_covered": min(units_available, units_needed),
                "freshness_hours": round(hours_old, 1),
                "is_stale": False,
                "match_score": match_score,
                "location_match_quality": loc_quality,
                "city": city,
                "explanation": {
                    "stock_status": f"{units_available} units available in cold-chain reserve.",
                    "freshness": f"Inspected {round(hours_old, 1)} hours ago.",
                    "coverage": f"Covers {min(units_available, units_needed)} of {units_needed} requested units."
                }
            })

        facility_matches.sort(key=lambda x: x["match_score"], reverse=True)
        return facility_matches, unavailable_facilities

    # =========================================================================
    # INVITATION & RESPONSE CLASSIFICATION
    # =========================================================================

    @classmethod
    def _classify_invitations_and_responses(cls, request_id: str) -> Tuple[List[Dict], List[Dict]]:
        """
        Classifies active invitations and confirmed responses for the request.
        """
        raw_invitations = SupabaseService.get_invitations_for_request(request_id)
        raw_reservations = SupabaseService.get_reservations_for_request(request_id)

        awaiting = []
        confirmed = []

        for inv in raw_invitations:
            status = inv.get("status")
            donor_id = inv.get("donor_id", "masked")
            masked_name = f"Donor Node #{donor_id[:6].upper()}"

            item = {
                "invitation_id": inv.get("id"),
                "donor_masked_label": masked_name,
                "status": status,
                "sent_at": inv.get("created_at"),
                "expires_at": inv.get("expires_at"),
                "responded_at": inv.get("responded_at")
            }

            if status == "pending":
                awaiting.append(item)
            elif status == "accepted":
                confirmed.append({
                    **item,
                    "response_type": "donor_accepted",
                    "message": "Donor accepted emergency broadcast. Triage coordinator notified for scheduling."
                })

        for res in raw_reservations:
            status = res.get("status")
            if status in ["reserved", "confirmed"]:
                confirmed.append({
                    "reservation_id": res.get("id"),
                    "reservation_code": res.get("reservation_code"),
                    "facility_name": res.get("facility_name", "Blood Bank"),
                    "units_reserved": res.get("units_reserved", 1),
                    "status": status,
                    "response_type": "facility_reserved",
                    "expires_at": res.get("expires_at")
                })

        return awaiting, confirmed

    # =========================================================================
    # ATOMIC INVENTORY RESERVATION LOGIC
    # =========================================================================

    @classmethod
    def create_inventory_reservation(
        cls,
        inventory_id: str,
        request_id: str,
        facility_id: str,
        units_to_reserve: int,
        confirmed_by: str,
        reservation_duration_hours: int = 12
    ) -> Dict[str, Any]:
        """
        Atomically creates an inventory reservation:
        - Prevents double allocation and race conditions.
        - Verifies that required units are available in stock.
        - Deducts or locks units and issues a unique reservation code.
        """
        if units_to_reserve <= 0:
            raise ValueError("Units to reserve must be greater than zero.")

        # Atomic transaction execution via SupabaseService
        reservation = SupabaseService.create_atomic_reservation(
            inventory_id=inventory_id,
            request_id=request_id,
            facility_id=facility_id,
            units_to_reserve=units_to_reserve,
            confirmed_by=confirmed_by,
            duration_hours=reservation_duration_hours
        )

        AuditService.record_event(
            actor_id=confirmed_by,
            action="INVENTORY_RESERVATION_CREATED",
            entity_type="inventory_reservations",
            entity_id=str(reservation.get("id")),
            metadata={
                "reservation_code": reservation.get("reservation_code"),
                "units_reserved": units_to_reserve,
                "inventory_id": inventory_id
            }
        )

        return reservation

    @classmethod
    def release_inventory_reservation(cls, reservation_id: str, actor_id: str) -> bool:
        """
        Releases an active inventory reservation, restoring units to available status.
        """
        success = SupabaseService.release_reservation(reservation_id)
        if success:
            AuditService.record_event(
                actor_id=actor_id,
                action="INVENTORY_RESERVATION_RELEASED",
                entity_type="inventory_reservations",
                entity_id=reservation_id,
                metadata={"released_by": actor_id}
            )
        return success
