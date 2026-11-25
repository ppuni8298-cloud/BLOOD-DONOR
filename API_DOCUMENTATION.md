# BloodLink — Python Flask REST API Documentation

**Version**: 2.0.0  
**Base URL**: `http://localhost:5000`  
**Authentication**: Supabase JWT (`Authorization: Bearer <token>`)

---

## 1. Authentication Overview

All endpoints under `/api/v1/*` require an `Authorization` header containing a valid Supabase access token:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Tokens are verified cryptographically via `backend/middleware/auth_middleware.py` against the `SUPABASE_JWT_SECRET`.

---

## 2. API Endpoints

### 2.1 Public Health Check
**`GET /api/health`**

Inspects service status, environment, and database connectivity.

**Request**:
```http
GET /api/health HTTP/1.1
Host: localhost:5000
Accept: application/json
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "BloodLink API is operational.",
  "data": {
    "service": "BloodLink REST API",
    "version": "2.0.0",
    "environment": "development",
    "status": "healthy",
    "timestamp": "2026-11-24T14:40:00.000000+00:00",
    "integrations": {
      "supabase_postgresql": "configured",
      "jwt_verification": "active"
    }
  }
}
```

---

### 2.2 Get Authenticated Profile
**`GET /api/v1/me`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Extracts identity directly from the verified token signature and returns the authenticated user's profile.

**Request**:
```http
GET /api/v1/me HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_access_token>
Accept: application/json
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Authenticated user profile retrieved.",
  "data": {
    "user": {
      "id": "e2b12345-6789-4abc-9def-0123456789ab",
      "full_name": "Dr. Elena Rostova",
      "email": "dr.elena@hospital.org",
      "phone": "+1 (555) 019-2041",
      "account_type": "hospital",
      "city": "Metro Central",
      "district": "Sector 4",
      "is_verified": true,
      "account_status": "active",
      "created_at": "2026-11-24T10:00:00Z"
    }
  }
}
```

**Error (401 Unauthorized)**:
```json
{
  "status": "error",
  "message": "Missing Authorization header. Expected Bearer token.",
  "code": "AUTH_HEADER_MISSING"
}
```

---

### 2.3 Update Permitted Profile Fields
**`PATCH /api/v1/me/profile`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Updates safe biographical fields. Rejects attempts to self-escalate verification status or account types.

**Request Body**:
```json
{
  "full_name": "Dr. Elena Rostova-Smith",
  "phone": "+1 (555) 019-9999",
  "city": "Capital District"
}
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Profile updated successfully.",
  "data": {
    "updated_fields": ["full_name", "phone", "city"]
  }
}
```

---

### 2.4 Dispatch Emergency Blood Beacon
**`POST /api/v1/emergency/dispatch`**  
*Protected & Role-Restricted*: Only `hospital`, `admin`, or `super_admin` accounts can access this endpoint. Donors and patients receive a 403 Forbidden.

**Request**:
```http
POST /api/v1/emergency/dispatch HTTP/1.1
Host: localhost:5000
Authorization: Bearer <hospital_access_token>
Content-Type: application/json

{
  "blood_type": "O-",
  "units": 3,
  "hospital_name": "City General Trauma Ward"
}
```

**Response (201 Created)**:
```json
{
  "status": "success",
  "message": "Emergency blood beacon broadcasted to regional network.",
  "data": {
    "incident_id": "EMG-E2B12345",
    "blood_type": "O-",
    "units_requested": 3,
    "hospital_name": "City General Trauma Ward",
    "dispatched_by": "dr.elena@hospital.org",
    "status": "BEACON_ACTIVE",
    "notified_nodes_count": 8
  }
}
```

**Error (403 Forbidden - Role Mismatch)**:
```json
{
  "status": "error",
  "message": "Access denied: Account type 'donor' does not have permission for this resource.",
  "code": "FORBIDDEN_ROLE"
}
```


---

