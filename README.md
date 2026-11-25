# BloodLink — Intelligent Blood Donation & Emergency Network

> *"One Donation. Three Lives. One Connected Network."*  
> Aligned with **United Nations Sustainable Development Goal 3: Good Health and Well-being** (Targets 3.6 & 3.8).

🌐 **LIVE PRODUCTION DEPLOYMENT**: **[https://bloodlink-network-ppuni8298-9673s-projects.vercel.app](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app)**  
🗄️ **LIVE DATABASE (SUPABASE)**: `https://bjsvcijupiojifrgrgle.supabase.co` (Active & Protected by RLS)  
🐙 **GITHUB REPOSITORY**: **[https://github.com/ppuni8298-cloud/BLOOD-DONOR](https://github.com/ppuni8298-cloud/BLOOD-DONOR)**

---

## 🌟 Overview

**BloodLink** is an enterprise-grade healthcare technology platform designed to modernize voluntary blood donation, real-time hospital stock transparency, clinical compatibility matching, and emergency transfusion triage.

Built with a modern decoupled architecture:
- **Client**: High-performance responsive web application with interactive **Three.js WebGL 3D Erythrocyte Visualizations**, Chart.js telemetry, Lucide medical icons, and automatic WebGL fallback resilience.
- **Identity & Database**: **Supabase Authentication (GoTrue JWT)** and **Supabase PostgreSQL 15** with strict **Row Level Security (RLS)** across all clinical and user tables.
- **Backend & Matching Engine**: **Python 3.11+ Flask REST API** running on Gunicorn WSGI, featuring AABB/WHO validated clinical compatibility matrices, multi-factor distance and urgency scoring, two-phase atomic inventory reservations, and audit logging.

---

## 🚀 Live System Portals

All portals are deployed and operational on the production domain:

| Portal | Live Link | Description |
| :--- | :--- | :--- |
| **Landing Page** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app) | 3D red blood cell physics, compatibility matrix, and impact stats |
| **Authentication** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/auth) | Secure multi-role onboarding and sign in (Supabase GoTrue) |
| **Find Blood** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/find-blood) | Emergency public search for regional licensed blood banks |
| **Donor Command Center** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/donor-dashboard) | Readiness toggle, camp booking, match invitations |
| **Patient Emergency Portal** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/patient-dashboard) | Code-Red emergency blood requests and live timeline events |
| **Hospital Operations** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/hospital-dashboard) | Request verification, regional reservations, transfusion logs |
| **Blood Bank Management** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/bloodbank-dashboard) | Cold-chain inventory, 5-day platelet alerts, QC screening |
| **Super Admin Console** | [Visit Portal](https://bloodlink-network-ppuni8298-9673s-projects.vercel.app/admin-dashboard) | 3D Telemetry globe, facility accreditation, platform broadcast |

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend UI / UX** | HTML5, CSS3 Custom Properties, Vanilla ES6+ JavaScript, Lucide Icons, Chart.js |
| **3D Medical Visuals**| Three.js (WebGL with automatic 2D CSS pulse fallback) |
| **Identity & Storage**| Supabase Auth (GoTrue JWT, PKCE, OAuth), Supabase Storage |
| **Primary Database** | Supabase PostgreSQL 15, Row Level Security (RLS), PL/pgSQL Triggers |
| **Backend REST API** | Python 3.11+, Flask 3.0, PyJWT, Cryptography, Requests |
| **WSGI Server** | Gunicorn (Production) |
| **DevOps & Hosting** | Vercel (Production Frontend), Docker & Gunicorn (Backend) |

---

## 🧪 Automated Testing & Verification

BloodLink maintains a rigorous test suite of **428 automated tests** passing with **100% success rate (0 failures, 0 regressions)**:

```bash
# 1. Run Backend Python Pytest Suite (91 tests)
python -m pytest backend/tests -v

# 2. Run Comprehensive Codebase & Security Audit (168 checks)
node scripts/audit_codebase.js

# 3. Run Production & Deployment Verification Suite (59 assertions)
node tests/phase8-production-verification-test.js

# 4. Run Super Admin Command Center Test Suite (67 assertions)
node tests/phase7-admin-command-center-test.js

# 5. Run Authentication & RLS Architectural Suite (43 assertions)
node tests/frontend-auth-test.js
```

---

## ⚡ Quickstart (Local Development)

### 1. Prerequisites
- Node.js 18+ (tested on Node.js 24)
- Python 3.11+
- Git

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your live Supabase credentials are set:
```env
SUPABASE_URL=https://bjsvcijupiojifrgrgle.supabase.co
SUPABASE_ANON_KEY=sb_publishable_KuOjjBY2jKHYAWTYV5ovJg_YcvQ6rfO
SUPABASE_PROJECT_REF=bjsvcijupiojifrgrgle
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
FLASK_APP=backend.app:create_app
FLASK_ENV=development
```

### 3. Start Local Servers
In Terminal 1 (Frontend, Port 3000):
```bash
node serve.js
```
Open **`http://localhost:3000`** in your browser.

In Terminal 2 (Backend REST API, Port 5000):
```bash
python -m flask run --port 5000
# Or using Gunicorn / WSGI:
python wsgi.py
```

### 4. Provisioning Your First Super Admin
Once you sign up with your email on `auth.html`:
```bash
python scripts/provision_super_admin.py --email your-email@example.com
```

---

## ⚕️ Statutory Clinical Governance Disclaimer

> **CLINICAL NOTICE**: BloodLink facilitates algorithmic candidate discovery, communication, and inventory logistics. **BloodLink does not autonomously approve transfusions or replace standard blood banking laboratory procedures.**
> 
> All candidate matches and reserved units must undergo mandatory laboratory crossmatching, antibody screening, and verification by certified medical professionals prior to clinical transfusion.
