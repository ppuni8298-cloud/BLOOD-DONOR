# BloodLink Intelligent Blood Matching & Donor Discovery Engine

## 1. System Architecture & Overview

The **BloodLink Central Intelligent Matching Engine** (`backend/services/matching_engine.py`) provides automated multi-factor discovery to fulfill urgent and critical emergency blood transfusion requisitions across three distinct inventory streams:
1. **Registered, Consenting, and Clinically Verified Donors**
2. **Certified Hospital Cold-Chain Inventory**
3. **Regional Blood Bank Reserves**

The engine is engineered to bridge acute trauma resuscitation requirements with clinical precision, real-time geographic proximity, stock freshness verification, and strict donor privacy preservation.

```
                              ┌───────────────────────────────────┐
                              │     Emergency Blood Request       │
                              │  (Patient Group, Component, City) │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │  Clinical Compatibility Matrix    │
                              │  (AABB / WHO Ruleset 2026.1)      │
                              └─────────┬───────────────┬─────────┘
                                        │               │
                        Approved Groups │               │ Unapproved Ruleset
                                        ▼               ▼
                      ┌─────────────────────────┐   ┌───────────────────────────┐
                      │ Multi-Factor Discovery  │   │ pending_clinical_review   │
                      │ Engine Scoring (0-100)  │   │ (Zero Unverified Matches) │
                      └────────────┬────────────┘   └───────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ Consenting Donors│     │ Facility Stock   │     │ Active Responses │
│  - Privacy Mask  │     │  - Freshness     │     │  - Invitations   │
│  - Distance/Area │     │    (<48h fresh)  │     │  - Reservations  │
│  - Active Commit.│     │  - Atomic Lock   │     │    (RSV-Code)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## 2. Multi-Factor Scoring & Ranking Weights

Candidates are evaluated across four weighted dimensions yielding a composite match score between `0.0` and `100.0`:

| Dimension | Maximum Score | Clinical & Operational Criteria |
| :--- | :---: | :--- |
| **Component Compatibility** | 25.0 pts | Identical ABO/Rh matches receive `+25.0` pts; cross-compatible groups (e.g. O- to A+ red cells) receive `+15.0` pts. |
| **Geographic Proximity** | 15.0 pts | Same hospital district/sector (`+15.0` pts); exact city municipality (`+10.0` pts); regional transit radius (`+5.0` pts). |
| **Inventory Freshness & Coverage**| 15.0 pts | Stock inspected $\le$ 48h covering 100% of required units (`+15.0` pts); partial coverage scaled proportionally. |
| **Clinical Urgency Modifier** | 5.0 pts | Critical/Code Red requisitions receive emergency escalation bonus (`+5.0` pts) capping at `100.0`. |
| **Baseline Clinical Safety** | 60.0 pts | Base allocation for any clinically verified candidate meeting all baseline safety and consent prerequisites. |

---

## 3. Five-Stream Output Categorization

The matching output is partitioned into five distinct operational buckets:

1. **`potential_donors`**: Registered consenting donors matching ABO/Rh component rules, sorted descending by match score. Includes approximate distance, masked ID, and compatibility audit explanation.
2. **`facility_inventory`**: Verified hospital and blood bank reserves with valid cold-chain certifications, inspected within 48 hours, covering requested units.
3. **`awaiting_responses`**: Emergency broadcast invitations dispatched to compatible donor nodes that are currently awaiting acknowledgment.
4. **`confirmed_responses`**: Donor nodes that have accepted the emergency broadcast and time-locked facility inventory reservations (`RSV-YYYY-XXXXX`).
5. **`unavailable_options`**: Discovered candidates excluded with transparent clinical rationales (e.g., `"Stock data outdated (50h ago). Availability requires confirmation"`, `"Discovery consent not granted"`, or `"Donor currently has multiple active emergency commitments"`).

---

## 4. Strict Donor Privacy Preservation Protocols

Under HIPAA, GDPR, and clinical ethics guidelines, private donor telemetry is strictly protected:
- **Zero PII Leakage**: Personal telephone numbers, email addresses, and exact residential street addresses are **never exposed** in matching API payloads or patient dashboard views.
- **Masked Clinical Identifiers**: Donors are represented via cryptographic display codes (e.g. `DONOR-0101`, `DONOR-E48A`).
- **Service Area Aggregation**: Locations are generalized to municipality or district level (e.g. `Metro Central (Sector 4)`), preserving geographic utility without disclosing residential coordinates.
- **Controlled Contact Routing**: Communication is routed through verified hospital triage desks and emergency broadcast codes. Direct donor contact is only established upon voluntary acceptance and hospital intake scheduling.

---

## 5. Cold-Chain Freshness & Stale Inventory Checks

Blood components possess limited clinical shelf-lives (e.g. 5 days for platelets, 35–42 days for red cells). Inventory records that have not been physically inspected or electronically verified within 48 hours are automatically flagged:
- **Threshold**: `STALE_INVENTORY_THRESHOLD_HOURS = 48`
- **Mitigation Action**: Any inventory item whose `last_inspected_at` or `updated_at` exceeds 48 hours is excluded from the primary matching list and routed to `unavailable_options` with the mandatory operational label:
  > **"Availability requires confirmation"**
- Prevents trauma teams from dispatching couriers to unverified or depleted storage units.

---

## 6. Atomic Inventory Reservations (`RSV-YYYY-XXXXX`)

To prevent race conditions, double allocation, and stock exhaustion across multiple hospital emergency requests:
- **Code Generation Trigger**: Database trigger `generate_reservation_code()` automatically assigns sequential codes formatted as `RSV-YYYY-XXXXX`.
- **Time-Lock Window**: Reservations include a default 12-hour expiration window (`expires_at`), releasing units automatically back to general inventory if not collected by medical couriers.
- **Atomic Concurrency**: Implemented with row-level locks preventing simultaneous double-booking of cold-chain units.
- **Release API**: Authorized medical personnel can release reservations (`DELETE /api/v1/facility/inventory/reservations/<id>`), returning units to general circulation.

---

## 7. Fail-Safe Clinical Hold States (`pending_clinical_review`)

If the active compatibility matrix in `matching_rule_versions` is unapproved, revoked, or undergoing medical board review:
- The engine halts candidate discovery immediately.
- Returns status `pending_clinical_review`.
- Produces zero unverified matches rather than guessing compatibility.
- Surfaces the statutory clinical notice instructing medical staff to execute manual laboratory crossmatching.

---

## 8. Statutory Clinical Disclaimer

> **Statutory Notice:** BloodLink provides donor and inventory discovery support only. Selecting a blood group or component does not establish transfusion compatibility. All compatibility, component selection, antibody screening, and crossmatching must be strictly verified and authorized by qualified medical transfusion professionals.