## 3. Phase 3: Donor Command Center Endpoints

### 3.1 Get Donor Command Center Summary
**`GET /api/v1/donor/summary`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Aggregates verified clinical metrics, transfusion impact (1 unit = 3 lives saved), next eligible donation date (56-day recovery interval), upcoming appointments, and active availability state.

**Request**:
```http
GET /api/v1/donor/summary HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_donor_token>
Accept: application/json
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Donor command center telemetry retrieved.",
  "data": {
    "donor_id": "donor-uuid-5678",
    "full_name": "Dr. Elena Rostova",
    "blood_group": "O-",
    "availability_status": "available",
    "discovery_consent": true,
    "is_verified": true,
    "metrics": {
      "verified_donations_count": 3,
      "total_units_donated": 3,
      "lives_saved_count": 9,
      "upcoming_appointments_count": 1
    },
    "clinical_eligibility": {
      "is_medically_eligible": true,
      "days_until_eligible": 0,
      "next_eligible_date": "2026-11-24",
      "recovery_period_days": 56,
      "clinical_guideline": "Minimum 56-day inter-donation recovery interval for whole blood."
    }
  }
}
```

---

### 3.2 Get Verified Donation History
**`GET /api/v1/donor/history`**  
*Protected*: Requires valid Supabase JWT Bearer token.  
*Query Parameters*: `?status=verified|pending_verification|rejected|all` (default `all`).

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Donation records retrieved successfully.",
  "data": {
    "count": 3,
    "filter": "verified",
    "donations": [
      {
        "id": "don-01",
        "facility_name": "Metropolitan Central Blood Bank",
        "donation_date": "2026-08-14",
        "donation_type": "whole_blood",
        "units": 1,
        "reference_number": "BL-DON-2026-8941",
        "verification_status": "verified",
        "certificate_id": "CERT-BL-2026-8941"
      }
    ]
  }
}
```

---

### 3.3 Synchronize Donor Availability
**`PATCH /api/v1/donor/availability`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Instantly updates donor availability state in PostgreSQL and logs an audit trail event.  
*Allowed States*: `available`, `temporarily_unavailable`, `not_accepting_requests`.

**Request**:
```http
PATCH /api/v1/donor/availability HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_donor_token>
Content-Type: application/json

{
  "availability_status": "available",
  "discovery_consent": true
}
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Donor availability status successfully synchronized.",
  "data": {
    "availability_status": "available",
    "consent_to_discovery": true,
    "updated_at": "2026-11-24T15:20:00.000000+00:00",
    "clinical_notice": "Availability updated. Note: Clinical eligibility is strictly governed by donation interval and medical screening."
  }
}
```

---

### 3.4 List Active Donation Camps & Fixed Centers
**`GET /api/v1/camps`**  
*Public & Authenticated*: Returns accredited community blood donation drives and fixed blood banks.

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Active donation camps retrieved.",
  "data": {
    "count": 3,
    "camps": [
      {
        "id": "camp-metro-01",
        "camp_name": "Metro Red Cross Blood Drive",
        "organizer_name": "Indian Red Cross Society",
        "location": "Community Center, Sector 14",
        "city": "Bengaluru",
        "camp_date": "2026-11-28",
        "start_time": "09:00",
        "end_time": "17:00",
        "status": "active"
      }
    ]
  }
}
```

---

### 3.5 Schedule Donation Appointment
**`POST /api/v1/donor/appointments`**  
*Protected*: Requires valid Supabase JWT Bearer token.

**Request**:
```http
POST /api/v1/donor/appointments HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_donor_token>
Content-Type: application/json

{
  "camp_id": "camp-metro-01",
  "appointment_date": "2026-11-28",
  "time_slot": "11:00 AM - 11:30 AM",
  "donation_type": "whole_blood"
}
```

