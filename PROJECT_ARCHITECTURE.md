# BloodLink – System Architecture Specification

## 1. Architectural Overview

**BloodLink** is an intelligent, high-availability blood donation, emergency dispatch, and transfusion logistics platform aligned with **UN Sustainable Development Goal 3 (Good Health and Well-being)**.

The system is architected as a hybrid decoupled solution combining an edge-optimized Single Page Application (SPA), serverless identity and relational storage via Supabase, and a hardened Python Flask REST API for clinical algorithmic orchestration and administrative control.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  - Edge-Distributed HTML5 / Vanilla ES6+ Web Applications                         |
|  - Three.js WebGL 3D Cellular & Telemetry Visualizations (with canvas fallback)   |
|  - Client Runtime State & Role Router (session-manager.js, api-client.js)         |
+----------------------------------------+------------------------------------------+
                                         |
               +-------------------------+-------------------------+
               | Direct TLS (HTTPS/WSS)                            | Bearer JWT (REST)
               v                                                   v
+------------------------------------+             +--------------------------------+
|       SUPABASE CLOUD INFRA         |             |      PYTHON FLASK REST API     |
| - Supabase Auth (GoTrue JWT)       |             | - Cryptographic JWT Validation |
| - PostgreSQL 15 Relational DB      |             | - Role-Based Access Control    |
| - Row Level Security (RLS) Engine  |<----------->| - Intelligent Matching Engine  |
| - Realtime WebSockets Pub/Sub      | ServiceRole | - Clinical Compatibility Matrix|
| - Supabase Storage (S3-compatible) |  TLS Only   | - Atomic Inventory Reservation |
+------------------------------------+             | - Cold-Chain Discard Engine    |
                                                   | - Super Admin Oversight API    |
                                                   +--------------------------------+
```

---

## 2. Core Subsystems

### 2.1 Identity, Authentication & Session Routing
- **Provider**: Supabase Auth (GoTrue).
- **Tokens**: Asymmetric HS256 JWT tokens containing user UUID, email, and metadata.
- **Frontend Session Management** (`js/api/session-manager.js`):
  - Listens to `onAuthStateChange`.
  - Automatically fetches `user_roles` to determine highest privilege.
  - Automatically redirects authenticated users to their authorized command centers:
    - `donor` &rarr; `donor-dashboard.html`
    - `patient` &rarr; `patient-dashboard.html`
    - `hospital` &rarr; `hospital-dashboard.html`
    - `blood_bank` &rarr; `bloodbank-dashboard.html`
    - `admin` / `super_admin` &rarr; `admin-dashboard.html`
- **Security Boundary**: Public registration strictly prohibits `admin` or `super_admin` role assignment. Administrative roles must be provisioned via controlled CLI (`scripts/provision_super_admin.py`) or assigned by active Super Admins via the administrative console.

### 2.2 Client-Side Rendering & 3D WebGL Engine
- **Core Visualizer**: Three.js rendering interactive, realistic biconcave erythrocytes (red blood cells) with procedural normal maps, subsurface scattering approximations, and fluid micro-turbulent physics.
- **Resilience**: Every 3D viewport (`hero-scene.js`, `donor-3d-cell.js`, `patient-3d-pulse.js`, `hospital-3d-cell.js`, `bloodbank-3d-cell.js`, `admin-3d-globe.js`) implements automated WebGL context sniffing and falls back gracefully to CSS micro-animations without degrading interface usability.

### 2.3 Flask Algorithmic & Control Middleware
- **Framework**: Python 3.11+ Flask Application Factory (`backend/app.py`).
- **Production Server**: Gunicorn WSGI container (`wsgi.py`).
- **Middleware Layers**:
  - `auth_middleware.py`: Cryptographically verifies incoming Bearer JWT signatures against `SUPABASE_JWT_SECRET` with mandatory expiration and audience validation.
  - `role_middleware.py`: Enforces role allowlists on protected route boundaries.
  - `rate_limit.py`: Sliding-window IP rate limiter preventing request flooding and brute-force attacks.
  - `audit_middleware.py`: Asynchronously records administrative and security events into immutable PostgreSQL audit logs.

### 2.4 Clinical Compatibility & Discovery Engine
- **Compatibility Matrix** (`backend/services/compatibility_service.py`):
  - AABB / WHO validated component rules for Whole Blood, Packed Red Blood Cells (PRBC), Platelets, Fresh Frozen Plasma (FFP), and Cryoprecipitate.
  - Plasma reverse compatibility safeguards (AB+ universal plasma donor, O- universal plasma recipient).
  - Unapproved or proposed matrix modifications are automatically quarantined in `status = pending_review`.
- **Multi-Factor Candidate Scoring** (`backend/services/matching_engine.py`):
  - Haversine geodesic distance weighting (default 25 km, expandable to 100 km).
  - Component urgency and clinical priority scoring.
  - Donor availability status, cool-off periods (56 days for whole blood), and active commitment caps.
  - Atomic two-phase inventory reservation preventing double-allocation of critical units.

---

## 3. Data Architecture & Relational Model

The database runs on Supabase PostgreSQL with 8 sequential schema migrations:
1. `20261124000001_initial_schema.sql`: Core profiles, roles, facility records, and audit logs.
2. `20261124000002_row_level_security.sql`: Initial zero-trust Row Level Security policies.
3. `20261124000003_auth_triggers.sql`: PostgreSQL triggers synchronizing `auth.users` to `public.profiles`.
4. `20261124000004_donor_command_center.sql`: Donor metrics, appointments, donation camps, and history.
5. `20261124000005_patient_emergency_portal.sql`: Emergency blood requests, timeline events, and hospital routing.
6. `20261124000006_intelligent_matching_engine.sql`: Candidate matches, inventory reservations, and notifications.
7. `20261124000007_facility_management_system.sql`: Cold-chain batches, QC screening, dispatch, and transfusion fulfilment.
8. `20261125000008_super_admin_command_center.sql`: Administrative roles, facility accreditation, platform broadcast, security incidents, and clinical governance config.

Consolidated setup file: `supabase/combined_migrations.sql`.

---

## 4. Statutory Clinical Governance

> **IMPORTANT CLINICAL NOTICE**
> BloodLink facilitates automated communication, donor discovery, inventory reservation, and dispatch logistics.
> **BloodLink is not an autonomous diagnostic or transfusion prescription device.**
> All matching candidates and reserved units must undergo standard laboratory antibody screening, ABO/Rh crossmatching, and qualified medical officer authorization prior to transfusion.
