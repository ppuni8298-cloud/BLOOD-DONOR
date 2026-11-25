# BloodLink — Cybersecurity & Access Control Specification

**Security Standard**: Zero-Trust Healthcare Architecture  
**Regulatory Alignment**: HIPAA Security Rule & EU GDPR Privacy Directives

---

## 1. Security Architecture Overview

BloodLink implements defense-in-depth across three decoupled tiers:

```
[ Tier 1: Client Layer (Browser) ]
       │  • Uses Anon Key ONLY
       │  • PKCE OAuth authentication
       │  • Session stored in encrypted local storage
       ▼
[ Tier 2: Database Layer (Supabase PostgreSQL) ]
       │  • 100% of tables protected by Row Level Security (RLS)
       │  • Security-definer trigger functions for identity sync
       │  • Immutable append-only audit trail
       ▲
[ Tier 3: Application Server Layer (Python Flask API) ]
          • Cryptographic JWT signature verification (HS256)
          • Token-bucket IP rate limiting
          • Strict CORS allowlist
          • Role verification middleware
```

---

## 2. Key Security Guarantees

### 2.1 Credential Isolation
- The **Supabase Service Role Key** is restricted exclusively to server-side code (`backend/services/supabase_service.py`).
- Frontend files (`js/`) operate strictly with the public `anon` key.
- No user passwords or password hashes are stored in public database tables. All password verification is executed within Supabase's hardened `auth.users` schema.

### 2.2 Prevention of Privilege Self-Escalation
- In `supabase/migrations/20261124000002_row_level_security.sql`:
  - Normal users have `UPDATE` permission on `public.profiles` only for their own biographical fields (`full_name`, `phone`, `city`, `avatar_url`).
  - The `is_verified`, `account_status`, and `account_type` fields are locked. Any update that attempts to modify `is_verified` or `account_type` is rejected by the RLS `WITH CHECK` expression.
  - The `public.user_roles` table permits modifications **exclusively** to the `super_admin` role or database trigger functions.

### 2.3 Protection of Sensitive Donor Telemetry
- Donors' personal contact details (phone, physical address, email) are locked in `public.profiles` and accessible only by the donor themselves or authorized emergency personnel.
- Clinical compatibility discovery searches query `donor_profiles` with `consent_to_discovery = TRUE`, exposing only the blood group and readiness status, never raw telephone or address records.

### 2.4 Cryptographic JWT Verification
In `backend/middleware/auth_middleware.py`:
- All protected API endpoints (`/api/v1/me`, `/api/v1/emergency/dispatch`) verify incoming Bearer tokens using `jwt.decode` with the shared `SUPABASE_JWT_SECRET`.
- Validates token expiration (`exp`) and audience (`aud = 'authenticated'`).
- The backend never trusts client-supplied user IDs or role claims sent in request bodies; all identity values are derived directly from the cryptographically verified JWT payload (`g.user_id = payload['sub']`).

### 2.5 Immutable Audit Ledger
In `public.audit_logs`:
- RLS permits only `SELECT` and `INSERT` operations.
- `UPDATE` and `DELETE` policies are entirely omitted.
- No client or normal administrator can alter or erase forensic audit records once created.

### 2.6 Matching Engine Privacy Preservation Protocol
- In `backend/services/matching_engine.py` and `matching_candidates`:
  - Donor phone numbers, email addresses, and residential street coordinates are explicitly omitted from all candidate payload dictionaries.
  - Display identifiers are masked with pseudorandom hashes (e.g. `DONOR-0101`).
  - Spatial coordinates are aggregated to municipality or sector level (`Metro Central (Sector 4)`), preserving dispatch utility while preventing donor stalking or harassment.
  - Contact routing is gated behind hospital triage confirmation; donors are never contacted directly by patients.

### 2.7 Atomic Concurrency & Inventory Reservation Security
- In `inventory_reservations` and `facility_inventory`:
  - Race conditions during high-volume trauma mass casualties are prevented via atomic database row locking and PostgreSQL triggers (`generate_reservation_code()`).
  - Reservations have a mandatory `expires_at` window (default 12 hours) that automatically releases locked units back to public circulation if courier pickup is not confirmed.
  - Releasing reservations requires authenticated staff authorization and is logged to the forensic audit ledger.

### 2.8 Fail-Safe Clinical Hold States
- If the clinical ruleset status in `matching_rule_versions` is ever marked unapproved, revoked, or corrupted:
  - The matching engine immediately fails safe into `pending_clinical_review`.
  - Zero candidate matches are returned, preventing erroneous or dangerous cross-transfusions.
  - Statutory clinical disclaimers are returned with every request response.


---

## 3. Patient Emergency Portal & Blood Request Security

### 3.1 Patient Request Ownership & Immutability of Clinical Status
In `supabase/migrations/20261124000005_patient_emergency_portal.sql`:
- **Creation Security**:
  - Requesters can only insert records where `requester_id = auth.uid()`.
  - The `status` field is strictly constrained on insert to `'submitted'` or `'awaiting_verification'`.
  - The `verification_status` field is locked to `'pending'`.
- **Status Tampering Prevention**:
  - Requesters are blocked from changing `verification_status` or escalating `status` to `verified`, `fulfilment_in_progress`, or `fulfilled`.
  - Requesters hold `UPDATE` permission **solely** to cancel their own requests (`status = 'cancelled'`), accompanied by an audit cancellation reason.
  - Verification and fulfilment transitions are restricted to accounts holding the `hospital`, `blood_bank`, `admin`, or `super_admin` role.