**Response (201 Created)**:
```json
{
  "status": "success",
  "message": "Donation appointment confirmed and scheduled.",
  "data": {
    "appointment": {
      "id": "appt-uuid-9901",
      "donor_id": "donor-uuid-5678",
      "camp_id": "camp-metro-01",
      "appointment_date": "2026-11-28",
      "time_slot": "11:00 AM - 11:30 AM",
      "status": "scheduled"
    }
  }
}
```

---

### 3.6 Cancel Donation Appointment
**`DELETE /api/v1/donor/appointments/<appointment_id>`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Cancels a donation reservation belonging to the authenticated donor.

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Appointment cancelled successfully.",
  "data": {
    "appointment_id": "appt-uuid-9901",
    "status": "cancelled"
  }
}
```

---

### 3.7 In-App Clinical Notifications
**`GET /api/v1/donor/notifications`**  
*Protected*: Requires valid Supabase JWT Bearer token.

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Notifications retrieved.",
  "data": {
    "unread_count": 1,
    "notifications": [
      {
        "id": "notif-01",
        "title": "Urgent O- Needed nearby",
        "message": "City Trauma Hub requires 2 units of O- Negative for acute surgical resuscitation.",
        "type": "urgent",
        "is_read": false,
        "created_at": "2026-11-24T15:10:00.000000+00:00"
      }
    ]
  }
}
```


---

## 4. Patient Emergency Portal & Request Management Endpoints

### 4.1 Patient Dashboard Telemetry
**`GET /api/v1/patient/dashboard`**  
*Protected*: Requires valid Supabase JWT Bearer token with `patient` account type.

Returns active emergency request counts, total requests, fulfilled count, unread notifications count, latest active request with audit events, and statutory clinical compatibility disclaimers.

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Patient command center telemetry retrieved.",
  "data": {
    "patient": {
      "id": "pat-uuid-1001",
      "name": "Marcus Vance",
      "email": "marcus@example.com",
      "city": "Metro Central"
    },
    "metrics": {
      "active_requests_count": 1,
      "total_requests_count": 1,
      "fulfilled_requests_count": 0,
      "unread_notifications_count": 1
    },
    "current_active_request": {
      "id": "req-uuid-9042",
      "request_code": "REQ-2026-9042",
      "patient_name": "Eleanor Vance",
      "blood_group": "O-",
      "blood_component": "packed_red_cells",
      "units_needed": 2,
      "hospital_name": "Metropolitan Central Trauma Care",
      "status": "matching_in_progress",
      "verification_status": "verified"
    },
    "clinical_disclaimer": "Clinical Notice: Selecting a blood group or component does not establish transfusion compatibility..."
  }
}
```

---

### 4.2 Create Emergency Blood Request
**`POST /api/v1/patient/requests`**  
*Protected*: Requires valid Supabase JWT Bearer token with `patient` account type.

Validates clinical parameters, sets verification to `pending`, status to `submitted`, logs an initial timeline event, and records an immutable audit ledger entry.

**Request**:
```http
POST /api/v1/patient/requests HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_patient_token>
Content-Type: application/json

