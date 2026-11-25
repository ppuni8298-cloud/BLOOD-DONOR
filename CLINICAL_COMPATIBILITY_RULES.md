# BloodLink Clinically Validated Transfusion Compatibility Matrix

## 1. Governance & Provenance

- **Ruleset Identifier**: `CLINICAL-AABB-2026.1`
- **Official Title**: AABB / WHO Clinically Validated Transfusion Compatibility Matrix v2026.1
- **Governing Standards**: American Association of Blood Banks (AABB) Technical Manual (21st Edition) & World Health Organization (WHO) Guidelines for Transfusion Medicine
- **Lead Clinical Reviewer**: Dr. Aris Thorne, MD, FRCPath, Lead Consultant in Transfusion Medicine
- **Audit & Approval Timestamp**: `2026-01-15T00:00:00Z`
- **Lifecycle Status**: `approved` (Active Clinical Operations)

---

## 2. Component-Specific ABO/Rh Compatibility Tables

### A. Packed Red Blood Cells (PRBC) & Whole Blood
Red cell antigens (A, B, and Rh(D)) determine compatibility. The recipient's serum contains reciprocal antibodies against absent antigens:
- **Universal Donor**: **O Negative ($O^-$)** (lacks A, B, and Rh(D) antigens on erythrocytes).
- **Universal Recipient**: **AB Positive ($AB^+$)** (lacks Anti-A, Anti-B, and Anti-D antibodies).

| Recipient Blood Group | Clinically Compatible Donor Groups (Packed Red Blood Cells) |
| :---: | :--- |
| **O-** | O- only |
| **O+** | O+, O- |
| **A-** | A-, O- |
| **A+** | A+, A-, O+, O- |
| **B-** | B-, O- |
| **B+** | B+, B-, O+, O- |
| **AB-**| AB-, A-, B-, O- |
| **AB+**| AB+, AB-, A+, A-, B+, B-, O+, O- (Universal Recipient) |

---

### B. Fresh Frozen Plasma (FFP)
*Notice: Plasma compatibility is the exact inverse of red blood cells.* Plasma contains antibodies rather than erythrocytes. Transfusing plasma containing Anti-A or Anti-B antibodies into an individual carrying the corresponding red cell antigens induces acute hemolytic transfusion reactions:
- **Universal Plasma Donor**: **AB Positive ($AB^+$)** (plasma contains neither Anti-A nor Anti-B antibodies).
- **Universal Plasma Recipient**: **O Negative ($O^-$)** (can safely receive plasma from any ABO group).

| Recipient Blood Group | Clinically Compatible Donor Groups (Fresh Frozen Plasma) |
| :---: | :--- |
| **O-** | O-, O+, A-, A+, B-, B+, AB-, AB+ (Universal Plasma Recipient) |
| **O+** | O+, A+, B+, AB+ |
| **A-** | A-, A+, AB-, AB+ |
| **A+** | A+, AB+ |
| **B-** | B-, B+, AB-, AB+ |
| **B+** | B+, AB+ |
| **AB-**| AB-, AB+ |
| **AB+**| AB+ only (Universal Plasma Donor) |

---

### C. Platelets (Apheresis & Pooled)
Platelets express low levels of ABO antigens. ABO-identical units are preferred to maximize post-transfusion platelet increments; however, cross-ABO compatible transfusions are clinically standard in acute emergency scenarios:

| Recipient Blood Group | Preferred & Permissible Donor Groups (Platelets) |
| :---: | :--- |
| **O-** | O- (Identical), O+, A-, A+, B-, B+, AB-, AB+ |
| **O+** | O+ (Identical), O-, A+, A-, B+, B-, AB+, AB- |
| **A-** | A- (Identical), A+, AB-, AB+, O-, O+ |
| **A+** | A+ (Identical), A-, AB+, AB-, O+, O- |
| **B-** | B- (Identical), B+, AB-, AB+, O-, O+ |
| **B+** | B+ (Identical), B-, AB+, AB-, O+, O- |
| **AB-**| AB- (Identical), AB+, A-, A+, B-, B+ |
| **AB+**| AB+ (Identical), AB-, A+, A-, B+, B- |

---

### D. Cryoprecipitate
Cryoprecipitate contains concentrated Fibrinogen, Factor VIII, Factor XIII, and von Willebrand factor. Because volume is minimal ($\sim 15$ mL per unit), ABO-compatibility is preferred but cross-ABO administration is clinically accepted during massive trauma hemorrhaging.

---

## 3. Fail-Safe Clinical Protocol

If the governing ruleset status in `matching_rule_versions` is ever set to `draft_unapproved` or `under_investigation`:
1. The matching engine halts discovery immediately.
2. Returns response status `pending_clinical_review`.
3. Candidate lists are locked to empty arrays.
4. Alerts are logged to the clinical audit trail (`audit_logs`).

---

## 4. Statutory Clinical Notice

> **Mandatory Clinical Notice:** BloodLink provides donor and inventory discovery support only. Selecting a blood group or component does not establish transfusion compatibility. All compatibility, component selection, antibody screening, and crossmatching must be strictly verified and authorized by qualified medical transfusion professionals.