### 3.2 Privacy-Preserving Matching & Anonymized Responders
- When an emergency blood request triggers regional matching:
  - Universal donor nodes are matched based on ABO/Rh compatibility, distance, and active availability.
  - The patient interface displays only aggregate and anonymized telemetry (e.g. `4 compatible donor nodes alerted`).
  - No donor telephone number, personal email, or residential address is exposed to the requester.
  - In `public.request_responses`, responder identities are masked behind facility triage channels unless explicit medical disclosure consent is confirmed.

### 3.3 Clinical Transfusion Governance
- The platform strictly enforces automated disclaimers across API responses and frontend forms:
  > *"Clinical Notice: Selecting a blood group or component does not establish transfusion compatibility. All blood group compatibility, component selection, and crossmatching must be strictly verified by qualified medical professionals."*
- BloodLink serves as a secure emergency communication network; all transfusion authorizations, blood crossmatches, and biological testing remain the strict responsibility of certified hospital blood bank clinicians.

---

## 4. Hospital & Blood Bank Facility Access Control & Hemovigilance Security

### 4.1 Multi-Tenant Facility Isolation via PostgreSQL Row Level Security
In `supabase/migrations/20261124000007_facility_management_system.sql`:
- All queries and mutations on `component_batches`, `component_processing_events`, `inventory_quality_checks`, `dispatch_records`, and `inventory_alerts` execute against the database security function:
  ```sql
  CREATE OR REPLACE FUNCTION is_facility_staff(user_uuid UUID, target_facility_id UUID)
  RETURNS BOOLEAN AS $$
  BEGIN
      RETURN EXISTS (
          SELECT 1 FROM public.facility_staff
          WHERE user_id = user_uuid
            AND facility_id = target_facility_id
            AND is_active = TRUE
      ) OR EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = user_uuid
            AND role IN ('admin', 'super_admin')
      ) OR user_uuid = target_facility_id;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- Cross-facility data leakage is mathematically blocked at the PostgreSQL engine level.

### 4.2 Immutable Inventory State Ledger (`inventory_movements`)
- Every lifecycle event (`intake`, `separation`, `quarantine_release`, `reservation`, `dispatch`, `transfer_receive`, `administration`, `discard`) records an immutable row in `inventory_movements`.
- The table permits only `INSERT` and `SELECT` operations. `UPDATE` and `DELETE` permissions are revoked across all roles including facility managers.

### 4.3 Mandatory Laboratory QC Screening Gate
- Units cannot transition to `available` without passing the mandatory 5-point infectious disease assay (HIV-1/2, HBV, HCV, Syphilis, Malaria).
- A positive or indeterminate result immediately and irreversibly transitions the batch to `quarantined_reactive`, removing it from the matching discovery engine.

### 4.4 Chain-of-Custody & Temperature Excursion Controls
- Inter-facility transfers require cold-chain manifests (`DSP-YYYY-XXXXX`) logging dispatch core temperature, carrier credentials, and receiving temperature.
- Shipments failing temperature thresholds upon hospital delivery must be rejected and documented for medical biohazard destruction.

---

## 5. Super Admin Access Control, Anti-Privilege Escalation & Clinical Governance

### 5.1 Non-Selectable Public Registration
- In `auth.html`, the public registration form allows users to select only `donor`, `patient`, `hospital`, or `blood_bank`.
- The `super_admin` role cannot be requested or created via public registration.
- Any attempt to forge `account_type = 'super_admin'` in client metadata is rejected by database RLS and triggers.

### 5.2 Controlled Super Admin Provisioning (`scripts/provision_super_admin.py`)
- Initial Super Admin accounts are provisioned exclusively via the secure administrative setup CLI utility or server-side bootstrap with direct database service-role credentials.
- All provisioning events write an immutable audit log to `public.admin_action_logs`.

### 5.3 Privilege Self-Escalation Prevention
In `supabase/migrations/20261125000008_super_admin_command_center.sql` and `backend/routes/admin_routes.py`:
- Only users verified as `super_admin` can manage or assign roles in `public.admin_roles`.
- Ordinary administrators (`operations_admin`, `verification_admin`, etc.) cannot grant or promote themselves or any other user to `super_admin`.
- Super Admins cannot suspend their own accounts, preventing administrative lockout.

### 5.4 Clinical Governance Guard
- To prevent accidental or malicious corruption of transfusion medicine safety protocols, `public.system_configuration` enforces the database trigger `protect_clinical_rules_configuration()`.
- Updates to `clinical_transfusion_governance` are blocked at the PostgreSQL engine level unless a valid `medical_board_approval_token` is verified inside the JSON payload.
- The Flask REST API layer independently enforces this guard and returns HTTP 403 `CLINICAL_RULE_MODIFICATION_BLOCKED` if the token is absent.

### 5.5 Immutable Administrative Action Ledger (`admin_action_logs`)
- Every administrative action (user status update, facility accreditation review, broadcast dispatch, configuration update, role assignment) is written to `public.admin_action_logs`.
- PostgreSQL permissions explicitly revoke `UPDATE` and `DELETE` on this table across all users and administrators. Forensic records cannot be altered or erased once created.