{
  "patient_name": "Eleanor Vance",
  "blood_group": "O-",
  "blood_component": "packed_red_cells",
  "units_needed": 2,
  "hospital_name": "Metropolitan Central Trauma Care",
  "hospital_city": "Metro Central",
  "hospital_district": "Sector 4",
  "hospital_address": "842 Medical Center Blvd",
  "required_datetime": "2026-11-25T14:00:00Z",
  "urgency_priority": "critical",
  "clinical_reason": "Emergency surgery blood loss preparation",
  "treating_doctor": "Dr. Sarah Chen",
  "doctor_contact": "+1 (555) 019-4400",
  "requester_relationship": "Parent",
  "requester_phone": "+1 (555) 019-8800",
  "consent_acknowledged": true
}
```

**Response (201 Created)**:
```json
{
  "status": "success",
  "message": "Emergency blood request successfully submitted to regional transfusion network.",
  "data": {
    "request": {
      "id": "req-uuid-9042",
      "request_code": "REQ-2026-9042",
      "patient_name": "Eleanor Vance",
      "blood_group": "O-",
      "units_needed": 2,
      "status": "submitted",
      "verification_status": "pending",
      "created_at": "2026-11-24T15:45:00.000000+00:00"
    },
    "clinical_disclaimer": "Clinical Notice: Selecting a blood group or component does not establish transfusion compatibility..."
  }
}
```

---

### 4.3 List Patient's Blood Requests
**`GET /api/v1/patient/requests`**  
*Protected*: Requires valid Supabase JWT Bearer token.  
*Query Parameters*: `?status=submitted|verified|fulfilled|cancelled&priority=critical|urgent|scheduled`

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Blood requests retrieved.",
  "data": {
    "count": 1,
    "requests": [
      {
        "id": "req-uuid-9042",
        "request_code": "REQ-2026-9042",
        "patient_name": "Eleanor Vance",
        "blood_group": "O-",
        "units_needed": 2,
        "hospital_name": "Metropolitan Central Trauma Care",
        "status": "matching_in_progress"
      }
    ]
  }
}
```

---

### 4.4 Get Single Request Details & Timeline
**`GET /api/v1/patient/requests/<request_id>`**  
*Protected*: Requires valid Supabase JWT Bearer token. Enforces patient ownership.

**`GET /api/v1/patient/requests/<request_id>/timeline`**  
*Protected*: Requires valid Supabase JWT Bearer token. Returns clinical audit events for the request.

---

### 4.5 Cancel Emergency Blood Request
**`PATCH /api/v1/patient/requests/<request_id>/cancel`**  
*Protected*: Requires valid Supabase JWT Bearer token.

Allows requester to cancel their own active request with a mandatory reason. Cannot cancel requests that are already fulfilled or cancelled.

**Request**:
```http
PATCH /api/v1/patient/requests/req-uuid-9042/cancel HTTP/1.1
Host: localhost:5000
Authorization: Bearer <supabase_patient_token>
Content-Type: application/json

{
  "reason": "Family donor provided required units; surgical hold lifted."
}
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Blood request successfully cancelled.",
  "data": {
    "request_id": "req-uuid-9042",
    "status": "cancelled",
    "cancellation_reason": "Family donor provided required units; surgical hold lifted."
  }
}
```

---

### 4.6 List Verified Medical Facilities & Inventory
**`GET /api/v1/facilities`**  
*Public & Authenticated*: Returns verified hospitals and blood banks.  
*Query Parameters*: `?city=...&type=hospital|blood_bank`

**`GET /api/v1/facilities/<facility_id>`**  
*Public & Authenticated*: Returns facility information and verified inventory reserves.

---

### 4.7 Patient Notifications
**`GET /api/v1/patient/notifications`**  
*Protected*: Requires valid Supabase JWT Bearer token.

**`PATCH /api/v1/patient/notifications/<notification_id>/read`**  
*Protected*: Requires valid Supabase JWT Bearer token. Marks a notification as read.

---

## 5. Intelligent Blood Matching & Donor Discovery Endpoints

### 5.1 Get Active Clinical Compatibility Matrix
**`GET /api/v1/clinical/compatibility-rules`**  
*Public / Authenticated*: Retrieves active clinical compatibility matrix metadata, governing authority, reviewer information, and statutory clinical disclaimer.

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Active clinical compatibility matrix retrieved.",
  "data": {
    "version_code": "CLINICAL-AABB-2026.1",
    "title": "AABB / WHO Clinically Validated Transfusion Compatibility Matrix v2026.1",
    "authority": "American Association of Blood Banks (AABB) & WHO Technical Guidance",
    "reviewer_name": "Dr. Aris Thorne, MD, FRCPath, Transfusion Medicine Lead",
    "status": "approved",
    "approved_at": "2026-01-15T00:00:00Z",
    "clinical_disclaimer": "BloodLink provides donor and inventory discovery support only. Final blood component selection, compatibility verification, antibody screening and crossmatching must be performed and authorized by qualified medical transfusion professionals."
  }
}
```

---

### 5.2 Execute Intelligent Matching for Request
**`POST /api/v1/requests/<request_id>/run-matching`**  
*Protected*: Requesters, hospital staff, and administrators.  
Executes multi-factor discovery evaluating compatibility, location quality (exact city, district, radius), donor availability, discovery consent, verification, and active commitments (<2).

**Request**:
```http
POST /api/v1/requests/req-uuid-9042/run-matching HTTP/1.1
Host: localhost:5000
Authorization: Bearer <token>
Content-Type: application/json

