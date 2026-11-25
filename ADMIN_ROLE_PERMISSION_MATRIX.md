# BloodLink – Administrative Role & Permission Matrix

## 1. Least-Privilege Role Hierarchy

BloodLink enforces a role-based access control (RBAC) model across platform administration to prevent unauthorized access and separate operational duties:

| Administrative Role | Key Responsibilities | Access Level |
|---------------------|----------------------|--------------|
| **`super_admin`** | Full platform governance, system configuration, security incident resolution, and administrative role provisioning. | Full Access across all 10 modules |
| **`operations_admin`** | Emergency operations triage, stalled requisition investigations, regional inventory monitoring, and platform broadcasts. | Operational Oversight & Broadcasts |
| **`verification_admin`** | Hospital and blood bank accreditation review, medical license validation, and physical cold-chain audit confirmation. | Institutional Accreditation Queue |
| **`security_auditor`** | Forensic security audit log inspection, authentication telemetry analysis, and incident triage investigations. | Security Center & Audit Streams |
| **`analytics_viewer`** | Hemovigilance surveillance, crossmatch-to-transfusion (C:T) ratio tracking, and regional demand reporting. | Read-Only Platform Analytics |

---

## 2. Detailed Permission Matrix

| Module / Operation | `super_admin` | `operations_admin` | `verification_admin` | `security_auditor` | `analytics_viewer` | Regular Users (`donor`, `patient`, `hospital`, `blood_bank`) |
|--------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| **View Dashboard Overview** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (403 Forbidden) |
| **Search & List Platform Users** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **View User Detail & Security Timeline** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Suspend / Reactivate User Account** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View Facility Verification Queue** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Approve / Reject Facility Accreditation** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **View Emergency Operations Telemetry** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View Platform Inventory Intelligence** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **View Hemovigilance Analytics & Reports** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Dispatch Targeted Platform Broadcasts** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inspect Unified Security Audit Stream** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Create / Update Security Incident Records** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Read System Configuration** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Update Operational Configuration** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Update Clinical Compatibility Rules** | 🔒 *(Requires Medical Board Approval Token)* | ❌ | ❌ | ❌ | ❌ | ❌ |
| **List Administrative Roles** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Assign / Revoke Administrative Roles** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Provisioning Workflow for Initial Super Admin

To provision the initial Super Admin in a new deployment:

```bash
# 1. Ensure user is registered through normal auth flow (creates profile entry)
# 2. Execute secure CLI bootstrap utility
python scripts/provision_super_admin.py --email admin@bloodlink.net --notes "Initial system deployment bootstrap"

# 3. Verify active administrators
python scripts/provision_super_admin.py --list
```