{
  "search_radius_km": 25.0
}
```

**Response (200 OK)**:
```json
{
  "status": "success",
  "message": "Intelligent matching executed successfully.",
  "data": {
    "request_id": "req-uuid-9042",
    "status": "completed",
    "candidates": {
      "potential_donors": [
        {
          "candidate_type": "donor",
          "donor_display_id": "DONOR-0101",
          "blood_group": "O-",
          "component": "packed_red_cells",
          "match_score": 95.0,
          "location_match_quality": "exact_city",
          "approximate_distance_km": 4.8,
          "service_area": "Metro Central (Sector 4)",
          "is_identical_match": true,
          "units_available": 1,
          "verification_status": "verified"
        }
      ],
      "facility_inventory": [
        {
          "candidate_type": "facility_inventory",
          "facility_name": "Metropolitan Central Trauma Care",
          "blood_group": "O-",
          "component": "packed_red_cells",
          "units_available": 14,
          "freshness_hours": 0.5,
          "match_score": 98.0
        }
      ],
      "awaiting_responses": [],
      "confirmed_responses": [],
      "unavailable_options": []
    },
    "summary": {
      "total_candidates": 2,
      "donors_count": 1,
      "facilities_count": 1,
      "execution_time_ms": 115
    },
    "clinical_disclaimer": "BloodLink provides donor and inventory discovery support only..."
  }
}
```

---

### 5.3 Get Current Matches for Request
**`GET /api/v1/requests/<request_id>/matches`**  
*Protected*: Returns current matching options and discovery progress. Strictly omits donor phone, email, and street address.

---

### 5.4 Donor Invitations Management
**`GET /api/v1/donor/invitations`**  
*Protected*: Authenticated donors only.  
*Query Parameters*: `?status=pending|accepted|declined|all`  
Returns emergency broadcast invitations dispatched to the donor's compatible group.

**`POST /api/v1/donor/invitations/<invitation_id>/respond`**  
*Protected*: Accepts or declines an emergency broadcast invitation. Prevents duplicate responses and responses to fulfilled or cancelled requests.

**Request**:
```http
POST /api/v1/donor/invitations/inv-uuid-101/respond HTTP/1.1
Host: localhost:5000
Authorization: Bearer <donor_token>
Content-Type: application/json

{
  "action": "accepted",
  "response_notes": "Departing immediately. ETA 30 minutes."
}
```

---

### 5.5 Get Active Donor Commitments
**`GET /api/v1/donor/commitments`**  
*Protected*: Authenticated donors only. Returns active accepted commitments with hospital destination and required arrival time.

---

### 5.6 Create Atomic Inventory Reservation
**`POST /api/v1/facility/inventory/reservations`**  
*Protected*: Facility and hospital staff only.  
Atomically locks stock units and assigns a unique `RSV-YYYY-XXXXX` reservation code, preventing double-allocation and race conditions.

**Request**:
```http
POST /api/v1/facility/inventory/reservations HTTP/1.1
Host: localhost:5000
Authorization: Bearer <facility_token>
Content-Type: application/json

{
  "inventory_id": "inv-uuid-001",
  "request_id": "req-uuid-9042",
  "units_to_reserve": 2,
  "duration_hours": 12
}
```

**Response (201 Created)**:
```json
{
  "status": "success",
  "message": "Facility inventory units successfully reserved.",
  "data": {
    "id": "rsv-uuid-001",
    "reservation_code": "RSV-2026-90421",
    "units_reserved": 2,
    "status": "reserved",
    "expires_at": "2026-11-25T10:00:00Z"
  }
}
```

---

### 5.7 Release Inventory Reservation
**`DELETE /api/v1/facility/inventory/reservations/<reservation_id>`**  
*Protected*: Releases locked units back to general emergency inventory.

---

### 5.8 Matching Performance & Discovery Analytics
**`GET /api/v1/admin/matching-analytics`**  
*Protected*: Administrative and supervisory medical staff.  
Returns aggregate telemetry including total matching runs, match discovery rate (%), donor response rate (%), average execution latency, active requests, and fulfillment status.

---

## 6. Hospital & Blood Bank Facility Management Endpoints

All facility endpoints are hosted under `/api/v1/facility/*` and require a valid Bearer token for an authorized facility account (`hospital`, `blood_bank`, or verified `facility_staff`).

### 6.1 Hospital Dashboard Aggregates
**`GET /api/v1/facility/hospital/dashboard`**  
*Protected*: Hospital staff only. Returns real-time trauma blood reserves, active emergency requisitions, pending clinical reviews, and active cold-chain alerts.

### 6.2 Hospital Emergency Requisitions
**`GET /api/v1/facility/hospital/requests?urgency=code_red&status=active`**  
*Protected*: Hospital staff only. Retrieves triage-sorted surgical blood requests.

### 6.3 Clinical Request Verification
**`POST /api/v1/facility/hospital/verify-request`**  
*Protected*: Attending physicians (`medical_officer`) only. Authorizes or rejects surgical blood requisitions.

**Request**:
```json
{
  "request_id": "req-uuid-001",
  "action": "verified",
  "clinical_notes": "Trauma laparotomy authorized. Hemoglobin verified at 6.4 g/dL."
}
```

### 6.4 Hospital Trauma Blood Reserve
**`GET /api/v1/facility/hospital/inventory`**  
*Protected*: Hospital transfusionists and inventory officers. Returns on-site emergency units across all 8 ABO/Rh blood groups.

### 6.5 Record Transfusion Fulfilment & Administration
**`POST /api/v1/facility/hospital/fulfilment`**  
*Protected*: Transfusion laboratory staff. Verifies recipient crossmatch compatibility, logs unit release, vital signs, and adverse reaction telemetry.

**Request**:
```json
{
  "request_id": "req-uuid-001",
  "batch_id": "batch-prbc-001",
  "recipient_blood_group": "O+",
  "crossmatch_status": "compatible",
  "crossmatch_method": "Saline + Indirect Antiglobulin Test (Coombs)",
  "crossmatch_verified": true,
  "adverse_reaction": "none",
  "notes": "Infused 1 unit PRBC over 120 minutes with stable vital signs."
}
```

### 6.6 Blood Bank Dashboard Aggregates
**`GET /api/v1/facility/bloodbank/dashboard`**  
*Protected*: Blood bank staff only. Returns $8 \times 5$ inventory matrix, daily phlebotomy counts, quarantine batches, and cold vault sensor temperatures.

### 6.7 Component Batch Intake & Registration
**`POST /api/v1/facility/bloodbank/batch`**  
*Protected*: Blood bank intake technicians. Registers new whole blood or apheresis units with automated shelf-life calculation (Platelets: 5d, PRBC: 42d, FFP: 365d).

**Request**:
```json
{
  "component_type": "platelets",
  "blood_group": "O+",
  "volume_ml": 250,
  "anticoagulant": "CPDA-1",
  "collection_date": "2026-11-24T10:00:00Z",
  "storage_location": "Vault C (Platelet Agitator Incubator #1)",
  "storage_temperature": 22.0
}
```

### 6.8 Laboratory 5-Point Infectious Disease QC Screening
**`POST /api/v1/facility/bloodbank/qc`**  
*Protected*: Laboratory diagnostic technicians. Submits screening assays for HIV, HBV, HCV, Syphilis, and Malaria. All non-reactive assays automatically release the unit to `available` status; any reactive result locks the unit in biohazard quarantine.

**Request**:
```json
{
  "batch_id": "batch-plts-001",
  "hiv": false,
  "hbv": false,
  "hcv": false,
  "syphilis": false,
  "malaria": false,
  "notes": "All 5 screening assays non-reactive. Unit certified safe for release."
}
```

### 6.9 Unit Biohazard Discard Documentation
**`POST /api/v1/facility/bloodbank/discard`**  
*Protected*: Blood bank quality managers. Documents the destruction of expired or contaminated units.

**Request**:
```json
{
  "batch_id": "batch-prbc-999",
  "reason": "expired",
  "destruction_method": "High-temperature medical biohazard incineration",
  "biohazard_tracking_code": "BIO-2026-99214"
}
```

### 6.10 Cold-Chain Courier Dispatch Manifest
**`POST /api/v1/facility/bloodbank/dispatch`**  
*Protected*: Logistics coordinators. Generates a traceable dispatch manifest (`DSP-YYYY-XXXXX`) for temperature-controlled transit to a receiving hospital.

**Request**:
```json
{
  "recipient_facility_id": "hosp-uuid-001",
  "request_id": "req-uuid-001",
  "batch_ids": ["batch-prbc-001", "batch-prbc-002"],
  "core_temp_at_dispatch": 3.8,
  "transport_carrier": "BloodLink Emergency Medical Transit (Unit 4)",
  "tracking_number": "MED-TRANSIT-8841"
}
```

### 6.11 Hospital Dispatch Receipt & Inspection
**`POST /api/v1/facility/hospital/receive-dispatch`**  
*Protected*: Hospital receiving officers. Confirms delivery and logs arrival core temperature.

### 6.12 Facility Stock & Temperature Alerts
**`GET /api/v1/facility/alerts`**  
*Protected*: Facility staff. Retrieves active inventory shortage alerts, near-expiry warnings, and cold-chain temperature excursion events.

### 6.13 Facility Staff Roster Management
- **`GET /api/v1/facility/staff`**: Retrieves authorized institutional staff members.
- **`POST /api/v1/facility/staff`**: Enrolls new medical officers or laboratory technicians with assigned roles.

### 6.14 Regulatory & Hemovigilance Reports
**`GET /api/v1/facility/reports?month=current`**  
*Protected*: Directors and regulatory auditors. Exports C:T ratios, component yield distributions, and discard audits.

### 6.15 On-Site Phlebotomy & Donation Verification
**`POST /api/v1/facility/donation`**  
*Protected*: Phlebotomists and donation coordinators. Records voluntary donation intake and issues digital donation verification certificates.

---

## 7. Super Admin Command Center Endpoints

All administrative endpoints are hosted under `/api/v1/admin/*` and strictly enforce JWT Bearer authentication and administrative role authorization (`super_admin`, `operations_admin`, `verification_admin`, `security_auditor`, `analytics_viewer`).

### 7.1 Global Admin Dashboard Telemetry
**`GET /api/v1/admin/dashboard`**  
*Protected*: Administrative roles. Returns platform-wide aggregates: total users, active donors, patients, verified facilities, active emergency requisitions, code-red counts, verified stock units, and system health status.

### 7.2 User Registry Search & Filter
**`GET /api/v1/admin/users?role=donor&status=active&search=john&limit=50&offset=0`**  
*Protected*: `super_admin`, `operations_admin`, `security_auditor`. Searches platform users. Never exposes passwords or private medical attributes.

### 7.3 User Detail & Forensic Timeline
**`GET /api/v1/admin/users/<user_id>`**  
*Protected*: Administrative roles. Returns user profile details, role bindings, and security timeline.

### 7.4 User Account Status Management
**`PATCH /api/v1/admin/users/<user_id>/status`**  
*Protected*: `super_admin`, `operations_admin`. Suspends, reactivates, or bans a user account with mandatory administrative reason. Prevents self-suspension. Writes to `admin_action_logs`.

**Request**:
```json
{
  "status": "suspended",
  "reason": "Administrative suspension pending documentation re-verification."
}
```

### 7.5 Facility Verification Queue
**`GET /api/v1/admin/facilities?status=pending&type=hospital`**  
*Protected*: `super_admin`, `verification_admin`, `operations_admin`. Retrieves pending hospital and blood bank applications.

### 7.6 Facility Accreditation Review
**`POST /api/v1/admin/facilities/<facility_id>/review`**  
*Protected*: `super_admin`, `verification_admin`. Records formal review decision (`approved`, `rejected`, `additional_documentation_requested`, `suspended`, `reinstated`) with verified license number, accreditation body, and physical audit confirmation.

**Request**:
```json
{
  "decision": "approved",
  "reason": "State medical directorate license LIC-MED-104928 inspected and cold chain certified.",
  "license_number_verified": "LIC-MED-104928",
  "accreditation_body": "State Ministry of Health",
  "physical_audit_completed": true,
  "review_notes": "Walk-in cold vaults and platelet agitators validated."
}
```

### 7.7 Global Emergency Operations Telemetry
**`GET /api/v1/admin/emergency-operations?urgency=code_red`**  
*Protected*: `super_admin`, `operations_admin`. Monitors active trauma requests, matching candidates, donor responses, and stalled triage alerts.

### 7.8 Global Inventory Intelligence
**`GET /api/v1/admin/inventory-overview`**  
*Protected*: `super_admin`, `operations_admin`, `analytics_viewer`. Aggregated stock distribution across 8 ABO/RhD groups and 5 blood components, shortage alerts, and cold-chain compliance.

### 7.9 Platform Performance Analytics
**`GET /api/v1/admin/analytics?range=30d`**  
*Protected*: `super_admin`, `analytics_viewer`, `operations_admin`. Calculates fulfillment rates, C:T ratio, discovery rates, and regional demand.

### 7.10 Targeted Platform Broadcasts
- **`GET /api/v1/admin/announcements`**: Lists platform broadcasts and engagement counts.
- **`POST /api/v1/admin/announcements`**: Dispatches targeted announcements (`all`, `donors`, `patients`, `hospitals`, `blood_banks`).

**Request**:
```json
{
  "title": "Severe O-Negative Platelet Alert",
  "content": "Certified trauma centers report acute shortage. Voluntary donors requested.",
  "target_audience": "donors",
  "priority": "critical"
}
```

### 7.11 Security Audit Stream & Incidents
- **`GET /api/v1/admin/security/events?limit=50`**: Unified security audit stream (logins, privilege modifications, rate limits).
- **`GET /api/v1/admin/security/incidents`**: Lists security incidents (`INC-YYYY-XXXXX`).
- **`POST /api/v1/admin/security/incidents`**: Creates incident or logs investigation notes and resolution summary.

### 7.12 System Configuration & Clinical Governance Guard
- **`GET /api/v1/admin/configuration`**: Reads platform configurations.
- **`PATCH /api/v1/admin/configuration`**: Updates configuration setting. Modification of clinical compatibility rules requires a validated `medical_board_approval_token`.

### 7.13 Admin Role Management & Anti-Escalation
- **`GET /api/v1/admin/roles`**: Lists provisioned administrators.
- **`POST /api/v1/admin/roles/assign`**: Assigns granular administrative roles. Only authenticated Super Admins can assign roles; ordinary administrators cannot grant `super_admin`.
